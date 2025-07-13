// ar_backend/src/services/gameService.js

// ### NOTE: Changed from `pool` to `getClient` for transaction safety ###
const { getClient, query } = require('../config/database');
const CrashGameEngine = require('./CrashGameEngine');
const userService = require('./userService');
const plinkoService = require('./plinkoService');
const { OXYBLE_DECIMALS } = require('../utils/constants');
const { Address } = require('@ton/core'); // Import Address for validation

class GameService {

    // --- Coinflip Methods (Your original logic, now using transactions) ---
    async playCoinflip({ userWalletAddress, betAmountOXYBLE, choice }) {
        const client = await getClient();
        try {
            await client.query('BEGIN');
            
            // This now uses the robust userService which handles user existence and balance checks.
            await userService.updateUserBalances(userWalletAddress, { OXYBLE: -betAmountOXYBLE }, 'game_bet_coinflip', { game: 'coinflip' }, client);

            const randomNumber = Math.random();
            const serverCoinSide = randomNumber < 0.5 ? 'heads' : 'tails';
            const outcome = (choice === serverCoinSide) ? 'win' : 'loss';
            const winnings = (outcome === 'win') ? betAmountOXYBLE * 2 : 0;
            const amountDelta = winnings - betAmountOXYBLE;

            if (outcome === 'win') {
                await userService.updateUserBalances(userWalletAddress, { OXYBLE: winnings }, 'game_win_coinflip', { game: 'coinflip' }, client);
            }

            const historyQuery = `
                INSERT INTO coinflip_history (user_wallet_address, bet_amount_OXYBLE, choice, server_coin_side, outcome, amount_delta_OXYBLE, played_at)
                 VALUES ($1, $2, $3, $4, $5, $6, NOW())`;
            await client.query(historyQuery, [userWalletAddress, betAmountOXYBLE, choice, serverCoinSide, amountDelta]);
            
            await client.query('COMMIT');
            
            const updatedProfile = await userService.fetchUserProfile(userWalletAddress);

            return {
                outcome,
                server_coin_side: serverCoinSide,
                amount_delta_OXYBLE: amountDelta,
                newClaimableOXYBLERewards: updatedProfile.claimable_OXYBLE_rewards, // Return the updated total
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
        const { rows } = await query(
            "SELECT * FROM coinflip_history WHERE user_wallet_address = $1 ORDER BY played_at DESC LIMIT 50",
            [userWalletAddress]
        );
        return rows;
    }

    // --- Crash Game Methods (Delegation preserved) ---
    getCrashState() { return CrashGameEngine.getGameState(); }
    async placeCrashBet(payload) { return CrashGameEngine.handlePlaceBet(payload); }
    async cashOutCrashBet(payload) { return CrashGameEngine.handleCashOut(payload); }

    // --- ### NEW, FULLY FUNCTIONAL PLINKO METHOD ### ---
    async playPlinko({ userWalletAddress, betAmount, risk, rows }) {
        const betAmountFloat = parseFloat(betAmount);
        if (isNaN(betAmountFloat) || betAmountFloat <= 0) {
            throw new Error('Invalid bet amount.');
        }

        const client = await getClient();
        try {
            await client.query('BEGIN');

            // 1. Deduct the bet amount from the user's internal game balance
            await userService.updateUserBalances(userWalletAddress, { OXYBLE: -betAmountFloat }, 'game_bet_plinko', { game: 'plinko', risk, rows }, client);

            // 2. Use your existing plinkoService to get a random outcome
            const { multiplier, path, bucketIndex } = plinkoService.runPlinko(rows, risk);
            const payout = betAmountFloat * multiplier;

            // 3. If there are winnings, add them to the user's balance
            if (payout > 0) {
                await userService.updateUserBalances(userWalletAddress, { OXYBLE: payout }, 'game_win_plinko', { game: 'plinko', multiplier }, client);
            }

            // 4. Log the game result to the 'plinko_games' table in the database
            const { rows: gameLogRows } = await client.query(
                `INSERT INTO plinko_games (user_wallet_address, bet_amount, risk, "rows", multiplier, payout, path, created_at)
                 VALUES ($1, $2, $3, $4, $5, $6, $7, NOW()) RETURNING *`,
                [userWalletAddress, betAmountFloat, risk, rows, multiplier, payout, JSON.stringify(path)]
            );
            
            await client.query('COMMIT');
            
            // 5. Fetch the user's latest profile (with updated balance) to send back
            const updatedUser = await userService.fetchUserProfile(userWalletAddress);
            
            return {
                ...gameLogRows[0],
                path: JSON.parse(gameLogRows[0].path), // Ensure path is an array
                bucketIndex, // Send bucketIndex back to the frontend
                user: updatedUser 
            };
        } catch (error) {
            await client.query('ROLLBACK');
            console.error('Plinko game transaction failed:', error);
            // Re-throw the error so the controller can send a proper response
            throw error;
        } finally {
            client.release();
        }
    }
}

module.exports = new GameService();