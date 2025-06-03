// File: ar_backend/src/services/earnService.js
const db = require('../config/database');
const { TonClient, Address, Cell, Slice, beginCell, internal, WalletContractV4, toNano, fromNano } = require('@ton/ton');
const { getHttpEndpoint } = require('@orbs-network/ton-access');
const { mnemonicToPrivateKey } = require('@ton/crypto'); 

const priceService = require('./priceService');
const tonUtils = require('../utils/tonUtils'); 
const { 
    STAKING_CONTRACT_ADDRESS, 
    ARIX_TOKEN_MASTER_ADDRESS,
    // Removed USDT_REWARD_JETTON_MASTER_ADDRESS, BACKEND_USDT_WALLET_ADDRESS, BACKEND_USDT_WALLET_MNEMONIC
    BACKEND_ARIX_WALLET_ADDRESS,      // New: Backend's ARIX payout wallet address
    BACKEND_ARIX_WALLET_MNEMONIC,     // New: Mnemonic for backend's ARIX payout wallet
    STAKING_CONTRACT_JETTON_WALLET_ADDRESS,
    TON_NETWORK
} = require('../config/envConfig');

const ARIX_DECIMALS = 9;
const USD_DECIMALS = 2; // For displaying USD values
const MIN_ARIX_WITHDRAWAL_APPROX_USD_VALUE = 3; // Minimum withdrawal equivalent to $3 USD

// OP Codes for TEP-74 Jetton standard (used in verification)
const OP_JETTON_TRANSFER = 0x0f8a7ea5;
const OP_JETTON_INTERNAL_TRANSFER = 0x178d4519;
const OP_JETTON_TRANSFER_NOTIFICATION = 0x7362d09c;

// Helper to parse StakeParametersFromUser from forward_payload (from Tact contract)
function parseStakeParametersFromForwardPayload(forwardPayloadSlice) {
    try {
        const queryId = forwardPayloadSlice.loadUintBig(64);
        const stakeIdentifier = forwardPayloadSlice.loadUintBig(64);
        const durationSeconds = forwardPayloadSlice.loadUint(32);
        const arixLockAprBps = forwardPayloadSlice.loadUint(16);
        const arixLockPenaltyBps = forwardPayloadSlice.loadUint(16);
        return { queryId, stakeIdentifier, durationSeconds, arixLockAprBps, arixLockPenaltyBps };
    } catch (e) {
        console.error("Failed to parse StakeParametersFromUser from forward_payload:", e);
        return null;
    }
}

// Helper to parse the unstake response payload from the Staking Contract's Jetton Wallet (from Tact contract)
function parseUnstakeResponsePayload(payloadSlice) {
    try {
        const queryId = payloadSlice.loadUintBig(64);
        const stakerAddress = payloadSlice.loadAddress(); 
        const stakeIdentifierProcessed = payloadSlice.loadUintBig(64);
        const finalArixAmountReturned = payloadSlice.loadCoins();
        const arixLockRewardPaid = payloadSlice.loadCoins();
        const arixPenaltyApplied = payloadSlice.loadCoins();
        return { queryId, stakerAddress, stakeIdentifierProcessed, finalArixAmountReturned, arixLockRewardPaid, arixPenaltyApplied };
    } catch (e) {
        console.error("Failed to parse UnstakeResponsePayload from forward_payload:", e);
        return null;
    }
}


class EarnService {
    async getActiveStakingPlans() {
        const { rows } = await db.query(
            `SELECT plan_id, plan_key, title, duration_days, 
                    apr_percent_of_initial_usd_value, arix_early_unstake_penalty_percent, min_stake_usd, 
                    referral_l1_invest_percent, referral_l2_invest_percent,
                    referral_l1_reward_percent_of_l1_direct_bonus, referral_l2_reward_percent_of_l1_direct_bonus,
                    is_active 
             FROM staking_plans WHERE is_active = TRUE ORDER BY duration_days ASC`
        );
        return rows.map(p => ({
            ...p,
            plan_id: parseInt(p.plan_id),
            duration_days: parseInt(p.duration_days),
            apr_percent_of_initial_usd_value: parseFloat(p.apr_percent_of_initial_usd_value),
            arix_early_unstake_penalty_percent: parseFloat(p.arix_early_unstake_penalty_percent),
            min_stake_usd: parseFloat(p.min_stake_usd),
            max_stake_arix: p.max_stake_arix ? parseFloat(p.max_stake_arix) : null, // Assuming max_stake_arix is still relevant
            referral_l1_invest_percent: parseFloat(p.referral_l1_invest_percent || 0),
            referral_l2_invest_percent: parseFloat(p.referral_l2_invest_percent || 0),
            referral_l1_reward_percent_of_l1_direct_bonus: parseFloat(p.referral_l1_reward_percent_of_l1_direct_bonus || 0),
            referral_l2_reward_percent_of_l1_direct_bonus: parseFloat(p.referral_l2_reward_percent_of_l1_direct_bonus || 0),
        }));
    }

    async getPlanByKey(planKey) {
        const { rows } = await db.query(
            "SELECT * FROM staking_plans WHERE plan_key = $1 AND is_active = TRUE", [planKey]
        );
        if (!rows[0]) return null;
        const p = rows[0];
        return {
            ...p,
            plan_id: parseInt(p.plan_id),
            duration_days: parseInt(p.duration_days),
            apr_percent_of_initial_usd_value: parseFloat(p.apr_percent_of_initial_usd_value),
            arix_early_unstake_penalty_percent: parseFloat(p.arix_early_unstake_penalty_percent),
            min_stake_usd: parseFloat(p.min_stake_usd),
            max_stake_arix: p.max_stake_arix ? parseFloat(p.max_stake_arix) : null, // Assuming max_stake_arix is still relevant
            referral_l1_invest_percent: parseFloat(p.referral_l1_invest_percent || 0),
            referral_l2_invest_percent: parseFloat(p.referral_l2_invest_percent || 0),
            referral_l1_reward_percent_of_l1_direct_bonus: parseFloat(p.referral_l1_reward_percent_of_l1_direct_bonus || 0),
            referral_l2_reward_percent_of_l1_direct_bonus: parseFloat(p.referral_l2_reward_percent_of_l1_direct_bonus || 0),
        };
    }
    
