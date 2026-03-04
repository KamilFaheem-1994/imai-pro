const express = require('express');
const router = express.Router();
const { ApifyService, ApifyServiceError } = require('../services/apifyService');
const { addTrackedCreators, getSettingValue } = require('../services/dbService');

// ------------------------------------------------------------------ //
//  Token Resolution + Singleton Cache                                  //
// ------------------------------------------------------------------ //

let _cachedService = null;
let _cachedToken = null;

/**
 * Resolve the Apify token.
 * Priority: process.env.APIFY_TOKEN > settings DB > null
 */
async function getApifyToken() {
  if (process.env.APIFY_TOKEN) return process.env.APIFY_TOKEN;

  try {
    const dbToken = await getSettingValue('apify_token');
    return dbToken || null;
  } catch (error) {
    console.error('[Apify] Failed to fetch token from database:', error.message);
    return null;
  }
}

/**
 * Return a cached ApifyService instance (async — resolves token from DB).
 */
async function getApifyService() {
  const token = await getApifyToken();

  if (!token) {
    throw new ApifyServiceError('Apify token is not configured. Set it in Settings or the APIFY_TOKEN env var.', {
      code: 'not_authenticated',
      statusCode: 401,
    });
  }

  if (_cachedService && _cachedToken === token) {
    return _cachedService;
  }

  _cachedService = new ApifyService(token);
  _cachedToken = token;
  return _cachedService;
}

// ------------------------------------------------------------------ //
//  Error handler                                                       //
// ------------------------------------------------------------------ //

function apifyErrorHandler(err, req, res, _next) {
  if (!req.originalUrl.startsWith('/api/apify')) {
    return _next(err);
  }

  if (err instanceof ApifyServiceError) {
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
 * GET /api/apify/test
 * Health check — validates Apify token.
 */
router.get('/api/apify/test', async (req, res, next) => {
  try {
    const service = await getApifyService();
    const info = await service.testConnection();
    res.json({ success: true, data: info });
  } catch (error) {
    if (error instanceof ApifyServiceError) {
      return res.status(error.statusCode || 500).json({
        success: false,
        message: 'Apify connection failed',
        error: error.message,
        code: error.code || undefined,
      });
    }
    next(error);
  }
});

/**
 * GET /api/apify/search-locations?q={query}&limit={limit}
 * Location autocomplete — searches Instagram locations by name.
 */
router.get('/api/apify/search-locations', async (req, res, next) => {
  try {
    const { q, limit } = req.query;

    if (!q || q.length < 2) {
      return res.status(400).json({
        success: false,
        error: 'q query param is required (min 2 characters)',
      });
    }

    const service = await getApifyService();
    const locations = await service.searchLocations(q, parseInt(limit, 10) || 10);

    res.json({ success: true, data: locations });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/apify/discover-by-location
 * Body: { locationUrl, locationName, clientId, platform?, maxPosts? }
 *
 * Scrapes posts from an Instagram location, extracts unique creators,
 * and persists them to tracked_creators with sourceType: "location".
 */
router.post('/api/apify/discover-by-location', async (req, res, next) => {
  try {
    const {
      locationUrl,
      locationName,
      clientId,
      platform = 'instagram',
      maxPosts = 50,
    } = req.body;

    if (!locationUrl || !clientId) {
      return res.status(400).json({
        success: false,
        error: 'locationUrl and clientId are required',
      });
    }

    const service = await getApifyService();
    const posts = await service.scrapeLocationPosts(locationUrl, maxPosts);

    // Deduplicate creators from scraped posts
    const creatorMap = new Map();
    for (const post of posts) {
      const username = post.ownerUsername;
      if (username && !creatorMap.has(username)) {
        creatorMap.set(username, {
          clientId,
          username,
          fullName: null,
          profilePicUrl: null,
          platform,
          sourceType: 'location',
          sourceValue: `loc:${locationName || 'unknown'}`,
          postId: null,
          postCaption: (post.caption || '').slice(0, 500),
          postMediaUrl: post.mediaUrl || null,
          platformUserId: post.ownerId || null,
          followersCount: null,
          isVerified: false,
          engagement: {
            likes: post.likesCount || 0,
            comments: post.commentsCount || 0,
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
        postsScraped: posts.length,
        uniqueCreators: creators.length,
        tracked: trackedResults || { inserted: 0, duplicates: 0, errors: 0 },
      },
    });
  } catch (error) {
    next(error);
  }
});

// ------------------------------------------------------------------ //
//  Attach error handler                                                //
// ------------------------------------------------------------------ //
router.use(apifyErrorHandler);

module.exports = router;
