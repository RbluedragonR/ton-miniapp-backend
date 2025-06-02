// File: ar_backend/src/services/earnService.js
const db = require('../config/database');
const { TonClient, Address, Cell } = require('@ton/ton'); // For on-chain verification
const { getHttpEndpoint } = require('@orbs-network/ton-access');
const priceService = require('./priceService'); // Assuming priceService.js exists for ARIX price

const ARIX_DECIMALS = 9;
const USDT_DECIMALS = 6; // Confirm based on the jUSDT or other variant used
const MIN_USDT_WITHDRAWAL = 3; // As per client image

const { 
    STAKING_CONTRACT_ADDRESS, 
    ARIX_TOKEN_MASTER_ADDRESS,
    USDT_REWARD_JETTON_MASTER_ADDRESS, // e.g., jUSDT master address
    BACKEND_USDT_WALLET_ADDRESS, // Backend's wallet for sending USDT rewards
    STAKING_CONTRACT_JETTON_WALLET_ADDRESS // ARIX Staking SC's Jetton Wallet
} = require('../config/envConfig');

async function getTonClientInstance() {
  const network = process.env.TON_NETWORK || 'mainnet';
  const endpoint = await getHttpEndpoint({ network });
  return new TonClient({ endpoint });
}

class EarnService {
    async getActiveStakingPlans() {
        // Fetches plans with new referral and USDT APR fields
        const { rows } = await db.query(
            `SELECT plan_id, plan_key, title, duration_days, 
                    fixed_usdt_apr_percent, arix_early_unstake_penalty_percent, min_stake_arix, 
                    referral_l1_invest_percent, referral_l2_invest_percent,
                    referral_l1_reward_percent_of_l1_direct_bonus, referral_l2_reward_percent_of_l1_direct_bonus,
                    is_active 
             FROM staking_plans WHERE is_active = TRUE ORDER BY duration_days ASC`
        );
        return rows.map(p => ({ ...p, /* ensure numeric types are numbers */ }));
    }

    async getPlanByKey(planKey) {
        const { rows } = await db.query("SELECT * FROM staking_plans WHERE plan_key = $1 AND is_active = TRUE", [planKey]);
        if (!rows[0]) return null;
        return { ...rows[0], /* ensure numeric types */ };
    }
    
    async createStake({ planKey, arixAmount, userWalletAddress, transactionBoc, referenceUsdtValue, referrerWalletAddress }) {
        const plan = await this.getPlanByKey(planKey);
        if (!plan) throw new Error("Invalid or inactive staking plan key.");
        if (arixAmount < parseFloat(plan.min_stake_arix)) throw new Error(`Minimum stake is ${plan.min_stake_arix} ARIX.`);

        const stakeTimestamp = new Date();
        const unlockTimestamp = new Date(stakeTimestamp.getTime() + parseInt(plan.duration_days, 10) * 24 * 60 * 60 * 1000);
        
        const client = await db.getClient();
        try {
            await client.query('BEGIN');
            // Ensure user and referrer (if any) exist
            await client.query(
                `INSERT INTO users (wallet_address, created_at, updated_at) VALUES ($1, NOW(), NOW()) ON CONFLICT (wallet_address) DO NOTHING`,
                [userWalletAddress]
            );
            if (referrerWalletAddress) {
                await client.query(
                    `INSERT INTO users (wallet_address, created_at, updated_at) VALUES ($1, NOW(), NOW()) ON CONFLICT (wallet_address) DO NOTHING`,
                    [referrerWalletAddress]
                );
                // Update new user's referrer if not already set
                await client.query(
                    `UPDATE users SET referrer_wallet_address = $1 WHERE wallet_address = $2 AND referrer_wallet_address IS NULL`,
                    [referrerWalletAddress, userWalletAddress]
                );
            }
            
            const { rows } = await client.query(
                `INSERT INTO user_stakes (
                    user_wallet_address, staking_plan_id, arix_amount_staked, reference_usdt_value_at_stake_time, 
                    stake_timestamp, unlock_timestamp, onchain_stake_tx_boc, status, updated_at
                 ) VALUES ($1, $2, $3, $4, $5, $6, $7, 'pending_confirmation', NOW()) RETURNING *`,
                [userWalletAddress, plan.plan_id, arixAmount, referenceUsdtValue, stakeTimestamp, unlockTimestamp, transactionBoc]
            );
            const newStake = rows[0];

            // Process L1 & L2 investment-based referral bonuses immediately
            if (referrerWalletAddress) {
                await this._processInvestmentReferralBonuses(client, newStake, plan, userWalletAddress, referenceUsdtValue);
            }
            
            await client.query('COMMIT');
            
            this.verifyOnChainArixStake(newStake.stake_id, transactionBoc)
                .catch(err => console.error(`Background ARIX stake verification failed for ${newStake.stake_id}:`, err.message));
            
            return newStake;
        } catch (error) { /* ... rollback, log, throw ... */ } finally { client.release(); }
    }

