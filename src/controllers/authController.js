const { checkTelegramAuth, extractTelegramUserData, extractTelegramWebAppInfo } = require('../utils/telegramAuth');
const UserService = require('../services/userService');
const { isValidTonAddress } = require('../utils/tonUtils');

class AuthController {
    constructor() {
        this.userService = new UserService();
        this.botToken = process.env.TELEGRAM_BOT_TOKEN;
    }

    /**
     * Authenticate user via Telegram WebApp
     */
    async authenticateTelegram(req, res, next) {
        try {
            const { initData, walletAddress, referrerCode } = req.body;

            // Validate required fields
            if (!initData) {
                return res.status(400).json({ 
                    error: 'Missing required field: initData' 
                });
            }

            // Verify Telegram authentication
            if (!this.botToken) {
                console.warn('TELEGRAM_BOT_TOKEN not configured, skipping auth verification');
            } else if (!checkTelegramAuth(initData, this.botToken)) {
                return res.status(401).json({ 
                    error: 'Invalid Telegram authentication' 
                });
            }

            // Extract user data from initData
            const telegramUser = extractTelegramUserData(initData);
            const webAppInfo = extractTelegramWebAppInfo(initData);

            if (!telegramUser) {
                return res.status(400).json({ 
                    error: 'Invalid Telegram user data' 
                });
            }

            // Validate wallet address if provided
            if (walletAddress && !isValidTonAddress(walletAddress)) {
                return res.status(400).json({ 
                    error: 'Invalid wallet address format' 
                });
            }

            // Create or update user in database
            const userData = {
                telegram_id: telegramUser.id,
                telegram_username: telegramUser.username,
                telegram_first_name: telegramUser.first_name,
                telegram_last_name: telegramUser.last_name,
                telegram_language_code: telegramUser.language_code,
                telegram_is_premium: telegramUser.is_premium,
                wallet_address: walletAddress,
                referrer_code: referrerCode,
                web_app_info: webAppInfo,
                last_telegram_auth: new Date().toISOString()
            };

            const user = await this.userService.ensureUserExists(
                walletAddress, 
                telegramUser.id, 
                telegramUser.username, 
                referrerCode,
                userData
            );

            res.json({
                success: true,
                user: {
                    id: user.id,
                    telegram_id: user.telegram_id,
                    telegram_username: user.telegram_username,
                    telegram_first_name: user.telegram_first_name,
                    wallet_address: user.wallet_address,
                    referral_code: user.referral_code,
                    balance: user.balance,
                    created_at: user.created_at,
                    last_telegram_auth: user.last_telegram_auth
                },
                telegram_user: telegramUser,
                web_app_info: webAppInfo
            });

        } catch (error) {
            console.error('AuthController authenticateTelegram error:', error);
            next(error);
        }
    }

    /**
     * Get user authentication status
     */
    async getAuthStatus(req, res, next) {
        try {
            const { telegramId, walletAddress } = req.query;

            if (!telegramId && !walletAddress) {
                return res.status(400).json({ 
                    error: 'Either telegramId or walletAddress is required' 
                });
            }

            let user = null;
            if (telegramId) {
                user = await this.userService.getUserByTelegramId(telegramId);
            } else if (walletAddress) {
                if (!isValidTonAddress(walletAddress)) {
                    return res.status(400).json({ 
                        error: 'Invalid wallet address format' 
                    });
                }
                user = await this.userService.fetchUserProfile(walletAddress);
            }

            res.json({
                success: true,
                authenticated: !!user,
                user: user ? {
                    id: user.id,
                    telegram_id: user.telegram_id,
                    telegram_username: user.telegram_username,
                    wallet_address: user.wallet_address,
                    referral_code: user.referral_code,
                    balance: user.balance,
                    created_at: user.created_at,
                    last_telegram_auth: user.last_telegram_auth
                } : null
            });

        } catch (error) {
            console.error('AuthController getAuthStatus error:', error);
            next(error);
        }
    }

    /**
     * Link wallet to existing Telegram user
     */
    async linkWallet(req, res, next) {
        try {
            const { telegramId, walletAddress } = req.body;

            if (!telegramId || !walletAddress) {
                return res.status(400).json({ 
                    error: 'Both telegramId and walletAddress are required' 
                });
            }

            if (!isValidTonAddress(walletAddress)) {
                return res.status(400).json({ 
                    error: 'Invalid wallet address format' 
                });
            }

            const user = await this.userService.linkWalletToTelegramUser(telegramId, walletAddress);

            res.json({
                success: true,
                user: {
                    id: user.id,
                    telegram_id: user.telegram_id,
                    telegram_username: user.telegram_username,
                    wallet_address: user.wallet_address,
                    referral_code: user.referral_code,
                    balance: user.balance,
                    created_at: user.created_at,
                    last_telegram_auth: user.last_telegram_auth
                }
            });

        } catch (error) {
            console.error('AuthController linkWallet error:', error);
            next(error);
        }
    }
}

module.exports = new AuthController(); 