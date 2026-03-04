const express = require('express');
const router = express.Router();
const { ImaiApiService, ImaiApiError, IMAI_ERROR_MAP, tokenEvents } = require('../services/imaiApiService');
const { sql, addTrackedCreators } = require('../services/dbService');
const {
  buildMentionFilter,
  buildGeoFilter,
  buildCombinedFilter,
  buildSponsoredPostsFilter,
} = require('../services/searchFilterBuilder');

// ------------------------------------------------------------------ //
//  API Key Resolution + Singleton Cache                                //
// ------------------------------------------------------------------ //

let _cachedService = null;
let _cachedApiKey = null;

/**
 * Resolve the IMAI API key.
 * Priority: process.env.IMAI_API_KEY  >  settings DB table.
 */
async function getImaiApiKey() {
  if (process.env.IMAI_API_KEY) return process.env.IMAI_API_KEY;

  try {
    const result = await sql`SELECT value FROM settings WHERE key = 'imai_api_key' LIMIT 1`;
    return result[0]?.value || null;
  } catch (error) {
    console.error('[IMAI] Failed to fetch API key from database:', error.message);
    return null;
  }
}

/**
 * Return a cached ImaiApiService instance.
 * Recreates the instance when the underlying API key changes.
 */
async function getImaiService() {
  const apiKey = await getImaiApiKey();

  if (!apiKey) {
    throw new ImaiApiError('IMAI API key is not configured. Set IMAI_API_KEY env var or store it in the settings table.', {
      code: 'not_authenticated',
      statusCode: 401,
    });
  }

  if (_cachedService && _cachedApiKey === apiKey) {
    return _cachedService;
  }

  _cachedService = new ImaiApiService(apiKey);
  _cachedApiKey = apiKey;
  return _cachedService;
}

// ------------------------------------------------------------------ //
//  IMAI error-handling middleware                                       //
// ------------------------------------------------------------------ //

/**
 * Express error handler that maps ImaiApiError codes to proper HTTP
 * responses. Mounted at the end of the IMAI router.
 */
function imaiErrorHandler(err, req, res, _next) {
  // Only handle errors from IMAI routes (path starts with /api/imai).
  if (!req.originalUrl.startsWith('/api/imai')) {
    return _next(err);
  }

  if (err instanceof ImaiApiError) {
    const mapped = err.code ? IMAI_ERROR_MAP[err.code] : null;
    const httpStatus = mapped?.httpStatus || err.statusCode || 500;

    return res.status(httpStatus).json({
      success: false,
      error: err.message,
      code: err.code || undefined,
      details: err.response || undefined,
    });
  }

  // Axios network errors (timeouts, DNS failures, etc.)
  if (err.code === 'ECONNABORTED' || err.code === 'ETIMEDOUT') {
    return res.status(504).json({
      success: false,
      error: 'IMAI API request timed out',
      code: 'timeout',
    });
  }

  if (err.code === 'ENOTFOUND' || err.code === 'ECONNREFUSED') {
    return res.status(502).json({
      success: false,
      error: 'Unable to reach the IMAI API',
      code: 'unreachable',
    });
  }

  // Unknown error — pass to the global handler.
  _next(err);
}

// ------------------------------------------------------------------ //
//  Routes                                                              //
// ------------------------------------------------------------------ //

/**
 * GET /api/imai/credits
 * Returns token balance and account metadata.
 */
