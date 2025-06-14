// ar_backend/src/services/gameService.js

const pool = require('../config/database'); 
const CrashGameEngine = require('./CrashGameEngine');
const { ARIX_DECIMALS } = require('../utils/tonUtils');

class GameService {

    // --- Coinflip Methods (Your original logic, correctly placed) ---
    async playCoinflip({ userWalletAddress, betAmountArix, choice }) {
        const randomNumber = Math.random();
        const serverCoinSide = randomNumber < 0.5 ? 'heads' : 'tails';
        const outcome = (choice === serverCoinSide) ? 'win' : 'loss';
        const amountDelta = (outcome === 'win') ? parseFloat(betAmountArix) : -parseFloat(betAmountArix);
        
        const client = await pool.getClient();
        try {
            await client.query('BEGIN');
            
            // First ensure user exists and has a record. ON CONFLICT handles this.
            const userCheck = await client.query('SELECT id, claimable_arix_rewards FROM users WHERE wallet_address = $1', [userWalletAddress]);
            
            if (userCheck.rows.length === 0) {
                 // You might want to handle user creation more robustly here or assume they must exist
                 throw new Error("User not found. Please visit the main app page first.");
            }
            
            const userData = userCheck.rows[0];
            const currentBalance = parseFloat(userData.claimable_arix_rewards);

            if (amountDelta < 0 && currentBalance < betAmountArix) {
                 throw new Error('Insufficient ARIX balance.');
            }

            const newClaimableArixFloat = currentBalance + amountDelta;
            await client.query(
                `UPDATE users SET claimable_arix_rewards = $1, updated_at = NOW() WHERE wallet_address = $2`,
                [newClaimableArixFloat, userWalletAddress]
            );

            // Corrected your coinflip_history insert to use the right columns as per your other files
            await client.query(
                `INSERT INTO coinflip_history (user_wallet_address, bet_amount_arix, choice, server_coin_side, outcome, amount_delta_arix)
                 VALUES ($1, $2, $3, $4, $5, $6)`,
                [userWalletAddress, betAmountArix, choice, serverCoinSide, outcome, amountDelta]
            );

            await client.query('COMMIT');
            return {
                outcome,
                server_coin_side: serverCoinSide,
                amount_delta_arix: amountDelta,
                newClaimableArixRewards: newClaimableArixFloat,
            };
        } catch (error) {
            await client.query('ROLLBACK');
            console.error("GameService.playCoinflip error:", error);
            throw error;
        } finally {
            client.release();
        }
    }

    async getCoinflipHistory(userWalletAddress) {
        const { rows } = await pool.query(
            "SELECT * FROM coinflip_history WHERE user_wallet_address = $1 ORDER BY played_at DESC LIMIT 50",
            [userWalletAddress]
        );
        return rows;
    }

    // --- Crash Game Methods (Now part of the service) ---

    // These methods now simply delegate to the singleton Engine instance.
    // This maintains your architecture of calling services from controllers.
    getCrashState() {
        return CrashGameEngine.getGameState();
    }

    async placeCrashBet(payload) {
        return CrashGameEngine.handlePlaceBet(payload);
    }

    async cashOutCrashBet(payload) {
        return CrashGameEngine.handleCashOut(payload);
    }
}

// Export a single instance of the service
module.exports = new GameService();