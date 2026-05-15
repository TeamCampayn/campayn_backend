const express = require('express');
const router = express.Router();
const instagramController = require('../controllers/instagramController');

// Callback URL for Facebook Login
router.get('/auth/facebook/callback', instagramController.handleAuthCallback);

// Manual trigger to refresh insights
router.get('/creators/:creatorId/insights', instagramController.getCreatorInsights);

module.exports = router;
