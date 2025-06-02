const express = require('express');
const earnController = require('../controllers/earnController');

const router = express.Router();

router.get('/config', earnController.getStakingConfig);
router.get('/arx-price', earnController.getCurrentArxPrice); // New endpoint for price
router.post('/stake', earnController.recordUserStake);
router.get('/stakes/:userWalletAddress', earnController.getUserStakes);
router.post('/initiate-unstake', earnController.initiateUnstake);
router.post('/confirm-unstake', earnController.confirmUnstakeAndProcessRewards);

module.exports = router;