    async createStake({ planKey, arixAmount, userWalletAddress, transactionBoc, referenceUsdtValue, referrerWalletAddress, transactionHash, stakeUUID }) {
        const plan = await this.getPlanByKey(planKey);
        if (!plan) throw new Error("Invalid or inactive staking plan key.");
        // Validate minimum stake based on USD value (frontend conversion to ARIX for actual stake)
        if (referenceUsdtValue < plan.min_stake_usd) {
            throw new Error(`Minimum stake for ${plan.title} is $${plan.min_stake_usd.toFixed(USD_DECIMALS)} USD.`);
        }
        if (arixAmount <= 0) throw new Error("ARIX amount must be positive.");
        if (!transactionHash) throw new Error("Transaction hash is required to record the stake.");
        if (!stakeUUID) throw new Error("Valid Stake UUID from frontend is required.");

        const stakeTimestamp = new Date();
        const unlockTimestamp = new Date(stakeTimestamp.getTime() + plan.duration_days * 24 * 60 * 60 * 1000);
        
        const client = await db.getClient();
        try {
            await client.query('BEGIN');
            // Ensure user and referrer (if any) exist
            await client.query(
                `INSERT INTO users (wallet_address, created_at, updated_at) VALUES ($1, NOW(), NOW()) ON CONFLICT (wallet_address) DO NOTHING`,
                [userWalletAddress]
            );
            if (referrerWalletAddress && referrerWalletAddress !== userWalletAddress) {
                await client.query(
                    `INSERT INTO users (wallet_address, created_at, updated_at) VALUES ($1, NOW(), NOW()) ON CONFLICT (wallet_address) DO NOTHING`,
                    [referrerWalletAddress]
                );
                await client.query(
                    `UPDATE users SET referrer_wallet_address = $1, updated_at = NOW() WHERE wallet_address = $2 AND referrer_wallet_address IS NULL`,
                    [referrerWalletAddress, userWalletAddress]
                );
            }
            
            const { rows } = await client.query(
                `INSERT INTO user_stakes (
                    stake_id, user_wallet_address, staking_plan_id, arix_amount_staked, 
                    reference_usdt_value_at_stake_time, stake_timestamp, unlock_timestamp, 
                    onchain_stake_tx_boc, onchain_stake_tx_hash, status, created_at, updated_at
                 ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'pending_confirmation', NOW(), NOW())
                RETURNING stake_id`,
                [stakeUUID, userWalletAddress, plan.plan_id, arixAmount, referenceUsdtValue, 
                 stakeTimestamp, unlockTimestamp, transactionBoc, transactionHash]
            );
            const newStakeId = rows[0].stake_id;

            if (referrerWalletAddress && referrerWalletAddress !== userWalletAddress) {
                // Pass stake's USD value for referral calculation
                await this._processInvestmentReferralBonuses(client, newStakeId, plan, userWalletAddress, referenceUsdtValue);
            }
            
            await client.query('COMMIT');
            
            this.verifyOnChainArixStake(newStakeId)
                .then(verificationResult => { 
                    if(verificationResult.verified) console.log(`BG Stake Verify OK for ${newStakeId}`);
                    else console.warn(`BG Stake Verify NOK for ${newStakeId}: ${verificationResult.reason}`);
                })
                .catch(err => console.error(`BG Stake Verify Error for ${newStakeId}:`, err.message));
            
            return { stake_id: newStakeId, status: 'pending_confirmation', transactionHash };
        } catch (error) {
            await client.query('ROLLBACK');
            if (error.constraint === 'user_stakes_pkey' || (error.message && error.message.includes("duplicate key value violates unique constraint"))) {
                 console.error("SERVICE: Error in createStake - Duplicate Stake ID (UUID):", stakeUUID, error.message);
                 throw new Error(`Stake with ID ${stakeUUID} already exists. Possible duplicate submission.`);
            }
            console.error("SERVICE: Error in createStake:", error.message, error.stack);
            throw error;
        } finally {
            client.release();
        }
    }

    async _processInvestmentReferralBonuses(dbClient, stakeId, plan, stakerWalletAddress, stakedUsdValue) {
        const l1ReferrerQuery = await dbClient.query("SELECT referrer_wallet_address FROM users WHERE wallet_address = $1", [stakerWalletAddress]);
        const l1Referrer = l1ReferrerQuery.rows[0]?.referrer_wallet_address;
        if (!l1Referrer || l1Referrer === stakerWalletAddress) return;

        let l1DirectBonusUsdValue = 0;
        if (plan.referral_l1_invest_percent > 0) {
            l1DirectBonusUsdValue = stakedUsdValue * (plan.referral_l1_invest_percent / 100);
            if (l1DirectBonusUsdValue > 0) {
                const currentArxPrice = await priceService.getArxUsdtPrice();
                if (currentArxPrice && currentArxPrice > 0) {
                    const l1DirectBonusArix = l1DirectBonusUsdValue / currentArxPrice;
                    await this._addReferralReward(dbClient, stakeId, l1Referrer, stakerWalletAddress, 1, 'investment_percentage_l1', l1DirectBonusArix);
                } else {
                    console.warn(`Could not get ARIX price to calculate L1 referral bonus for stake ${stakeId}. USD value: ${l1DirectBonusUsdValue}`);
                }
            }
        }

        const l2ReferrerQuery = await dbClient.query("SELECT referrer_wallet_address FROM users WHERE wallet_address = $1", [l1Referrer]);
        const l2Referrer = l2ReferrerQuery.rows[0]?.referrer_wallet_address;
        if (!l2Referrer || l2Referrer === l1Referrer || l2Referrer === stakerWalletAddress) return;

        if (plan.referral_l2_invest_percent > 0) {
            const l2BonusFromInvestmentUsd = stakedUsdValue * (plan.referral_l2_invest_percent / 100);
            if (l2BonusFromInvestmentUsd > 0) {
                const currentArxPrice = await priceService.getArxUsdtPrice();
                if (currentArxPrice && currentArxPrice > 0) {
                    const l2BonusFromInvestmentArix = l2BonusFromInvestmentUsd / currentArxPrice;
                    await this._addReferralReward(dbClient, stakeId, l2Referrer, stakerWalletAddress, 2, 'investment_percentage_l2', l2BonusFromInvestmentArix);
                } else {
                    console.warn(`Could not get ARIX price to calculate L2 investment referral bonus for stake ${stakeId}. USD value: ${l2BonusFromInvestmentUsd}`);
                }
            }
        }
        // L2 bonus based on L1's direct bonus (for Advanced/VIP type logic)
        if (plan.referral_l2_reward_percent_of_l1_direct_bonus > 0 && l1DirectBonusUsdValue > 0) {
            const l2BonusFromL1RewardUsd = l1DirectBonusUsdValue * (plan.referral_l2_reward_percent_of_l1_direct_bonus / 100);
            if (l2BonusFromL1RewardUsd > 0) {
                const currentArxPrice = await priceService.getArxUsdtPrice();
                if (currentArxPrice && currentArxPrice > 0) {
                    const l2BonusFromL1RewardArix = l2BonusFromL1RewardUsd / currentArxPrice;
                    await this._addReferralReward(dbClient, stakeId, l2Referrer, l1Referrer, 2, 'l1_direct_bonus_commission_l2', l2BonusFromL1RewardArix);
                } else {
                    console.warn(`Could not get ARIX price to calculate L2 L1-reward referral bonus for stake ${stakeId}. USD value: ${l2BonusFromL1RewardUsd}`);
                }
            }
        }
    }
    
