const db = require('../config/database');
const CrashGameEngine = require('./CrashGameEngine');

const ARIX_DECIMALS = 9;

class GameService {

    // --- Coinflip Methods (Preserved) ---
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

        const client = await db.getClient();
        try {
            await client.query('BEGIN');
            const userRes = await client.query(
                `INSERT INTO users (wallet_address, created_at, updated_at, claimable_arix_rewards)
                 VALUES ($1, NOW(), NOW(), 0)
                 ON CONFLICT (wallet_address)
                 DO UPDATE SET updated_at = NOW()
                 RETURNING claimable_arix_rewards, id;`,
                [userWalletAddress]
            );

            const currentBalance = parseFloat(userRes.rows[0].claimable_arix_rewards);
            if (currentBalance < betAmountArix && amountDelta < 0) {
                 throw new Error('Insufficient ARIX balance.');
            }
            const newClaimableArixFloat = currentBalance + amountDelta;


            await client.query(
                `UPDATE users SET claimable_arix_rewards = $1, updated_at = NOW() WHERE wallet_address = $2`,
                [newClaimableArixFloat, userWalletAddress]
            );

            await client.query(
                `INSERT INTO coinflip_history (user_id, bet_amount, choice, server_choice, outcome, payout_amount, balance_change)
                 VALUES ($1, $2, $3, $4, $5, $6, $7)`,
                [userRes.rows[0].id, betAmountArix * (10**ARIX_DECIMALS), choice, serverCoinSide, outcome, (outcome === 'win' ? betAmountArix * 2 : 0) * (10**ARIX_DECIMALS), amountDelta * (10**ARIX_DECIMALS)]
            );

            await client.query('COMMIT');
            return {
                outcome,
                serverCoinSide,
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
        const userRes = await db.query('SELECT id FROM users WHERE wallet_address = $1', [userWalletAddress]);
        if (userRes.rows.length === 0) return [];
        
        const { rows } = await db.query(
            "SELECT id, bet_amount, choice, server_choice, outcome, payout_amount, played_at FROM coinflip_history WHERE user_id = $1 ORDER BY played_at DESC LIMIT 50",
            [userRes.rows[0].id]
        );
        return rows.map(row => ({
            ...row,
            bet_amount: parseFloat(row.bet_amount) / (10**ARIX_DECIMALS),
            payout_amount: parseFloat(row.payout_amount) / (10**ARIX_DECIMALS)
        }));
    }

    // --- Crash Game Methods (Production Ready) ---

    getCrashState() {
        return CrashGameEngine.getPublicGameState();
    }

    async placeCrashBet({ userId, betAmountArix }) {
        return CrashGameEngine.placeBet(userId, betAmountArix);
    }

    async cashOutCrashBet({ userId }) {
        return CrashGameEngine.cashOut(userId);
    }
    
    async getCrashHistory(limit = 20) {
        return CrashGameEngine.gameState.history;
    }
}

module.exports = {
    gameService: new GameService()
};
