const db = require('../config/database');
const crypto = require('crypto');

const ARIX_DECIMALS = 9;

/**
 * A local helper to update a user's ARIX balance within a transaction.
 * This is created to avoid duplicating the balance update logic in placeBet and cashOut,
 * while keeping the logic inside this service file as requested.
 * @param {object} client - The active database client from a transaction.
 * @param {number} userId - The user's ID.
 * @param {number} amountDelta - The amount to add (positive) or subtract (negative).
 * @returns {Promise<{newBalance: number}>}
 */
const updateUserBalanceInGame = async (client, userId, amountDelta) => {
    const userRes = await client.query(
        'SELECT claimable_arix_rewards FROM users WHERE id = $1 FOR UPDATE',
        [userId]
    );

    if (userRes.rows.length === 0) {
        throw new Error(`User with ID ${userId} not found.`);
    }

    const currentBalance = parseFloat(userRes.rows[0].claimable_arix_rewards);

    // Basic check to prevent going into deep negative balance on a loss.
    if (currentBalance + amountDelta < 0 && amountDelta < 0) {
        throw new Error('Insufficient balance to place this bet.');
    }

    const newBalance = currentBalance + amountDelta;

    await client.query(
        'UPDATE users SET claimable_arix_rewards = $1, updated_at = NOW() WHERE id = $2',
        [newBalance, userId]
    );

    return { newBalance };
};


// ========================================================================
// CRASH GAME ENGINE (Self-contained within this service file)
// ========================================================================

const crashGameState = {
    status: 'waiting', // 'waiting' -> 'running' -> 'crashed'
    roundId: null,
    crashMultiplier: 0,
    currentMultiplier: 1.00,
    startTime: null,
    gameLoop: null,
    players: new Map(), // Stores { userId: { betAmountArix, status: 'placed' } }
};

const TICK_RATE = 100; // ms per tick
const WAITING_TIME = 8000; // 8 seconds for betting

const getMultiplierForTime = (seconds) => {
    const multiplier = Math.pow(1.015, seconds * 2);
    return Math.max(1, multiplier);
};

const generateCrashPoint = () => {
    const e = 2 ** 32;
    const h = crypto.randomBytes(4).readUInt32LE(0);
    const crashPoint = Math.floor(100 * e - h) / (100 * (e - h));
    return Math.max(1.00, parseFloat(crashPoint.toFixed(2)));
};

const runGameCycle = async () => {
    try {
        console.log(`[Crash] Starting new round... Waiting for ${WAITING_TIME / 1000}s.`);
        crashGameState.status = 'waiting';
        crashGameState.currentMultiplier = 1.00;
        crashGameState.players.clear();

        const crashPoint = generateCrashPoint();
        crashGameState.crashMultiplier = crashPoint;

        const { rows } = await db.query(
            'INSERT INTO crash_rounds (crash_multiplier, status) VALUES ($1, $2) RETURNING id',
            [crashPoint, 'waiting']
        );
        crashGameState.roundId = rows[0].id;
        console.log(`[Crash] Round ${crashGameState.roundId} created. Will crash at ${crashPoint}x`);

        await new Promise(resolve => setTimeout(resolve, WAITING_TIME));

        console.log(`[Crash] Round ${crashGameState.roundId} running!`);
        crashGameState.status = 'running';
        crashGameState.startTime = Date.now();
        await db.query('UPDATE crash_rounds SET status = $1 WHERE id = $2', ['running', crashGameState.roundId]);

        crashGameState.gameLoop = setInterval(async () => {
            const elapsed = (Date.now() - crashGameState.startTime) / 1000;
            crashGameState.currentMultiplier = getMultiplierForTime(elapsed);

            if (crashGameState.currentMultiplier >= crashGameState.crashMultiplier) {
                clearInterval(crashGameState.gameLoop);
                crashGameState.status = 'crashed';
                console.log(`[Crash] Round ${crashGameState.roundId} CRASHED at ${crashGameState.crashMultiplier}x!`);

                await db.query('UPDATE crash_rounds SET status = $1 WHERE id = $2', ['crashed', crashGameState.roundId]);

                for (const [userId, player] of crashGameState.players.entries()) {
                    if (player.status === 'placed') {
                        player.status = 'lost';
                        await db.query(
                            'UPDATE crash_bets SET status = $1 WHERE user_id = $2 AND round_id = $3',
                            ['lost', userId, crashGameState.roundId]
                        );
                        console.log(`[Crash] User ${userId} lost their bet of ${player.betAmountArix}.`);
                    }
                }
                setTimeout(runGameCycle, 5000);
            }
        }, TICK_RATE);
    } catch (error) {
        console.error('[Crash] A critical error occurred in the game cycle:', error);
        setTimeout(runGameCycle, 15000);
    }
};

