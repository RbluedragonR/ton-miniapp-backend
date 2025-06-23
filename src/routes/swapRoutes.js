// ar_backend/src/routes/swapRoutes.js
const express = require('express');
const router = express.Router();
const swapController = require('../controllers/swapController');

// GET /api/swap/quote?from=ARIX&to=USDT
router.get('/quote', swapController.getQuote);

// POST /api/swap/execute
router.post('/execute', swapController.performSwap);

module.exports = router;
