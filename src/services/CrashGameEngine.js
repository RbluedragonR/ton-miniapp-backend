const crypto = require('crypto');
const db = require('../config/database');
const { toArixSmallestUnits, fromArixSmallestUnits } = require('../utils/tonUtils');
const userService = require('./userService');

const GAME_TICK_RATE_MS = 100; // Update multiplier 10 times per second
const WAITING_TIME_MS = 8000; // 8 seconds between rounds
const CRASHED_TIME_MS = 4000; // 4 seconds to show crashed state

class CrashGameEngine {
    constructor() {
        this.wss = null;
        this.gameState = {
            phase: 'WAITING', // WAITING, RUNNING, CRASHED
            multiplier: 1.00,
            timeUntilNextRound: WAITING_TIME_MS / 1000,
            gameId: null,
            hashedServerSeed: null,
            players: {}, // { [userAddress]: { betAmount, status: 'playing'|'cashed_out' } }
            history: [],
        };
        this.gameLoopInterval = null;
        this.timeout = null;
    }

    start(wss) {
        this.wss = wss;
        console.log('[CrashEngine] Starting...');
        this.loadHistory();
        this.gameLoopInterval = setInterval(() => this.tick(), GAME_TICK_RATE_MS);
        this.startWaitingPhase();

        this.wss.on('connection', ws => {
            ws.send(JSON.stringify({ type: 'full_state', payload: this.getPublicGameState() }));
        });
    }

    tick() {
        if (this.gameState.phase === 'RUNNING') {
            const newMultiplier = this.calculateNextMultiplier();
            this.gameState.multiplier = newMultiplier;
            if (newMultiplier >= this.crashPoint) {
                this.crash();
            }
        }
        if (this.gameState.phase === 'WAITING') {
            this.gameState.timeUntilNextRound -= (GAME_TICK_RATE_MS / 1000);
        }
        this.broadcastState();
    }

    startWaitingPhase() {
        this.gameState.phase = 'WAITING';
        this.gameState.timeUntilNextRound = WAITING_TIME_MS / 1000;
        console.log('[CrashEngine] Phase: WAITING');
        
        this.timeout = setTimeout(() => this.startRunningPhase(), WAITING_TIME_MS);
    }
    
    async startRunningPhase() {
        // 1. Generate Provably Fair data
        const serverSeed = crypto.randomBytes(32).toString('hex');
        this.hashedServerSeed = crypto.createHash('sha256').update(serverSeed).digest('hex');
        this.crashPoint = this.calculateCrashPoint(serverSeed);
        
        this.gameState.phase = 'RUNNING';
        this.gameState.multiplier = 1.00;
        console.log(`[CrashEngine] Phase: RUNNING. Crashing at ${this.crashPoint.toFixed(2)}x`);

        // 2. Store game in DB
        const { rows } = await db.query(
            'INSERT INTO crash_games (server_seed, hashed_server_seed, crash_multiplier, status) VALUES ($1, $2, $3, $4) RETURNING id',
            [serverSeed, this.hashedServerSeed, this.crashPoint, 'in_progress']
        );
        this.gameState.gameId = rows[0].id;
        this.gameState.hashedServerSeed = this.hashedServerSeed;

        // Reset players for the new round, but carry over bets placed during waiting phase
        Object.values(this.gameState.players).forEach(p => p.status = 'playing');
    }

    crash() {
        console.log(`[CrashEngine] CRASHED at ${this.gameState.multiplier.toFixed(2)}x`);
        this.gameState.phase = 'CRASHED';
        this.gameState.multiplier = this.crashPoint; // Display the exact crash point

        // Update game in DB
        db.query(
            'UPDATE crash_games SET status = $1, ended_at = NOW() WHERE id = $2',
            ['completed', this.gameState.gameId]
        );
        
        // Mark all remaining players as lost
        Object.keys(this.gameState.players).forEach(userAddress => {
            if (this.gameState.players[userAddress].status === 'playing') {
                this.gameState.players[userAddress].status = 'lost';
            }
        });

        const historyItem = { id: this.gameState.gameId, crash_multiplier: this.crashPoint };
        this.gameState.history.unshift(historyItem);
        if (this.gameState.history.length > 20) this.gameState.history.pop();

        this.timeout = setTimeout(() => {
            this.gameState.players = {}; // Clear players for next round
            this.startWaitingPhase();
        }, CRASHED_TIME_MS);
    }

