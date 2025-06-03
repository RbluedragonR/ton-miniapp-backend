// File: AR_Proj/ar_backend/src/services/earnService.js
const db = require('../config/database');
const { TonClient, Address, Cell, Slice, beginCell, internal, WalletContractV4, toNano, fromNano } = require('@ton/ton');
const { getHttpEndpoint } = require('@orbs-network/ton-access');
const { mnemonicToPrivateKey } = require('@ton/crypto'); 

const priceService = require('./priceService');
const tonUtils = require('../utils/tonUtils'); 
const { 
    STAKING_CONTRACT_ADDRESS, 
    ARIX_TOKEN_MASTER_ADDRESS,
    USDT_REWARD_JETTON_MASTER_ADDRESS, 
    BACKEND_USDT_WALLET_ADDRESS,      
    BACKEND_USDT_WALLET_MNEMONIC,   
    STAKING_CONTRACT_JETTON_WALLET_ADDRESS,
    TON_NETWORK
} = require('../config/envConfig');

const ARIX_DECIMALS = 9;
const USDT_DECIMALS = 6; 
const MIN_USDT_WITHDRAWAL = 3;
const USDT_PAYOUT_FORWARD_TON_AMOUNT = toNano('0.05'); 

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
            `SELECT *, ref_monthly_l1_usdt_earn_percent, ref_monthly_l2_usdt_earn_percent 
             FROM staking_plans WHERE is_active = TRUE ORDER BY duration_days ASC`
        );
        return rows.map(p => ({
            ...p,
            plan_id: parseInt(p.plan_id),
            duration_days: parseInt(p.duration_days),
            fixed_usdt_apr_percent: parseFloat(p.fixed_usdt_apr_percent),
            arix_early_unstake_penalty_percent: parseFloat(p.arix_early_unstake_penalty_percent),
            min_stake_arix: parseFloat(p.min_stake_arix),
            max_stake_arix: p.max_stake_arix ? parseFloat(p.max_stake_arix) : null,
            referral_l1_invest_percent: parseFloat(p.referral_l1_invest_percent || 0),
            referral_l2_invest_percent: parseFloat(p.referral_l2_invest_percent || 0),
            referral_l1_reward_percent_of_l1_direct_bonus: parseFloat(p.referral_l1_reward_percent_of_l1_direct_bonus || 0),
            referral_l2_reward_percent_of_l1_direct_bonus: parseFloat(p.referral_l2_reward_percent_of_l1_direct_bonus || 0),
            ref_monthly_l1_usdt_earn_percent: parseFloat(p.ref_monthly_l1_usdt_earn_percent || 0),
            ref_monthly_l2_usdt_earn_percent: parseFloat(p.ref_monthly_l2_usdt_earn_percent || 0),
        }));
    }

    async getPlanByKey(planKey) {
        const { rows } = await db.query(
            "SELECT *, ref_monthly_l1_usdt_earn_percent, ref_monthly_l2_usdt_earn_percent FROM staking_plans WHERE plan_key = $1 AND is_active = TRUE", [planKey]
        );
        if (!rows[0]) return null;
        const p = rows[0];
        return {
            ...p,
            plan_id: parseInt(p.plan_id),
            duration_days: parseInt(p.duration_days),
            fixed_usdt_apr_percent: parseFloat(p.fixed_usdt_apr_percent),
            arix_early_unstake_penalty_percent: parseFloat(p.arix_early_unstake_penalty_percent),
            min_stake_arix: parseFloat(p.min_stake_arix),
            max_stake_arix: p.max_stake_arix ? parseFloat(p.max_stake_arix) : null,
            referral_l1_invest_percent: parseFloat(p.referral_l1_invest_percent || 0),
            referral_l2_invest_percent: parseFloat(p.referral_l2_invest_percent || 0),
            referral_l1_reward_percent_of_l1_direct_bonus: parseFloat(p.referral_l1_reward_percent_of_l1_direct_bonus || 0),
            referral_l2_reward_percent_of_l1_direct_bonus: parseFloat(p.referral_l2_reward_percent_of_l1_direct_bonus || 0),
            ref_monthly_l1_usdt_earn_percent: parseFloat(p.ref_monthly_l1_usdt_earn_percent || 0),
            ref_monthly_l2_usdt_earn_percent: parseFloat(p.ref_monthly_l2_usdt_earn_percent || 0),
        };
    }
    
    async createStake({ planKey, arixAmount, userWalletAddress, transactionBoc, referenceUsdtValue, referrerWalletAddress, transactionHash, stakeUUID }) {
        const plan = await this.getPlanByKey(planKey);
        if (!plan) throw new Error("Invalid or inactive staking plan key.");
        if (arixAmount < plan.min_stake_arix) throw new Error(`Minimum stake for ${plan.title} is ${plan.min_stake_arix.toFixed(ARIX_DECIMALS)} ARIX.`);
        if (!transactionHash) throw new Error("Transaction hash is required to record the stake.");
        if (!stakeUUID) throw new Error("Valid Stake UUID from frontend is required.");

        const stakeTimestamp = new Date();
        const unlockTimestamp = new Date(stakeTimestamp.getTime() + plan.duration_days * 24 * 60 * 60 * 1000);
        
        const client = await db.getClient();
        try {
            await client.query('BEGIN');
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
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW(), NOW())
                RETURNING stake_id`,
                [stakeUUID, userWalletAddress, plan.plan_id, arixAmount, referenceUsdtValue, 
                 stakeTimestamp, unlockTimestamp, transactionBoc, transactionHash, 'pending_confirmation']
            );
            const newStakeId = rows[0].stake_id;

            if (referrerWalletAddress && referrerWalletAddress !== userWalletAddress) {
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

    async _processInvestmentReferralBonuses(dbClient, stakeId, plan, stakerWalletAddress, stakedUsdtValue) {
        const l1ReferrerQuery = await dbClient.query("SELECT referrer_wallet_address FROM users WHERE wallet_address = $1", [stakerWalletAddress]);
        const l1Referrer = l1ReferrerQuery.rows[0]?.referrer_wallet_address;
        if (!l1Referrer || l1Referrer === stakerWalletAddress) return;

        let l1DirectBonusUsdt = 0;
        if (plan.referral_l1_invest_percent > 0) {
            l1DirectBonusUsdt = stakedUsdtValue * (plan.referral_l1_invest_percent / 100);
            if (l1DirectBonusUsdt > 0) {
                await this._addReferralReward(dbClient, stakeId, l1Referrer, stakerWalletAddress, 1, 'investment_percentage_l1', l1DirectBonusUsdt);
            }
        }

        const l2ReferrerQuery = await dbClient.query("SELECT referrer_wallet_address FROM users WHERE wallet_address = $1", [l1Referrer]);
        const l2Referrer = l2ReferrerQuery.rows[0]?.referrer_wallet_address;
        if (!l2Referrer || l2Referrer === l1Referrer || l2Referrer === stakerWalletAddress) return;

        if (plan.referral_l2_invest_percent > 0) {
            const l2BonusFromInvestment = stakedUsdtValue * (plan.referral_l2_invest_percent / 100);
            if (l2BonusFromInvestment > 0) {
                await this._addReferralReward(dbClient, stakeId, l2Referrer, stakerWalletAddress, 2, 'investment_percentage_l2', l2BonusFromInvestment);
            }
        }
        if (plan.referral_l2_reward_percent_of_l1_direct_bonus > 0 && l1DirectBonusUsdt > 0) {
            const l2BonusFromL1Reward = l1DirectBonusUsdt * (plan.referral_l2_reward_percent_of_l1_direct_bonus / 100);
            if (l2BonusFromL1Reward > 0) {
                 await this._addReferralReward(dbClient, stakeId, l2Referrer, l1Referrer, 2, 'l1_direct_bonus_commission_l2', l2BonusFromL1Reward);
            }
        }
    }
    
    async _addReferralReward(dbClient, stakeId, referrerWallet, sourceUserWallet, level, rewardType, amountUsdt) {
        await dbClient.query(
            `INSERT INTO referral_rewards (stake_id, referrer_wallet_address, referred_wallet_address, level, reward_type, reward_amount_usdt, status, created_at)
             VALUES ($1, $2, $3, $4, $5, $6, 'pending_payout', NOW())`,
            [stakeId, referrerWallet, sourceUserWallet, level, rewardType, amountUsdt]
        );
        await dbClient.query(
            `UPDATE users SET claimable_usdt_balance = COALESCE(claimable_usdt_balance, 0) + $1, updated_at = NOW() WHERE wallet_address = $2`,
            [amountUsdt, referrerWallet]
        );
         console.log(`Referral Reward: ${amountUsdt.toFixed(USDT_DECIMALS)} USDT for ${referrerWallet} (L${level}) from user ${sourceUserWallet}, type: ${rewardType}.`);
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
                await db.query("UPDATE user_stakes SET status = 'active', updated_at = NOW(), last_usdt_reward_calc_timestamp = NOW(), notes = $2 WHERE stake_id = $1", [stakeId, verificationNote.substring(0,250)]);
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
            message = `This is an EARLY unstake of ARIX principal. A ${penaltyPercent}% penalty on staked ARIX will apply. Any ARIX-specific lock rewards (if applicable) would be forfeited by the SC. USDT rewards are managed separately by the backend.`;
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
        const userResult = await db.query("SELECT claimable_usdt_balance FROM users WHERE wallet_address = $1", [userWalletAddress]);
        const totalClaimableUsdt = userResult.rows[0] ? parseFloat(userResult.rows[0].claimable_usdt_balance) : 0;

        const stakesQuery = `
            SELECT us.*, 
                   sp.plan_key, sp.title AS plan_title, 
                   sp.fixed_usdt_apr_percent, 
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
                usdtApr: parseFloat(s.fixed_usdt_apr_percent).toFixed(2),
                accruedUsdtRewardTotal: parseFloat(s.usdt_reward_accrued_total || 0).toFixed(USDT_DECIMALS),
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
            totalClaimableUsdt: totalClaimableUsdt.toFixed(USDT_DECIMALS)
        };
    }
    
    async executeSecureUsdtPayout(withdrawalId, recipientWalletAddress, amountUsdtSmallestUnits) {
        console.log(`USDT Payout Init: ID ${withdrawalId}, To ${recipientWalletAddress}, Amount ${fromNano(amountUsdtSmallestUnits)} USDT`);
        if (!BACKEND_USDT_WALLET_MNEMONIC) {
            console.error("USDT Payout Aborted: Backend USDT wallet mnemonic is not configured.");
            throw new Error("Backend USDT wallet mnemonic is not configured.");
        }
        if (!USDT_REWARD_JETTON_MASTER_ADDRESS) {
            console.error("USDT Payout Aborted: USDT Reward Jetton Master Address is not configured.");
            throw new Error("USDT Reward Jetton Master Address is not configured.");
        }
        if (!BACKEND_USDT_WALLET_ADDRESS) {
            console.error("USDT Payout Aborted: Backend USDT public wallet address is not configured.");
            throw new Error("Backend USDT public wallet address is not configured.");
        }

        const tonClient = await tonUtils.getTonClient();
        const { contract: backendWalletContract, keyPair, address: backendWalletAddressParsed } = await tonUtils.getWalletForPayout(BACKEND_USDT_WALLET_MNEMONIC.split(" "));
        
        if (backendWalletAddressParsed.toLowerCase() !== Address.parse(BACKEND_USDT_WALLET_ADDRESS).toString({urlSafe: true, bounceable: true, testOnly: TON_NETWORK === 'testnet'}).toLowerCase()) {
            console.error(`CRITICAL SECURITY: Mnemonic derived address ${backendWalletAddressParsed} does not match configured BACKEND_USDT_WALLET_ADDRESS ${BACKEND_USDT_WALLET_ADDRESS}`);
            throw new Error("Backend wallet address mismatch. Payout aborted for security.");
        }

        const backendUsdtJettonWalletAddress = await tonUtils.getJettonWalletAddress(BACKEND_USDT_WALLET_ADDRESS, USDT_REWARD_JETTON_MASTER_ADDRESS);
        if (!backendUsdtJettonWalletAddress) {
            throw new Error(`Could not derive backend's USDT Jetton Wallet for ${BACKEND_USDT_WALLET_ADDRESS} using master ${USDT_REWARD_JETTON_MASTER_ADDRESS}. Ensure master is correct and wallet is funded with TON to deploy JW if needed.`);
        }
        console.log(`Backend's USDT Jetton Wallet for payout: ${backendUsdtJettonWalletAddress}`);

        const transferMessageBody = tonUtils.createJettonTransferMessage(
            amountUsdtSmallestUnits,
            recipientWalletAddress,      
            BACKEND_USDT_WALLET_ADDRESS, 
            USDT_PAYOUT_FORWARD_TON_AMOUNT,
            null 
        );

        const seqno = await backendWalletContract.getSeqno();
        const transfer = backendWalletContract.createTransfer({
            seqno: seqno,
            secretKey: keyPair.secretKey,
            messages: [internal({
                to: Address.parse(backendUsdtJettonWalletAddress),
                value: toNano('0.1'), 
                body: transferMessageBody,
                bounce: true, 
            })]
        });

        await backendWalletContract.send(transfer);
        console.log(`USDT Payout tx for Withdrawal ID ${withdrawalId} sent from ${backendWalletContract.address.toString()}. Seqno: ${seqno}. Awaiting on-chain confirmation...`);

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
                    lt: lastTxLt, // Start from the last known transaction to avoid re-fetching old ones
                    // hash: <if we could get hash of message before sending, that would be better>
                    to_lt: 0, // Fetch towards newest
                    archival: true
                });

                for (const tx of transactions) {
                    if (tx.seqno === seqno) { // Match by seqno
                        txHash = tx.hash().toString('hex');
                        console.log(`USDT Payout tx for ID ${withdrawalId} (seqno ${seqno}) confirmed with hash: ${txHash}.`);
                        break;
                    }
                }
                if (transactions.length > 0) { // Update lastTxLt for next poll iteration if needed
                    lastTxLt = transactions[transactions.length -1].lt;
                }

            } catch (pollError) {
                console.warn(`Polling error for USDT payout (ID ${withdrawalId}, attempt ${attempts}): ${pollError.message}`);
            }
        }
        
        if (txHash) {
            return { success: true, transactionHash: txHash };
        } else {
            console.error(`USDT Payout tx for ID ${withdrawalId} (seqno ${seqno}) could not be confirmed on-chain after ${attempts} attempts.`);
            return { success: false, transactionHash: null, reason: "Transaction confirmation timeout after sending." };
        }
    }

    async processUsdtWithdrawalRequest(userWalletAddress, amountToWithdrawUsdt) {
        if (amountToWithdrawUsdt < MIN_USDT_WITHDRAWAL) {
            throw new Error(`Minimum USDT withdrawal is $${MIN_USDT_WITHDRAWAL.toFixed(USDT_DECIMALS)}.`);
        }
        const amountUsdtSmallestUnits = BigInt(Math.round(amountToWithdrawUsdt * (10 ** USDT_DECIMALS)));

        const client = await db.getClient();
        try {
            await client.query('BEGIN');
            const userResult = await client.query("SELECT claimable_usdt_balance FROM users WHERE wallet_address = $1 FOR UPDATE", [userWalletAddress]);
            const currentClaimable = userResult.rows[0] ? parseFloat(userResult.rows[0].claimable_usdt_balance) : 0;

            if (currentClaimable < amountToWithdrawUsdt) {
                await client.query('ROLLBACK'); // Release lock before throwing
                throw new Error(`Insufficient claimable USDT. Available: $${currentClaimable.toFixed(USDT_DECIMALS)}`);
            }
            
            const newBalance = currentClaimable - amountToWithdrawUsdt;
            await client.query("UPDATE users SET claimable_usdt_balance = $1, updated_at = NOW() WHERE wallet_address = $2", [newBalance, userWalletAddress]);

            const { rows: withdrawalRecord } = await client.query(
                `INSERT INTO user_usdt_withdrawals (user_wallet_address, amount_usdt, status, requested_at)
                 VALUES ($1, $2, 'processing', NOW()) RETURNING withdrawal_id`,
                [userWalletAddress, amountToWithdrawUsdt]
            );
            const withdrawalId = withdrawalRecord[0].withdrawal_id;
            await client.query('COMMIT'); 

            // Asynchronously attempt payout and update status. Do not await here.
            this.executeSecureUsdtPayout(withdrawalId, userWalletAddress, amountUsdtSmallestUnits)
                .then(async payoutResult => {
                    const finalStatus = payoutResult.success ? 'completed' : 'payout_failed';
                    const notes = payoutResult.success ? 'Payout successful.' : (payoutResult.reason || 'Payout failed due to unknown on-chain issue.');
                    await db.query(
                        `UPDATE user_usdt_withdrawals SET status = $1, onchain_tx_hash = $2, processed_at = NOW(), notes = $3 WHERE withdrawal_id = $4`,
                        [finalStatus, payoutResult.transactionHash, notes.substring(0,250), withdrawalId]
                    );
                    if (!payoutResult.success) {
                        console.error(`USDT Payout Failed for Withdrawal ID ${withdrawalId}. User balance was debited. Reason: ${notes}. Manual reconciliation/revert may be needed.`);
                        // For MVP, we log. Production might auto-revert or flag for admin.
                        // Example Revert (use with caution, ensure it's appropriate for the failure type):
                        // await db.query("UPDATE users SET claimable_usdt_balance = claimable_usdt_balance + $1, updated_at = NOW(), notes = COALESCE(notes, '') || $3 WHERE wallet_address = $2", 
                        //    [amountToWithdrawUsdt, userWalletAddress, `\nReverted failed payout attempt for WID ${withdrawalId}. Reason: ${notes.substring(0,100)}`]);
                    }
                })
                .catch(async payoutError => {
                    console.error(`CRITICAL SYSTEM ERROR during USDT Payout for Withdrawal ID ${withdrawalId}: ${payoutError.message}`, payoutError.stack);
                    try {
                        await db.query(
                            `UPDATE user_usdt_withdrawals SET status = 'payout_system_error', notes = $1, processed_at = NOW() WHERE withdrawal_id = $2`,
                            [`System error during payout: ${payoutError.message}`.substring(0, 250), withdrawalId]
                        );
                        // Revert user's balance on system error during payout attempt
                        await db.query("UPDATE users SET claimable_usdt_balance = claimable_usdt_balance + $1, updated_at = NOW(), notes = COALESCE(notes, '') || $3 WHERE wallet_address = $2", 
                            [amountToWithdrawUsdt, userWalletAddress, `\nReverted system error payout for WID ${withdrawalId}.`]);
                        console.log(`User ${userWalletAddress} balance reverted for WID ${withdrawalId} due to payout system error.`);
                    } catch (dbError) {
                        console.error(`Failed to update withdrawal status to payout_system_error or revert balance for ID ${withdrawalId}: ${dbError.message}`);
                    }
                });

            return { message: `USDT Withdrawal request for $${amountToWithdrawUsdt.toFixed(USDT_DECIMALS)} is processing. You will be notified of the outcome.`, withdrawalId };
        } catch (error) {
            // Ensure client is released if BEGIN was called but COMMIT/ROLLBACK wasn't reached due to early throw
            if (client && client.activeQuery === null) { // Check if client is not in a query
                 try { await client.query('ROLLBACK'); } catch (rbError) { console.error("Rollback error in outer catch:", rbError); }
            }
            console.error("SERVICE: Error in processUsdtWithdrawalRequest:", error.message, error.stack);
            throw error;
        } finally {
            if (client) client.release();
        }
    }

    async calculateAndStoreMonthlyUsdtRewards() {
        console.log("CRON_JOB: Starting monthly USDT reward & referral calculation...");
        const client = await db.getClient();
        try {
            await client.query('BEGIN');
            const { rows: activeStakes } = await client.query(`
                SELECT us.stake_id, us.user_wallet_address, us.reference_usdt_value_at_stake_time, 
                       us.last_usdt_reward_calc_timestamp, us.stake_timestamp, us.unlock_timestamp,
                       sp.plan_id, sp.plan_key, sp.fixed_usdt_apr_percent, sp.duration_days,
                       sp.ref_monthly_l1_usdt_earn_percent, sp.ref_monthly_l2_usdt_earn_percent
                FROM user_stakes us
                JOIN staking_plans sp ON us.staking_plan_id = sp.plan_id
                WHERE us.status = 'active' AND us.unlock_timestamp > NOW()
            `);

            let totalStakesProcessed = 0;
            let totalReferralBonuses = 0;

            for (const stake of activeStakes) {
                const plan = await this.getPlanByKey(stake.plan_key);
                if (!plan) {
                    console.warn(`CRON_JOB: Plan ${stake.plan_key} for stake ${stake.stake_id} not found. Skipping.`);
                    continue;
                }

                const now = new Date();
                let lastCalcTime = stake.last_usdt_reward_calc_timestamp ? new Date(stake.last_usdt_reward_calc_timestamp) : new Date(stake.stake_timestamp);
                let shouldCalculate = !stake.last_usdt_reward_calc_timestamp || (now >= new Date(lastCalcTime.getFullYear(), lastCalcTime.getMonth() + 1, lastCalcTime.getDate()));
                
                if (!shouldCalculate) continue;

                const monthlyUsdtRewardForStaker = (parseFloat(stake.reference_usdt_value_at_stake_time) * (parseFloat(stake.fixed_usdt_apr_percent) / 100)) / 12;

                if (monthlyUsdtRewardForStaker > 0) {
                    await client.query(
                        `UPDATE user_stakes SET usdt_reward_accrued_total = COALESCE(usdt_reward_accrued_total, 0) + $1, last_usdt_reward_calc_timestamp = NOW(), updated_at = NOW() WHERE stake_id = $2`,
                        [monthlyUsdtRewardForStaker, stake.stake_id]
                    );
                    await client.query(
                        `UPDATE users SET claimable_usdt_balance = COALESCE(claimable_usdt_balance, 0) + $1, updated_at = NOW() WHERE wallet_address = $2`,
                        [monthlyUsdtRewardForStaker, stake.user_wallet_address]
                    );
                    totalStakesProcessed++;
                    console.log(`CRON_JOB: Stake ${stake.stake_id} (User ${stake.user_wallet_address}) awarded ${monthlyUsdtRewardForStaker.toFixed(USDT_DECIMALS)} USDT directly.`);

                    const stakerWalletAddress = stake.user_wallet_address;
                    const l1ReferrerQuery = await client.query("SELECT referrer_wallet_address FROM users WHERE wallet_address = $1", [stakerWalletAddress]);
                    const l1Referrer = l1ReferrerQuery.rows[0]?.referrer_wallet_address;

                    if (l1Referrer && l1Referrer !== stakerWalletAddress && plan.ref_monthly_l1_usdt_earn_percent > 0) {
                        const l1MonthlyBonus = monthlyUsdtRewardForStaker * (plan.ref_monthly_l1_usdt_earn_percent / 100);
                        if (l1MonthlyBonus > 0) {
                            await this._addReferralReward(client, stake.stake_id, l1Referrer, stakerWalletAddress, 1, 'monthly_earnings_l1', l1MonthlyBonus);
                            totalReferralBonuses++;
                        }

                        const l2ReferrerQuery = await client.query("SELECT referrer_wallet_address FROM users WHERE wallet_address = $1", [l1Referrer]);
                        const l2Referrer = l2ReferrerQuery.rows[0]?.referrer_wallet_address;

                        if (l2Referrer && l2Referrer !== l1Referrer && l2Referrer !== stakerWalletAddress && plan.ref_monthly_l2_usdt_earn_percent > 0) {
                            const l2MonthlyBonus = monthlyUsdtRewardForStaker * (plan.ref_monthly_l2_usdt_earn_percent / 100);
                            if (l2MonthlyBonus > 0) {
                                await this._addReferralReward(client, stake.stake_id, l2Referrer, stakerWalletAddress, 2, 'monthly_earnings_l2', l2MonthlyBonus);
                                totalReferralBonuses++;
                            }
                        }
                    }
                }
            }
            await client.query('COMMIT');
            console.log(`CRON_JOB: Monthly USDT reward calculation finished. ${totalStakesProcessed} stakes processed directly. ${totalReferralBonuses} referral bonuses processed.`);
        } catch (error) {
            await client.query('ROLLBACK');
            console.error("CRON_JOB_ERROR: Error during monthly USDT reward & referral calculation:", error.message, error.stack);
        } finally {
            client.release();
        }
    }
}
module.exports = new EarnService();