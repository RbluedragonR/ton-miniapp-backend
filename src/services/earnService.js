// File: ar_backend/src/services/earnService.js
const db = require('../config/database');
const { Address, toNano, fromNano, internal, Cell, Slice } = require('@ton/ton');
const priceService = require('./priceService');
const tonUtils = require('../utils/tonUtils');
const userService = require('./userService');
const { parseStakeParametersFromForwardPayload, parseUnstakeResponsePayload } = require('../utils/payloadParsers');
const {
    ARIX_TOKEN_MASTER_ADDRESS,
    STAKING_CONTRACT_ADDRESS,
    STAKING_CONTRACT_JETTON_WALLET_ADDRESS,
    USDT_JETTON_MASTER_ADDRESS,
    BACKEND_USDT_WALLET_ADDRESS,
    BACKEND_USDT_WALLET_MNEMONIC,
    TON_NETWORK,
} = require('../config/envConfig');
const {
    ARIX_DECIMALS,
    USDT_DECIMALS,
    MIN_USDT_WITHDRAWAL_USD_VALUE,
    TON_TRANSACTION_FEES,
    OP_JETTON_TRANSFER,
    OP_JETTON_INTERNAL_TRANSFER,
    OP_JETTON_TRANSFER_NOTIFICATION
} = require('../utils/constants');

class EarnService {
    async getActiveStakingPlans() {
        const { rows } = await db.query(
            `SELECT plan_id, plan_key, title, duration_days, 
                    fixed_usdt_apr_percent, arix_early_unstake_penalty_percent, 
                    min_stake_usdt, max_stake_usdt,
                    referral_l1_invest_percent, referral_l2_invest_percent,
                    referral_l2_commission_on_l1_bonus_percent,
                    is_active 
             FROM staking_plans WHERE is_active = TRUE ORDER BY min_stake_usdt ASC`
        );
        return rows.map(p => ({
            plan_id: parseInt(p.plan_id),
            plan_key: p.plan_key,
            title: p.title,
            duration_days: parseInt(p.duration_days),
            fixed_usdt_apr_percent: parseFloat(p.fixed_usdt_apr_percent),
            arix_early_unstake_penalty_percent: parseFloat(p.arix_early_unstake_penalty_percent),
            min_stake_usdt: parseFloat(p.min_stake_usdt),
            max_stake_usdt: p.max_stake_usdt ? parseFloat(p.max_stake_usdt) : null,
            referral_l1_invest_percent: parseFloat(p.referral_l1_invest_percent || 0),
            referral_l2_invest_percent: parseFloat(p.referral_l2_invest_percent || 0),
            referral_l2_commission_on_l1_bonus_percent: parseFloat(p.referral_l2_commission_on_l1_bonus_percent || 0),
            is_active: p.is_active,
        }));
    }

    async getPlanByKey(planKey) {
        const { rows } = await db.query(
            "SELECT * FROM staking_plans WHERE plan_key = $1 AND is_active = TRUE", [planKey]
        );
        if (!rows[0]) return null;
        const p = rows[0];
        return {
            plan_id: parseInt(p.plan_id),
            plan_key: p.plan_key,
            title: p.title,
            duration_days: parseInt(p.duration_days),
            fixed_usdt_apr_percent: parseFloat(p.fixed_usdt_apr_percent),
            arix_early_unstake_penalty_percent: parseFloat(p.arix_early_unstake_penalty_percent),
            min_stake_usdt: parseFloat(p.min_stake_usdt),
            max_stake_usdt: p.max_stake_usdt ? parseFloat(p.max_stake_usdt) : null,
            referral_l1_invest_percent: parseFloat(p.referral_l1_invest_percent || 0),
            referral_l2_invest_percent: parseFloat(p.referral_l2_invest_percent || 0),
            referral_l2_commission_on_l1_bonus_percent: parseFloat(p.referral_l2_commission_on_l1_bonus_percent || 0),
            is_active: p.is_active,
        };
    }

