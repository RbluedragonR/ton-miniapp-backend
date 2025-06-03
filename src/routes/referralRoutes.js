// File: ar_backend/src/routes/referralRoutes.js
const express = require('express');
const referralController = require('../controllers/referralController');
// const { authenticate } = require('../middlewares/authMiddleware'); // Optional

const router = express.Router();

// GET /api/referral/data/:userWalletAddress - Get user's referral link, counts, and USDT earnings
router.get('/data/:userWalletAddress', referralController.getUserReferralData);

// GET /api/referral/program-details - Get explanation of referral reward percentages per plan
router.get('/program-details', referralController.getReferralProgramDetails);

module.exports = router;