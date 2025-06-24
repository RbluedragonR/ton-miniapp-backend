//================================================================
// FILE: ar_backend/src/controllers/earnController.js (UPDATED)
//================================================================
const earnService = require('../services/earnService');
const priceService = require('../services/priceService');
const { Address } = require('@ton/core');
const {
    ARIX_TOKEN_MASTER_ADDRESS,
    STAKING_CONTRACT_ADDRESS,
    STAKING_CONTRACT_JETTON_WALLET_ADDRESS,
    USDT_JETTON_MASTER_ADDRESS,
} = require('../config/envConfig');
const { ARIX_DECIMALS, USDT_DECIMALS } = require('../utils/constants');

const isValidTonAddress = (addr) => {
    if (!addr) return false;
    try {
        Address.parse(addr);
        return true;
    } catch (e) {
        return false;
    }
};

exports.getStakingConfig = async (req, res, next) => {
    try {
        const plansFromDb = await earnService.getActiveStakingPlans();
        const currentArxPrice = await priceService.getArxUsdtPrice();

        const config = {
            stakingContractAddress: STAKING_CONTRACT_ADDRESS,
            stakingContractJettonWalletAddress: STAKING_CONTRACT_JETTON_WALLET_ADDRESS,
            arxToken: {
                masterAddress: ARIX_TOKEN_MASTER_ADDRESS,
                decimals: ARIX_DECIMALS,
            },
            usdtToken: {
                masterAddress: USDT_JETTON_MASTER_ADDRESS,
                decimals: USDT_DECIMALS,
            },
            stakingPlans: plansFromDb.map(p => ({
                key: p.plan_key,
                id: p.plan_id.toString(),
                title: p.title,
                durationDays: parseInt(p.duration_days, 10),
                fixedUsdtAprPercent: parseFloat(p.fixed_usdt_apr_percent).toFixed(2),
                arixEarlyUnstakePenaltyPercent: parseFloat(p.arix_early_unstake_penalty_percent).toFixed(2),
                minStakeUsdt: parseFloat(p.min_stake_usdt).toFixed(2),
                maxStakeUsdt: p.max_stake_usdt ? parseFloat(p.max_stake_usdt).toFixed(2) : null,
                referralL1InvestPercent: parseFloat(p.referral_l1_invest_percent).toFixed(2),
                referralL2InvestPercent: parseFloat(p.referral_l2_invest_percent).toFixed(2),
                referralL2CommissionOnL1BonusPercent: parseFloat(p.referral_l2_commission_on_l1_bonus_percent).toFixed(2),
            })),
            currentArxUsdtPrice: currentArxPrice
        };
        res.status(200).json(config);
    } catch (error) {
        console.error("CTRL: Error in getStakingConfig:", error);
        next(error);
    }
};

/**
 * [NEW] Controller to fetch the ARIX price.
 * This provides a dedicated endpoint for the frontend.
 */
exports.getArixPrice = async (req, res, next) => {
    try {
        const price = await priceService.getArxUsdtPrice();
        res.status(200).json({ price });
    } catch (error) {
        console.error("CTRL: Error in getArixPrice:", error);
        next(error);
    }
};


exports.recordUserStake = async (req, res, next) => {
    try {
        const {
            planKey, arixAmount, userWalletAddress,
            transactionBoc, transactionHash, stakeUUID,
            referenceUsdtValue, referrerCodeOrAddress
        } = req.body;

        if (!planKey || !arixAmount || !userWalletAddress || !transactionBoc || !referenceUsdtValue || !transactionHash || !stakeUUID) {
            return res.status(400).json({ message: "Missing required stake information." });
        }
        if (!isValidTonAddress(userWalletAddress)) {
            return res.status(400).json({ message: "Invalid userWalletAddress format." });
        }
        if (referrerCodeOrAddress && typeof referrerCodeOrAddress !== 'string') {
            return res.status(400).json({ message: "Invalid referrer format." });
        }

        const numericArixAmount = parseFloat(arixAmount);
        if (isNaN(numericArixAmount) || numericArixAmount <= 0) {
            return res.status(400).json({ message: "Invalid ARIX amount."});
        }
        const numericReferenceUsdtValue = parseFloat(referenceUsdtValue);
        if (isNaN(numericReferenceUsdtValue) || numericReferenceUsdtValue <= 0) {
            return res.status(400).json({ message: "Invalid reference USDT value."});
        }

        const newStake = await earnService.createStake({
            planKey,
            arixAmount: numericArixAmount,
            userWalletAddress,
            transactionBoc,
            transactionHash,
            stakeUUID,
            referenceUsdtValue: numericReferenceUsdtValue,
            referrerCodeOrAddress
        });

        res.status(201).json({
            message: "ARIX Stake recorded. Awaiting on-chain confirmation. USDT rewards will accrue monthly once active.",
            stake: newStake
        });
    } catch (error) {
        console.error("CTRL: Error recording stake:", error.message, error.stack);
        if (error.message.includes("Invalid") || error.message.includes("Minimum stake") || error.message.includes("required") || error.message.includes("already exists")) {
            return res.status(400).json({ message: error.message });
        }
        next(error);
    }
};