    async createStake({ planKey, arixAmount, userWalletAddress, transactionBoc, transactionHash, stakeUUID, referenceUsdtValue, referrerCodeOrAddress }) {
        const plan = await this.getPlanByKey(planKey);
        if (!plan) throw new Error("Invalid or inactive staking plan key.");

        if (referenceUsdtValue < plan.min_stake_usdt) {
            throw new Error(`Minimum stake for ${plan.title} is $${plan.min_stake_usdt.toFixed(2)} USD.`);
        }
        if (plan.max_stake_usdt && referenceUsdtValue > plan.max_stake_usdt) {
            throw new Error(`Maximum stake for ${plan.title} is $${plan.max_stake_usdt.toFixed(2)} USD.`);
        }
        if (arixAmount <= 0) throw new Error("ARIX amount must be positive.");
        if (!transactionHash) throw new Error("Transaction hash is required to record the stake.");
        if (!stakeUUID) throw new Error("Valid Stake UUID from frontend is required.");

        const stakeTimestamp = new Date();
        const unlockTimestamp = new Date(stakeTimestamp.getTime() + plan.duration_days * 24 * 60 * 60 * 1000);

        const client = await db.getClient();
        try {
            await client.query('BEGIN');

            const user = await userService.ensureUserExists(userWalletAddress, null, null, referrerCodeOrAddress);
            const actualReferrerWallet = user.referrer_wallet_address;

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

            if (actualReferrerWallet && actualReferrerWallet !== userWalletAddress) {
                await this._processInvestmentReferralBonuses(client, newStakeId, plan, userWalletAddress, actualReferrerWallet, referenceUsdtValue);
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
            if (error.constraint === 'user_stakes_onchain_stake_tx_hash_key' || (error.message && error.message.includes("duplicate key value violates unique constraint \"user_stakes_onchain_stake_tx_hash_key\""))) {
                console.warn("SERVICE: Error in createStake - Duplicate transaction hash:", transactionHash, error.message);
                throw new Error(`Stake with transaction hash ${transactionHash} already exists or is being processed.`);
            }
            if (error.constraint === 'user_stakes_pkey' || (error.message && error.message.includes("duplicate key value violates unique constraint \"user_stakes_pkey\""))) {
                console.error("SERVICE: Error in createStake - Duplicate Stake ID (UUID):", stakeUUID, error.message);
                throw new Error(`Stake with ID ${stakeUUID} already exists. Possible duplicate submission.`);
            }
            console.error("SERVICE: Error in createStake:", error.message, error.stack);
            throw error;
        } finally {
            client.release();
        }
    }

    async _processInvestmentReferralBonuses(dbClient, stakeId, plan, stakerWalletAddress, l1ReferrerWalletAddress, stakedUsdValue) {
        let l1DirectBonusUsdt = 0;
        if (plan.referral_l1_invest_percent > 0) {
            l1DirectBonusUsdt = stakedUsdValue * (plan.referral_l1_invest_percent / 100);
            if (l1DirectBonusUsdt > 0) {
                await this._addReferralReward(dbClient, stakeId, l1ReferrerWalletAddress, stakerWalletAddress, 1, 'investment_percentage_l1', l1DirectBonusUsdt);
            }
        }

        const l2ReferrerQuery = await dbClient.query("SELECT referrer_wallet_address FROM users WHERE wallet_address = $1", [l1ReferrerWalletAddress]);
        const l2ReferrerWalletAddress = l2ReferrerQuery.rows[0]?.referrer_wallet_address;

        if (l2ReferrerWalletAddress && l2ReferrerWalletAddress !== l1ReferrerWalletAddress && l2ReferrerWalletAddress !== stakerWalletAddress) {
            if (plan.referral_l2_invest_percent > 0) {
                const l2BonusFromInvestmentUsd = stakedUsdValue * (plan.referral_l2_invest_percent / 100);
                if (l2BonusFromInvestmentUsd > 0) {
                    await this._addReferralReward(dbClient, stakeId, l2ReferrerWalletAddress, stakerWalletAddress, 2, 'investment_percentage_l2', l2BonusFromInvestmentUsd);
                }
            }
            if (plan.referral_l2_commission_on_l1_bonus_percent > 0 && l1DirectBonusUsdt > 0) {
                const l2BonusFromL1RewardUsd = l1DirectBonusUsdt * (plan.referral_l2_commission_on_l1_bonus_percent / 100);
                if (l2BonusFromL1RewardUsd > 0) {
                    await this._addReferralReward(dbClient, stakeId, l2ReferrerWalletAddress, l1ReferrerWalletAddress, 2, 'l1_bonus_commission_l2', l2BonusFromL1RewardUsd);
                }
            }
        }
    }

    async _addReferralReward(dbClient, stakeId, referrerWallet, sourceUserWallet, level, rewardType, amountUsdt) {
        if (amountUsdt <= 0) return;

        await dbClient.query(
            `INSERT INTO referral_rewards (stake_id, referrer_wallet_address, referred_wallet_address, level, reward_type, reward_amount_usdt, status, created_at)
             VALUES ($1, $2, $3, $4, $5, $6, 'credited', NOW())`,
            [stakeId, referrerWallet, sourceUserWallet, level, rewardType, amountUsdt]
        );
        await dbClient.query(
            `UPDATE users SET claimable_usdt_balance = COALESCE(claimable_usdt_balance, 0) + $1, updated_at = NOW() WHERE wallet_address = $2`,
            [amountUsdt, referrerWallet]
        );
        console.log(`Referral Reward: ${amountUsdt.toFixed(USDT_DECIMALS)} USDT for ${referrerWallet} (L${level}) from user ${sourceUserWallet}, type: ${rewardType}. Credited to claimable_usdt_balance.`);
    }

    async calculateAndStoreMonthlyUsdtRewards() {
        console.log("CRON_JOB: Starting monthly USDT reward calculation...");
        const client = await db.getClient();
        try {
            await client.query('BEGIN');
            const { rows: activeStakes } = await client.query(`
                SELECT us.stake_id, us.user_wallet_address, us.reference_usdt_value_at_stake_time, 
                       us.last_usdt_reward_calc_timestamp, us.stake_timestamp, us.unlock_timestamp,
                       sp.plan_id, sp.plan_key, sp.fixed_usdt_apr_percent, sp.duration_days
                FROM user_stakes us
                JOIN staking_plans sp ON us.staking_plan_id = sp.plan_id
                WHERE us.status = 'active' AND us.unlock_timestamp > NOW() 
                FOR UPDATE OF us;
            `);

            let totalStakesProcessed = 0;

            for (const stake of activeStakes) {
                const now = new Date();
                let lastCalcTime = stake.last_usdt_reward_calc_timestamp ? new Date(stake.last_usdt_reward_calc_timestamp) : new Date(stake.stake_timestamp);

                let monthsToCalculate = 0;
                let nextCalcDueDate = new Date(lastCalcTime.getFullYear(), lastCalcTime.getMonth() + 1, lastCalcTime.getDate());

                while (nextCalcDueDate <= now && nextCalcDueDate <= new Date(stake.unlock_timestamp)) {
                    monthsToCalculate++;
                    nextCalcDueDate.setMonth(nextCalcDueDate.getMonth() + 1);
                }

                if (monthsToCalculate === 0) continue;

                const monthlyUsdRewardForStaker = (parseFloat(stake.reference_usdt_value_at_stake_time) * (parseFloat(stake.fixed_usdt_apr_percent) / 100)) / 12;
                const totalUsdtRewardForThisPeriod = monthlyUsdRewardForStaker * monthsToCalculate;

                if (totalUsdtRewardForThisPeriod > 0) {
                    const newLastCalcTimestamp = new Date(lastCalcTime.getFullYear(), lastCalcTime.getMonth() + monthsToCalculate, lastCalcTime.getDate());

                    await client.query(
                        `UPDATE user_stakes SET usdt_reward_accrued_total = COALESCE(usdt_reward_accrued_total, 0) + $1, 
                         last_usdt_reward_calc_timestamp = $2, updated_at = NOW() 
                         WHERE stake_id = $3`,
                        [totalUsdtRewardForThisPeriod, newLastCalcTimestamp, stake.stake_id]
                    );
                    await client.query(
                        `UPDATE users SET claimable_usdt_balance = COALESCE(claimable_usdt_balance, 0) + $1, updated_at = NOW() 
                         WHERE wallet_address = $2`,
                        [totalUsdtRewardForThisPeriod, stake.user_wallet_address]
                    );
                    totalStakesProcessed++;
                    console.log(`CRON_JOB: Stake ${stake.stake_id} (User ${stake.user_wallet_address}) awarded ${totalUsdtRewardForThisPeriod.toFixed(USDT_DECIMALS)} USDT for ${monthsToCalculate} month(s).`);
                }
            }
            await client.query('COMMIT');
            console.log(`CRON_JOB: Monthly USDT reward calculation finished. ${totalStakesProcessed} stakes processed.`);
        } catch (error) {
            await client.query('ROLLBACK');
            console.error("CRON_JOB_ERROR: Error during monthly USDT reward calculation:", error.message, error.stack);
        } finally {
            client.release();
        }
    }

    async prepareArixUnstake(userWalletAddress, stakeId) {
        const { rows } = await db.query(
            `SELECT us.stake_id, us.arix_amount_staked, us.unlock_timestamp, us.status,
                    sp.arix_early_unstake_penalty_percent
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
        let messageText = ""; // Renamed from 'message' to avoid conflict
        const isEarly = now < unlockTime;

        if (isEarly) {
            penaltyPercent = parseFloat(stake.arix_early_unstake_penalty_percent);
            messageText = `This is an EARLY unstake of ARIX principal. A ${penaltyPercent}% penalty on staked ARIX will apply. USDT rewards accrued to date will remain claimable.`;
        } else {
            messageText = "Ready for full-term ARIX principal unstake. You will receive your ARIX principal. Accrued USDT rewards are managed separately.";
        }
        return {
            message: messageText, // Keep 'message' for consistency with controller if it expects that
            stakeId: stake.stake_id,
            isEarly,
            principalArix: principalArix.toFixed(ARIX_DECIMALS),
            arixPenaltyPercentApplied: penaltyPercent,
        };
    }

    async finalizeArixUnstake({ userWalletAddress, stakeId, unstakeTransactionBoc, unstakeTransactionHash }) {
        if (!unstakeTransactionHash) {
            throw new Error("Unstake transaction hash is required to finalize and verify the unstake.");
        }
        console.log(`FINALIZE_ARIX_UNSTAKE (DB Stake ID: ${stakeId}): Hash ${unstakeTransactionHash}.`);

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

            if (stake.status !== 'active' && stake.status !== 'pending_arix_unstake_confirmation' && stake.status !== 'unstake_failed') {
                throw new Error(`ARIX Stake status (${stake.status}) does not allow unstake finalization. Expected 'active', 'pending_arix_unstake_confirmation', or 'unstake_failed' for retry.`);
            }

            await client.query(
                `UPDATE user_stakes 
                 SET status = 'pending_arix_unstake_confirmation', 
                     onchain_unstake_tx_boc = $1, 
                     onchain_unstake_tx_hash = $2, 
                     notes = 'Awaiting on-chain unstake verification.',
                     updated_at = NOW() 
                 WHERE stake_id = $3`,
                [unstakeTransactionBoc, unstakeTransactionHash, stakeId]
            );
            await client.query('COMMIT');

            this.verifyOnChainArixUnstakeOutcome(stakeId)
                .then(res => console.log(`BG Unstake Verify (Stake ${stakeId}): ${res.reason}`))
                .catch(err => console.error(`BG Unstake Verify Err (Stake ${stakeId}):`, err));

            return {
                message: `ARIX Unstake request submitted. Status: pending_arix_unstake_confirmation. Backend will verify the outcome.`,
                stake_id: stakeId, transactionHash: unstakeTransactionHash
            };
        } catch (error) {
            await client.query('ROLLBACK');
            console.error("SERVICE: Error in finalizeArixUnstake:", error.message, error.stack);
            throw error;
        }
        finally { client.release(); }
    }

    async verifyOnChainArixStake(stakeId) {
        console.log(`VERIFY_STAKE (DB Stake ID: ${stakeId}): Starting on-chain verification.`);
        let stakeRecord;
        let planRecord;
        let userArixJettonWalletAddress;
        let verificationNote = "Verification initiated.";

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
                verificationNote = "Missing transaction hash for verification.";
                await db.query("UPDATE user_stakes SET status = 'stake_failed', notes = $2, updated_at = NOW() WHERE stake_id = $1", [stakeId, verificationNote]);
                return { verified: false, reason: verificationNote };
            }

            const tonClient = await tonUtils.getTonClient();
            const userAddr = Address.parse(stakeRecord.user_wallet_address);
            userArixJettonWalletAddress = await tonUtils.getJettonWalletAddress(userAddr.toString({bounceable: true, testOnly: TON_NETWORK === 'testnet'}), ARIX_TOKEN_MASTER_ADDRESS);
            if (!userArixJettonWalletAddress) {
                throw new Error(`Could not derive user's ARIX Jetton Wallet for ${userAddr.toString({bounceable: true, testOnly: TON_NETWORK === 'testnet'})}. Master: ${ARIX_TOKEN_MASTER_ADDRESS}`);
            }

            console.log(`VERIFY_STAKE: Checking transactions for SC Jetton Wallet: ${STAKING_CONTRACT_JETTON_WALLET_ADDRESS}`);
            const scJettonWalletTransactions = await tonClient.getTransactions(Address.parse(STAKING_CONTRACT_JETTON_WALLET_ADDRESS), { limit: 25, archival: true });

            let verified = false;
            verificationNote = "Verification failed: No matching Jetton transfer notification found at SC's Jetton Wallet for this stake's details.";
            const expectedAmountBn = toNano(stakeRecord.arix_amount_staked.toString());

            for (const tx of scJettonWalletTransactions) {
                if (tx.inMessage && tx.inMessage.info.type === 'internal' && tx.inMessage.info.src) {
                    if (tx.inMessage.info.src.equals(Address.parse(userArixJettonWalletAddress))) {
                        const bodySlice = tx.inMessage.body.beginParse();
                        const opCode = bodySlice.loadUint(32);

                        if (opCode === OP_JETTON_TRANSFER_NOTIFICATION || opCode === OP_JETTON_INTERNAL_TRANSFER) {
                            const queryId = bodySlice.loadUintBig(64);
                            const amountReceived = bodySlice.loadCoins();
                            const senderOfNotification = bodySlice.loadAddress();

                            if (!senderOfNotification.equals(userAddr)) continue;
                            if (amountReceived !== expectedAmountBn) {
                                console.log(`VERIFY_STAKE: Amount mismatch for user ${userAddr.toString()}. Expected: ${fromNano(expectedAmountBn)}, Got: ${fromNano(amountReceived)}`);
                                continue;
                            }

                            const forwardPayloadCellRef = bodySlice.loadMaybeRef(); // In internal_transfer, payload is after fwd_amount
                            let forwardPayloadCell = forwardPayloadCellRef;
                            if (opCode === OP_JETTON_INTERNAL_TRANSFER) { // internal_transfer has response_destination, custom_payload, forward_ton_amount before forward_payload
                                bodySlice.loadAddress(); // response_destination
                                bodySlice.loadBit();     // custom_payload bit
                                bodySlice.loadCoins();   // forward_ton_amount
                                forwardPayloadCell = bodySlice.loadMaybeRef(); // The actual forward_payload
                            }


                            if (!forwardPayloadCell) { verificationNote = "Forward payload missing in notification."; continue; }

                            const scPayload = parseStakeParametersFromForwardPayload(forwardPayloadCell.beginParse());
                            if (!scPayload) { verificationNote = "Failed to parse forward payload for SC."; continue; }

                            const expectedDurationSeconds = planRecord.duration_days * 24 * 60 * 60;
                            const dbStakeIdAsScId = BigInt('0x' + stakeId.replace(/-/g, '').substring(0, 16));

                            if (scPayload.stakeIdentifier !== dbStakeIdAsScId) {
                                verificationNote = `Stake Identifier mismatch. Expected derived: ${dbStakeIdAsScId}, Got from SC: ${scPayload.stakeIdentifier}`;
                                continue;
                            }
                            if (scPayload.durationSeconds !== expectedDurationSeconds) {
                                verificationNote = `Duration mismatch. Expected: ${expectedDurationSeconds}, Got: ${scPayload.durationSeconds}`;
                                continue;
                            }
                            // Add checks for arix_lock_apr_bps and arix_lock_penalty_bps if needed
                            const expectedPenaltyBps = parseInt(planRecord.arix_early_unstake_penalty_percent * 100);
                            if (scPayload.arixLockPenaltyBps !== expectedPenaltyBps) {
                                verificationNote = `Penalty BPS mismatch. Expected: ${expectedPenaltyBps}, Got: ${scPayload.arixLockPenaltyBps}`;
                                continue;
                            }


                            verified = true;
                            verificationNote = `Stake verified: Jetton transfer notification received. Amount: ${fromNano(amountReceived)}. SC Stake ID: ${scPayload.stakeIdentifier}`;
                            break;
                        }
                    }
                }
            }

            if (verified) {
                await db.query("UPDATE user_stakes SET status = 'active', updated_at = NOW(), last_usdt_reward_calc_timestamp = stake_timestamp, notes = $2 WHERE stake_id = $1", [stakeId, verificationNote.substring(0,250)]);
                console.log(`VERIFY_STAKE (Stake ID: ${stakeId}): Successfully verified and set to active. Note: ${verificationNote}`);
            } else {
                await db.query("UPDATE user_stakes SET status = 'stake_failed', notes = $2, updated_at = NOW() WHERE stake_id = $1", [stakeId, verificationNote.substring(0,250)]);
                console.warn(`VERIFY_STAKE (Stake ID: ${stakeId}): Verification failed. Note: ${verificationNote}`);
            }
            return { verified, reason: verificationNote };

        } catch (error) {
            console.error(`VERIFY_STAKE_ERROR (Stake ID: ${stakeId}): ${error.message}`, error.stack);
            verificationNote = `Verification error: ${error.message}`.substring(0,250);
            try {
                await db.query("UPDATE user_stakes SET status = 'stake_failed', notes = $2, updated_at = NOW() WHERE stake_id = $1", [stakeId, verificationNote]);
            } catch (dbError) { console.error(`VERIFY_STAKE_ERROR DB Update (Stake ID: ${stakeId}): ${dbError.message}`); }
            return { verified: false, reason: error.message };
        }
    }