    async _addReferralReward(dbClient, stakeId, referrerWallet, sourceUserWallet, level, rewardType, amountArix) {
        await dbClient.query(
            `INSERT INTO referral_rewards (stake_id, referrer_wallet_address, referred_wallet_address, level, reward_type, reward_amount_arix_equivalent_of_usd_value, status, created_at)
             VALUES ($1, $2, $3, $4, $5, $6, 'pending_payout', NOW())`,
            [stakeId, referrerWallet, sourceUserWallet, level, rewardType, amountArix]
        );
        await dbClient.query(
            `UPDATE users SET total_claimable_arix_rewards = COALESCE(total_claimable_arix_rewards, 0) + $1, updated_at = NOW() WHERE wallet_address = $2`,
            [amountArix, referrerWallet]
        );
         console.log(`Referral Reward: ${amountArix.toFixed(ARIX_DECIMALS)} ARIX for ${referrerWallet} (L${level}) from user ${sourceUserWallet}, type: ${rewardType}.`);
    }

    async calculateAndStoreMonthlyArixRewards() { // Renamed from calculateAndStoreMonthlyUsdtRewards
        console.log("CRON_JOB: Starting monthly ARIX reward & referral calculation...");
        const client = await db.getClient();
        try {
            await client.query('BEGIN');
            const { rows: activeStakes } = await client.query(`
                SELECT us.stake_id, us.user_wallet_address, us.reference_usdt_value_at_stake_time, 
                       us.last_arix_reward_calc_timestamp, us.stake_timestamp, us.unlock_timestamp,
                       sp.plan_id, sp.plan_key, sp.apr_percent_of_initial_usd_value, sp.duration_days
                FROM user_stakes us
                JOIN staking_plans sp ON us.staking_plan_id = sp.plan_id
                WHERE us.status = 'active' AND us.unlock_timestamp > NOW()
            `);

            let totalStakesProcessed = 0;
            let totalReferralBonuses = 0;

            const currentArxPrice = await priceService.getArxUsdtPrice();
            if (!currentArxPrice || currentArxPrice <= 0) {
                console.error("CRON_JOB_ERROR: Could not fetch current ARIX price. Aborting monthly reward calculation.");
                await client.query('ROLLBACK');
                return;
            }

            for (const stake of activeStakes) {
                const plan = await this.getPlanByKey(stake.plan_key);
                if (!plan) {
                    console.warn(`CRON_JOB: Plan ${stake.plan_key} for stake ${stake.stake_id} not found. Skipping.`);
                    continue;
                }

                const now = new Date();
                let lastCalcTime = stake.last_arix_reward_calc_timestamp ? new Date(stake.last_arix_reward_calc_timestamp) : new Date(stake.stake_timestamp);
                let shouldCalculate = !stake.last_arix_reward_calc_timestamp || (now >= new Date(lastCalcTime.getFullYear(), lastCalcTime.getMonth() + 1, lastCalcTime.getDate()));
                
                if (!shouldCalculate) continue;

                // Calculate USD value of reward
                const monthlyUsdRewardForStaker = (parseFloat(stake.reference_usdt_value_at_stake_time) * (parseFloat(stake.apr_percent_of_initial_usd_value) / 100)) / 12;
                
                // Convert USD reward to ARIX using current price
                const monthlyArixRewardForStaker = monthlyUsdRewardForStaker / currentArxPrice;

                if (monthlyArixRewardForStaker > 0) {
                    await client.query(
                        `UPDATE user_stakes SET arix_reward_accrued_total = COALESCE(arix_reward_accrued_total, 0) + $1, last_arix_reward_calc_timestamp = NOW(), updated_at = NOW() WHERE stake_id = $2`,
                        [monthlyArixRewardForStaker, stake.stake_id]
                    );
                    await client.query(
                        `UPDATE users SET total_claimable_arix_rewards = COALESCE(total_claimable_arix_rewards, 0) + $1, updated_at = NOW() WHERE wallet_address = $2`,
                        [monthlyArixRewardForStaker, stake.user_wallet_address]
                    );
                    totalStakesProcessed++;
                    console.log(`CRON_JOB: Stake ${stake.stake_id} (User ${stake.user_wallet_address}) awarded ${monthlyArixRewardForStaker.toFixed(ARIX_DECIMALS)} ARIX directly.`);

                    // Monthly referral bonuses based on staker's monthly USD earnings, paid in ARIX
                    const stakerWalletAddress = stake.user_wallet_address;
                    const l1ReferrerQuery = await client.query("SELECT referrer_wallet_address FROM users WHERE wallet_address = $1", [stakerWalletAddress]);
                    const l1Referrer = l1ReferrerQuery.rows[0]?.referrer_wallet_address;

                    // Note: The SQL schema provided by the user does not have `ref_monthly_l1_usdt_earn_percent`
                    // or `ref_monthly_l2_usdt_earn_percent`. Assuming referral percentages for 'investment'
                    // are now re-used or a new definition for monthly referral is needed.
                    // For now, I will use a simplified assumption: if L1/L2 get a % of direct monthly reward.
                    // This logic is based on the previous `setup_usdt_referral_staking_backend.sh` not the latest SQL.
                    // I will remove the monthly referral bonus part as the SQL schema doesn't support it,
                    // focusing only on investment bonuses which are handled by `_processInvestmentReferralBonuses`.
                    // If monthly referral rewards are required, new columns in staking_plans for them are necessary.
                }
            }
            await client.query('COMMIT');
            console.log(`CRON_JOB: Monthly ARIX reward calculation finished. ${totalStakesProcessed} stakes processed directly. ${totalReferralBonuses} referral bonuses processed.`);
        } catch (error) {
            await client.query('ROLLBACK');
            console.error("CRON_JOB_ERROR: Error during monthly ARIX reward & referral calculation:", error.message, error.stack);
        } finally {
            client.release();
        }
    }
    
