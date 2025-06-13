const { gameService } = require('../services/gameService');
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

// --- Coinflip Handlers (Preserved) ---

exports.handleCoinflipBet = async (req, res, next) => {
    try {
        const { userWalletAddress, betAmountArix, choice } = req.body;

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

        const gameResult = await gameService.playCoinflip({
            userWalletAddress,
            betAmountArix: numericBetAmount,
            choice
        });
        res.status(200).json(gameResult);

    } catch (error) {
        if (error.message.includes("Insufficient") || error.message.includes("Bet amount exceeds limit") || error.message.includes("invalid balance state")) { 
            return res.status(400).json({ message: error.message });
        }
        console.error("CTRL: Error in handleCoinflipBet:", error.message, error.stack);
        next(error);
    }
};

exports.getCoinflipHistoryForUser = async (req, res, next) => {
  try {
    const { userWalletAddress } = req.params;
    if (!isValidTonAddress(userWalletAddress)) {
      return res.status(400).json({ message: "Invalid userWalletAddress format." });
    }
    const history = await gameService.getCoinflipHistory(userWalletAddress);
    res.status(200).json(history);
  } catch (error) {
    console.error("CTRL: Error in getCoinflipHistoryForUser:", error.message);
    next(error);
  }
};

// --- Crash Game Handlers (Production Ready) ---

exports.getCrashState = (req, res) => {
    const state = gameService.getCrashState();
    res.status(200).json(state);
};

exports.getCrashHistory = async (req, res, next) => {
    try {
        const history = await gameService.getCrashHistory();
        res.status(200).json(history);
    } catch (error) {
        console.error("CTRL: Error in getCrashHistory:", error.message);
        next(error);
    }
};

exports.placeCrashBet = async (req, res, next) => {
    try {
        const { userWalletAddress, betAmountArix } = req.body;
        if (!isValidTonAddress(userWalletAddress)) {
             return res.status(400).json({ message: "Invalid userWalletAddress." });
        }
        const numericBetAmount = parseFloat(betAmountArix);
        if (isNaN(numericBetAmount) || numericBetAmount <= 0) {
            return res.status(400).json({ message: "Invalid bet amount." });
        }

        const user = await userService.ensureUserExists(userWalletAddress);
        const result = await gameService.placeCrashBet({
            userId: user.id,
            betAmountArix: numericBetAmount
        });
        res.status(200).json(result);
    } catch (error) {
        res.status(400).json({ message: error.message });
    }
};

exports.cashOutCrashBet = async (req, res, next) => {
    try {
        const { userWalletAddress } = req.body;
        if (!isValidTonAddress(userWalletAddress)) {
             return res.status(400).json({ message: "Invalid userWalletAddress." });
        }
        
        const user = await userService.ensureUserExists(userWalletAddress);
        const result = await gameService.cashOutCrashBet({ userId: user.id });
        res.status(200).json(result);
    } catch (error) {
        res.status(400).json({ message: error.message });
    }
};