    async verifyOnChainArixUnstakeOutcome(stakeId) {
        console.log(`VERIFY_UNSTAKE_OUTCOME (DB Stake ID: ${stakeId}): Starting verification.`);
        let stakeRecord;
        let userArixJettonWalletAddress;
        let verificationNote = "Unstake outcome verification initiated.";

        try {
            const stakeRes = await db.query(
                `SELECT us.user_wallet_address, us.arix_amount_staked, us.unlock_timestamp, 
                        us.onchain_unstake_tx_hash, us.status,
                        sp.arix_early_unstake_penalty_percent
                 FROM user_stakes us JOIN staking_plans sp ON us.staking_plan_id = sp.plan_id
                 WHERE us.stake_id = $1`, [stakeId]
            );
            if (!stakeRes.rows[0]) return { verified: false, reason: "Stake not found in DB for unstake verification." };
            stakeRecord = stakeRes.rows[0];

            if (stakeRecord.status !== 'pending_arix_unstake_confirmation') {
                return { verified: true, reason: `Already processed or not in pending state (status: ${stakeRecord.status})` };
            }
            // onchain_unstake_tx_hash is the hash of the user's transaction *calling* the main Staking Contract.
            // We need to find the subsequent transaction where the SC's Jetton Wallet sends ARIX back to the user's Jetton Wallet.

            const tonClient = await tonUtils.getTonClient();
            const userAddr = Address.parse(stakeRecord.user_wallet_address);
            userArixJettonWalletAddress = await tonUtils.getJettonWalletAddress(userAddr.toString({bounceable: true, testOnly: TON_NETWORK === 'testnet'}), ARIX_TOKEN_MASTER_ADDRESS);
            if (!userArixJettonWalletAddress) throw new Error("Could not get user's ARIX Jetton Wallet for unstake verification.");

            console.log(`VERIFY_UNSTAKE: Checking transactions for User's Jetton Wallet: ${userArixJettonWalletAddress}`);
            const userJettonWalletTransactions = await tonClient.getTransactions(Address.parse(userArixJettonWalletAddress), { limit: 25, archival: true });

            let verifiedReturn = false;
            verificationNote = "No ARIX return transfer found to user's Jetton Wallet from SC Jetton Wallet matching this unstake.";
            let finalArixReturnedByScToUser = BigInt(0);
            let scReportedPenalty = BigInt(0);
            let scReportedArixLockReward = BigInt(0);

            for (const tx of userJettonWalletTransactions) {
                if (tx.inMessage && tx.inMessage.info.type === 'internal' && tx.inMessage.info.src) {
                    if (tx.inMessage.info.src.equals(Address.parse(STAKING_CONTRACT_JETTON_WALLET_ADDRESS))) {
                        const bodySlice = tx.inMessage.body.beginParse();
                        const opCode = bodySlice.loadUint(32);

                        if (opCode === OP_JETTON_TRANSFER_NOTIFICATION || opCode === OP_JETTON_INTERNAL_TRANSFER) {
                            const queryId = bodySlice.loadUintBig(64);
                            finalArixReturnedByScToUser = bodySlice.loadCoins();
                            const originalSenderOfNotification = bodySlice.loadAddressSlices(); // For notification

                            let forwardPayloadCell = null;
                            if (opCode === OP_JETTON_INTERNAL_TRANSFER) {
                                bodySlice.loadAddress();
                                bodySlice.loadBit();
                                bodySlice.loadCoins();
                                forwardPayloadCell = bodySlice.loadMaybeRef();
                            } else if (opCode === OP_JETTON_TRANSFER_NOTIFICATION) {
                                forwardPayloadCell = bodySlice.loadMaybeRef();
                            }

                            if (forwardPayloadCell) {
                                const unstakeResp = parseUnstakeResponsePayload(forwardPayloadCell.beginParse());
                                if (unstakeResp) {
                                    const dbStakeIdAsScId = BigInt('0x' + stakeId.replace(/-/g, '').substring(0, 16));
                                    if (unstakeResp.stakeIdentifierProcessed === dbStakeIdAsScId && unstakeResp.stakerAddress.equals(userAddr)) {
                                        scReportedPenalty = unstakeResp.arixPenaltyApplied;
                                        scReportedArixLockReward = unstakeResp.arixLockRewardPaid;

                                        if (finalArixReturnedByScToUser !== unstakeResp.finalArixAmountReturned) {
                                            console.warn(`VERIFY_UNSTAKE: Amount mismatch in SC payload for stake ${stakeId}. Transfered: ${fromNano(finalArixReturnedByScToUser)}, Payload reports: ${fromNano(unstakeResp.finalArixAmountReturned)}`);
                                        }
                                        verificationNote = `ARIX return verified. SC Payload: Penalty=${fromNano(scReportedPenalty)}, SC ARIX Reward=${fromNano(scReportedArixLockReward)}. Actual ARIX to JW: ${fromNano(finalArixReturnedByScToUser)}`;
                                        verifiedReturn = true; break;
                                    }
                                } else { verificationNote = "Returned ARIX, but SC unstake response payload parse failed."; }
                            } else { verificationNote = "Returned ARIX, but no SC unstake response payload in notification."; }
                            if(verifiedReturn) break;
                        }
                    }
                }
            }

            const now = new Date();
            const unlockTime = new Date(stakeRecord.unlock_timestamp);
            const isActuallyEarly = now < unlockTime;
            let finalDbStatus = 'unstake_failed'; // Default if not verified

            if (verifiedReturn) {
                finalDbStatus = isActuallyEarly ? 'early_arix_unstaked' : 'completed_arix_unstaked';
            }

            const finalPenaltyToStore = parseFloat(fromNano(scReportedPenalty));
            const finalArixRewardFromLockToStore = parseFloat(fromNano(scReportedArixLockReward));

            await db.query(
                `UPDATE user_stakes SET status = $1, arix_penalty_applied = $2, arix_final_reward_calculated = $3, notes = $4, updated_at = NOW() 
                 WHERE stake_id = $5`,
                [finalDbStatus, finalPenaltyToStore, finalArixRewardFromLockToStore, verificationNote.substring(0,250), stakeId]
            );
            if(verifiedReturn) {
                console.log(`VERIFY_UNSTAKE (Stake ID: ${stakeId}): Successfully verified. Status: ${finalDbStatus}. Note: ${verificationNote}`);
            } else {
                console.warn(`VERIFY_UNSTAKE (Stake ID: ${stakeId}): Verification failed. Status set to unstake_failed. Note: ${verificationNote}`);
            }
            return { verified: verifiedReturn, reason: verificationNote };

        } catch (error) {
            console.error(`VERIFY_UNSTAKE_OUTCOME_ERROR (Stake ID: ${stakeId}): ${error.message}`, error.stack);
            verificationNote = `Unstake outcome verification error: ${error.message}`.substring(0,250);
            try {
                await db.query("UPDATE user_stakes SET status = 'unstake_failed', notes = $2, updated_at = NOW() WHERE stake_id = $1", [stakeId, verificationNote]);
            } catch (dbError) { console.error(`VERIFY_UNSTAKE_OUTCOME_ERROR DB Update (Stake ID: ${stakeId}): ${dbError.message}`); }
            return { verified: false, reason: error.message };
        }
    }

