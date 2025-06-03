// File: AR_Proj/ar_backend/src/services/gameService.js
const db = require('../config/database');
const ARIX_DECIMALS = 9; 

class GameService {
    async playCoinflip({ userWalletAddress, betAmountArix, choice }) {
        const randomNumber = Math.random();
        const serverCoinSide = randomNumber < 0.5 ? 'heads' : 'tails'; 

        let outcome;
        let amountDelta; // This is the change to the user's claimable_arix_rewards

        if (choice === serverCoinSide) {
            outcome = 'win';
            // User wins the bet amount (their stake effectively doubles, so net gain is betAmountArix)
            amountDelta = betAmountArix; 
        } else {
            outcome = 'loss';
            // User loses their bet amount
            amountDelta = -betAmountArix; 
        }

        const client = await db.getClient();
        try {
            await client.query('BEGIN');

            // Ensure user exists and get current claimable_arix_rewards
            // The INSERT...ON CONFLICT...DO UPDATE ensures the user exists and updated_at is touched.
            const userRes = await client.query(
                `INSERT INTO users (wallet_address, created_at, updated_at, claimable_arix_rewards) 
                 VALUES ($1, NOW(), NOW(), 0) 
                 ON CONFLICT (wallet_address) 
                 DO UPDATE SET updated_at = NOW()
                 RETURNING claimable_arix_rewards;`, 
                [userWalletAddress]
            );
            
            // let currentClaimableArix = parseFloat(userRes.rows[0].claimable_arix_rewards);
            // For MVP, frontend does primary balance check for betting.
            // Backend just applies the delta. If claimable_arix_rewards goes negative, it's an "off-chain debt".
            // A stricter version could check: if (currentClaimableArix + amountDelta < 0 && amountDelta < 0) {
            //    throw new Error("Loss would result in excessive negative claimable ARIX balance.");
            // }
            
            const newClaimableArixFloat = parseFloat(userRes.rows[0].claimable_arix_rewards) + amountDelta;

            await client.query(
                `UPDATE users SET claimable_arix_rewards = $1, updated_at = NOW() WHERE wallet_address = $2`,
                [newClaimableArixFloat, userWalletAddress]
            );

            const gameRecord = await client.query(
                `INSERT INTO coinflip_history (user_wallet_address, bet_amount_arix, choice, server_coin_side, outcome, amount_delta_arix, played_at)
                 VALUES ($1, $2, $3, $4, $5, $6, NOW()) RETURNING game_id`,
                [userWalletAddress, betAmountArix, choice, serverCoinSide, outcome, amountDelta]
            );
            
            await client.query('COMMIT');
            console.log(`Coinflip game for ${userWalletAddress}: Bet ${betAmountArix}, Outcome ${outcome}, Delta ${amountDelta}. New Claimable ARIX: ${newClaimableArixFloat.toFixed(ARIX_DECIMALS)}`);

            return {
                userWalletAddress,
                betAmountArix,
                choice,
                serverCoinSide,
                outcome,
                amountDeltaArix: amountDelta, // Keep this name for frontend consistency
                newClaimableArixRewards: newClaimableArixFloat.toFixed(ARIX_DECIMALS),
                gameId: gameRecord.rows[0].game_id
            };

        } catch (error) {
            await client.query('ROLLBACK');
            console.error("GameService.playCoinflip error:", error.message, error.stack);
            // Check if the error is related to a specific constraint or DB issue
            if (error.code === '23514' || error.message.includes("check constraint")) { // Example for check constraint
                 throw new Error("Bet resulted in an invalid balance state. Please check your funds.");
            }
            throw error;
        } finally {
            client.release();
        }
    }

    async getCoinflipHistory(userWalletAddress) {
        const { rows } = await db.query(
            "SELECT game_id, user_wallet_address, bet_amount_arix, choice, server_coin_side, outcome, amount_delta_arix, played_at FROM coinflip_history WHERE user_wallet_address = $1 ORDER BY played_at DESC LIMIT 50",
            [userWalletAddress]
        );
        return rows.map(row => ({
            ...row,
            bet_amount_arix: parseFloat(row.bet_amount_arix),
            amount_delta_arix: parseFloat(row.amount_delta_arix)
        }));
    }
}

module.exports = new GameService();