// File: ar_backend/src/routes/earnRoutes.js
const express = require('express');
const earnController = require('../controllers/earnController');
// const { authenticate } = require('../middlewares/authMiddleware'); // Optional: if auth is needed for some routes

const router = express.Router();

// GET /api/earn/config - Get staking plans, ARIX price, SC addresses
router.get('/config', earnController.getStakingConfig);

// POST /api/earn/stake - User initiates an ARIX stake
router.post('/stake', earnController.recordUserStake);

// GET /api/earn/stakes/:userWalletAddress - Get user's stakes and USDT reward summary
router.get('/stakes/:userWalletAddress', earnController.getUserStakesAndRewards);

// POST /api/earn/initiate-unstake - Prepare for ARIX principal unstake from SC
router.post('/initiate-arix-unstake', earnController.initiateArixUnstake);

// POST /api/earn/confirm-unstake - Confirm ARIX principal unstake from SC
router.post('/confirm-arix-unstake', earnController.confirmArixUnstake);

// POST /api/earn/request-usdt-withdrawal - User requests to withdraw their accrued USDT rewards
router.post('/request-usdt-withdrawal', earnController.requestUsdtWithdrawal);

// POST /api/earn/admin/trigger-monthly-rewards - Admin/Cron endpoint
router.post('/admin/trigger-monthly-rewards', earnController.triggerMonthlyUsdtRewardCalculation);


module.exports = router;
