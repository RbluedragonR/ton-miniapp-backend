const crypto = require('crypto');
const pool = require('../config/db');

// --- GAME CONFIGURATION ---
const WAITING_TIME_MS = 8000;
const CRASHED_TIME_MS = 5000;
const GAME_TICK_RATE_MS = 100;

/**
 * Singleton class to manage the entire Crash game lifecycle.
 * Ensures only one instance of the game runs on the server.
 */
class CrashGameEngine {
    constructor() {
        if (CrashGameEngine.instance) {
            return CrashGameEngine.instance;
        }

        // --- Game State ---
        this.phase = 'CONNECTING'; // WAITING, RUNNING, CRASHED
        this.gameId = null;
        this.crashPoint = 0;
        this.startTime = null;
        this.multiplier = 1.00;
        
        // --- Player & History Data ---
        this.players = {}; // In-memory cache of current players for the round
        this.history = []; // Cache of the last ~20 game results

        // --- Provably Fair ---
        this.serverSeed = null;
        this.hashedServerSeed = null;

        this.wss = null; // WebSocket Server instance
        
        CrashGameEngine.instance = this;
    }

    start(wss) {
        if (this.wss) return; // Prevent multiple starts
        this.wss = wss;
        console.log('[CrashEngine] Engine starting...');
        this.loadHistory().then(() => this.startWaitingPhase());
    }

    // --- Core Game Loop ---

    async startWaitingPhase() {
        clearTimeout(this.gameLoopTimeout);
        
        this.phase = 'WAITING';
        this.players = {};
        this.multiplier = 1.00;

        // Generate secrets for the *next* round to be provably fair
        this.serverSeed = crypto.randomBytes(32).toString('hex');
        this.hashedServerSeed = crypto.createHash('sha256').update(this.serverSeed).digest('hex');
        this.crashPoint = this._calculateCrashPoint(this.serverSeed);
        
        console.log(`[CrashEngine] WAITING phase. Next round will crash at: ${this.crashPoint.toFixed(2)}x`);

        this.broadcastState();

        this.gameLoopTimeout = setTimeout(() => {
            this.startRunningPhase();
        }, WAITING_TIME_MS);
    }
    
    async startRunningPhase() {
        clearTimeout(this.gameLoopTimeout);
        this.phase = 'RUNNING';

        // Save the new round to the database
        try {
            const { rows } = await pool.query(
                "INSERT INTO crash_rounds (crash_multiplier, server_seed, public_hash, hashed_server_seed, status) VALUES ($1, $2, 'not_revealed_yet', $3, 'running') RETURNING id",
                [this.crashPoint, this.serverSeed, this.hashedServerSeed]
            );
            this.gameId = rows[0].id;
        } catch (err) {
            console.error('[CrashEngine] CRITICAL: Could not create game round in DB.', err);
            this.startWaitingPhase(); // Reset if DB fails
            return;
        }

        console.log(`[CrashEngine] RUNNING phase. Game ID: ${this.gameId}`);
        this.startTime = Date.now();
        this.tick();
    }
    
    tick() {
        if (this.phase !== 'RUNNING') return;
        
        const elapsed = (Date.now() - this.startTime) / 1000;
        this.multiplier = Math.pow(1.04, elapsed); // Adjusted curve for a smoother start

        if (this.multiplier >= this.crashPoint) {
            this.endGame();
        } else {
            this.broadcastState();
            this.gameLoopTimeout = setTimeout(() => this.tick(), GAME_TICK_RATE_MS);
        }
    }
    
    async endGame() {
        clearTimeout(this.gameLoopTimeout);
        this.phase = 'CRASHED';
        this.multiplier = this.crashPoint;

        console.log(`[CrashEngine] CRASHED at ${this.crashPoint.toFixed(2)}x`);

        await pool.query("UPDATE crash_rounds SET status = 'crashed' WHERE id = $1", [this.gameId]);

        // Mark any players who didn't cash out as 'lost'
        Object.values(this.players).forEach(p => {
            if (p.status === 'placed') p.status = 'lost';
        });
        await pool.query(
            "UPDATE crash_bets SET status = 'lost' WHERE game_id = $1 AND status = 'placed'", 
            [this.gameId]
        );

        this.history.push({ crash_multiplier: this.crashPoint.toFixed(2) });
        if(this.history.length > 20) this.history.shift();

        this.broadcastState();
        
        this.gameLoopTimeout = setTimeout(() => this.startWaitingPhase(), CRASHED_TIME_MS);
    }
    