    async findAllStakesAndRewardsByUser(userWalletAddress, currentArxPrice) {
        const userResult = await db.query(
            "SELECT claimable_usdt_balance, claimable_arix_rewards FROM users WHERE wallet_address = $1",
            [userWalletAddress]
        );
        const userData = userResult.rows[0] || { claimable_usdt_balance: 0, claimable_arix_rewards: 0 };
        const totalClaimableUsdt = parseFloat(userData.claimable_usdt_balance);
        const totalClaimableArix = parseFloat(userData.claimable_arix_rewards);

        const stakesQuery = `
            SELECT us.*, 
                   sp.plan_key, sp.title AS plan_title, 
                   sp.fixed_usdt_apr_percent, 
                   sp.arix_early_unstake_penalty_percent, 
                   sp.duration_days AS plan_duration_days,
                   (EXTRACT(EPOCH FROM (CASE WHEN us.unlock_timestamp > NOW() THEN us.unlock_timestamp - NOW() ELSE INTERVAL '0 seconds' END)) / (24 * 60 * 60))::INTEGER AS remaining_days
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
                currentUsdtValueOfStakedArix: currentArxPrice && arixAmountStakedNum > 0 ? (arixAmountStakedNum * currentArxPrice).toFixed(2) : 'N/A',
                referenceUsdtValueAtStakeTime: parseFloat(s.reference_usdt_value_at_stake_time).toFixed(2),
                fixedUsdtAprPercent: parseFloat(s.fixed_usdt_apr_percent).toFixed(2),
                usdtRewardAccruedTotal: parseFloat(s.usdt_reward_accrued_total || 0).toFixed(USDT_DECIMALS),
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
            totalClaimableUsdt: totalClaimableUsdt.toFixed(USDT_DECIMALS),
            totalClaimableArix: totalClaimableArix.toFixed(ARIX_DECIMALS)
        };
    }

    async executeSecureUsdtPayout(withdrawalId, recipientWalletAddress, amountUsdtSmallestUnits) {
        console.log(`USDT Payout Init: ID ${withdrawalId}, To ${recipientWalletAddress}, Amount ${fromNano(amountUsdtSmallestUnits)} USDT (smallest units)`);

        if (!BACKEND_USDT_WALLET_MNEMONIC) throw new Error("Backend USDT wallet mnemonic is not configured.");
        if (!USDT_JETTON_MASTER_ADDRESS) throw new Error("USDT Jetton Master Address is not configured.");
        if (!BACKEND_USDT_WALLET_ADDRESS) throw new Error("Backend USDT public wallet address is not configured.");

        const tonClient = await tonUtils.getTonClient();
        const { contract: backendWalletContract, keyPair, address: backendWalletAddressParsed } = await tonUtils.getWalletForPayout(BACKEND_USDT_WALLET_MNEMONIC.split(" "));

        const configuredBackendAddress = Address.parse(BACKEND_USDT_WALLET_ADDRESS).toString({urlSafe: true, bounceable: true, testOnly: TON_NETWORK === 'testnet'});
        if (backendWalletAddressParsed.toLowerCase() !== configuredBackendAddress.toLowerCase()) {
            throw new Error("Backend wallet address mismatch. Payout aborted for security.");
        }

        const backendUsdtJettonWalletAddress = await tonUtils.getJettonWalletAddress(BACKEND_USDT_WALLET_ADDRESS, USDT_JETTON_MASTER_ADDRESS);
        if (!backendUsdtJettonWalletAddress) {
            throw new Error(`Could not derive backend's USDT Jetton Wallet for ${BACKEND_USDT_WALLET_ADDRESS} using master ${USDT_JETTON_MASTER_ADDRESS}.`);
        }
        console.log(`Backend's USDT Jetton Wallet for payout: ${backendUsdtJettonWalletAddress}`);

