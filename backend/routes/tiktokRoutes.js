const express = require('express');
const router = express.Router();
const { addTrackedCreators, getSettingValue } = require('../services/dbService');
const { getPlatformService } = require('../services/platforms');
const { ImaiApiService, ImaiApiError } = require('../services/imaiApiService');
const tiktokController = require('../controllers/tiktokController');

// ------------------------------------------------------------------ //
//  GET /api/tiktok/search                                             //
// ------------------------------------------------------------------ //

/**
 * Search TikTok users or challenges (hashtags).
 *
 * Query parameters:
 *   keyword   (required) — search term; prefix with # for hashtag/challenge search
 *   clientId  (optional) — UUID of client; when provided, results are saved to tracked_creators
 */
router.get('/api/tiktok/search', tiktokController.searchPosts);

// ------------------------------------------------------------------ //
//  GET /api/tiktok/user/:username                                     //
// ------------------------------------------------------------------ //

/**
 * Get TikTok user info.
 */
router.get('/api/tiktok/user/:username', async (req, res) => {
  try {
    const { username } = req.params;

    if (!username) {
      return res.status(400).json({
        success: false,
        error: 'Username parameter is required',
      });
    }

    const apiKey = await getSettingValue('imai_api_key');
    if (!apiKey) {
      return res.status(400).json({
        success: false,
        error: 'IMAI API key not configured',
        message: 'Set your IMAI API key in Settings.',
      });
    }

    const tiktok = getPlatformService('tiktok', apiKey);

    console.log(`\nTikTok User Info: @${username}`);
    const userInfo = await tiktok.getUserInfo(username);

    return res.status(200).json({
      success: true,
      data: userInfo,
    });
  } catch (error) {
    console.error('TikTok User Info Error:', error.message);

    if (error instanceof ImaiApiError) {
      return res.status(error.statusCode || 500).json({
        success: false,
        error: error.code || 'imai_api_error',
        message: error.message,
        details: error.response || null,
      });
    }

    return res.status(500).json({
      success: false,
      error: 'Failed to get TikTok user info',
      message: error.message,
    });
  }
});

// ------------------------------------------------------------------ //
//  GET /api/tiktok/challenge/:hashtag                                 //
// ------------------------------------------------------------------ //

/**
 * Get TikTok challenge (hashtag) info and feed.
 */
router.get('/api/tiktok/challenge/:hashtag', async (req, res) => {
  try {
    const { hashtag } = req.params;

    if (!hashtag) {
      return res.status(400).json({
        success: false,
        error: 'Hashtag parameter is required',
      });
    }

    const apiKey = await getSettingValue('imai_api_key');
    if (!apiKey) {
      return res.status(400).json({
        success: false,
        error: 'IMAI API key not configured',
        message: 'Set your IMAI API key in Settings.',
      });
    }

    const imai = new ImaiApiService(apiKey);
    const tiktok = getPlatformService('tiktok', apiKey);

    console.log(`\nTikTok Challenge Info: #${hashtag}`);

    // Fetch challenge metadata and feed in parallel
    const [challengeInfo, feed] = await Promise.all([
      imai.ttChallengeInfo(hashtag),
      tiktok.searchByHashtag(hashtag),
    ]);

    return res.status(200).json({
      success: true,
      data: {
        challenge: challengeInfo,
        feed,
        totalPosts: feed.length,
      },
    });
  } catch (error) {
    console.error('TikTok Challenge Error:', error.message);

    if (error instanceof ImaiApiError) {
      return res.status(error.statusCode || 500).json({
        success: false,
        error: error.code || 'imai_api_error',
        message: error.message,
        details: error.response || null,
      });
    }

    return res.status(500).json({
      success: false,
      error: 'Failed to get TikTok challenge info',
      message: error.message,
    });
  }
});

module.exports = router;
