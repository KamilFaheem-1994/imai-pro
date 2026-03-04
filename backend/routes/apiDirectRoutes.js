const express = require('express');
const router = express.Router();
const { ApiDirectService, ApiDirectError, PLATFORM_COSTS } = require('../services/apiDirectService');
const { addTrackedCreators, getSettingValue } = require('../services/dbService');

// ------------------------------------------------------------------ //
//  API Key Resolution + Singleton Cache                                //
// ------------------------------------------------------------------ //

let _cachedService = null;
let _cachedKey = null;

/**
 * Resolve the APIDirect API key.
 * Priority: process.env.APIDIRECT_API_KEY > settings DB > null
 */
async function getApiDirectKey() {
  if (process.env.APIDIRECT_API_KEY) return process.env.APIDIRECT_API_KEY;

  try {
    const dbKey = await getSettingValue('apidirect_api_key');
    return dbKey || null;
  } catch (error) {
    console.error('[APIDirect] Failed to fetch API key from database:', error.message);
    return null;
  }
}

/**
 * Return a cached ApiDirectService instance (async — resolves key from DB).
 */
async function getApiDirectService() {
  const key = await getApiDirectKey();

  if (!key) {
    throw new ApiDirectError('APIDirect API key is not configured. Set it in Settings or the APIDIRECT_API_KEY env var.', {
      code: 'not_authenticated',
      statusCode: 401,
    });
  }

  if (_cachedService && _cachedKey === key) {
    return _cachedService;
  }

  _cachedService = new ApiDirectService(key);
  _cachedKey = key;
  return _cachedService;
}

// ------------------------------------------------------------------ //
//  Error handler                                                       //
// ------------------------------------------------------------------ //

function apiDirectErrorHandler(err, req, res, _next) {
  if (!req.originalUrl.startsWith('/api/apidirect')) {
    return _next(err);
  }

  if (err instanceof ApiDirectError) {
    const httpStatus = err.statusCode || 500;
    return res.status(httpStatus).json({
      success: false,
      error: err.message,
      code: err.code || undefined,
    });
  }

  _next(err);
}

// ------------------------------------------------------------------ //
//  Routes                                                              //
// ------------------------------------------------------------------ //

/**
 * GET /api/apidirect/test
 * Health check — validates APIDirect API key.
 */
router.get('/api/apidirect/test', async (req, res, next) => {
  try {
    const service = await getApiDirectService();
    const info = await service.testConnection();
    res.json({ success: true, data: info });
  } catch (error) {
    if (error instanceof ApiDirectError) {
      return res.status(error.statusCode || 500).json({
        success: false,
        message: 'APIDirect connection failed',
        error: error.message,
        code: error.code || undefined,
      });
    }
    next(error);
  }
});

/**
 * GET /api/apidirect/search?query=X&platform=Y&page=1&clientId=Z
 *
 * Search posts via APIDirect, optionally auto-track creators.
 * Returns response in the same shape as /api/instagram/search for compatibility.
 */
router.get('/api/apidirect/search', async (req, res, next) => {
  try {
    const { query, platform = 'instagram', page = '1', clientId } = req.query;

    // ---- Validate query ------------------------------------------------
    if (!query || query.length < 2) {
      return res.status(400).json({
        success: false,
        error: 'query param is required (min 2 characters)',
      });
    }

    // ---- Execute search ------------------------------------------------
    const service = await getApiDirectService();
    const results = await service.searchPosts(platform, query, { page: parseInt(page, 10) || 1 });

    // Combine all normalised posts
    const allPosts = [...results.hashtagPosts, ...results.mentionPosts];

    // ---- Auto-track creators when clientId is provided -----------------
    let trackedResults = null;

    if (clientId && allPosts.length > 0) {
      try {
        console.log(`\n[APIDirect] Adding ${allPosts.length} posts to tracked_creators for client ${clientId}...`);

        // Determine source type from query prefix
        const sourceType = query.startsWith('#') ? 'hashtag' : 'mention';
        const sourceValue = query;

        // Deduplicate creators by username
        const creatorMap = new Map();

        for (const post of allPosts) {
          const username = post.creator?.username || 'unknown';
          if (username !== 'unknown' && !creatorMap.has(username)) {
            creatorMap.set(username, {
              clientId,
              username,
              fullName: post.creator?.fullName || null,
              profilePicUrl: post.creator?.profilePicUrl || null,
              platform,
              sourceType,
              sourceValue,
              postId: post.postId || post.shortcode || null,
              postCaption: post.content?.caption || null,
              postMediaUrl: post.content?.displayUrl || post.content?.thumbnailUrl || null,
              platformUserId: post.creator?.userId || null,
              followersCount: null,
              isVerified: post.creator?.isVerified || false,
              engagement: post.engagement
                ? {
                    likes: post.engagement.likes || 0,
                    comments: post.engagement.comments || 0,
                  }
                : null,
            });
          }
        }

        const creators = Array.from(creatorMap.values());
        trackedResults = await addTrackedCreators(creators);
        console.log(
          `[APIDirect] Tracked creators: ${trackedResults.inserted} inserted, ${trackedResults.duplicates} duplicates, ${trackedResults.errors} errors`,
        );
      } catch (dbError) {
        console.error('[APIDirect] Error adding to tracked_creators:', dbError.message);
        // Don't fail the request if database insert fails
      }
    }

    // ---- Build response (same shape as /api/instagram/search) ----------
    const estimatedCost = PLATFORM_COSTS[platform] || 0.006;

    return res.status(200).json({
      success: true,
      data: {
        keyword: results.keyword,
        platform,
        totalPosts: results.totalPosts,
        hashtagResults: {
          count: results.hashtagPosts.length,
          posts: results.hashtagPosts,
        },
        mentionResults: {
          count: results.mentionPosts.length,
          posts: results.mentionPosts,
        },
        allPosts,
        provider: 'apidirect',
        estimatedCost,
        trackedCreators: trackedResults
          ? {
              inserted: trackedResults.inserted,
              duplicates: trackedResults.duplicates,
              errors: trackedResults.errors,
            }
          : null,
      },
      message: `Found ${results.totalPosts} posts for query "${query}" (${platform} via APIDirect)${
        trackedResults ? ` | Added ${trackedResults.inserted} new creators` : ''
      }`,
    });
  } catch (error) {
    next(error);
  }
});

// ------------------------------------------------------------------ //
//  Attach error handler                                                //
// ------------------------------------------------------------------ //
router.use(apiDirectErrorHandler);

module.exports = router;