        const payoutForwardPayload = tonUtils.createJettonForwardPayload(BigInt(withdrawalId), `Withdrawal ID: ${withdrawalId}`); // Use withdrawalId as queryId for payload

        const transferMessageBody = tonUtils.createJettonTransferMessage(
            amountUsdtSmallestUnits,
            recipientWalletAddress,
            BACKEND_USDT_WALLET_ADDRESS,
            toNano( (TON_TRANSACTION_FEES.JETTON_TRANSFER_FROM_WALLET / 1e9).toFixed(9) ), // Convert nanoTON to TON string for toNano
            payoutForwardPayload
        );

        const seqno = await backendWalletContract.getSeqno();
        const transfer = backendWalletContract.createTransfer({
            seqno: seqno,
            secretKey: keyPair.secretKey,
            messages: [internal({
                to: Address.parse(backendUsdtJettonWalletAddress),
                value: toNano( (TON_TRANSACTION_FEES.BASE_JETTON_PAYOUT_PROCESSING / 1e9).toFixed(9) ),
                body: transferMessageBody,
                bounce: true,
            })]
        });

        await backendWalletContract.send(transfer);
        console.log(`USDT Payout tx for Withdrawal ID ${withdrawalId} sent from ${backendWalletContract.address.toString()}. Seqno: ${seqno}. Awaiting on-chain confirmation...`);

