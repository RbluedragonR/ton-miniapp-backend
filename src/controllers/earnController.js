// File: ar_backend/src/controllers/earnController.js
const earnService = require('../services/earnService');
const priceService = require('../services/priceService'); // Assuming priceService.js exists and is configured
const { 
    ARIX_TOKEN_MASTER_ADDRESS, 
    STAKING_CONTRACT_ADDRESS, // For ARIX Staking SC
    STAKING_CONTRACT_JETTON_WALLET_ADDRESS // ARIX Staking SC's Jetton Wallet
} = require('../config/envConfig');

exports.getStakingConfig = async (req, res, next) => {
    try {
        const plansFromDb = await earnService.getActiveStakingPlans();
        const currentArxPrice = await priceService.getArxUsdtPrice();

        const config = {
            stakingContractAddress: STAKING_CONTRACT_ADDRESS,
            stakingContractJettonWalletAddress: STAKING_CONTRACT_JETTON_WALLET_ADDRESS,
            arxToken: {
                masterAddress: ARIX_TOKEN_MASTER_ADDRESS,
                decimals: 9,
            },
            stakingPlans: plansFromDb.map(p => ({
                key: p.plan_key,
                id: p.plan_id.toString(),
                title: p.title,
                duration: parseInt(p.duration_days, 10),
                usdtApr: p.fixed_usdt_apr_percent, // APR for USDT rewards
                arixEarlyUnstakePenaltyPercent: p.arix_early_unstake_penalty_percent,
                minStakeArix: p.min_stake_arix,
                // Include referral info if frontend needs to display it directly on plan cards
                referralL1InvestPercent: p.referral_l1_invest_percent,
                referralL2InvestPercent: p.referral_l2_invest_percent,
                referralL1RewardPercent: p.referral_l1_reward_percent_of_l1_direct_bonus,
                referralL2RewardPercent: p.referral_l2_reward_percent_of_l1_direct_bonus,
            })),
            currentArxUsdtPrice: currentArxPrice 
        };
        res.status(200).json(config);
    } catch (error) {
        console.error("CTRL: Error in getStakingConfig:", error);
        next(error);
    }
};

exports.recordUserStake = async (req, res, next) => {
    try {
        const { planKey, arixAmount, userWalletAddress, transactionBoc, referenceUsdtValue, referrerWalletAddress } = req.body;
        
        if (!planKey || !arixAmount || !userWalletAddress || !transactionBoc || !referenceUsdtValue) {
            return res.status(400).json({ message: "Missing required stake information." });
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
            referenceUsdtValue: numericReferenceUsdtValue,
            referrerWalletAddress // Can be null
        });

        res.status(201).json({ 
            message: "ARIX Stake recorded. Awaiting on-chain confirmation. USDT rewards will accrue monthly once active.", 
            stake: newStake 
        });
    } catch (error) {
        console.error("CTRL: Error recording stake:", error.message, error.stack);
        if (error.message.includes("Invalid") || error.message.includes("Minimum stake")) {
            return res.status(400).json({ message: error.message });
        }
        next(error);
    }
};

exports.getUserStakesAndRewards = async (req, res, next) => {
    try {
        const { userWalletAddress } = req.params;
        if (!userWalletAddress) {
            return res.status(400).json({ message: "User wallet address is required." });
        }
        const currentArxPrice = await priceService.getArxUsdtPrice();
        const data = await earnService.findAllStakesAndRewardsByUser(userWalletAddress, currentArxPrice);
        res.status(200).json(data); // This will include stakes and total claimable USDT
    } catch (error) {
        console.error("CTRL: Error in getUserStakesAndRewards:", error);
        next(error);
    }
};

exports.initiateArixUnstake = async (req, res, next) => { // For ARIX principal from SC
    try {
        const { userWalletAddress, stakeId } = req.body;
        if (!userWalletAddress || !stakeId) {
            return res.status(400).json({ message: "User wallet address and stake ID are required." });
        }
        const unstakePreparationDetails = await earnService.prepareArixUnstake(userWalletAddress, stakeId);
        res.status(200).json(unstakePreparationDetails);
    } catch (error) { /* ... error handling ... */ next(error); }
};

exports.confirmArixUnstake = async (req, res, next) => { // For ARIX principal from SC
    try {
        const { userWalletAddress, stakeId, unstakeTransactionBoc } = req.body;
        if (!userWalletAddress || !stakeId || !unstakeTransactionBoc) {
            return res.status(400).json({ message: "Missing required ARIX unstake confirmation information." });
        }
        const result = await earnService.finalizeArixUnstake({
            userWalletAddress, stakeId, unstakeTransactionBoc
        });
        res.status(200).json(result);
    } catch (error) { /* ... error handling ... */ next(error); }
};

exports.requestUsdtWithdrawal = async (req, res, next) => {
    try {
        const { userWalletAddress, amountUsdt } = req.body;
        if (!userWalletAddress || !amountUsdt || parseFloat(amountUsdt) <= 0) {
            return res.status(400).json({ message: "User wallet address and valid USDT amount are required."});
        }
        const withdrawalResult = await earnService.processUsdtWithdrawalRequest(userWalletAddress, parseFloat(amountUsdt));
        res.status(200).json(withdrawalResult);
    } catch (error) {
        console.error("CTRL: Error in requestUsdtWithdrawal:", error.message);
        if (error.message.includes("Minimum withdrawal") || error.message.includes("Insufficient claimable")) {
            return res.status(400).json({ message: error.message });
        }
        next(error);
    }
};

// Endpoint for admin/cron to trigger monthly USDT reward calculation
exports.triggerMonthlyUsdtRewardCalculation = async (req, res, next) => {
    // TODO: Secure this endpoint (e.g., IP whitelist, secret key)
    // For Vercel Cron, it might be a secret in the URL or header.
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
