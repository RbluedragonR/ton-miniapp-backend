// ar_backend/src/services/gameService.js
const pool = require('../config/database');
const CrashGameEngine = require('./CrashGameEngine');
const userService = require('./userService');
const plinkoService = require('./plinkoService');
const { ARIX_DECIMALS } = require('../utils/constants');

class GameService {

    // --- Coinflip Methods (Your original logic, preserved) ---
    async playCoinflip({ userWalletAddress, betAmountArix, choice }) {
        const randomNumber = Math.random();
        const serverCoinSide = randomNumber < 0.5 ? 'heads' : 'tails';
        const outcome = (choice === serverCoinSide) ? 'win' : 'loss';
        // Note: Your original logic used a single amount for win/loss. A 2x payout would mean `amountDelta = betAmountArix`.
        // I'm keeping your original logic which seems to be 1x reward or 1x loss.
        const amountDelta = (outcome === 'win') ? parseFloat(betAmountArix) : -parseFloat(betAmountArix);
        
        const client = await pool.getClient();
        try {
            await client.query('BEGIN');
            
            const userCheck = await client.query('SELECT claimable_arix_rewards FROM users WHERE wallet_address = $1 FOR UPDATE', [userWalletAddress]);
            
            if (userCheck.rows.length === 0) {
                 await client.query('ROLLBACK');
                 throw new Error("User not found. Please visit the main app page first.");
            }
            
            const userData = userCheck.rows[0];
            const currentBalance = parseFloat(userData.claimable_arix_rewards);

            if (amountDelta < 0 && currentBalance < betAmountArix) {
                 await client.query('ROLLBACK');
                 throw new Error('Insufficient ARIX balance.');
            }

            const newClaimableArixFloat = currentBalance + amountDelta;
            await client.query(
                `UPDATE users SET claimable_arix_rewards = $1, updated_at = NOW() WHERE wallet_address = $2`,
                [newClaimableArixFloat, userWalletAddress]
            );

            await client.query(
                `INSERT INTO coinflip_history (user_wallet_address, bet_amount_arix, choice, server_coin_side, outcome, amount_delta_arix, played_at)
                 VALUES ($1, $2, $3, $4, $5, $6, NOW())`,
                [userWalletAddress, betAmountArix, choice, serverCoinSide, outcome, amountDelta]
            );

            await client.query('COMMIT');
            return {
                outcome,
                server_coin_side: serverCoinSide,
                amount_delta_arix: amountDelta,
                newClaimableArixRewards: newClaimableArixFloat.toFixed(ARIX_DECIMALS),
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

    // --- Crash Game Methods (Delegation preserved) ---
    getCrashState() {
        return CrashGameEngine.getGameState();
    }

    async placeCrashBet(payload) {
        // Assuming CrashGameEngine is designed to handle its own DB logic
        return CrashGameEngine.handlePlaceBet(payload);
    }

    async cashOutCrashBet(payload) {
        return CrashGameEngine.handleCashOut(payload);
    }

    // --- NEW PLINKO GAME METHOD ---
    async playPlinko({ userWalletAddress, betAmount, risk, rows }) {
        const betAmountFloat = parseFloat(betAmount);
        if (isNaN(betAmountFloat) || betAmountFloat <= 0) {
            throw new Error('Invalid bet amount.');
        }

        const client = await pool.getClient();
        try {
            await client.query('BEGIN');
            
            // 1. Run the Plinko simulation to get the result first
            const { multiplier, path, bucketIndex } = plinkoService.runPlinko(rows, risk);
            const payout = betAmountFloat * multiplier;
            const netChange = payout - betAmountFloat;

            // 2. Update user's internal ARIX `balance` with the net result of the game.
            await userService.updateUserBalances(userWalletAddress, { ARIX: netChange }, 'game_plinko', { bet: betAmountFloat, multiplier, payout, risk, rows }, client);

            // 3. Log the game result to the new `plinko_games` table
            const { rows: gameLogRows } = await client.query(
                `INSERT INTO plinko_games (user_wallet_address, bet_amount, risk, "rows", multiplier, payout, path, created_at)
                 VALUES ($1, $2, $3, $4, $5, $6, $7, NOW()) RETURNING *`,
                [userWalletAddress, betAmountFloat, risk, rows, multiplier, payout, JSON.stringify(path)]
            );
            
            await client.query('COMMIT');
            
            const updatedUser = await userService.fetchUserProfile(userWalletAddress);
            
            return {
                ...gameLogRows[0],
                path: JSON.parse(gameLogRows[0].path),
                bucketIndex,
                user: updatedUser 
            };
        } catch (error) {
            await client.query('ROLLBACK');
            console.error('Plinko game transaction failed:', error);
            throw error;
        } finally {
            client.release();
        }
    }
}

module.exports = new GameService();
