// File: AR_Proj/ar_backend/src/services/userService.js
const db = require('../config/database');

class UserService {
    async fetchUserProfile(walletAddress) {
        const userQuery = `
            SELECT 
                u.wallet_address, 
                u.username, 
                u.telegram_id, 
                u.referrer_wallet_address,
                r.username as referrer_username, -- Get referrer's username
                u.created_at, 
                u.claimable_usdt_balance, 
                u.claimable_arix_rewards
            FROM users u
            LEFT JOIN users r ON u.referrer_wallet_address = r.wallet_address
            WHERE u.wallet_address = $1;
        `;
        const { rows } = await db.query(userQuery, [walletAddress]);

        if (rows.length === 0) {
            return null; 
        }
        const user = rows[0];
        return {
            wallet_address: user.wallet_address,
            username: user.username,
            telegram_id: user.telegram_id,
            referrer_wallet_address: user.referrer_wallet_address,
            referrer_username: user.referrer_username, // May be null if no referrer or referrer has no username
            created_at: user.created_at,
            claimable_usdt_balance: parseFloat(user.claimable_usdt_balance).toFixed(6),
            claimable_arix_rewards: parseFloat(user.claimable_arix_rewards).toFixed(9),
            // You can add more aggregated data here later, e.g., total staked, total earned, etc.
        };
    }

    // Placeholder for updating user profile details if needed in the future
    async updateUserProfile(walletAddress, profileData) {
        // Example: const { username, telegram_id } = profileData;
        // const { rows } = await db.query(
        //     "UPDATE users SET username = $1, telegram_id = $2, updated_at = NOW() WHERE wallet_address = $3 RETURNING *",
        //     [username, telegram_id, walletAddress]
        // );
        // return rows[0];
        console.log(`UserService: updateUserProfile for ${walletAddress} with data:`, profileData);
        throw new Error("Update user profile not yet implemented.");
    }
}

module.exports = new UserService();