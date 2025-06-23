// ar_backend/src/routes/gameRoutes.js
const express = require('express');
const gameController = require('../controllers/gameController');

const router = express.Router();

// --- Original Coinflip Routes ---
// POST /api/game/coinflip/bet
router.post('/coinflip/bet', gameController.handleCoinflipBet);

// GET /api/game/coinflip/history/:userWalletAddress
router.get('/coinflip/history/:userWalletAddress', gameController.getCoinflipHistoryForUser);

// --- Original Crash History Route ---
// GET /api/game/crash/history/:walletAddress
router.get('/crash/history/:walletAddress', gameController.getCrashHistoryForUser);

// --- ADDED Crash Action Routes ---
// GET /api/game/crash/state
router.get('/crash/state', gameController.getCrashState);

// POST /api/game/crash/bet
router.post('/crash/bet', gameController.placeCrashBet);

// POST /api/game/crash/cashout
router.post('/crash/cashout', gameController.cashOutCrash);


// --- ADDED Plinko Route ---
// POST /api/game/plinko/play
router.post('/plinko/play', gameController.playPlinko);


module.exports = router;