    async prepareArixUnstake(userWalletAddress, stakeId) {
        const { rows } = await db.query(
            `SELECT us.stake_id, us.arix_amount_staked, us.unlock_timestamp, us.status,
                    sp.arix_early_unstake_penalty_percent, sp.duration_days
             FROM user_stakes us JOIN staking_plans sp ON us.staking_plan_id = sp.plan_id
             WHERE us.stake_id = $1 AND us.user_wallet_address = $2`,
            [stakeId, userWalletAddress]
        );
        if (!rows[0]) throw new Error("ARIX Stake not found or not owned by user.");
        const stake = rows[0];
        if (stake.status !== 'active') {
            throw new Error(`ARIX Stake is not active (Status: ${stake.status}). Cannot initiate unstake.`);
        }

        const now = new Date();
        const unlockTime = new Date(stake.unlock_timestamp);
        const principalArix = parseFloat(stake.arix_amount_staked);
        let penaltyPercent = 0;
        let message = "";
        const isEarly = now < unlockTime;

        if (isEarly) {
            penaltyPercent = parseFloat(stake.arix_early_unstake_penalty_percent);
            message = `This is an EARLY unstake of ARIX principal. A ${penaltyPercent}% penalty on staked ARIX will apply. Any ARIX-specific lock rewards (if applicable) would be forfeited by the SC. ARIX rewards from initial USD value are managed separately by the backend.`;
        } else {
            message = "Ready for full-term ARIX principal unstake. You will receive your ARIX principal (plus any ARIX-specific lock rewards, if applicable from the SC).";
        }
        return {
            message, stakeId: stake.stake_id, isEarly, principalArix: principalArix.toFixed(ARIX_DECIMALS),
            arixPenaltyPercentApplied: penaltyPercent,
        };
    }

    async finalizeArixUnstake({ userWalletAddress, stakeId, unstakeTransactionBoc, unstakeTransactionHash }) {
        if (!unstakeTransactionHash) {
             throw new Error("Unstake transaction hash is required to finalize and verify the unstake.");
        }
        console.log(`FINALIZE_ARIX_UNSTAKE (Stake ID: ${stakeId}): Hash ${unstakeTransactionHash}.`);
        
        const client = await db.getClient();
        try {
            await client.query('BEGIN');
            const { rows: stakeRows } = await client.query(
                `SELECT us.status FROM user_stakes us 
                 WHERE us.stake_id = $1 AND us.user_wallet_address = $2 FOR UPDATE`,
                [stakeId, userWalletAddress]
            );
            if (!stakeRows[0]) throw new Error("ARIX Stake not found for finalization.");
            const stake = stakeRows[0];

            if (stake.status !== 'active') {
                throw new Error(`ARIX Stake status (${stake.status}) does not allow unstake finalization. Expected 'active'.`);
            }
            
            await client.query(
                `UPDATE user_stakes 
                 SET status = 'pending_arix_unstake_confirmation', 
                     onchain_unstake_tx_boc = $1, 
                     onchain_unstake_tx_hash = $2, 
                     updated_at = NOW() 
                 WHERE stake_id = $3`,
                [unstakeTransactionBoc, unstakeTransactionHash, stakeId]
            );
            await client.query('COMMIT');
            
            this.verifyOnChainArixUnstakeOutcome(stakeId)
                .then(res => console.log(`BG Unstake Verify (Stake ${stakeId}): ${res.reason}`))
                .catch(err => console.error(`BG Unstake Verify Err (Stake ${stakeId}):`, err));

            return {
                message: `ARIX Unstake request submitted. Status: pending_arix_unstake_confirmation.`,
                stake_id: stakeId, transactionHash: unstakeTransactionHash
            };
        } catch (error) { await client.query('ROLLBACK'); throw error; } 
        finally { client.release(); }
    }
    
