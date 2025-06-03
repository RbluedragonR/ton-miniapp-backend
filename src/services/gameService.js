// File: AR_Proj/ar_backend/src/services/gameService.js
const db = require('../config/database');
const ARIX_DECIMALS = 9; // Ensure consistency or fetch from a central config if it varies

class GameService {
    /**
     * Plays a game of Coinflip.
     * @param {object} betData
     * @param {string} betData.userWalletAddress
     * @param {number} betData.betAmountArix
     * @param {string} betData.choice - 'heads' or 'tails'
     * @returns {Promise<object>} Game result
     */
    async playCoinflip({ userWalletAddress, betAmountArix, choice }) {
        const randomNumber = Math.random();
        const serverCoinSide = randomNumber < 0.5 ? 'heads' : 'tails'; 

        let outcome;
        let amountDelta; 

        if (choice === serverCoinSide) {
            outcome = 'win';
            amountDelta = betAmountArix; 
        } else {
            outcome = 'loss';
            amountDelta = -betAmountArix; 
        }

        // For MVP: Record game. Actual ARIX balance management needs a robust system.
        // Consider if users table needs an `arix_game_balance` or similar.
        // For now, we assume the frontend checked a general ARIX balance.
        // If an error for insufficient balance is thrown, it should come from a balance check BEFORE this.

        const client = await db.getClient();
        try {
            await client.query('BEGIN');

            // Ensure user exists (or create them if game is first interaction)
            // This also updates `updated_at` timestamp for existing users.
            await client.query(
                `INSERT INTO users (wallet_address, created_at, updated_at) 
                 VALUES ($1, NOW(), NOW()) 
                 ON CONFLICT (wallet_address) DO UPDATE SET updated_at = NOW()`, 
                [userWalletAddress]
            );

            const gameRecord = await client.query(
                `INSERT INTO coinflip_history (user_wallet_address, bet_amount_arix, choice, server_coin_side, outcome, amount_delta_arix, played_at)
                 VALUES ($1, $2, $3, $4, $5, $6, NOW()) RETURNING *`,
                [userWalletAddress, betAmountArix, choice, serverCoinSide, outcome, amountDelta]
            );
            
            // TODO: Implement ARIX balance deduction/crediting here if managing game balances on backend.
            // For MVP, this might be deferred or handled by a separate treasury/payout mechanism.
            // Example: if (outcome === 'win') { await creditUserArix(userWalletAddress, betAmountArix * 2); } 
            // else { /* ARIX already considered "spent" by frontend if pre-deducted */ }

            await client.query('COMMIT');
            console.log(`Coinflip game recorded for ${userWalletAddress}: Bet ${betAmountArix} on ${choice}, Server: ${serverCoinSide}, Outcome: ${outcome}, Delta: ${amountDelta}, GameID: ${gameRecord.rows[0].game_id}`);

            return {
                userWalletAddress,
                betAmountArix,
                choice,
                serverCoinSide,
                outcome,
                amountDelta, // This is the change (+/- profit/loss relative to stake)
                gameId: gameRecord.rows[0].game_id
                // newBalance: newBalance, // Include if managing balance directly here
            };

        } catch (error) {
            await client.query('ROLLBACK');
            console.error("GameService.playCoinflip error:", error.message, error.stack);
            throw error; // Re-throw to be caught by controller
        } finally {
            client.release();
        }
    }

    /**
     * Fetches Coinflip game history for a user.
     * @param {string} userWalletAddress
     * @returns {Promise<Array>} List of game history records.
     */
    async getCoinflipHistory(userWalletAddress) {
        const { rows } = await db.query(
            "SELECT game_id, user_wallet_address, bet_amount_arix, choice, server_coin_side, outcome, amount_delta_arix, played_at FROM coinflip_history WHERE user_wallet_address = $1 ORDER BY played_at DESC LIMIT 50",
            [userWalletAddress]
        );
        return rows.map(row => ({
            ...row,
            bet_amount_arix: parseFloat(row.bet_amount_arix), // Ensure numeric types are numbers
            amount_delta_arix: parseFloat(row.amount_delta_arix)
        }));
    }
}

module.exports = new GameService();