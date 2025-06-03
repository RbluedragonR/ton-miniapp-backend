// File: ar_backend/src/controllers/referralController.js
const referralService = require('../services/referralService');
const { Address } = require('@ton/core');

const isValidTonAddress = (addr) => {
    if (!addr) return false;
    try {
        Address.parse(addr);
        return true;
    } catch (e) {
        return false;
    }
};

exports.getUserReferralData = async (req, res, next) => {
    try {
        const { userWalletAddress } = req.params;
        if (!isValidTonAddress(userWalletAddress)) {
            return res.status(400).json({ message: "Invalid userWalletAddress format." });
        }
        const referralData = await referralService.getReferralData(userWalletAddress);
        res.status(200).json(referralData);
    } catch (error) {
        console.error("CTRL: Error in getUserReferralData:", error.message);
        if (error.message.includes("User not found")) {
            return res.status(404).json({ message: error.message });
        }
        next(error);
    }
};

exports.getReferralProgramDetails = async (req, res, next) => {
    try {
        const planExplanations = await referralService.getReferralPlanExplanations();
        res.status(200).json({
            message: "Referral rewards are based on the staking plan chosen by the referred user. Rewards are credited in USDT.",
            plans: planExplanations
        });
    } catch (error) {
        console.error("CTRL: Error in getReferralProgramDetails:", error.message);
        next(error);
    }
};