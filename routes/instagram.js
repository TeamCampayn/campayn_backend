const express = require('express');
const router = express.Router();
const instagramController = require('../controllers/instagramController');

// Callback URL for Facebook Login
router.get('/auth/facebook/callback', instagramController.handleAuthCallback);

// Manual trigger to refresh insights
router.get('/creators/:creatorId/insights', instagramController.getCreatorInsights);

// Creator dashboard data (real IG data + Campayn Score + Rate Card)
router.get('/auth/creator/dashboard/:userId', instagramController.getCreatorDashboard);

// Public media kit (no auth required)
router.get('/creator/media-kit/:igHandle', instagramController.getMediaKit);

module.exports = router;
