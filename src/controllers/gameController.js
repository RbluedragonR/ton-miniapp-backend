// File: AR_Proj/ar_backend/src/controllers/gameController.js
const gameService = require('../services/gameService'); 
// const { ARIX_TOKEN_MASTER_ADDRESS } = require('../config/envConfig'); // Not directly used in this controller, but good to keep if other game logic might need it
const { Address } = require('@ton/core'); // For address validation

// Helper to validate TON address string
const isValidTonAddress = (addr) => {
    try {
        Address.parse(addr); // Use Address from @ton/core
        return true;
    } catch (e) {
        return false;
    }
};

exports.handleCoinflipBet = async (req, res, next) => {
    try {
        const { userWalletAddress, betAmountArix, choice } = req.body;

        // Basic Validations
        if (!userWalletAddress || !betAmountArix || !choice) {
            return res.status(400).json({ message: "Missing required bet information (userWalletAddress, betAmountArix, choice)." });
        }
        if (!isValidTonAddress(userWalletAddress)) {
             return res.status(400).json({ message: "Invalid userWalletAddress format." });
        }
        const numericBetAmount = parseFloat(betAmountArix);
        if (isNaN(numericBetAmount) || numericBetAmount <= 0) {
            return res.status(400).json({ message: "Invalid ARIX bet amount. Must be greater than 0."});
        }
        if (choice !== 'heads' && choice !== 'tails') {
            return res.status(400).json({ message: "Invalid choice. Must be 'heads' or 'tails'." });
        }

        // Note: Robust balance checks (on-chain or reliable off-chain ledger) would typically happen here or in the service.
        // The current gameService.playCoinflip primarily records the game and outcome.
        // Actual ARIX deduction/crediting for games needs a separate, secure mechanism.

        const gameResult = await gameService.playCoinflip({
            userWalletAddress,
            betAmountArix: numericBetAmount,
            choice
        });

        res.status(200).json(gameResult);

    } catch (error) {
        // Handle custom errors from the service layer if defined (e.g., insufficient balance)
        if (error.message.includes("Insufficient balance for bet") || error.message.includes("Bet amount exceeds limit")) { 
            return res.status(400).json({ message: error.message });
        }
        console.error("CTRL: Error in handleCoinflipBet:", error.message, error.stack);
        next(error); // Pass to general error handler
    }
};

exports.getCoinflipHistoryForUser = async (req, res, next) => {
  try {
    const { userWalletAddress } = req.params;
    if (!isValidTonAddress(userWalletAddress)) {
      return res.status(400).json({ message: "Invalid userWalletAddress format." });
    }
    const history = await gameService.getCoinflipHistory(userWalletAddress);
    res.status(200).json(history); // history will be an array of game records
  } catch (error) {
    console.error("CTRL: Error in getCoinflipHistoryForUser:", error.message);
    next(error);
  }
};