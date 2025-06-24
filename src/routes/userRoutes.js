
const express = require('express');
const userController = require('../controllers/userController');
// const { authenticate } = require('../middlewares/authMiddleware'); // Optional

const router = express.Router();






// GET /api/user/profile/:userWalletAddress - Get user's profile data
// Accepts query params: telegram_id, username, referrer (code or address) for initial profile setup/update
router.get('/profile/:userWalletAddress', userController.getUserProfile);

router.get('/profile/:userWalletAddress', userController.getUserProfile);

// [NEW] POST /api/user/withdraw/arix - Initiate an ARIX withdrawal
router.post('/withdraw/arix', userController.handleArixWithdrawal);

module.exports = router;