    async _processInvestmentReferralBonuses(dbClient, stake, plan, stakerWalletAddress, stakedUsdtValue) {
        const l1Referrer = (await dbClient.query("SELECT referrer_wallet_address FROM users WHERE wallet_address = $1", [stakerWalletAddress])).rows[0]?.referrer_wallet_address;
        if (!l1Referrer) return;

        let l1DirectBonusUsdt = 0;
        if (plan.referral_l1_invest_percent > 0) {
            l1DirectBonusUsdt = stakedUsdtValue * (parseFloat(plan.referral_l1_invest_percent) / 100);
            if (l1DirectBonusUsdt > 0) {
                await this._addReferralReward(dbClient, stake.stake_id, l1Referrer, stakerWalletAddress, 1, 'investment_percentage', l1DirectBonusUsdt);
            }
        }

        const l2Referrer = (await dbClient.query("SELECT referrer_wallet_address FROM users WHERE wallet_address = $1", [l1Referrer])).rows[0]?.referrer_wallet_address;
        if (!l2Referrer) return;

        // L2 bonus based on direct investment value
        if (plan.referral_l2_invest_percent > 0) {
            const l2BonusFromInvestment = stakedUsdtValue * (parseFloat(plan.referral_l2_invest_percent) / 100);
            if (l2BonusFromInvestment > 0) {
                await this._addReferralReward(dbClient, stake.stake_id, l2Referrer, l1Referrer, 2, 'investment_percentage', l2BonusFromInvestment);
            }
        }
        // L2 bonus based on L1's direct bonus (for Advanced/VIP type logic)
        if (plan.referral_l2_reward_percent_of_l1_direct_bonus > 0 && l1DirectBonusUsdt > 0) {
            const l2BonusFromL1Reward = l1DirectBonusUsdt * (parseFloat(plan.referral_l2_reward_percent_of_l1_direct_bonus) / 100);
            if (l2BonusFromL1Reward > 0) {
                 await this._addReferralReward(dbClient, stake.stake_id, l2Referrer, l1Referrer, 2, 'l1_bonus_percentage', l2BonusFromL1Reward);
            }
        }
    }
    
    async calculateAndStoreMonthlyUsdtRewards() {
        // ... (Implementation from previous response, ensuring it uses new schema columns like fixed_usdt_apr_percent)
        // This function will also call _processRewardBasedReferralBonuses if applicable for the plan.
        console.log("CRON: Starting monthly USDT reward calculation...");
        const client = await db.getClient();
        try {
            await client.query('BEGIN');
            const { rows: activeStakes } = await client.query( /* ... query for active stakes ... */ );
            for (const stake of activeStakes) {
                // ... calculate monthlyUsdtReward ...
                // Store in user_stakes.usdt_reward_accrued_total
                // Store in users.claimable_usdt_balance (after payout logic)
                // Call await this._processRewardBasedReferralBonuses(client, stake, plan_details, monthlyUsdtReward);
            }
            await client.query('COMMIT');
        } catch (e) { /* ... */ } finally { client.release(); }
    }
    
    async _processRewardBasedReferralBonuses(dbClient, stake, plan, monthlyUsdtRewardOfStaker) {
        // For "Advanced" / "VIP" plans where L1/L2 get % of staker's monthly USDT reward.
        // This logic needs to be carefully mapped from client's image: "X% of referral's reward"
        // Assuming "referral's reward" means the direct staker's monthly USDT reward.
        // This function is called by calculateAndStoreMonthlyUsdtRewards.
    }

    async _addReferralReward(dbClient, stakeId, referrer, referred, level, type, amountUsdt) {
        await dbClient.query(
            `INSERT INTO referral_rewards (stake_id, referrer_wallet_address, referred_wallet_address, level, reward_type, reward_amount_usdt, status)
             VALUES ($1, $2, $3, $4, $5, $6, 'pending_payout')`,
            [stakeId, referrer, referred, level, type, amountUsdt]
        );
        // Also update the referrer's claimable_usdt_balance
        await dbClient.query(
            `UPDATE users SET claimable_usdt_balance = claimable_usdt_balance + $1 WHERE wallet_address = $2`,
            [amountUsdt, referrer]
        );
    }

