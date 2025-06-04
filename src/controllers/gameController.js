
const gameService = require('../services/gameService'); 
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
        // gameResult now includes: userWalletAddress, betAmountArix, choice, serverCoinSide, outcome, amountDeltaArix, newClaimableArixRewards, gameId
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