    async verifyOnChainArixStake(stakeId) { // stakeId is DB UUID
        console.log(`VERIFY_STAKE (Stake ID: ${stakeId}): Starting on-chain verification.`);
        let stakeRecord;
        let planRecord;
        let userArixJettonWalletAddress;

        try {
            const stakeRes = await db.query(
                `SELECT us.arix_amount_staked, us.user_wallet_address, us.onchain_stake_tx_hash, us.status,
                        sp.plan_id, sp.duration_days, sp.arix_early_unstake_penalty_percent, sp.plan_key
                 FROM user_stakes us JOIN staking_plans sp ON us.staking_plan_id = sp.plan_id 
                 WHERE us.stake_id = $1`, [stakeId]);
            
            if (!stakeRes.rows[0]) {
                console.error(`VERIFY_STAKE (Stake ID: ${stakeId}): Stake not found in DB.`);
                return { verified: false, reason: "Stake not found in DB." };
            }
            stakeRecord = stakeRes.rows[0];
            planRecord = await this.getPlanByKey(stakeRecord.plan_key);

            if (stakeRecord.status !== 'pending_confirmation') {
                console.log(`VERIFY_STAKE (Stake ID: ${stakeId}): Stake status is not 'pending_confirmation' (is ${stakeRecord.status}). Skipping.`);
                return { verified: true, reason: `Already processed (status: ${stakeRecord.status})` };
            }
            if (!stakeRecord.onchain_stake_tx_hash) {
                console.warn(`VERIFY_STAKE (Stake ID: ${stakeId}): Missing onchain_stake_tx_hash. Cannot verify.`);
                await db.query("UPDATE user_stakes SET status = 'stake_failed', notes = $2, updated_at = NOW() WHERE stake_id = $1", [stakeId, "Missing transaction hash for verification."]);
                return { verified: false, reason: "Missing transaction hash." };
            }

            const tonClient = await tonUtils.getTonClient();
            const userAddr = Address.parse(stakeRecord.user_wallet_address);
            userArixJettonWalletAddress = await tonUtils.getJettonWalletAddress(userAddr.toString({bounceable: true, testOnly: TON_NETWORK === 'testnet'}), ARIX_TOKEN_MASTER_ADDRESS);
            if (!userArixJettonWalletAddress) {
                 throw new Error(`Could not derive user's ARIX Jetton Wallet for ${userAddr.toString({bounceable: true, testOnly: TON_NETWORK === 'testnet'})}. Master: ${ARIX_TOKEN_MASTER_ADDRESS}`);
            }

            const txs = await tonClient.getTransactions(userAddr, {
                hash: Buffer.from(stakeRecord.onchain_stake_tx_hash, 'hex'),
                limit: 1,
            });

            if (!txs || txs.length === 0) {
                console.warn(`VERIFY_STAKE (Stake ID: ${stakeId}): Transaction ${stakeRecord.onchain_stake_tx_hash} not found originating from user's main wallet. It might be still processing or hash is incorrect.`);
                return { verified: false, reason: "Transaction not found from user's main wallet (yet?)." };
            }
            
            const stakeTx = txs[0];
            let verified = false;
            let verificationNote = "Verification failed: No matching Jetton transfer message found to SC's Jetton Wallet.";

            if (stakeTx.computePhase.type !== 'vm' || stakeTx.computePhase.exitCode !== 0) {
                verificationNote = `Stake initiation transaction failed on-chain. Exit code: ${stakeTx.computePhase.exitCode || 'N/A'}`;
                await db.query("UPDATE user_stakes SET status = 'stake_failed', notes = $2, updated_at = NOW() WHERE stake_id = $1", [stakeId, verificationNote.substring(0,250)]);
                return { verified: false, reason: verificationNote };
            }

            for (const outMsg of stakeTx.outMessages.values()) {
                if (outMsg.info.type === 'internal' && outMsg.info.dest?.equals(Address.parse(userArixJettonWalletAddress))) {
                    const userJwCallBody = outMsg.body.beginParse();
                    const opUserJw = userJwCallBody.loadUint(32);
                    if (opUserJw === OP_JETTON_TRANSFER) { 
                        userJwCallBody.loadUintBig(64); 
                        const jettonAmountToSc = userJwCallBody.loadCoins();
                        const scJettonWalletDest = userJwCallBody.loadAddress();
                        
                        if (!scJettonWalletDest?.equals(Address.parse(STAKING_CONTRACT_JETTON_WALLET_ADDRESS))) {
                            verificationNote = "Jetton transfer not to SC's Jetton Wallet."; continue;
                        }
                        const expectedAmount = toNano(stakeRecord.arix_amount_staked);
                        if (jettonAmountToSc !== expectedAmount) {
                            verificationNote = `Amount mismatch. Expected: ${expectedAmount}, Got: ${jettonAmountToSc}`; continue;
                        }
                        
                        userJwCallBody.loadAddress(); 
                        userJwCallBody.loadBit(); 
                        userJwCallBody.loadCoins(); 
                        const forwardPayloadCell = userJwCallBody.loadMaybeRef();

                        if (!forwardPayloadCell) { verificationNote = "Forward payload missing."; continue; }
                        const scPayload = parseStakeParametersFromForwardPayload(forwardPayloadCell.beginParse());
                        if (!scPayload) { verificationNote = "Failed to parse forward payload for SC."; continue; }
                        
                        const expectedDurationSeconds = planRecord.duration_days * 24 * 60 * 60;
                        const expectedScStakeId = BigInt('0x' + stakeId.replace(/-/g, '').substring(0, 16));

                        if (scPayload.stakeIdentifier !== expectedScStakeId) {
                            verificationNote = `Stake Identifier mismatch. Expected derived: ${expectedScStakeId}, Got: ${scPayload.stakeIdentifier}`; continue;
                        }
                        if (scPayload.durationSeconds !== expectedDurationSeconds) {
                             verificationNote = `Duration mismatch. Expected: ${expectedDurationSeconds}, Got: ${scPayload.durationSeconds}`; continue;
                        }
                        // TODO: Add checks for scPayload.arixLockAprBps and scPayload.arixLockPenaltyBps against planRecord if these are defined in planRecord for ARIX lock terms

                        verified = true;
                        verificationNote = "Stake transaction verified successfully (user JW call to SC JW).";
                        break; 
                    }
                }
            }

            if (verified) {
                await db.query("UPDATE user_stakes SET status = 'active', updated_at = NOW(), last_arix_reward_calc_timestamp = NOW(), notes = $2 WHERE stake_id = $1", [stakeId, verificationNote.substring(0,250)]);
            } else {
                await db.query("UPDATE user_stakes SET status = 'stake_failed', notes = $2, updated_at = NOW() WHERE stake_id = $1", [stakeId, verificationNote.substring(0,250)]);
            }
            return { verified, reason: verificationNote };

        } catch (error) {
            console.error(`VERIFY_STAKE_ERROR (Stake ID: ${stakeId}): ${error.message}`, error.stack);
            try {
                await db.query("UPDATE user_stakes SET status = 'stake_failed', notes = $2, updated_at = NOW() WHERE stake_id = $1", [stakeId, `Verification error: ${error.message.substring(0,250)}`]);
            } catch (dbError) { console.error(`VERIFY_STAKE_ERROR DB (Stake ID: ${stakeId}): ${dbError.message}`); }
            return { verified: false, reason: error.message };
        }
    }
    
