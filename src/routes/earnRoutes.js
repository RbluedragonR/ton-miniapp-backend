const express = require('express');
const earnController = require('../controllers/earnController');
// const { authenticate } = require('../middlewares/authMiddleware'); // Optional

const router = express.Router();

// GET /api/earn/config - Get staking plans, OXYBLE price, SC addresses, USDT token info
router.get('/config', earnController.getStakingConfig);

/**
 * [NEW] GET /api/earn/arx-price - Get just the current OXYBLE/USDT price.
 * This fixes the 404 error seen in the frontend logs.
 */
router.get('/arx-price', earnController.getOXYBLEPrice);

// POST /api/earn/stake - User initiates an OXYBLE stake (principal is OXYBLE, rewards are USDT)
router.post('/stake', earnController.recordUserStake);

// GET /api/earn/stakes/:userWalletAddress - Get user's stakes, accrued USDT rewards, and claimable OXYBLE rewards
router.get('/stakes/:userWalletAddress', earnController.getUserStakesAndRewards);

// POST /api/earn/initiate-OXYBLE-unstake - Prepare for OXYBLE principal unstake from SC
router.post('/initiate-OXYBLE-unstake', earnController.initiateOXYBLEUnstake);

// POST /api/earn/confirm-OXYBLE-unstake - Confirm OXYBLE principal unstake from SC
router.post('/confirm-OXYBLE-unstake', earnController.confirmOXYBLEUnstake);

// POST /api/earn/request-usdt-withdrawal - User requests to withdraw their accrued USDT rewards
router.post('/request-usdt-withdrawal', earnController.requestUsdtWithdrawal);

// POST /api/earn/request-OXYBLE-withdrawal - User requests to withdraw their accrued OXYBLE rewards (from games/tasks)
router.post('/request-OXYBLE-withdrawal', earnController.requestOXYBLERewardWithdrawal);


// POST /api/earn/admin/trigger-monthly-usdt-rewards - Admin/Cron endpoint for USDT rewards
router.post('/admin/trigger-monthly-usdt-rewards', earnController.triggerMonthlyUsdtRewardCalculation);


module.exports = router;

