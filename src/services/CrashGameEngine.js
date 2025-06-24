// src/services/CrashGameEngine.js

const EventEmitter = require('events');
const crypto = require('crypto');
const { query, getClient } = require('../config/database'); // Use the new resilient DB config
const userService = require('./userService');

// --- GAME CONFIGURATION ---
const WAITING_TIME_MS = 8000;
const CRASHED_TIME_MS = 5000;
const GAME_TICK_RATE_MS = 100;

class CrashGameEngine extends EventEmitter {
    constructor() {
        if (CrashGameEngine.instance) {
            return CrashGameEngine.instance;
        }
        super();

        this.phase = 'CONNECTING';
        this.gameId = null;
        this.crashPoint = 0;
        this.startTime = null;
        this.multiplier = 1.00;
        this.players = {};
        this.history = [];
        this.serverSeed = null;
        this.hashedServerSeed = null;
        this.gameLoopTimeout = null;
        this.wss = null;

        this.tick = this.tick.bind(this);
        this.startWaitingPhase = this.startWaitingPhase.bind(this);
        this.startRunningPhase = this.startRunningPhase.bind(this);
        this.endGame = this.endGame.bind(this);
        this.handleMessage = this.handleMessage.bind(this);

        CrashGameEngine.instance = this;
    }
    
    start(wss) {
        if (this.wss) return;
        this.wss = wss;
        console.log('[CrashEngine] Engine starting and attaching to WebSocket server...');
        
        this.wss.on('connection', ws => {
            // Send the current state immediately on connection
            ws.send(JSON.stringify({ type: 'full_state', payload: this.getGameState() }));
            ws.on('message', (message) => this.handleMessage(ws, message));
        });
        
        // Initialize the game loop
        this.loadHistory().then(this.startWaitingPhase);
    }
    
    async handleMessage(ws, rawMessage) {
        try {
            const { type, payload } = JSON.parse(rawMessage);
            const userWalletAddress = payload?.userWalletAddress;
            if (!userWalletAddress) return;

            let result;
            switch (type) {
                case 'PLACE_BET':
                    result = await this.handlePlaceBet(payload);
                    ws.send(JSON.stringify({ type: result.success ? 'bet_success' : 'bet_error', payload: result }));
                    break;
                case 'CASH_OUT':
                    result = await this.handleCashOut(payload);
                    ws.send(JSON.stringify({ type: result.success ? 'cashout_success' : 'cashout_error', payload: result }));
                    break;
            }
        } catch (e) {
            console.error('[CrashEngine] Error handling message:', e);
        }
    }
    
    async loadHistory() {
        try {
            // Uses the new resilient `query` function automatically.
            const { rows } = await query("SELECT crash_multiplier FROM crash_rounds WHERE status = 'crashed' ORDER BY id DESC LIMIT 20");
            this.history = rows.map(r => ({ crash_multiplier: parseFloat(r.crash_multiplier) }));
        } catch (e) {
            console.error("[CrashEngine] Failed to load history:", e.message); // Log only the message
            this.history = []; // Default to empty history on failure
        }
    }

    async startWaitingPhase() {
        if (this.gameLoopTimeout) clearTimeout(this.gameLoopTimeout);
        
        this.phase = 'WAITING';
        this.players = {};
        this.multiplier = 1.00;
        this.serverSeed = crypto.randomBytes(32).toString('hex');
        this.hashedServerSeed = crypto.createHash('sha256').update(this.serverSeed).digest('hex');
        this.crashPoint = this._calculateCrashPoint(this.serverSeed);
        
        try {
            // ### BUG FIX & STABILITY ENHANCEMENT ###
            // The `public_hash` IS the `hashedServerSeed`. The original query was incorrect.
            // This query now also uses the resilient `query` function from database.js.
            const insertQuery = `
                INSERT INTO crash_rounds (crash_multiplier, server_seed, public_hash, hashed_server_seed, status) 
                VALUES ($1, $2, $3, $3, 'waiting') 
                RETURNING id
            `;
            const { rows } = await query(insertQuery, [this.crashPoint, this.serverSeed, this.hashedServerSeed]);
            this.gameId = rows[0].id;

            console.log(`[CrashEngine] WAITING for Game ID ${this.gameId}. Next crash @ ${this.crashPoint.toFixed(2)}x`);
            this.broadcastState();
            
            // Schedule the next phase
            this.gameLoopTimeout = setTimeout(this.startRunningPhase, WAITING_TIME_MS);

        } catch(err) {
             console.error('[CrashEngine] CRITICAL DB ERROR creating WAITING round:', err.message);
             // Use a calmer, longer retry delay. The resilient query function already tried 3 times.
             // This indicates a more serious problem, so we back off significantly.
             this.gameLoopTimeout = setTimeout(this.startWaitingPhase, 15000); 
             return;
        }
    }
    