    async findAllStakesAndRewardsByUser(userWalletAddress, currentArxPrice) {
        // ... (Revised implementation from previous response, ensuring it fetches from new schema)
        // Should return stakes with their ARIX details and accrued/claimable USDT.
        // Also fetch total claimable_usdt_balance from users table.
        const userResult = await db.query("SELECT claimable_usdt_balance FROM users WHERE wallet_address = $1", [userWalletAddress]);
        const totalClaimableUsdt = userResult.rows[0] ? parseFloat(userResult.rows[0].claimable_usdt_balance) : 0;

        const stakesQuery = `
            SELECT us.*, sp.title AS plan_title, sp.fixed_usdt_apr_percent, sp.arix_early_unstake_penalty_percent, sp.duration_days AS plan_duration_days
            FROM user_stakes us
            JOIN staking_plans sp ON us.staking_plan_id = sp.plan_id
            WHERE us.user_wallet_address = $1 ORDER BY us.stake_timestamp DESC;
        `;
        const { rows: stakes } = await db.query(stakesQuery, [userWalletAddress]);
        
        return {
            stakes: stakes.map(s => ({ /* ... map to frontend structure ... */
                id: s.stake_id, planTitle: s.plan_title,
                arixAmountStaked: parseFloat(s.arix_amount_staked).toFixed(ARIX_DECIMALS),
                referenceUsdtValueAtStakeTime: parseFloat(s.reference_usdt_value_at_stake_time).toFixed(2),
                usdtApr: parseFloat(s.fixed_usdt_apr_percent),
                accruedUsdtRewardTotal: parseFloat(s.usdt_reward_accrued_total || 0).toFixed(USDT_DECIMALS),
                arixEarlyUnstakePenaltyPercent: parseFloat(s.arix_early_unstake_penalty_percent),
                status: s.status, /* ... other fields ... */
            })),
            totalClaimableUsdt: totalClaimableUsdt.toFixed(USDT_DECIMALS)
        };
    }
    
    async prepareArixUnstake(userWalletAddress, stakeId) { /* ... as in previous response ... */ }
    async finalizeArixUnstake({ userWalletAddress, stakeId, unstakeTransactionBoc }) { /* ... as in previous response, updates ARIX stake status ... */ }
    async verifyOnChainArixStake(stakeId, transactionBocBase64) { /* ... TODO: implement full verification ... */ }
    async verifyOnChainArixUnstake(stakeId, unstakeTransactionBocBase64) { /* ... TODO: implement full verification ... */ }

    async processUsdtWithdrawalRequest(userWalletAddress, amountToWithdrawUsdt) {
        if (amountToWithdrawUsdt < MIN_USDT_WITHDRAWAL) {
            throw new Error(`Minimum USDT withdrawal is $${MIN_USDT_WITHDRAWAL}.`);
        }
        const client = await db.getClient();
        try {
            await client.query('BEGIN');
            const userResult = await client.query("SELECT claimable_usdt_balance FROM users WHERE wallet_address = $1 FOR UPDATE", [userWalletAddress]);
            const currentClaimable = userResult.rows[0] ? parseFloat(userResult.rows[0].claimable_usdt_balance) : 0;

            if (currentClaimable < amountToWithdrawUsdt) {
                throw new Error(`Insufficient claimable USDT balance. Available: $${currentClaimable.toFixed(USDT_DECIMALS)}`);
            }
            
            const newBalance = currentClaimable - amountToWithdrawUsdt;
            await client.query("UPDATE users SET claimable_usdt_balance = $1 WHERE wallet_address = $2", [newBalance, userWalletAddress]);

            const { rows: withdrawalRecord } = await client.query(
                `INSERT INTO user_usdt_withdrawals (user_wallet_address, amount_usdt, status, requested_at)
                 VALUES ($1, $2, 'processing', NOW()) RETURNING withdrawal_id`,
                [userWalletAddress, amountToWithdrawUsdt]
            );
            const withdrawalId = withdrawalRecord[0].withdrawal_id;

            // TODO: Securely trigger actual USDT Jetton transfer from BACKEND_USDT_WALLET_ADDRESS
            // This is a critical security point. For now, we log and mark as processing.
            // const onchainTxHash = await triggerSecureUsdtPayout(userWalletAddress, amountToWithdrawUsdt);
            // if (onchainTxHash) {
            //    await client.query("UPDATE user_usdt_withdrawals SET status = 'completed', onchain_tx_hash = $1, processed_at = NOW() WHERE withdrawal_id = $2", [onchainTxHash, withdrawalId]);
            // } else {
            //    await client.query("UPDATE user_usdt_withdrawals SET status = 'failed' WHERE withdrawal_id = $1", [withdrawalId]);
            //    throw new Error("USDT payout transaction failed to initiate.");
            // }
            console.log(`USDT WITHDRAWAL: Marked withdrawal ID ${withdrawalId} for ${amountToWithdrawUsdt} USDT to ${userWalletAddress} as 'processing'. Actual payout TODO.`);

            await client.query('COMMIT');
            return { message: `USDT Withdrawal request for $${amountToWithdrawUsdt.toFixed(USDT_DECIMALS)} is processing.`, withdrawalId };
        } catch (error) { /* ... rollback, log, throw ... */ } finally { client.release(); }
    }
}
module.exports = new EarnService();
