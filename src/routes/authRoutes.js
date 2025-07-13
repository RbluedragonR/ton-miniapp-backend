const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');

/**
 * @route POST /api/auth/telegram
 * @desc Authenticate user via Telegram WebApp
 * @access Public
 */
router.post('/telegram', authController.authenticateTelegram);

/**
 * @route GET /api/auth/status
 * @desc Get user authentication status
 * @access Public
 */
router.get('/status', authController.getAuthStatus);

/**
 * @route POST /api/auth/link-wallet
 * @desc Link wallet to existing Telegram user
 * @access Public
 */
router.post('/link-wallet', authController.linkWallet);

module.exports = router; 