exports.getUserStakesAndRewards = async (req, res, next) => {
    try {
        const { userWalletAddress } = req.params;
        if (!isValidTonAddress(userWalletAddress)) {
            return res.status(400).json({ message: "Invalid userWalletAddress parameter." });
        }
        const currentArxPrice = await priceService.getArxUsdtPrice();
        const data = await earnService.findAllStakesAndRewardsByUser(userWalletAddress, currentArxPrice);
        res.status(200).json(data);
    }
    catch (error) {
        console.error("CTRL: Error in getUserStakesAndRewards:", error);
        next(error);
    }
};

exports.initiateArixUnstake = async (req, res, next) => {
    try {
        const { userWalletAddress, stakeId } = req.body;
        if (!isValidTonAddress(userWalletAddress) || !stakeId) {
            return res.status(400).json({ message: "Valid userWalletAddress and stakeId are required." });
        }
        const unstakePreparationDetails = await earnService.prepareArixUnstake(userWalletAddress, stakeId);
        res.status(200).json(unstakePreparationDetails);
    } catch (error) {
        console.error("CTRL: Error in initiateArixUnstake:", error.message);
        if (error.message.includes("not found") || error.message.includes("not active")) {
            return res.status(400).json({ message: error.message });
        }
        next(error);
    }
};

exports.confirmArixUnstake = async (req, res, next) => {
    try {
        const { userWalletAddress, stakeId, unstakeTransactionBoc, unstakeTransactionHash } = req.body;
        if (!isValidTonAddress(userWalletAddress) || !stakeId || !unstakeTransactionBoc || !unstakeTransactionHash) {
            return res.status(400).json({ message: "Missing required ARIX unstake confirmation information." });
        }
        const result = await earnService.finalizeArixUnstake({
            userWalletAddress, stakeId, unstakeTransactionBoc, unstakeTransactionHash
        });
        res.status(200).json(result);
    } catch (error) {
        console.error("CTRL: Error in confirmArixUnstake:", error.message);
        if (error.message.includes("not found") || error.message.includes("does not allow") || error.message.includes("required")) {
            return res.status(400).json({ message: error.message });
        }
        next(error);
    }
};

exports.requestUsdtWithdrawal = async (req, res, next) => {
    try {
        const { userWalletAddress, amountUsdt } = req.body;
        if (!isValidTonAddress(userWalletAddress) || !amountUsdt || parseFloat(amountUsdt) <= 0) {
            return res.status(400).json({ message: "Valid userWalletAddress and positive USDT amount are required."});
        }
        const withdrawalResult = await earnService.processUsdtWithdrawalRequest(userWalletAddress, parseFloat(amountUsdt));
        res.status(200).json(withdrawalResult);
    } catch (error) {
        console.error("CTRL: Error in requestUsdtWithdrawal:", error.message);
        if (error.message.includes("Minimum USDT withdrawal") || error.message.includes("Insufficient claimable USDT")) {
            return res.status(400).json({ message: error.message });
        }
        next(error);
    }
};

exports.requestArixRewardWithdrawal = async (req, res, next) => {
    try {
        const { userWalletAddress, amountArix } = req.body;
        if (!isValidTonAddress(userWalletAddress) || !amountArix || parseFloat(amountArix) <= 0) {
            return res.status(400).json({ message: "Valid userWalletAddress and positive ARIX amount are required."});
        }
        const withdrawalResult = await earnService.processArixRewardWithdrawalRequest(userWalletAddress, parseFloat(amountArix));
        res.status(200).json(withdrawalResult);
    } catch (error) {
        console.error("CTRL: Error in requestArixRewardWithdrawal:", error.message);
        if (error.message.includes("Minimum ARIX withdrawal") || error.message.includes("Insufficient claimable ARIX")) {
            return res.status(400).json({ message: error.message });
        }
        next(error);
    }
};

exports.triggerMonthlyUsdtRewardCalculation = async (req, res, next) => {
    const adminSecret = req.headers['x-admin-secret'];
    if (process.env.CRON_SECRET && adminSecret !== process.env.CRON_SECRET) {
        return res.status(403).json({ message: "Forbidden: Invalid admin secret."});
    }
    try {
        console.log("ADMIN: Received request to trigger monthly USDT reward calculation.");
        await earnService.calculateAndStoreMonthlyUsdtRewards();
        res.status(200).json({ message: "Monthly USDT reward calculation process triggered successfully." });
    } catch (error) {
        console.error("CTRL: Error triggering monthly USDT reward calculation:", error);
        next(error);
    }
};
