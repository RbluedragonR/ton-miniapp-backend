// File: ar_backend/src/routes/earnRoutes.js
const express = require('express');
const earnController = require('../controllers/earnController');
// const { authenticate } = require('../middlewares/authMiddleware'); // Optional

const router = express.Router();

// GET /api/earn/config - Get staking plans, ARIX price, SC addresses, USDT token info
router.get('/config', earnController.getStakingConfig);

// POST /api/earn/stake - User initiates an ARIX stake (principal is ARIX, rewards are USDT)
router.post('/stake', earnController.recordUserStake);

// GET /api/earn/stakes/:userWalletAddress - Get user's stakes, accrued USDT rewards, and claimable ARIX rewards
router.get('/stakes/:userWalletAddress', earnController.getUserStakesAndRewards);

// POST /api/earn/initiate-arix-unstake - Prepare for ARIX principal unstake from SC
router.post('/initiate-arix-unstake', earnController.initiateArixUnstake);

// POST /api/earn/confirm-arix-unstake - Confirm ARIX principal unstake from SC
router.post('/confirm-arix-unstake', earnController.confirmArixUnstake);

// POST /api/earn/request-usdt-withdrawal - User requests to withdraw their accrued USDT rewards
router.post('/request-usdt-withdrawal', earnController.requestUsdtWithdrawal);

// POST /api/earn/request-arix-withdrawal - User requests to withdraw their accrued ARIX rewards (from games/tasks)
router.post('/request-arix-withdrawal', earnController.requestArixRewardWithdrawal);


// POST /api/earn/admin/trigger-monthly-usdt-rewards - Admin/Cron endpoint for USDT rewards
router.post('/admin/trigger-monthly-usdt-rewards', earnController.triggerMonthlyUsdtRewardCalculation);


module.exports = router;