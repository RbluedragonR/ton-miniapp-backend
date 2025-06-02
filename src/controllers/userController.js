// File: AR_Proj/ar_backend/src/controllers/userController.js
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
        if (!isValidTonAddress(userWalletAddress)) {
            return res.status(400).json({ message: "Invalid userWalletAddress format." });
        }

        let profile = await userService.fetchUserProfile(userWalletAddress);
        
        if (!profile) {
            // If profile not found, it might be a brand new user interacting.
            // For an MVP, simply returning 404 is okay if other flows don't create users.
            // However, many flows (like first stake, first task) already do an "INSERT ON CONFLICT"
            // So, if fetchUserProfile returns null here, it's a genuine "not found" post-initial interactions.
            console.log(`CTRL: User profile not found for ${userWalletAddress}. This might be okay if they haven't interacted with services that create users yet.`);
            // To ensure a user record always exists if they hit this endpoint with a valid wallet:
            // profile = await userService.ensureUserExists(userWalletAddress);
            // For now, stick to returning 404 if other services haven't created them.
             return res.status(404).json({ message: "User profile not found. The user may need to complete an initial action like staking or a task." });
        }
        res.status(200).json(profile);
    } catch (error) {
        console.error("CTRL: Error in getUserProfile:", error.message, error.stack);
        next(error);
    }
};