    async startRunningPhase() {
        if (this.gameLoopTimeout) clearTimeout(this.gameLoopTimeout);
        this.phase = 'RUNNING';

        try {
            await query("UPDATE crash_rounds SET status = 'running' WHERE id = $1", [this.gameId]);
        } catch (err) {
            console.error('[CrashEngine] DB Error starting RUNNING round:', err.message);
            this.gameLoopTimeout = setTimeout(this.startWaitingPhase, 5000);
            return;
        }
        
        console.log(`[CrashEngine] RUNNING Game ID: ${this.gameId}`);
        this.startTime = Date.now();
        this.tick();
    }
    
    tick() {
        if (this.phase !== 'RUNNING') return;
        
        const elapsed = (Date.now() - this.startTime) / 1000;
        this.multiplier = Math.max(1.00, parseFloat(Math.pow(1.06, elapsed).toFixed(2)));
        
        if (this.multiplier >= this.crashPoint) {
            this.endGame();
        } else {
            this.broadcastState();
            this.gameLoopTimeout = setTimeout(this.tick, GAME_TICK_RATE_MS);
        }
    }

    async endGame() {
        if (this.gameLoopTimeout) clearTimeout(this.gameLoopTimeout);
        
        this.phase = 'CRASHED';
        this.multiplier = this.crashPoint;

        try {
            await query("UPDATE crash_rounds SET status = 'crashed' WHERE id = $1", [this.gameId]);
        
            const playersToUpdate = Object.keys(this.players).filter(addr => this.players[addr].status === 'placed');
            if (playersToUpdate.length > 0) {
                await query(
                    "UPDATE crash_bets SET status = 'lost' WHERE game_id = $1 AND user_wallet_address = ANY($2::varchar[]) AND status = 'placed'",
                    [this.gameId, playersToUpdate]
                );
            }
        } catch(err) {
            console.error(`[CrashEngine] DB Error during endGame for game ${this.gameId}:`, err.message);
        }
        
        Object.values(this.players).forEach(p => { if (p.status === 'placed') p.status = 'lost'; });

        this.history.unshift({ crash_multiplier: this.crashPoint });
        if (this.history.length > 20) this.history.pop();
        
        console.log(`[CrashEngine] CRASHED at ${this.crashPoint.toFixed(2)}x`);
        this.broadcastState();
        this.gameLoopTimeout = setTimeout(this.startWaitingPhase, CRASHED_TIME_MS);
    }
    
