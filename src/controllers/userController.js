// File: AR_Proj/ar_backend/src/controllers/userController.js
const userService = require('../services/userService');
const { Address } = require('@ton/core'); // For address validation

const isValidTonAddress = (addr) => {
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

        const profile = await userService.fetchUserProfile(userWalletAddress);
        if (!profile) {
            // Instead of 404, maybe create a basic user entry if not exists,
            // or let frontend handle the "new user" flow.
            // For now, return 404 if no data found.
            // A typical TMA flow might auto-create user on first interaction via wallet.
            // The createStake/recordTask already do an INSERT ... ON CONFLICT for users.
            return res.status(404).json({ message: "User profile not found or user does not exist yet." });
        }
        res.status(200).json(profile);
    } catch (error) {
        console.error("CTRL: Error in getUserProfile:", error.message);
        next(error);
    }
};

// Placeholder for updating profile - can be expanded later
// exports.updateUserProfile = async (req, res, next) => {
//     try {
//         const { userWalletAddress } = req.params;
//         const profileData = req.body; // e.g., { username, telegram_id }
//         if (!isValidTonAddress(userWalletAddress)) {
//             return res.status(400).json({ message: "Invalid userWalletAddress format." });
//         }
//         // Add validation for profileData
//         const updatedProfile = await userService.updateUserProfile(userWalletAddress, profileData);
//         res.status(200).json(updatedProfile);
//     } catch (error) {
//         console.error("CTRL: Error in updateUserProfile:", error.message);
//         next(error);
//     }
// };