        const txHash = await tonUtils.waitForTransaction(tonClient, backendWalletContract.address, seqno);

        if (txHash) {
            console.log(`USDT Payout tx for ID ${withdrawalId} (seqno ${seqno}) confirmed with hash: ${txHash}.`);
            return { success: true, transactionHash: txHash, reason: "Transaction confirmed on-chain." };
        } else {
            console.error(`USDT Payout tx for ID ${withdrawalId} (seqno ${seqno}) could not be confirmed on-chain or failed.`);
            return { success: false, transactionHash: null, reason: "Transaction confirmation timeout or on-chain failure after sending." };
        }
    }

    async processUsdtWithdrawalRequest(userWalletAddress, amountUsdtToWithdraw) {
        if (amountUsdtToWithdraw < MIN_USDT_WITHDRAWAL_USD_VALUE) {
            throw new Error(`Minimum USDT withdrawal is $${MIN_USDT_WITHDRAWAL_USD_VALUE}.`);
        }
        const amountUsdtSmallestUnits = toNano(amountUsdtToWithdraw.toFixed(USDT_DECIMALS)); // Ensure correct precision for toNano

        const client = await db.getClient();
        try {
            await client.query('BEGIN');
            const userResult = await client.query("SELECT claimable_usdt_balance FROM users WHERE wallet_address = $1 FOR UPDATE", [userWalletAddress]);
            const currentClaimableUsdt = userResult.rows[0] ? parseFloat(userResult.rows[0].claimable_usdt_balance) : 0;

            if (currentClaimableUsdt < amountUsdtToWithdraw) {
                await client.query('ROLLBACK');
                throw new Error(`Insufficient claimable USDT. Available: $${currentClaimableUsdt.toFixed(USDT_DECIMALS)}`);
            }

            const newBalance = currentClaimableUsdt - amountUsdtToWithdraw;
            await client.query("UPDATE users SET claimable_usdt_balance = $1, updated_at = NOW() WHERE wallet_address = $2", [newBalance, userWalletAddress]);

            const { rows: withdrawalRecord } = await client.query(
                `INSERT INTO user_usdt_withdrawals (user_wallet_address, amount_usdt, status, requested_at)
                 VALUES ($1, $2, 'processing', NOW()) RETURNING withdrawal_id`,
                [userWalletAddress, amountUsdtToWithdraw]
            );
            const withdrawalId = withdrawalRecord[0].withdrawal_id;
            await client.query('COMMIT');

            this.executeSecureUsdtPayout(withdrawalId, userWalletAddress, amountUsdtSmallestUnits)
                .then(async payoutResult => {
                    const finalStatus = payoutResult.success ? 'completed' : 'payout_failed';
                    const notes = payoutResult.reason || (payoutResult.success ? 'Payout successful.' : 'Payout failed due to an on-chain issue.');
                    await db.query(
                        `UPDATE user_usdt_withdrawals SET status = $1, onchain_tx_hash = $2, processed_at = NOW(), notes = $3 WHERE withdrawal_id = $4`,
                        [finalStatus, payoutResult.transactionHash, notes.substring(0,250), withdrawalId]
                    );
                    if (!payoutResult.success) {
                        console.error(`USDT Payout Failed for Withdrawal ID ${withdrawalId}. User balance was debited. Reason: ${notes}. Attempting to revert claimable_usdt_balance.`);
                        try {
                            await db.query("UPDATE users SET claimable_usdt_balance = claimable_usdt_balance + $1, updated_at = NOW(), notes = COALESCE(notes, '') || $3 WHERE wallet_address = $2",
                                [amountUsdtToWithdraw, userWalletAddress, `\nReverted USDT withdrawal WID ${withdrawalId} due to payout failure: ${notes.substring(0,100)}`]);
                            console.log(`User ${userWalletAddress} USDT balance successfully reverted for WID ${withdrawalId}.`);
                        } catch (revertError) {
                            console.error(`CRITICAL: Failed to revert user's USDT balance for WID ${withdrawalId} after payout failure. Manual intervention required. Error: ${revertError.message}`);
                        }
                    }
                })
                .catch(async payoutError => {
                    console.error(`CRITICAL SYSTEM ERROR during USDT Payout for Withdrawal ID ${withdrawalId}: ${payoutError.message}`, payoutError.stack);
                    const errorNote = `System error during payout: ${payoutError.message}`.substring(0, 250);
                    try {
                        await db.query(
                            `UPDATE user_usdt_withdrawals SET status = 'payout_system_error', notes = $1, processed_at = NOW() WHERE withdrawal_id = $2`,
                            [errorNote, withdrawalId]
                        );
                        await db.query("UPDATE users SET claimable_usdt_balance = claimable_usdt_balance + $1, updated_at = NOW(), notes = COALESCE(notes, '') || $3 WHERE wallet_address = $2",
                            [amountUsdtToWithdraw, userWalletAddress, `\nReverted USDT withdrawal WID ${withdrawalId} due to system error.`]);
                        console.log(`User ${userWalletAddress} USDT balance reverted for WID ${withdrawalId} due to payout system error.`);
                    } catch (dbError) {
                        console.error(`Failed to update withdrawal status to payout_system_error or revert balance for ID ${withdrawalId}: ${dbError.message}`);
                    }
                });

            return { message: `USDT Withdrawal request for $${amountUsdtToWithdraw.toFixed(USDT_DECIMALS)} is processing.`, withdrawalId };
        } catch (error) {
            if (client && client.activeQuery === null) {
                try { await client.query('ROLLBACK'); } catch (rbError) { console.error("Rollback error in outer catch (USDT withdrawal):", rbError); }
            }
            console.error("SERVICE: Error in processUsdtWithdrawalRequest:", error.message, error.stack);
            throw error;
        } finally {
            if (client) client.release();
        }
    }

    async processArixRewardWithdrawalRequest(userWalletAddress, amountArixToWithdraw) {
        const currentArxPrice = await priceService.getArxUsdtPrice();
        let minArixWithdrawalAmount = 0;
        if (currentArxPrice && currentArxPrice > 0) {
            minArixWithdrawalAmount = MIN_USDT_WITHDRAWAL_USD_VALUE / currentArxPrice;
        } else {
            minArixWithdrawalAmount = 10; // Fallback if price fails
            console.warn(`ARIX price not available for withdrawal check. Using fallback min: ${minArixWithdrawalAmount} ARIX.`);
        }

        if (amountArixToWithdraw < minArixWithdrawalAmount && minArixWithdrawalAmount > 0) {
            throw new Error(`Minimum ARIX withdrawal is approx. ${minArixWithdrawalAmount.toFixed(ARIX_DECIMALS)} ARIX.`);
        }

        const amountArixSmallestUnits = toNano(amountArixToWithdraw.toFixed(ARIX_DECIMALS));

        const client = await db.getClient();
        try {
            await client.query('BEGIN');
            const userResult = await client.query("SELECT claimable_arix_rewards FROM users WHERE wallet_address = $1 FOR UPDATE", [userWalletAddress]);
            const currentClaimableArix = userResult.rows[0] ? parseFloat(userResult.rows[0].claimable_arix_rewards) : 0;

            if (currentClaimableArix < amountArixToWithdraw) {
                await client.query('ROLLBACK');
                throw new Error(`Insufficient claimable ARIX rewards. Available: ${currentClaimableArix.toFixed(ARIX_DECIMALS)} ARIX`);
            }

            const newBalance = currentClaimableArix - amountArixToWithdraw;
            await client.query("UPDATE users SET claimable_arix_rewards = $1, updated_at = NOW() WHERE wallet_address = $2", [newBalance, userWalletAddress]);

            // For now, ARIX withdrawals (from games/tasks) are logged but not auto-paid out.
            // This would require a separate ARIX treasury wallet and payout logic similar to USDT.
            // You can add a user_arix_withdrawals table and payout logic if needed.
            console.log(`ARIX Reward Withdrawal recorded for ${userWalletAddress}: ${amountArixToWithdraw} ARIX. Balance updated. Payout is manual or via separate process for now.`);

            await client.query('COMMIT');
            return { message: `ARIX Reward Withdrawal request for ${amountArixToWithdraw.toFixed(ARIX_DECIMALS)} ARIX recorded. Payouts are processed periodically.`, withdrawalId: `ARIX-MANUAL-${Date.now()}` };
        } catch (error) {
            if (client && client.activeQuery === null) {
                try { await client.query('ROLLBACK'); } catch (rbError) { console.error("Rollback error in outer catch (ARIX withdrawal):", rbError); }
            }
            console.error("SERVICE: Error in processArixRewardWithdrawalRequest:", error.message, error.stack);
            throw error;
        } finally {
            if (client) client.release();
        }
    }
}

const earnServiceInstance = new EarnService();
module.exports = earnServiceInstance; // Export the instance directly