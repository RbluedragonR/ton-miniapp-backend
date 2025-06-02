// File: AR_Proj/ar_backend/src/services/userService.js
const db = require('../config/database'); // Path to your database config

class UserService {
    async fetchUserProfile(walletAddress) {
        const userQuery = `
            SELECT 
                u.wallet_address, 
                u.username, 
                u.telegram_id, 
                u.referrer_wallet_address,
                r.username as referrer_username,
                u.created_at, 
                u.claimable_usdt_balance, 
                u.claimable_arix_rewards
            FROM users u
            LEFT JOIN users r ON u.referrer_wallet_address = r.wallet_address
            WHERE u.wallet_address = $1;
        `;
        const { rows } = await db.query(userQuery, [walletAddress]);

        if (rows.length === 0) {
            // If user is not found, they might be new. 
            // Other parts of your application (like staking/tasks) might auto-create them.
            // Returning null here allows the controller to decide on a 404 or other handling.
            return null; 
        }
        const user = rows[0];
        return {
            wallet_address: user.wallet_address,
            username: user.username,
            telegram_id: user.telegram_id,
            referrer_wallet_address: user.referrer_wallet_address,
            referrer_username: user.referrer_username,
            created_at: user.created_at,
            claimable_usdt_balance: parseFloat(user.claimable_usdt_balance).toFixed(6),
            claimable_arix_rewards: parseFloat(user.claimable_arix_rewards).toFixed(9),
        };
    }

    async ensureUserExists(walletAddress, telegramId = null, username = null, referrerWalletAddress = null) {
        // This can be called by controllers when a user first interacts, if needed.
        // The ON CONFLICT clause handles cases where the user already exists.
        // It will update updated_at if user exists, or insert if not.
        // It intelligently updates telegram_id and username only if new values are provided AND current values are null.
        // It intelligently updates referrer_wallet_address only if a new value is provided AND current value is null.
        const query = `
            INSERT INTO users (wallet_address, telegram_id, username, referrer_wallet_address, created_at, updated_at)
            VALUES ($1, $2, $3, $4, NOW(), NOW())
            ON CONFLICT (wallet_address) DO UPDATE SET
                updated_at = NOW(),
                telegram_id = COALESCE(users.telegram_id, EXCLUDED.telegram_id),
                username = COALESCE(users.username, EXCLUDED.username),
                referrer_wallet_address = COALESCE(users.referrer_wallet_address, EXCLUDED.referrer_wallet_address)
            RETURNING *;
        `;
        try {
            const { rows } = await db.query(query, [walletAddress, telegramId, username, referrerWalletAddress]);
            return rows[0];
        } catch (error) {
            console.error(`Error in ensureUserExists for ${walletAddress}:`, error);
            throw error;
        }
    }
}

module.exports = new UserService();