    // --- Player Actions (called from websocket server) ---

    async handlePlaceBet(userWalletAddress, betAmountArix) {
        if (this.phase !== 'WAITING') return { success: false, message: "Bets are closed for this round." };
        if (this.players[userWalletAddress]) return { success: false, message: "You already placed a bet." };
        if (!userWalletAddress || isNaN(betAmountArix) || betAmountArix <= 0) return { success: false, message: "Invalid bet." };

        // 1. Debit ARIX balance
        try {
            const result = await pool.query(
                `UPDATE users 
                 SET claimable_arix_rewards = claimable_arix_rewards - $1 
                 WHERE wallet_address = $2 AND claimable_arix_rewards >= $1
                 RETURNING claimable_arix_rewards`,
                [betAmountArix, userWalletAddress]
            );

            if (result.rowCount === 0) {
                return { success: false, message: 'Insufficient ARIX balance.' };
            }
        } catch (e) {
            console.error(`[CrashEngine] DB Error debiting user ${userWalletAddress}`, e);
            return { success: false, message: 'Server error placing bet.' };
        }

        // 2. Add player to current round
        this.players[userWalletAddress] = { betAmount: betAmountArix, status: 'placed' };
        this.broadcastState();

        return { success: true, message: 'Bet placed!' };
    }

    async handleCashOut(userWalletAddress) {
        if (this.phase !== 'RUNNING') return { success: false, message: 'Not a running game.' };
        
        const player = this.players[userWalletAddress];
        if (!player || player.status !== 'placed') {
            return { success: false, message: 'No active bet to cash out.' };
        }
        
        const cashOutMultiplier = this.multiplier;
        const payoutArix = parseFloat((player.betAmount * cashOutMultiplier).toFixed(9));

        // 1. Credit player wallet
        try {
            await pool.query(
                "UPDATE users SET claimable_arix_rewards = claimable_arix_rewards + $1 WHERE wallet_address = $2",
                [payoutArix, userWalletAddress]
            );
        } catch(e) {
             console.error(`[CrashEngine] DB Error crediting user ${userWalletAddress}`, e);
            return { success: false, message: 'Server error processing cash out.' };
        }

        // 2. Log the successful bet
        await pool.query(
            "INSERT INTO crash_bets (game_id, user_wallet_address, bet_amount_arix, status, cash_out_multiplier, payout_arix) VALUES ($1, $2, $3, 'cashed_out', $4, $5)",
            [this.gameId, userWalletAddress, player.betAmount, cashOutMultiplier, payoutArix]
        );

        // 3. Update player state for the current round
        player.status = 'cashed_out';
        player.payout = payoutArix.toFixed(2);
        player.cashOutAt = cashOutMultiplier.toFixed(2);

        this.broadcastState();

        return { success: true, message: 'Cashed out!', cashOutMultiplier, payoutArix };
    }
    
    // --- Getters ---
    
    getGameState() {
        return {
            phase: this.phase,
            multiplier: this.phase === 'CRASHED' ? this.crashPoint : this.multiplier,
            crashPoint: this.crashPoint, // Only for final state
            history: this.history,
            players: Object.entries(this.players).map(([address, data]) => ({
                user: `${address.slice(0, 4)}...${address.slice(-4)}`,
                bet: data.betAmount,
                status: data.status,
                payout: data.payout,
                cashOutAt: data.cashOutAt,
            })),
            timeUntilNextRound: this.gameState.timeUntilNextRound, // for countdown bar
            hashedServerSeed: this.hashedServerSeed
        };
    }
    
    async loadHistory() {
        const { rows } = await pool.query('SELECT crash_multiplier FROM crash_rounds WHERE status = $1 ORDER BY id DESC LIMIT 20', ['crashed']);
        this.history = rows.reverse();
    }
    
    _calculateCrashPoint(serverSeed) {
        // Provably Fair Calculation
        const hash = crypto.createHmac('sha256', serverSeed).update('ARIX_TERMINAL_SALT').digest('hex');
        const h = parseInt(hash.slice(0, 13), 16);
        const e = 2 ** 52;
        // This formula creates a nice distribution with more frequent low crashes.
        if (h % 25 === 0) return 1.00; // 4% chance of instant crash
        const crashPoint = Math.floor(100 * e / (e - h)) / 100;
        return Math.max(1.01, crashPoint);
    }
}

module.exports = new CrashGameEngine();