    async handlePlaceBet({ userWalletAddress, betAmountArix, autoCashoutAt }) {
        if (this.phase !== 'WAITING') return { success: false, message: "Bets are closed for this round." };
        if (!this.gameId) return { success: false, message: "Game not ready, please try again."};
        if (this.players[userWalletAddress]) return { success: false, message: "You have already placed a bet." };
        
        const client = await getClient();
        try {
            await client.query('BEGIN');
            
            // This service handles its own transaction logic internally
            await userService.updateUserBalances(userWalletAddress, { ARIX: -betAmountArix }, 'game_bet', { game: 'crash', game_id: this.gameId }, client);

            await client.query("INSERT INTO crash_bets (game_id, user_wallet_address, bet_amount_arix, status, placed_at) VALUES ($1, $2, $3, 'placed', NOW())", [ this.gameId, userWalletAddress, betAmountArix ]);
            
            await client.query('COMMIT');
            this.players[userWalletAddress] = { betAmount: betAmountArix, status: 'placed', autoCashoutAt };
            this.broadcastState();
            return { success: true, message: 'Bet placed!' };
        } catch (e) {
            await client.query('ROLLBACK');
            console.error(`[CrashEngine] Bet failed for ${userWalletAddress}:`, e.message);
            // Provide a user-friendly error
            return { success: false, message: e.message.includes("insufficient balance") ? "Insufficient balance." : "An error occurred placing your bet." };
        } finally {
            client.release();
        }
    }
    
    async handleCashOut({ userWalletAddress }) {
        if (this.phase !== 'RUNNING' || !this.players[userWalletAddress] || this.players[userWalletAddress].status !== 'placed') {
            return { success: false, message: 'Cannot cash out.' };
        }
        
        const player = this.players[userWalletAddress];
        const cashOutMultiplier = this.multiplier;
        const payoutArix = parseFloat((player.betAmount * cashOutMultiplier).toFixed(9));

        const client = await getClient();
        try {
            await client.query('BEGIN');
            
            await userService.updateUserBalances(userWalletAddress, { ARIX: payoutArix }, 'game_win', { game: 'crash', game_id: this.gameId, multiplier: cashOutMultiplier }, client);

            await client.query("UPDATE crash_bets SET status = 'cashed_out', cash_out_multiplier = $1, payout_arix = $2 WHERE game_id = $3 AND user_wallet_address = $4", [cashOutMultiplier, payoutArix, this.gameId, userWalletAddress]);
            
            await client.query('COMMIT');

            player.status = 'cashed_out';
            player.payout = payoutArix;
            player.cashOutAt = cashOutMultiplier;
            this.broadcastState();

            return { success: true, message: 'Cashed out!', cashOutMultiplier, payoutArix };
        } catch (e) {
            await client.query('ROLLBACK');
            console.error(`[CrashEngine] Cash out failed for ${userWalletAddress}:`, e.message);
            return { success: false, message: 'Server error during cash out.' };
        } finally {
            client.release();
        }
    }

    broadcastState() {
        if (!this.wss) return;
        const state = this.getGameState();
        this.emit('update', state); 
        
        const message = JSON.stringify({ type: 'game_update', payload: state });
        this.wss.clients.forEach(client => {
            if (client.readyState === 1) { // WebSocket.OPEN
                client.send(message);
            }
        });
    }

    // Kept for compatibility if anything else uses it, but broadcastState is primary
    emitUpdate() {
        this.emit('update', this.getGameState());
    }

    getGameState() {
        return {
            phase: this.phase,
            multiplier: this.phase === 'CRASHED' ? this.crashPoint : this.multiplier,
            history: this.history,
            // Format player list for the frontend
            players: Object.entries(this.players).map(([address, data]) => ({ 
                user_wallet_address: address, 
                bet_amount_arix: data.betAmount, 
                status: data.status, 
                cash_out_multiplier: data.cashOutAt,
                payout: data.payout // Include payout amount
            })),
            hashedServerSeed: this.hashedServerSeed,
            gameId: this.gameId,
        };
    }
    
    _calculateCrashPoint(serverSeed) {
        const hash = crypto.createHmac('sha256', serverSeed).update('ARIX_TERMINAL_PROVABLY_FAIR_SALT').digest('hex');
        const h = parseInt(hash.slice(0, 13), 16);
        const e = 2 ** 52;
        if (h % 33 === 0) return 1.00;
        // The original formula had a slight bias, this is a more standard one.
        const crashPoint = Math.floor((100 * e - h) / (e - h)) / 100;
        return Math.max(1.00, crashPoint);
    }
}

module.exports = new CrashGameEngine();