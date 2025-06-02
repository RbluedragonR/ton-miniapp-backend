// File: AR_Proj/ar_backend/src/routes/gameRoutes.js
const express = require('express');
const gameController = require('../controllers/gameController'); 
// const { authenticate } = require('../middlewares/authMiddleware'); // Optional: if auth is needed

const router = express.Router();

// POST /api/game/coinflip/bet - Handles a user placing a Coinflip bet
router.post('/coinflip/bet', gameController.handleCoinflipBet);

// GET /api/game/coinflip/history/:userWalletAddress - Fetches Coinflip game history for a user
router.get('/coinflip/history/:userWalletAddress', gameController.getCoinflipHistoryForUser);
// Note: If you have other games, you would add their routes here.
// Example: router.post('/poker/bet', gameController.handlePokerBet);

module.exports = router;