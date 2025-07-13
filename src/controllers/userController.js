/**
 * ar_backend/src/controllers/userController.js
 *
 * This file handles the request/response cycle for user-related endpoints.
 * REVISIONS:
 * - Added `handleOXYBLEWithdrawal` to process POST requests for withdrawals.
 * - It performs validation on the request body before calling the user service.
 * - Kept your existing `getUserProfile` and `isValidTonAddress` functions.
 */
const userService = require('../services/userService');
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

exports.getUserProfile = async (req, res, next) => {
    try {
        const { userWalletAddress } = req.params;
        const { telegram_id, username, referrer } = req.query;

        if (!isValidTonAddress(userWalletAddress)) {
            return res.status(400).json({ message: "Invalid userWalletAddress format." });
        }

        let profile = await userService.fetchUserProfile(userWalletAddress);

        if (profile && profile.is_new_user) {
            if (telegram_id || username || referrer) {
                profile = await userService.ensureUserExists(
                    userWalletAddress,
                    telegram_id ? parseInt(telegram_id) : null,
                    username,
                    referrer
                );
                profile = await userService.fetchUserProfile(userWalletAddress);
            }
        } else if (profile && (telegram_id || username)) {
            await userService.ensureUserExists(
                userWalletAddress,
                telegram_id ? parseInt(telegram_id) : null,
                username,
                null
            );
            profile = await userService.fetchUserProfile(userWalletAddress);
        }

        if (!profile) {
            console.warn(`CTRL: User profile still not found for ${userWalletAddress}.`);
            return res.status(404).json({ message: "User profile could not be retrieved or created." });
        }
        res.status(200).json(profile);
    } catch (error) {
        console.error("CTRL: Error in getUserProfile:", error.message, error.stack);
        next(error);
    }
};


/**
 * [NEW] Controller to handle OXYBLE withdrawal requests.
 */
exports.handleOXYBLEWithdrawal = async (req, res, next) => {
    const { userWalletAddress, amount, recipientAddress } = req.body;

    try {
        if (!userWalletAddress || !amount || !recipientAddress) {
            return res.status(400).json({ error: "User wallet address, amount, and recipient address are required." });
        }
        if (!isValidTonAddress(userWalletAddress) || !isValidTonAddress(recipientAddress)) {
            return res.status(400).json({ error: "Invalid TON address format provided." });
        }
        if (isNaN(parseFloat(amount)) || parseFloat(amount) <= 0) {
            return res.status(400).json({ error: "Invalid amount specified." });
        }

        const result = await userService.processOXYBLEWithdrawal(userWalletAddress, parseFloat(amount), recipientAddress);
        res.status(200).json(result);
    } catch (error) {
        console.error("CTRL: Error in handleOXYBLEWithdrawal:", error.message);
        next(error); // Pass to the global error handler
    }
};

/**
 * [NEW] Controller-like function to handle confirmed deposits from the listener.
 * This is not an endpoint, but a function to be called internally.
 */
exports.handleOXYBLEDeposit = async (depositData) => {
    const { userWalletAddress, amount, txHash } = depositData;
    try {
        console.log(`Processing deposit for wallet: ${userWalletAddress} with amount: ${amount}`);
        await userService.creditOXYBLEDeposit(userWalletAddress, amount, txHash);
        console.log(`Successfully credited deposit for wallet: ${userWalletAddress}`);
    } catch (error) {
        console.error(`Failed to process deposit for wallet ${userWalletAddress}:`, error);
    }
};
