const express = require('express');
const router = express.Router();
const instagramController = require('../controllers/instagramController');

/**
 * Instagram API Routes
 */
router.get('/api/instagram/webhook/verifytoken', instagramController.webhookVerify);
router.post('/api/instagram/webhook/story-mention', instagramController.webhookStoryMention);
router.get('/api/instagram/search', instagramController.searchPosts);

module.exports = router;
