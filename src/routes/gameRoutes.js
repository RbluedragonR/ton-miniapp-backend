const express = require('express');
const gameController = require('../controllers/gameController');

const router = express.Router();

// POST /api/game/coinflip/bet
router.post('/coinflip/bet', gameController.handleCoinflipBet);

// GET /api/game/coinflip/history/:userWalletAddress
router.get('/coinflip/history/:userWalletAddress', gameController.getCoinflipHistoryForUser);

// GET /api/game/crash/history/:walletAddress
router.get('/crash/history/:walletAddress', gameController.getCrashHistoryForUser);

module.exports = router;