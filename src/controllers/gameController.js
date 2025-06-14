// ar_backend/src/controllers/gameController.js

const gameService = require('../services/gameService');
const { Address } = require('@ton/core');
const pool = require('../config/database');  

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

        // Call the service, which now correctly handles its own DB transactions.
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

/**
 * Controller for fetching a user's personal Crash game history from the database.
 */
exports.getCrashHistoryForUser = async (req, res, next) => {
    try {
        const { walletAddress } = req.params;
        if (!isValidTonAddress(walletAddress)) {
            return res.status(400).json({ message: "Invalid wallet address." });
        }

        const query = `
            SELECT
                cb.id,
                cb.game_id,
                cb.bet_amount_arix,
                cb.status,
                cb.cash_out_multiplier,
                cb.payout_arix,
                cb.placed_at,
                cr.crash_multiplier
            FROM crash_bets cb
            JOIN crash_rounds cr ON cb.game_id = cr.id
            WHERE cb.user_wallet_address = $1
            ORDER BY cb.placed_at DESC
            LIMIT 50;
        `;
        const { rows } = await pool.query(query, [walletAddress]);
        res.status(200).json(rows);
    } catch (error) {
        console.error("CTRL: Error fetching crash history:", error);
        next(error);
    }
};