// ========================================================================
// GAME SERVICE CLASS
// ========================================================================

class GameService {
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

            const newClaimableArixFloat = parseFloat(userRes.rows[0].claimable_arix_rewards) + amountDelta;

            await client.query(
                `UPDATE users SET claimable_arix_rewards = $1, updated_at = NOW() WHERE wallet_address = $2`,
                [newClaimableArixFloat, userWalletAddress]
            );

            await client.query(
                `INSERT INTO coinflip_history (user_wallet_address, bet_amount_arix, choice, server_coin_side, outcome, amount_delta_arix, played_at)
                 VALUES ($1, $2, $3, $4, $5, $6, NOW()) RETURNING game_id`,
                [userWalletAddress, betAmountArix, choice, serverCoinSide, outcome, amountDelta]
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
    // --- Crash Game Methods ---

    getCrashState() {
        return {
            status: crashGameState.status,
            multiplier: crashGameState.currentMultiplier.toFixed(2),
            roundId: crashGameState.roundId,
            crashPoint: crashGameState.status === 'crashed' ? crashGameState.crashMultiplier.toFixed(2) : null,
        };
    }

    async placeCrashBet({ userId, betAmountArix }) {
        if (crashGameState.status !== 'waiting') {
            throw new Error('Betting is currently closed.');
        }
        if (crashGameState.players.has(userId)) {
            throw new Error('You have already placed a bet in this round.');
        }

        const client = await db.getClient();
        try {
            await client.query('BEGIN');

            const balanceChange = -Math.abs(betAmountArix);
            const { newBalance } = await updateUserBalanceInGame(client, userId, balanceChange);

            await client.query(
                'INSERT INTO crash_bets (user_id, round_id, bet_amount, status) VALUES ($1, $2, $3, $4)',
                [userId, crashGameState.roundId, betAmountArix, 'placed']
            );

            crashGameState.players.set(userId, { betAmountArix, status: 'placed' });

            await client.query('COMMIT');
            console.log(`[Crash] User ${userId} placed a bet of ${betAmountArix}. New balance: ${newBalance}`);
            return { success: true, newBalance };
        } catch (error) {
            await client.query('ROLLBACK');
            console.error('[Crash] Error placing bet:', error.message);
            throw error;
        } finally {
            client.release();
        }
    }

    async cashOutCrashBet({ userId }) {
        if (crashGameState.status !== 'running') {
            throw new Error('Cannot cash out, game is not running.');
        }
        const player = crashGameState.players.get(userId);
        if (!player || player.status !== 'placed') {
            throw new Error('No active bet to cash out.');
        }

        const cashOutMultiplier = parseFloat(crashGameState.currentMultiplier.toFixed(2));
        const payout = player.betAmountArix * cashOutMultiplier;

        const client = await db.getClient();
        try {
            await client.query('BEGIN');

            await client.query(
                'UPDATE crash_bets SET status = $1, cash_out_multiplier = $2, payout = $3 WHERE user_id = $4 AND round_id = $5',
                ['cashed_out', cashOutMultiplier, payout.toFixed(4), userId, crashGameState.roundId]
            );

            player.status = 'cashed_out';

            const { newBalance } = await updateUserBalanceInGame(client, userId, payout);

            await client.query('COMMIT');
            console.log(`[Crash] User ${userId} cashed out at ${cashOutMultiplier}x for ${payout}. New balance: ${newBalance}`);
            return { success: true, newBalance, payout, cashOutMultiplier };
        } catch (error) {
            await client.query('ROLLBACK');
            console.error('[Crash] Error cashing out:', error.message);
            throw error;
        } finally {
            client.release();
        }
    }

    async getCrashHistory(limit = 20) {
        const { rows } = await db.query(
            "SELECT crash_multiplier FROM crash_rounds WHERE status = 'crashed' ORDER BY created_at DESC LIMIT $1",
            [limit]
        );
        return rows.map(r => r.crash_multiplier);
    }
}

const gameServiceInstance = new GameService();

const startCrashGameEngine = () => {
    console.log('[Game Service] Initializing Crash Game Engine...');
    runGameCycle();
};

module.exports = {
    gameService: gameServiceInstance,
    startCrashGameEngine,
};
