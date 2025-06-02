// File: AR_Proj/ar_backend/src/routes/userRoutes.js
const express = require('express');
const userController = require('../controllers/userController');
// const { authenticate } = require('../middlewares/authMiddleware'); // Optional

const router = express.Router();

// GET /api/user/profile/:userWalletAddress - Get user's basic profile data
router.get('/profile/:userWalletAddress', userController.getUserProfile);

// Example for future PUT endpoint to update profile
// router.put('/profile/:userWalletAddress', authenticate, userController.updateUserProfile);

module.exports = router;