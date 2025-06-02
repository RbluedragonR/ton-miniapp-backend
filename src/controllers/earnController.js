const earnService = require('../services/earnService');
const priceService = require('../services/priceService');
const { ARIX_TOKEN_MASTER_ADDRESS, STAKING_CONTRACT_ADDRESS } = require('../config/envConfig');

exports.getStakingConfig = async (req, res, next) => {
    try {
        const plans = await earnService.getActiveStakingPlans();
        const currentArxPrice = await priceService.getArxUsdtPrice();

        const config = {
            stakingContractAddress: STAKING_CONTRACT_ADDRESS,
            arxToken: {
                masterAddress: ARIX_TOKEN_MASTER_ADDRESS,
                decimals: 9,
            },
            stakingPlans: plans.map(p => ({
                key: p.plan_key,
                id: p.plan_id,
                title: p.title,
                duration: p.duration_days,
                apr: parseFloat(p.fixed_apr_percent), // Use fixed_apr_percent and name it 'apr'
                earlyUnstakePenaltyPercent: parseFloat(p.early_unstake_penalty_percent),
                minStakeArix: parseFloat(p.min_stake_arix)
            })),
            currentArxUsdtPrice: currentArxPrice 
        };
        res.status(200).json(config);
    } catch (error) {
        next(error);
    }
};

exports.getCurrentArxPrice = async (req, res, next) => {
    try {
        const price = await priceService.getArxUsdtPrice();
        if (price !== null) {
            res.status(200).json({ price });
        } else {
            res.status(503).json({ message: "Could not fetch ARIX/USDT price at the moment." });
        }
    } catch (error) {
        next(error);
    }
};

exports.recordUserStake = async (req, res, next) => {
    try {
        const { planKey, arixAmount, userWalletAddress, transactionBoc, referenceUsdtValue } = req.body;
        if (!planKey || !arixAmount || !userWalletAddress || !transactionBoc) {
            return res.status(400).json({ message: "Missing required stake information." });
        }
        
        const numericArixAmount = parseFloat(arixAmount);
        if (isNaN(numericArixAmount) || numericArixAmount <= 0) {
            return res.status(400).json({ message: "Invalid ARIX amount."});
        }
        const numericReferenceUsdtValue = referenceUsdtValue ? parseFloat(referenceUsdtValue) : null;

        // TODO: Backend verification of transactionBoc against TON blockchain for the ARIX transfer.

        const newStake = await earnService.createStake({
            planKey,
            arixAmount: numericArixAmount,
            userWalletAddress,
            transactionBoc,
            referenceUsdtValue: numericReferenceUsdtValue,
        });

        res.status(201).json({ message: "Stake recorded successfully. Awaiting on-chain confirmation processing.", stake: newStake });
    } catch (error) {
        console.error("CTRL: Error recording stake:", error);
        next(error);
    }
};

exports.getUserStakes = async (req, res, next) => {
    try {
        const { userWalletAddress } = req.params;
        const currentArxPrice = await priceService.getArxUsdtPrice();
        const stakes = await earnService.findActiveStakesByUserWithDetails(userWalletAddress, currentArxPrice);
        res.status(200).json(stakes);
    } catch (error) {
        next(error);
    }
};

exports.initiateUnstake = async (req, res, next) => {
    try {
        const { userWalletAddress, stakeId } = req.body;
        if (!userWalletAddress || !stakeId) {
            return res.status(400).json({ message: "User wallet address and stake ID are required." });
        }
        const result = await earnService.prepareUnstake(userWalletAddress, stakeId);
        res.status(200).json(result);
    } catch (error) {
        next(error);
    }
};

exports.confirmUnstakeAndProcessRewards = async (req, res, next) => {
    try {
        const { userWalletAddress, stakeId, unstakeTransactionBoc } = req.body;
        if (!userWalletAddress || !stakeId || !unstakeTransactionBoc) {
            return res.status(400).json({ message: "Missing required unstake confirmation information." });
        }

        // TODO: Backend verification of unstakeTransactionBoc.

        const result = await earnService.finalizeUnstakeAndPayArixRewards(userWalletAddress, stakeId, unstakeTransactionBoc);
        res.status(200).json(result);
    } catch (error) {
        next(error);
    }
};