    async placeBet(userAddress, betAmount) {
        if (this.gameState.phase !== 'WAITING') {
            throw new Error("Bets can only be placed during the 'WAITING' phase.");
        }
        if (this.gameState.players[userAddress]) {
            throw new Error("You have already placed a bet for this round.");
        }

        const client = await db.getClient();
        try {
            await client.query('BEGIN');
            const userData = await userService.ensureUserExists(userAddress, client);
            const betAmountSmallest = toArixSmallestUnits(betAmount);

            if (BigInt(userData.claimable_arix_rewards) < betAmountSmallest) {
                throw new Error('Insufficient ARIX balance.');
            }

            const newBalance = BigInt(userData.claimable_arix_rewards) - betAmountSmallest;
            await client.query(
                'UPDATE users SET claimable_arix_rewards = $1 WHERE id = $2',
                [newBalance.toString(), userData.id]
            );

            // We don't have gameId yet, so we'll add it later when game starts
            // Or better, we let the user bet and store it when the game starts.
            // For now, simple in-memory:
            this.gameState.players[userAddress] = {
                betAmount,
                status: 'waiting_for_start' 
            };
            
            await client.query('COMMIT');
            return { success: true, newBalance: fromArixSmallestUnits(newBalance) };

        } catch (error) {
            await client.query('ROLLBACK');
            console.error("[CrashEngine] Error placing bet:", error);
            throw error;
        } finally {
            client.release();
        }
    }

    async cashOut(userAddress) {
        if (this.gameState.phase !== 'RUNNING') {
            throw new Error('Can only cash out while the game is running.');
        }
        const player = this.gameState.players[userAddress];
        if (!player || player.status !== 'playing') {
            throw new Error('No active bet to cash out.');
        }

        const cashoutMultiplier = this.gameState.multiplier;
        const betAmountSmallest = toArixSmallestUnits(player.betAmount);
        const payoutAmountSmallest = BigInt(Math.floor(Number(betAmountSmallest) * cashoutMultiplier));

        const client = await db.getClient();
        try {
            await client.query('BEGIN');
            
            const { rows } = await client.query('UPDATE users SET claimable_arix_rewards = claimable_arix_rewards + $1 WHERE wallet_address = $2 RETURNING id, claimable_arix_rewards', [payoutAmountSmallest.toString(), userAddress]);
            const newBalance = rows[0].claimable_arix_rewards;
            const userId = rows[0].id;
            
            // This needs to be stored against a bet record in the DB
            // For now, we update the in-memory state
            player.status = 'cashed_out';
            player.cashoutMultiplier = cashoutMultiplier;
            player.payout = fromArixSmallestUnits(payoutAmountSmallest);

            // Here you would insert/update the `crash_bets` table
            // For simplicity, this step is omitted in this example, but it's crucial for production.

            await client.query('COMMIT');
            return { success: true, newBalance: fromArixSmallestUnits(newBalance), cashedOutAt: cashoutMultiplier };

        } catch (error) {
            await client.query('ROLLBACK');
            throw error;
        } finally {
            client.release();
        }
    }
    
    // --- Provably Fair Calculation ---
    calculateCrashPoint(serverSeed) {
        const hash = crypto.createHmac('sha256', serverSeed).update('provably-fair-salt').digest('hex');
        const h = parseInt(hash.slice(0, 13), 16);
        const e = Math.pow(2, 52);
        const crashPoint = Math.floor((100 * e - h) / (e - h)) / 100;
        return Math.max(1.00, crashPoint);
    }
    
    // --- Multiplier Calculation ---
    calculateNextMultiplier() {
        const elapsed = (Date.now() - this.startTime) / 1000;
        const multiplier = Math.pow(1.05, elapsed); // Example growth curve
        return Math.min(multiplier, 10000); // Cap multiplier
    }

    getPublicGameState() {
        return {
            phase: this.gameState.phase,
            multiplier: this.gameState.multiplier,
            timeUntilNextRound: this.gameState.timeUntilNextRound,
            gameId: this.gameState.gameId,
            hashedServerSeed: this.gameState.hashedServerSeed,
            players: Object.keys(this.gameState.players).length, // Just send player count
            history: this.gameState.history,
        };
    }

    broadcastState() {
        if (!this.wss) return;
        this.wss.clients.forEach(client => {
            if (client.readyState === 1) { // WebSocket.OPEN
                client.send(JSON.stringify({ type: 'game_update', payload: this.getPublicGameState() }));
            }
        });
    }

    async loadHistory() {
        const { rows } = await db.query('SELECT id, crash_multiplier FROM crash_games WHERE status = $1 ORDER BY created_at DESC LIMIT 20', ['completed']);
        this.gameState.history = rows;
    }
}

// Export a singleton instance
module.exports = new CrashGameEngine();
