// File: ar_backend/src/services/referralService.js
const db = require('../config/database');
const { TMA_URL } = require('../config/envConfig');
const { USDT_DECIMALS } = require('../utils/constants');

class ReferralService {
    async getReferralData(userWalletAddress) {
        // 1. Get user's referral code
        const userQuery = await db.query("SELECT referral_code FROM users WHERE wallet_address = $1", [userWalletAddress]);
        if (userQuery.rows.length === 0) {
            throw new Error("User not found.");
        }
        const referralCode = userQuery.rows[0].referral_code;
        const referralLink = `${TMA_URL}?startapp=${referralCode}`; // Or however your TMA handles referral params

        // 2. Count L1 referrals
        const l1ReferralsQuery = await db.query(
            "SELECT COUNT(*) as count FROM users WHERE referrer_wallet_address = $1",
            [userWalletAddress]
        );
        const l1Count = parseInt(l1ReferralsQuery.rows[0].count, 10);

        // 3. Count L2 referrals
        const l2ReferralsQuery = await db.query(
            `SELECT COUNT(*) as count 
             FROM users u2 
             JOIN users u1 ON u2.referrer_wallet_address = u1.wallet_address 
             WHERE u1.referrer_wallet_address = $1`,
            [userWalletAddress]
        );
        const l2Count = parseInt(l2ReferralsQuery.rows[0].count, 10);
        const totalInvited = l1Count + l2Count; // Or just L1 if "total invited" means direct

        // 4. Calculate L1 USDT earnings
        const l1EarningsQuery = await db.query(
            "SELECT COALESCE(SUM(reward_amount_usdt), 0) as total FROM referral_rewards WHERE referrer_wallet_address = $1 AND level = 1",
            [userWalletAddress]
        );
        const l1EarningsUsdt = parseFloat(l1EarningsQuery.rows[0].total);

        // 5. Calculate L2 USDT earnings
        const l2EarningsQuery = await db.query(
            "SELECT COALESCE(SUM(reward_amount_usdt), 0) as total FROM referral_rewards WHERE referrer_wallet_address = $1 AND level = 2",
            [userWalletAddress]
        );
        const l2EarningsUsdt = parseFloat(l2EarningsQuery.rows[0].total);

        return {
            referralLink,
            l1ReferralCount: l1Count,
            l2ReferralCount: l2Count,
            totalUsersInvited: totalInvited, // This interpretation might need adjustment based on how "total invited" is defined
            l1EarningsUsdt: l1EarningsUsdt.toFixed(USDT_DECIMALS || 6),
            l2EarningsUsdt: l2EarningsUsdt.toFixed(USDT_DECIMALS || 6),
            totalReferralEarningsUsdt: (l1EarningsUsdt + l2EarningsUsdt).toFixed(USDT_DECIMALS || 6)
        };
    }

    async getReferralPlanExplanations() {
        // Fetch staking plans to explain referral percentages
        const { rows } = await db.query(
            `SELECT plan_key, title, 
                    referral_l1_invest_percent, 
                    referral_l2_invest_percent,
                    referral_l2_commission_on_l1_bonus_percent
             FROM staking_plans WHERE is_active = TRUE ORDER BY min_stake_usdt ASC`
        );
        return rows.map(p => ({
            planTitle: p.title,
            l1RewardPercentage: parseFloat(p.referral_l1_invest_percent).toFixed(2) + "% of referred user's investment.",
            l2RewardDescription: (p.referral_l2_invest_percent > 0)
                ? parseFloat(p.referral_l2_invest_percent).toFixed(2) + "% of L2 user's investment."
                : (p.referral_l2_commission_on_l1_bonus_percent > 0
                    ? parseFloat(p.referral_l2_commission_on_l1_bonus_percent).toFixed(2) + "% of your L1 referral's direct bonus from the L2 user's investment."
                    : "No L2 reward for this plan via this path.")
        }));
    }
}

module.exports = new ReferralService();