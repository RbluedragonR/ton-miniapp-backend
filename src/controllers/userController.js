
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
        const { telegram_id, username, referrer } = req.query; // referrer can be code or address from launch params

        if (!isValidTonAddress(userWalletAddress)) {
            return res.status(400).json({ message: "Invalid userWalletAddress format." });
        }

        let profile = await userService.fetchUserProfile(userWalletAddress);

        if (profile && profile.is_new_user) {
            // If profile was just created by fetchUserProfile, try to update with launch params if available
            if (telegram_id || username || referrer) {
                profile = await userService.ensureUserExists(
                    userWalletAddress,
                    telegram_id ? parseInt(telegram_id) : null,
                    username,
                    referrer
                );
                // Re-fetch to get potentially updated referrer info
                profile = await userService.fetchUserProfile(userWalletAddress);
            }
        } else if (profile && (telegram_id || username)) {
            // User exists, but maybe we have new TG ID or username from launch params to update if null in DB
            await userService.ensureUserExists(
                userWalletAddress,
                telegram_id ? parseInt(telegram_id) : null,
                username,
                null // Don't overwrite existing referrer here, only on first creation
            );
            // Re-fetch to get potentially updated info
            profile = await userService.fetchUserProfile(userWalletAddress);
        }


        if (!profile) {
            // This case should ideally not be hit if fetchUserProfile creates the user.
            // But as a fallback:
            console.warn(`CTRL: User profile still not found for ${userWalletAddress} after ensureUserExists attempt. This is unexpected.`);
            return res.status(404).json({ message: "User profile could not be retrieved or created." });
        }
        res.status(200).json(profile);
    } catch (error) {
        console.error("CTRL: Error in getUserProfile:", error.message, error.stack);
        next(error);
    }
};

// This controller is primarily for fetching. User creation/update is handled by ensureUserExists,
// which can be called by other controllers (e.g., when a user makes their first stake or completes a task).
// Or, as done above, ensure on profile fetch.