    async verifyOnChainArixUnstakeOutcome(stakeId) {
        console.log(`VERIFY_UNSTAKE_OUTCOME (Stake ID: ${stakeId}): Starting verification.`);
        let stakeRecord;
        let userArixJettonWalletAddress;

        try {
            const stakeRes = await db.query(
                `SELECT us.user_wallet_address, us.arix_amount_staked, us.unlock_timestamp, 
                        us.onchain_unstake_tx_hash, us.status,
                        sp.arix_early_unstake_penalty_percent, sp.duration_days
                 FROM user_stakes us JOIN staking_plans sp ON us.staking_plan_id = sp.plan_id
                 WHERE us.stake_id = $1`, [stakeId]
            );
            if (!stakeRes.rows[0]) return { verified: false, reason: "Stake not found." };
            stakeRecord = stakeRes.rows[0];

            if (stakeRecord.status !== 'pending_arix_unstake_confirmation') {
                return { verified: true, reason: `Already processed (status: ${stakeRecord.status})` };
            }
            if (!stakeRecord.onchain_unstake_tx_hash) {
                await db.query("UPDATE user_stakes SET status = 'unstake_failed', notes = $2, updated_at = NOW() WHERE stake_id = $1", [stakeId, "Missing unstake tx hash."]);
                return { verified: false, reason: "Missing unstake tx hash." };
            }

            const tonClient = await tonUtils.getTonClient();
            const userAddr = Address.parse(stakeRecord.user_wallet_address);
            userArixJettonWalletAddress = await tonUtils.getJettonWalletAddress(userAddr.toString({bounceable:true, testOnly: TON_NETWORK === 'testnet'}), ARIX_TOKEN_MASTER_ADDRESS);
            if (!userArixJettonWalletAddress) throw new Error("Could not get user's ARIX Jetton Wallet.");

            const scCallTxs = await tonClient.getTransactions(userAddr, {
                hash: Buffer.from(stakeRecord.onchain_unstake_tx_hash, 'hex'),
                limit: 1,
            });

            if (!scCallTxs || scCallTxs.length === 0) {
                return { verified: false, reason: "User's SC call tx not found." };
            }
            const scCallTx = scCallTxs[0];
            
            let scWasCalledAndSuccessful = false;
            for (const outMsg of scCallTx.outMessages.values()) {
                if (outMsg.info.type === 'internal' && outMsg.info.dest?.equals(Address.parse(STAKING_CONTRACT_ADDRESS))) {
                    if (scCallTx.computePhase.type === 'vm' && scCallTx.computePhase.exitCode === 0) {
                         scWasCalledAndSuccessful = true;
                    } else {
                        const reason = `User's call to Staking Contract failed or was skipped. Exit code: ${scCallTx.computePhase.exitCode || 'N/A'}`;
                        await db.query("UPDATE user_stakes SET status = 'unstake_failed', notes = $2, updated_at = NOW() WHERE stake_id = $1", [stakeId, reason.substring(0,250)]);
                        return { verified: false, reason };
                    }
                    break;
                }
            }
            if(!scWasCalledAndSuccessful){
                const reason = `User tx ${stakeRecord.onchain_unstake_tx_hash} did not successfully call our Staking Contract.`;
                await db.query("UPDATE user_stakes SET status = 'unstake_failed', notes = $2, updated_at = NOW() WHERE stake_id = $1", [stakeId, reason.substring(0,250)]);
                return { verified: false, reason };
            }
            
            await new Promise(resolve => setTimeout(resolve, 10000)); 

            const scJWTransactions = await tonClient.getTransactions(Address.parse(STAKING_CONTRACT_JETTON_WALLET_ADDRESS), { limit: 15 });

            let verifiedReturn = false;
            let verificationNote = "No ARIX return transfer found from SC Jetton Wallet within recent transactions.";
            let finalArixReturnedBySc = BigInt(0);
            let scReportedPenalty = BigInt(0);
            let scReportedArixLockReward = BigInt(0);

            for (const tx of scJWTransactions) {
                if (tx.inMessage?.info?.src?.equals(Address.parse(STAKING_CONTRACT_ADDRESS))) { 
                    for (const outMsg of tx.outMessages.values()) {
                        if (outMsg.info.type === 'internal' && outMsg.info.dest?.equals(Address.parse(userArixJettonWalletAddress))) {
                            const bodySlice = outMsg.body.beginParse();
                            const opCode = bodySlice.loadUint(32);

                            if (opCode === OP_JETTON_INTERNAL_TRANSFER || opCode === OP_JETTON_TRANSFER_NOTIFICATION) {
                                finalArixReturnedBySc = bodySlice.loadCoins(); 
                                let forwardPayloadCell = null;
                                if (opCode === OP_JETTON_INTERNAL_TRANSFER) {
                                    bodySlice.loadUintBig(64); bodySlice.loadAddress(); bodySlice.loadAddress(); bodySlice.loadCoins();
                                    forwardPayloadCell = bodySlice.loadMaybeRef();
                                } else { 
                                    bodySlice.loadUintBig(64); bodySlice.loadAddress();
                                    forwardPayloadCell = bodySlice.loadMaybeRef();
                                }

                                if (forwardPayloadCell) {
                                    const unstakeResp = parseUnstakeResponsePayload(forwardPayloadCell.beginParse());
                                    if (unstakeResp) {
                                        const expectedScStakeId = BigInt('0x' + stakeId.replace(/-/g, '').substring(0, 16));
                                        if (unstakeResp.stakeIdentifierProcessed === expectedScStakeId) {
                                            scReportedPenalty = unstakeResp.arixPenaltyApplied;
                                            scReportedArixLockReward = unstakeResp.arixLockRewardPaid;
                                            verificationNote = `ARIX return verified. SC Payload: Penalty=${fromNano(scReportedPenalty)}, Reward=${fromNano(scReportedArixLockReward)}`;
                                            verifiedReturn = true; break;
                                        }
                                    } else { verificationNote = "Returned ARIX, but SC payload parse failed."; }
                                } else { verificationNote = "Returned ARIX, but no SC payload with details."; }
                                if(verifiedReturn) break;
                            }
                        }
                    }
                }
                if(verifiedReturn) break;
            }
            
            const now = new Date();
            const unlockTime = new Date(stakeRecord.unlock_timestamp);
            const finalDbStatus = (now < unlockTime && verifiedReturn) ? 'early_arix_unstaked' : (verifiedReturn ? 'completed_arix_unstaked' : stakeRecord.status);
            
            if (verifiedReturn) {
                const finalPenaltyToStore = parseFloat(fromNano(scReportedPenalty));
                const finalArixRewardFromLockToStore = parseFloat(fromNano(scReportedArixLockReward));
                await db.query(
                    `UPDATE user_stakes SET status = $1, arix_penalty_applied = $2, arix_final_reward_calculated = $3, notes = $4, updated_at = NOW() 
                     WHERE stake_id = $5`, 
                    [finalDbStatus, finalPenaltyToStore, finalArixRewardFromLockToStore, verificationNote.substring(0,250), stakeId]
                );
            } else {
                 await db.query("UPDATE user_stakes SET notes = $2, updated_at = NOW() WHERE stake_id = $1 AND status = 'pending_arix_unstake_confirmation'", [stakeId, `Verification: ${verificationNote.substring(0,200)}`]);
            }
            return { verified: verifiedReturn, reason: verificationNote };

        } catch (error) { 
            console.error(`VERIFY_UNSTAKE_OUTCOME_ERROR (Stake ID: ${stakeId}): ${error.message}`, error.stack);
            try {
                 await db.query("UPDATE user_stakes SET status = 'unstake_failed', notes = $2, updated_at = NOW() WHERE stake_id = $1", [stakeId, `Unstake outcome verification error: ${error.message.substring(0,250)}`]);
            } catch (dbError) { console.error(`VERIFY_UNSTAKE_OUTCOME_ERROR DB (Stake ID: ${stakeId}): ${dbError.message}`); }
            return { verified: false, reason: error.message };
        }
    }
    
