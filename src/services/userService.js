
const db = require('../config/database');
const { USDT_DECIMALS, ARIX_DECIMALS } = require('../utils/constants'); 

class UserService {
    async fetchUserProfile(walletAddress) {
        const userQuery = `
            SELECT 
                u.wallet_address, 
                u.username, 
                u.telegram_id, 
                u.referral_code,
                u.referrer_wallet_address,
                r.username as referrer_username,
                r.referral_code as referrer_code,
                u.created_at, 
                u.claimable_usdt_balance, 
                u.claimable_arix_rewards
            FROM users u
            LEFT JOIN users r ON u.referrer_wallet_address = r.wallet_address
            WHERE u.wallet_address = $1;
        `;
        const { rows } = await db.query(userQuery, [walletAddress]);

        if (rows.length === 0) {
            
            
            const newUser = await this.ensureUserExists(walletAddress);
            return {
                wallet_address: newUser.wallet_address,
                username: newUser.username,
                telegram_id: newUser.telegram_id,
                referral_code: newUser.referral_code,
                referrer_wallet_address: newUser.referrer_wallet_address,
                referrer_username: null, 
                referrer_code: null,
                created_at: newUser.created_at,
                claimable_usdt_balance: parseFloat(newUser.claimable_usdt_balance || 0).toFixed(USDT_DECIMALS || 6),
                claimable_arix_rewards: parseFloat(newUser.claimable_arix_rewards || 0).toFixed(ARIX_DECIMALS || 9),
                is_new_user: true, 
            };
        }
        const user = rows[0];
        return {
            wallet_address: user.wallet_address,
            username: user.username,
            telegram_id: user.telegram_id,
            referral_code: user.referral_code,
            referrer_wallet_address: user.referrer_wallet_address,
            referrer_username: user.referrer_username,
            referrer_code: user.referrer_code,
            created_at: user.created_at,
            claimable_usdt_balance: parseFloat(user.claimable_usdt_balance || 0).toFixed(USDT_DECIMALS || 6),
            claimable_arix_rewards: parseFloat(user.claimable_arix_rewards || 0).toFixed(ARIX_DECIMALS || 9),
            is_new_user: false,
        };
    }

    async ensureUserExists(walletAddress, telegramId = null, username = null, referrerCodeOrAddress = null) {
        
        
        
        

        let referrerWallet = null;
        if (referrerCodeOrAddress) {
            
            const directReferrer = await db.query("SELECT wallet_address FROM users WHERE wallet_address = $1", [referrerCodeOrAddress]);
            if (directReferrer.rows.length > 0) {
                referrerWallet = directReferrer.rows[0].wallet_address;
            } else {
                
                const referrerByCode = await db.query("SELECT wallet_address FROM users WHERE referral_code = $1", [referrerCodeOrAddress]);
                if (referrerByCode.rows.length > 0) {
                    referrerWallet = referrerByCode.rows[0].wallet_address;
                }
            }
        }
        
        if (referrerWallet === walletAddress) {
            referrerWallet = null;
        }

        const query = `
            INSERT INTO users (wallet_address, telegram_id, username, referrer_wallet_address, created_at, updated_at, claimable_usdt_balance, claimable_arix_rewards)
            VALUES ($1, $2, $3, $4, NOW(), NOW(), 0, 0)
            ON CONFLICT (wallet_address) DO UPDATE SET
                updated_at = NOW(),
                telegram_id = COALESCE(users.telegram_id, EXCLUDED.telegram_id),
                username = COALESCE(users.username, EXCLUDED.username),
                referrer_wallet_address = CASE 
                                            WHEN users.referrer_wallet_address IS NULL THEN EXCLUDED.referrer_wallet_address
                                            ELSE users.referrer_wallet_address 
                                          END
            RETURNING *;
        `;
        try {
            const { rows } = await db.query(query, [walletAddress, telegramId, username, referrerWallet]);
            return rows[0];
        } catch (error) {
            console.error(`Error in ensureUserExists for ${walletAddress}:`, error);
            throw error;
        }
    }

    async getUserByReferralCode(referralCode) {
        const { rows } = await db.query("SELECT wallet_address, username FROM users WHERE referral_code = $1", [referralCode]);
        return rows[0] || null;
    }
}

module.exports = new UserService();