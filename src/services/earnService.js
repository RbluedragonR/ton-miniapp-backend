const db = require('../config/database');

const ARIX_DECIMALS = 9;

class EarnService {
    async getActiveStakingPlans() {
        const { rows } = await db.query("SELECT plan_id, plan_key, title, duration_days, fixed_apr_percent, early_unstake_penalty_percent, min_stake_arix FROM staking_plans WHERE is_active = TRUE ORDER BY duration_days ASC");
        return rows;
    }

    async createStake({ planKey, arixAmount, userWalletAddress, transactionBoc, referenceUsdtValue }) {
        const plans = await this.getActiveStakingPlans();
        const plan = plans.find(p => p.plan_key === planKey);

        if (!plan) throw new Error("Invalid staking plan key.");
        
        const numericMinStakeArix = parseFloat(plan.min_stake_arix);
        if (arixAmount < numericMinStakeArix) {
            throw new Error(`Minimum stake for ${plan.title} is ${numericMinStakeArix} ARIX.`);
        }

        const stakeTimestamp = new Date();
        const unlockTimestamp = new Date(stakeTimestamp.getTime() + plan.duration_days * 24 * 60 * 60 * 1000);

        const { rows } = await db.query(
            `INSERT INTO user_stakes (user_wallet_address, staking_plan_id, arix_amount_staked, reference_usdt_value_at_stake_time, stake_timestamp, unlock_timestamp, onchain_stake_tx_boc, status)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
            [userWalletAddress, plan.plan_id, arixAmount, referenceUsdtValue, stakeTimestamp, unlockTimestamp, transactionBoc, 'pending_confirmation']
        );
        return rows[0];
    }

    async findActiveStakesByUserWithDetails(userWalletAddress, currentArxPrice) {
        const query = `
            SELECT 
                us.stake_id,
                sp.plan_key,
                sp.title AS plan_title,
                sp.duration_days AS plan_duration_days,
                sp.fixed_apr_percent,
                sp.early_unstake_penalty_percent,
                us.arix_amount_staked,
                us.reference_usdt_value_at_stake_time,
                us.stake_timestamp,
                us.unlock_timestamp,
                us.status,
                (EXTRACT(EPOCH FROM (us.unlock_timestamp - NOW())) / (24 * 60 * 60))::INTEGER AS remaining_days
            FROM user_stakes us
            JOIN staking_plans sp ON us.staking_plan_id = sp.plan_id
            WHERE us.user_wallet_address = $1 AND (us.status = 'active' OR us.status = 'pending_confirmation')
            ORDER BY us.stake_timestamp DESC;
        `;
        const { rows } = await db.query(query, [userWalletAddress]);
        
        return rows.map(row => {
            const arixAmountStakedNum = parseFloat(row.arix_amount_staked);
            const fixedAprNum = parseFloat(row.fixed_apr_percent);
            const durationDaysNum = parseInt(row.plan_duration_days);
            
            let accruedArixReward = 0;
            if (row.status === 'active' || row.status === 'pending_confirmation') {
                const timeElapsedMs = new Date() - new Date(row.stake_timestamp);
                const daysElapsed = timeElapsedMs / (1000 * 60 * 60 * 24);
                const effectiveDaysForAccrual = Math.min(daysElapsed, durationDaysNum);
                accruedArixReward = (arixAmountStakedNum * (fixedAprNum / 100) * effectiveDaysForAccrual) / 365;
            }

            return {
                id: row.stake_id,
                planTitle: row.plan_title,
                arixAmountStaked: arixAmountStakedNum,
                currentUsdtValueRef: currentArxPrice ? (arixAmountStakedNum * currentArxPrice).toFixed(2) : 'N/A',
                referenceUsdtValueAtStakeTime: row.reference_usdt_value_at_stake_time ? parseFloat(row.reference_usdt_value_at_stake_time).toFixed(2) : 'N/A',
                apr: fixedAprNum, // Send the single fixed APR
                earlyUnstakePenaltyPercent: parseFloat(row.early_unstake_penalty_percent),
                accruedArixReward: parseFloat(accruedArixReward.toFixed(ARIX_DECIMALS)),
                remainingDays: row.remaining_days > 0 ? row.remaining_days : 0,
                status: row.status,
                stakeTimestamp: row.stake_timestamp,
                unlockTimestamp: row.unlock_timestamp
            };
        });
    }
    
    async prepareUnstake(userWalletAddress, stakeId) {
        const { rows } = await db.query(
            "SELECT us.*, sp.duration_days, sp.early_unstake_penalty_percent FROM user_stakes us JOIN staking_plans sp ON us.staking_plan_id = sp.plan_id WHERE us.stake_id = $1 AND us.user_wallet_address = $2", 
            [stakeId, userWalletAddress]
        );
        if (rows.length === 0) throw new Error("Stake not found or not owned by user.");
        const stake = rows[0];

        if (stake.status !== 'active' && stake.status !== 'pending_confirmation') {
             throw new Error(`Stake is not active or pending. Current status: ${stake.status}`);
        }

        const now = new Date();
        const unlockTime = new Date(stake.unlock_timestamp);
        let penaltyPercentToApply = 0;
        let message = "Ready to unstake. You will receive your principal ARIX and earned ARIX rewards.";

        if (now < unlockTime) { // Early unstake
            penaltyPercentToApply = parseFloat(stake.early_unstake_penalty_percent);
            message = `Early unstake: A ${penaltyPercentToApply}% penalty on staked ARIX will apply. All accrued ARIX rewards will be forfeited.`;
        }
        return { 
            message, 
            stakeId: stake.stake_id, 
            isEarly: now < unlockTime, 
            penaltyPercent: penaltyPercentToApply,
            principalArix: parseFloat(stake.arix_amount_staked) 
        };
    }

    async finalizeUnstakeAndPayArixRewards(userWalletAddress, stakeId, unstakeTransactionBoc) {
        // 1. TODO: Verify unstakeTransactionBoc on-chain.

        const { rows } = await db.query(
            "SELECT us.*, sp.fixed_apr_percent, sp.duration_days, sp.early_unstake_penalty_percent FROM user_stakes us JOIN staking_plans sp ON us.staking_plan_id = sp.plan_id WHERE us.stake_id = $1 AND us.user_wallet_address = $2",
            [stakeId, userWalletAddress]
        );
        if (rows.length === 0) throw new Error("Stake not found for finalization.");
        const stake = rows[0];

        if (stake.status !== 'active' && stake.status !== 'pending_confirmation' && stake.status !== 'pending_unstake') {
             throw new Error(`Stake status (${stake.status}) does not allow finalization.`);
        }

        let arixRewardAmount = 0;
        const now = new Date(); 
        const unlockTime = new Date(stake.unlock_timestamp);
        const principalArix = parseFloat(stake.arix_amount_staked);
        const fixedApr = parseFloat(stake.fixed_apr_percent);
        const durationDays = parseInt(stake.duration_days);
        const earlyUnstakePenaltyPercent = parseFloat(stake.early_unstake_penalty_percent);

        let finalStatus = 'completed';
        let penaltyAmountArix = 0;
        let actualPrincipalReturned = principalArix;

        if (now < unlockTime) { // Early unstake
            finalStatus = 'early_unstaked';
            arixRewardAmount = 0; 
            penaltyAmountArix = principalArix * (earlyUnstakePenaltyPercent / 100);
            actualPrincipalReturned = principalArix - penaltyAmountArix;
        } else { // Full term or late unstake
            arixRewardAmount = (principalArix * (fixedApr / 100) * durationDays) / 365;
        }
        
        arixRewardAmount = parseFloat(arixRewardAmount.toFixed(ARIX_DECIMALS));
        penaltyAmountArix = parseFloat(penaltyAmountArix.toFixed(ARIX_DECIMALS));
        actualPrincipalReturned = parseFloat(actualPrincipalReturned.toFixed(ARIX_DECIMALS));

        await db.query(
            "UPDATE user_stakes SET status = $1, arix_reward_calculated = $2, onchain_unstake_tx_boc = $3, updated_at = NOW(), arix_reward_paid = $2 WHERE stake_id = $4",
            [finalStatus, arixRewardAmount, unstakeTransactionBoc, stakeId]
        );
        
        return {
            message: `Unstake finalized. Status: ${finalStatus}. ARIX Reward (from SC): ${arixRewardAmount}. Principal ARIX (from SC after penalty if any): ${actualPrincipalReturned}.`,
            arixRewardPaid: arixRewardAmount,
            principalReturned: actualPrincipalReturned,
            penaltyApplied: penaltyAmountArix
        };
    }
}

module.exports = new EarnService();