    async findAllStakesAndRewardsByUser(userWalletAddress, currentArxPrice) {
        const userResult = await db.query("SELECT total_claimable_arix_rewards FROM users WHERE wallet_address = $1", [userWalletAddress]);
        const totalClaimableArixRewards = userResult.rows[0] ? parseFloat(userResult.rows[0].total_claimable_arix_rewards) : 0;

        const stakesQuery = `
            SELECT us.*, 
                   sp.plan_key, sp.title AS plan_title, 
                   sp.apr_percent_of_initial_usd_value, 
                   sp.arix_early_unstake_penalty_percent, 
                   sp.duration_days AS plan_duration_days,
                   (EXTRACT(EPOCH FROM (us.unlock_timestamp - NOW())) / (24 * 60 * 60))::INTEGER AS remaining_days
            FROM user_stakes us
            JOIN staking_plans sp ON us.staking_plan_id = sp.plan_id
            WHERE us.user_wallet_address = $1 ORDER BY us.stake_timestamp DESC;
        `;
        const { rows: stakesFromDb } = await db.query(stakesQuery, [userWalletAddress]);
        
        const stakes = stakesFromDb.map(s => {
             const arixAmountStakedNum = parseFloat(s.arix_amount_staked);
             return {
                id: s.stake_id,
                planKey: s.plan_key,
                planTitle: s.plan_title,
                arixAmountStaked: arixAmountStakedNum.toFixed(ARIX_DECIMALS),
                currentUsdtValueRef: currentArxPrice && arixAmountStakedNum > 0 ? (arixAmountStakedNum * currentArxPrice).toFixed(2) : 'N/A',
                referenceUsdtValueAtStakeTime: s.reference_usdt_value_at_stake_time ? parseFloat(s.reference_usdt_value_at_stake_time).toFixed(2) : 'N/A',
                usdValueRewardApr: parseFloat(s.apr_percent_of_initial_usd_value).toFixed(2), // New: APR is based on initial USD value
                accruedArixRewardTotal: parseFloat(s.arix_reward_accrued_total || 0).toFixed(ARIX_DECIMALS), // Accrued in ARIX
                arixEarlyUnstakePenaltyPercent: parseFloat(s.arix_early_unstake_penalty_percent).toFixed(2),
                remainingDays: (s.status === 'active' || s.status === 'pending_confirmation' || s.status === 'pending_arix_unstake_confirmation') ? (Math.max(0, s.remaining_days || 0)) : 0,
                status: s.status,
                stakeTimestamp: new Date(s.stake_timestamp).toISOString(),
                unlockTimestamp: new Date(s.unlock_timestamp).toISOString(),
                onchainStakeTxHash: s.onchain_stake_tx_hash,
                onchainUnstakeTxHash: s.onchain_unstake_tx_hash,
                planDurationDays: parseInt(s.plan_duration_days, 10),
                arixPenaltyApplied: s.arix_penalty_applied ? parseFloat(s.arix_penalty_applied).toFixed(ARIX_DECIMALS) : '0.000000000',
                arixFinalRewardCalculated: s.arix_final_reward_calculated ? parseFloat(s.arix_final_reward_calculated).toFixed(ARIX_DECIMALS) : '0.000000000',
            };
        });
        
        return {
            stakes,
            totalClaimableArix: totalClaimableArixRewards.toFixed(ARIX_DECIMALS)
        };
    }
    
    async executeSecureArixPayout(withdrawalId, recipientWalletAddress, amountArixSmallestUnits) { // Renamed from executeSecureUsdtPayout
        console.log(`ARIX Payout Init: ID ${withdrawalId}, To ${recipientWalletAddress}, Amount ${fromNano(amountArixSmallestUnits)} ARIX`);
        if (!BACKEND_ARIX_WALLET_MNEMONIC) {
            console.error("ARIX Payout Aborted: Backend ARIX wallet mnemonic is not configured.");
            throw new Error("Backend ARIX wallet mnemonic is not configured.");
        }
        if (!ARIX_TOKEN_MASTER_ADDRESS) { // Use ARIX_TOKEN_MASTER_ADDRESS for ARIX payouts
            console.error("ARIX Payout Aborted: ARIX Token Master Address is not configured.");
            throw new Error("ARIX Token Master Address is not configured.");
        }
        if (!BACKEND_ARIX_WALLET_ADDRESS) {
            console.error("ARIX Payout Aborted: Backend ARIX public wallet address is not configured.");
            throw new Error("Backend ARIX public wallet address is not configured.");
        }

        const tonClient = await tonUtils.getTonClient();
        const { contract: backendWalletContract, keyPair, address: backendWalletAddressParsed } = await tonUtils.getWalletForPayout(BACKEND_ARIX_WALLET_MNEMONIC.split(" "));
        
        if (backendWalletAddressParsed.toLowerCase() !== Address.parse(BACKEND_ARIX_WALLET_ADDRESS).toString({urlSafe: true, bounceable: true, testOnly: TON_NETWORK === 'testnet'}).toLowerCase()) {
            console.error(`CRITICAL SECURITY: Mnemonic derived address ${backendWalletAddressParsed} does not match configured BACKEND_ARIX_WALLET_ADDRESS ${BACKEND_ARIX_WALLET_ADDRESS}`);
            throw new Error("Backend wallet address mismatch. Payout aborted for security.");
        }

        const backendArixJettonWalletAddress = await tonUtils.getJettonWalletAddress(BACKEND_ARIX_WALLET_ADDRESS, ARIX_TOKEN_MASTER_ADDRESS);
        if (!backendArixJettonWalletAddress) {
            throw new Error(`Could not derive backend's ARIX Jetton Wallet for ${BACKEND_ARIX_WALLET_ADDRESS} using master ${ARIX_TOKEN_MASTER_ADDRESS}. Ensure master is correct and wallet is funded with TON to deploy JW if needed.`);
        }
        console.log(`Backend's ARIX Jetton Wallet for payout: ${backendArixJettonWalletAddress}`);

        // ARIX payout will have a general forward payload, not specific to unstake
        const payoutForwardPayload = new Cell().asBuilder()
            .storeUint(BigInt(Date.now()), 64)
            .storeStringTail("ARIX Reward Payout")
            .endCell();

        const transferMessageBody = tonUtils.createJettonTransferMessage(
            amountArixSmallestUnits,
            recipientWalletAddress,      
            BACKEND_ARIX_WALLET_ADDRESS, // Response address
            toNano('0.05'), // Forward TON amount for the Jetton transfer
            payoutForwardPayload 
        );

        const seqno = await backendWalletContract.getSeqno();
        const transfer = backendWalletContract.createTransfer({
            seqno: seqno,
            secretKey: keyPair.secretKey,
            messages: [internal({
                to: Address.parse(backendArixJettonWalletAddress),
                value: toNano('0.1'), // Amount of TON for jetton transfer processing fees
                body: transferMessageBody,
                bounce: true, 
            })]
        });

        await backendWalletContract.send(transfer);
        console.log(`ARIX Payout tx for Withdrawal ID ${withdrawalId} sent from ${backendWalletContract.address.toString()}. Seqno: ${seqno}. Awaiting on-chain confirmation...`);

        let txHash = null;
        let attempts = 0;
        const maxAttempts = 24; // ~2 minutes
        let lastTxLt = await backendWalletContract.getLastTransactionLt(); // Get current lt before polling

        while (!txHash && attempts < maxAttempts) {
            await new Promise(resolve => setTimeout(resolve, 5000)); // 5 second interval
            attempts++;
            try {
                const transactions = await tonClient.getTransactions(backendWalletContract.address, {
                    limit: 5,
                    lt: lastTxLt, 
                    to_lt: 0, 
                    archival: true
                });

                for (const tx of transactions) {
                    // Check if this transaction is the one we sent by matching sequence number or a more robust method
                    // For WalletContractV4, seqno should match on success.
                    if (tx.seqno === seqno) { 
                        if (tx.description.type === 'generic' && tx.description.computePhase.success) {
                             txHash = tx.hash().toString('hex');
                             console.log(`ARIX Payout tx for ID ${withdrawalId} (seqno ${seqno}) confirmed with hash: ${txHash}.`);
                             break;
                        } else {
                            console.warn(`ARIX Payout tx for ID ${withdrawalId} (seqno ${seqno}) found but failed on-chain. Status: ${tx.description.computePhase.exitCode || 'UNKNOWN_FAIL'}`);
                            return { success: false, transactionHash: null, reason: `On-chain transaction failed with exit code ${tx.description.computePhase.exitCode || 'N/A'}.` };
                        }
                    }
                }
                if (transactions.length > 0) { 
                    lastTxLt = transactions[transactions.length -1].lt;
                }

            } catch (pollError) {
                console.warn(`Polling error for ARIX payout (ID ${withdrawalId}, attempt ${attempts}): ${pollError.message}`);
            }
        }
        
        if (txHash) {
            return { success: true, transactionHash: txHash };
        } else {
            console.error(`ARIX Payout tx for ID ${withdrawalId} (seqno ${seqno}) could not be confirmed on-chain after ${attempts} attempts.`);
            return { success: false, transactionHash: null, reason: "Transaction confirmation timeout after sending." };
        }
    }

