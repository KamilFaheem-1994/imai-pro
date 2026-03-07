const express = require('express');
const router = express.Router();
const instagramController = require('../controllers/instagramController');

/**
 * Instagram API Routes
 */
// Webhook verification (GET)
router.get('/api/instagram/webhook', instagramController.webhook);
router.post('/api/instagram/webhook', instagramController.webhook);
// Search endpoint
router.get('/api/instagram/search', instagramController.searchPosts);

module.exports = router;