router.get('/api/imai/credits', async (req, res, next) => {
  try {
    const service = await getImaiService();
    const credits = await service.getCredits();

    res.json({
      success: true,
      data: credits,
      tokensUsedThisSession: service.getTokensUsed(),
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/imai/test
 * Quick health-check — calls getCredits and reports success/failure.
 */
router.get('/api/imai/test', async (req, res, next) => {
  try {
    const service = await getImaiService();
    const credits = await service.getCredits();

    res.json({
      success: true,
      message: 'IMAI API connection is working',
      data: credits,
    });
  } catch (error) {
    // For the test endpoint we still want a structured response, not a raw 500.
    if (error instanceof ImaiApiError) {
      const mapped = error.code ? IMAI_ERROR_MAP[error.code] : null;
      const httpStatus = mapped?.httpStatus || error.statusCode || 500;

      return res.status(httpStatus).json({
        success: false,
        message: 'IMAI API connection failed',
        error: error.message,
        code: error.code || undefined,
      });
    }
    next(error);
  }
});

/**
 * POST /api/imai/search
 * Body: { platform, filter (or filters for backward compat), paging?, sort? }
 */
router.post('/api/imai/search', async (req, res, next) => {
  try {
    const { platform, filter, filters, paging, sort } = req.body;

    if (!platform) {
      return res.status(400).json({
        success: false,
        error: 'platform is required (instagram, tiktok, or youtube)',
      });
    }

    // Accept both 'filter' (correct per IMAI API) and 'filters' (backward compat)
    const filterPayload = filter || filters;
    if (!filterPayload || typeof filterPayload !== 'object') {
      return res.status(400).json({
        success: false,
        error: 'filter object is required',
      });
    }

    const service = await getImaiService();
    const data = await service.searchInfluencers(platform, filterPayload, paging, sort);

    res.json({
      success: true,
      data,
      tokensUsedThisSession: service.getTokensUsed(),
    });
  } catch (error) {
    next(error);
  }
});

// (Removed: /api/imai/unlock — unused, no frontend caller)

/**
 * POST /api/imai/report
 * Body: { platform, username, dryRun? }
 */
router.post('/api/imai/report', async (req, res, next) => {
  try {
    const { platform, username, dryRun } = req.body;

    if (!platform) {
      return res.status(400).json({
        success: false,
        error: 'platform is required (instagram, tiktok, or youtube)',
      });
    }

    if (!username) {
      return res.status(400).json({
        success: false,
        error: 'username is required',
      });
    }

    const service = await getImaiService();
    const data = await service.createReport(platform, username, !!dryRun);

    res.json({
      success: true,
      data,
      tokensUsedThisSession: service.getTokensUsed(),
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/imai/report/:id
 */
router.get('/api/imai/report/:id', async (req, res, next) => {
  try {
    const { id } = req.params;

    if (!id) {
      return res.status(400).json({
        success: false,
        error: 'Report ID is required',
      });
    }

    const service = await getImaiService();
    const data = await service.fetchReport(id);

    res.json({
      success: true,
      data,
      tokensUsedThisSession: service.getTokensUsed(),
    });
  } catch (error) {
    next(error);
  }
});

// ------------------------------------------------------------------ //
//  Raw IG endpoints (convenience proxies)                              //
// ------------------------------------------------------------------ //

/**
 * GET /api/imai/ig/hashtag?hashtag={tag}&type={recent|top}&after={cursor}
 */
router.get('/api/imai/ig/hashtag', async (req, res, next) => {
  try {
    const { hashtag, type, after } = req.query;

    if (!hashtag) {
      return res.status(400).json({ success: false, error: 'hashtag query param is required' });
    }

    const service = await getImaiService();
    const data = await service.igHashtagFeed(hashtag, type || 'recent', after || null);

    res.json({ success: true, data, tokensUsedThisSession: service.getTokensUsed() });
  } catch (error) {
    next(error);
  }
});

// (Removed: /api/imai/ig/search and /api/imai/ig/user — unused convenience proxies)

// (Removed: /api/imai/tt/search and /api/imai/tt/user — unused convenience proxies)

// ------------------------------------------------------------------ //
//  Dictionaries (reserved for future filter-builder UI)                //
// ------------------------------------------------------------------ //

/**
 * GET /api/imai/dict/interests
 */
router.get('/api/imai/dict/interests', async (req, res, next) => {
  try {
    const service = await getImaiService();
    const data = await service.getInterests();
    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/imai/dict/languages?platform={platform}
 */
router.get('/api/imai/dict/languages', async (req, res, next) => {
  try {
    const service = await getImaiService();
    const data = await service.getLanguages(req.query.platform || 'instagram');
    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/imai/dict/geos?q={query}&limit={limit}
 */
router.get('/api/imai/dict/geos', async (req, res, next) => {
  try {
    const { q, limit } = req.query;

    if (!q) {
      return res.status(400).json({ success: false, error: 'q query param is required' });
    }

    const service = await getImaiService();
    const data = await service.getGeos(q, parseInt(limit, 10) || 10);
    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/imai/dict/tags?q={query}&platform={platform}
 */
router.get('/api/imai/dict/tags', async (req, res, next) => {
  try {
    const { q, platform } = req.query;

    if (!q) {
      return res.status(400).json({ success: false, error: 'q query param is required' });
    }

    const service = await getImaiService();
    const data = await service.getRelevantTags(q, platform || 'instagram');
    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
});

// ------------------------------------------------------------------ //
//  Contacts                                                            //
// ------------------------------------------------------------------ //

/**
 * GET /api/imai/contacts?platform={platform}&username={username}
 */
router.get('/api/imai/contacts', async (req, res, next) => {
  try {
    const { platform, username } = req.query;

    if (!platform || !username) {
      return res.status(400).json({
        success: false,
        error: 'Both platform and username query params are required',
      });
    }

    const service = await getImaiService();
    const data = await service.getContacts(platform, username);

    res.json({ success: true, data, tokensUsedThisSession: service.getTokensUsed() });
  } catch (error) {
    next(error);
  }
});

// ------------------------------------------------------------------ //
//  Sponsored Posts                                                      //
// ------------------------------------------------------------------ //

/**
 * POST /api/imai/sponsored-posts
 * Body: { filters, paging? }
 */
router.post('/api/imai/sponsored-posts', async (req, res, next) => {
  try {
    const { filters, paging } = req.body;

    if (!filters || typeof filters !== 'object') {
      return res.status(400).json({ success: false, error: 'filters object is required' });
    }

    const service = await getImaiService();
    const data = await service.searchSponsoredPosts(filters, paging);

    res.json({ success: true, data, tokensUsedThisSession: service.getTokensUsed() });
  } catch (error) {
    next(error);
  }
});

// ------------------------------------------------------------------ //
//  Discover by Mention                                                //
// ------------------------------------------------------------------ //

/**
 * POST /api/imai/discover-by-mention
 * Body: { handle, platform, clientId, lastPosted?, followers? }
 *
 * Searches for influencers who mentioned @handle in their content,
 * then persists them to tracked_creators with sourceType: "mention".
 */
router.post('/api/imai/discover-by-mention', async (req, res, next) => {
  try {
    const { handle, platform, clientId, lastPosted, followers } = req.body;

    if (!handle || !platform || !clientId) {
      return res.status(400).json({
        success: false,
        error: 'handle, platform, and clientId are required',
      });
    }

    const service = await getImaiService();
    const filter = buildMentionFilter(handle, { lastPosted, followers });
    const data = await service.searchInfluencers(platform, filter, { limit: 100, skip: 0 });

    // Extract creators from search results
    const results = data?.results || data?.data || [];
    const creators = results.map((result) => ({
      clientId,
      username: result.username || result.user_profile?.username || 'unknown',
      fullName: result.fullname || result.user_profile?.fullname || null,
      profilePicUrl: result.picture || result.user_profile?.picture || null,
      platform,
      sourceType: 'mention',
      sourceValue: handle.startsWith('@') ? handle : `@${handle}`,
      platformUserId: result.user_id || null,
      followersCount: result.followers || result.user_profile?.followers || null,
      isVerified: result.is_verified || false,
      engagement: {
        likes: result.avg_likes || 0,
        comments: result.avg_comments || 0,
      },
    }));

    let trackedResults = null;
    if (creators.length > 0) {
      trackedResults = await addTrackedCreators(creators);
    }

    res.json({
      success: true,
      data: {
        totalFound: results.length,
        tracked: trackedResults || { inserted: 0, duplicates: 0, errors: 0 },
      },
      tokensUsedThisSession: service.getTokensUsed(),
    });
  } catch (error) {
    next(error);
  }
});

// ------------------------------------------------------------------ //
//  Discover by Location                                                //
// ------------------------------------------------------------------ //

/**
 * POST /api/imai/discover-by-location
 * Body: { geoId, platform, clientId, hashtag?, lastPosted?, followers? }
 *
 * Searches for influencers in a given location, optionally combined with hashtag.
 */
router.post('/api/imai/discover-by-location', async (req, res, next) => {
  try {
    const { geoId, platform, clientId, hashtag, lastPosted, followers } = req.body;

    if (!geoId || !platform || !clientId) {
      return res.status(400).json({
        success: false,
        error: 'geoId, platform, and clientId are required',
      });
    }

    const service = await getImaiService();
    const filter = hashtag
      ? buildCombinedFilter({ geoId, hashtag, lastPosted, followers })
      : buildGeoFilter(geoId, { lastPosted, followers });
    const data = await service.searchInfluencers(platform, filter, { limit: 100, skip: 0 });

    const results = data?.results || data?.data || [];
    const creators = results.map((result) => ({
      clientId,
      username: result.username || result.user_profile?.username || 'unknown',
      fullName: result.fullname || result.user_profile?.fullname || null,
      profilePicUrl: result.picture || result.user_profile?.picture || null,
      platform,
      sourceType: 'location',
      sourceValue: `geo:${geoId}${hashtag ? ` #${hashtag.replace(/^#/, '')}` : ''}`,
      platformUserId: result.user_id || null,
      followersCount: result.followers || result.user_profile?.followers || null,
      isVerified: result.is_verified || false,
      engagement: {
        likes: result.avg_likes || 0,
        comments: result.avg_comments || 0,
      },
    }));

    let trackedResults = null;
    if (creators.length > 0) {
      trackedResults = await addTrackedCreators(creators);
    }

    res.json({
      success: true,
      data: {
        totalFound: results.length,
        tracked: trackedResults || { inserted: 0, duplicates: 0, errors: 0 },
      },
      tokensUsedThisSession: service.getTokensUsed(),
    });
  } catch (error) {
    next(error);
  }
});

// ------------------------------------------------------------------ //
//  Discover by Sponsored Posts / Brand Mentions                        //
// ------------------------------------------------------------------ //

/**
 * POST /api/imai/discover-by-brand-mention
 * Body: { handles, clientId, daysBack? }
 *
 * Searches sponsored posts that mention the brand handles,
 * then extracts unique creators and persists to tracked_creators.
 */
router.post('/api/imai/discover-by-brand-mention', async (req, res, next) => {
  try {
    const { handles, clientId, daysBack } = req.body;

    if (!handles || !Array.isArray(handles) || handles.length === 0 || !clientId) {
      return res.status(400).json({
        success: false,
        error: 'handles (array) and clientId are required',
      });
    }

    const service = await getImaiService();
    const filter = buildSponsoredPostsFilter(handles, { daysBack });
    const data = await service.searchSponsoredPosts(filter, { limit: 100, skip: 0 });

    const posts = data?.results || data?.data || [];

    // Deduplicate creators from posts
    const creatorMap = new Map();
    for (const post of posts) {
      const username = post.username || post.user?.username;
      if (username && !creatorMap.has(username)) {
        creatorMap.set(username, {
          clientId,
          username,
          fullName: post.fullname || post.user?.fullname || null,
          profilePicUrl: post.picture || post.user?.picture || null,
          platform: post.platform || 'instagram',
          sourceType: 'mention',
          sourceValue: handles.map((h) => (h.startsWith('@') ? h : `@${h}`)).join(', '),
          postId: post.id || post.code || null,
          postCaption: post.text || null,
          engagement: {
            likes: post.likes || 0,
            comments: post.comments || 0,
          },
        });
      }
    }

    const creators = Array.from(creatorMap.values());
    let trackedResults = null;
    if (creators.length > 0) {
      trackedResults = await addTrackedCreators(creators);
    }

    res.json({
      success: true,
      data: {
        postsFound: posts.length,
        uniqueCreators: creators.length,
        tracked: trackedResults || { inserted: 0, duplicates: 0, errors: 0 },
      },
      tokensUsedThisSession: service.getTokensUsed(),
    });
  } catch (error) {
    next(error);
  }
});

// ------------------------------------------------------------------ //
//  Token event listener — log every spend to credit_transactions       //
// ------------------------------------------------------------------ //

tokenEvents.on('token_spent', async ({ operation, cost, timestamp }) => {
  try {
    await sql`
      INSERT INTO credit_transactions (operation, tokens_used, created_at)
      VALUES (${operation}, ${cost}, ${timestamp})
    `;
  } catch (error) {
    console.error('[IMAI] Failed to log token spend:', error.message);
  }
});

// ------------------------------------------------------------------ //
//  Token History                                                       //
// ------------------------------------------------------------------ //

/**
 * GET /api/imai/token-history?limit={n}&offset={n}
 * Returns recent token transactions from the credit_transactions table.
 */
router.get('/api/imai/token-history', async (req, res, next) => {
  try {
    const limit = Math.min(parseInt(req.query.limit, 10) || 50, 200);
    const offset = parseInt(req.query.offset, 10) || 0;

    const transactions = await sql`
      SELECT id, operation, tokens_used, balance_after, agent_id, client_id, platform, details, created_at
      FROM credit_transactions
      ORDER BY created_at DESC
      LIMIT ${limit} OFFSET ${offset}
    `;

    const dailySpend = await sql`
      SELECT COALESCE(SUM(tokens_used), 0) AS total
      FROM credit_transactions
      WHERE created_at >= CURRENT_DATE
    `;

    res.json({
      success: true,
      data: {
        transactions,
        dailySpend: parseFloat(dailySpend[0]?.total) || 0,
      },
    });
  } catch (error) {
    next(error);
  }
});

// ------------------------------------------------------------------ //
//  Attach error handler at the end of this router                      //
// ------------------------------------------------------------------ //
router.use(imaiErrorHandler);

module.exports = router;