    async processArixWithdrawalRequest(userWalletAddress, amountArixToWithdraw) { // Renamed from processUsdtWithdrawalRequest
        const currentArxPrice = await priceService.getArxUsdtPrice();
        if (!currentArxPrice || currentArxPrice <= 0) {
            throw new Error("Cannot process withdrawal: ARIX price not available.");
        }
        const minArixWithdrawalEquivalentUsd = MIN_ARIX_WITHDRAWAL_APPROX_USD_VALUE;
        const minArixWithdrawalAmount = minArixWithdrawalEquivalentUsd / currentArxPrice;

        if (amountArixToWithdraw < minArixWithdrawalAmount) {
            throw new Error(`Minimum ARIX withdrawal is approx. ${minArixWithdrawalAmount.toFixed(ARIX_DECIMALS)} ARIX (equivalent to $${minArixWithdrawalEquivalentUsd.toFixed(USD_DECIMALS)} USD).`);
        }
        const amountArixSmallestUnits = toNano(amountArixToWithdraw.toString());

        const client = await db.getClient();
        try {
            await client.query('BEGIN');
            const userResult = await client.query("SELECT total_claimable_arix_rewards FROM users WHERE wallet_address = $1 FOR UPDATE", [userWalletAddress]);
            const currentClaimableArix = userResult.rows[0] ? parseFloat(userResult.rows[0].total_claimable_arix_rewards) : 0;

            if (currentClaimableArix < amountArixToWithdraw) {
                await client.query('ROLLBACK'); 
                throw new Error(`Insufficient claimable ARIX. Available: ${currentClaimableArix.toFixed(ARIX_DECIMALS)} ARIX`);
            }
            
            const newBalance = currentClaimableArix - amountArixToWithdraw;
            await client.query("UPDATE users SET total_claimable_arix_rewards = $1, updated_at = NOW() WHERE wallet_address = $2", [newBalance, userWalletAddress]);

            const { rows: withdrawalRecord } = await client.query(
                `INSERT INTO user_arix_withdrawals (user_wallet_address, amount_arix, status, requested_at)
                 VALUES ($1, $2, 'processing', NOW()) RETURNING withdrawal_id`,
                [userWalletAddress, amountArixToWithdraw]
            );
            const withdrawalId = withdrawalRecord[0].withdrawal_id;
            await client.query('COMMIT'); 

            // Asynchronously attempt payout and update status. Do not await here.
            this.executeSecureArixPayout(withdrawalId, userWalletAddress, amountArixSmallestUnits)
                .then(async payoutResult => {
                    const finalStatus = payoutResult.success ? 'completed' : 'payout_failed';
                    const notes = payoutResult.success ? 'Payout successful.' : (payoutResult.reason || 'Payout failed due to unknown on-chain issue.');
                    await db.query(
                        `UPDATE user_arix_withdrawals SET status = $1, onchain_tx_hash = $2, processed_at = NOW(), notes = $3 WHERE withdrawal_id = $4`,
                        [finalStatus, payoutResult.transactionHash, notes.substring(0,250), withdrawalId]
                    );
                    if (!payoutResult.success) {
                        console.error(`ARIX Payout Failed for Withdrawal ID ${withdrawalId}. User balance was debited. Reason: ${notes}. Manual reconciliation/revert may be needed.`);
                        // For MVP, we log. Production might auto-revert or flag for admin.
                        // Example Revert (use with caution, ensure it's appropriate for the failure type):
                        // await db.query("UPDATE users SET total_claimable_arix_rewards = total_claimable_arix_rewards + $1, updated_at = NOW(), notes = COALESCE(notes, '') || $3 WHERE wallet_address = $2", 
                        //    [amountArixToWithdraw, userWalletAddress, `\nReverted failed payout attempt for WID ${withdrawalId}. Reason: ${notes.substring(0,100)}`]);
                    }
                })
                .catch(async payoutError => {
                    console.error(`CRITICAL SYSTEM ERROR during ARIX Payout for Withdrawal ID ${withdrawalId}: ${payoutError.message}`, payoutError.stack);
                    try {
                        await db.query(
                            `UPDATE user_arix_withdrawals SET status = 'payout_system_error', notes = $1, processed_at = NOW() WHERE withdrawal_id = $2`,
                            [`System error during payout: ${payoutError.message}`.substring(0, 250), withdrawalId]
                        );
                        // Revert user's balance on system error during payout attempt
                        await db.query("UPDATE users SET total_claimable_arix_rewards = total_claimable_arix_rewards + $1, updated_at = NOW(), notes = COALESCE(notes, '') || $3 WHERE wallet_address = $2", 
                            [amountArixToWithdraw, userWalletAddress, `\nReverted system error payout for WID ${withdrawalId}.`]);
                        console.log(`User ${userWalletAddress} balance reverted for WID ${withdrawalId} due to payout system error.`);
                    } catch (dbError) {
                        console.error(`Failed to update withdrawal status to payout_system_error or revert balance for ID ${withdrawalId}: ${dbError.message}`);
                    }
                });

            return { message: `ARIX Withdrawal request for ${amountArixToWithdraw.toFixed(ARIX_DECIMALS)} ARIX is processing. You will be notified of the outcome.`, withdrawalId };
        } catch (error) {
            // Ensure client is released if BEGIN was called but COMMIT/ROLLBACK wasn't reached due to early throw
            if (client && client.activeQuery === null) { 
                 try { await client.query('ROLLBACK'); } catch (rbError) { console.error("Rollback error in outer catch:", rbError); }
            }
            console.error("SERVICE: Error in processArixWithdrawalRequest:", error.message, error.stack);
            throw error;
        } finally {
            if (client) client.release();
        }
    }
}
module.exports = new EarnService();