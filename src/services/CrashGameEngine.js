// ar_backend/src/services/CrashGameEngine.js
const crypto = require('crypto');
const pool = require('../config/database');

// --- GAME CONFIGURATION ---
const WAITING_TIME_MS = 8000;
const CRASHED_TIME_MS = 5000;
const GAME_TICK_RATE_MS = 100;

class CrashGameEngine {
    constructor() {
        if (CrashGameEngine.instance) {
            return CrashGameEngine.instance;
        }

        // Game State
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
        console.log('[CrashEngine] Engine starting...');
        
        this.wss.on('connection', ws => {
            ws.send(JSON.stringify({ type: 'full_state', payload: this.getGameState() }));
            ws.on('message', (message) => this.handleMessage(ws, message));
        });
        
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
            const { rows } = await pool.query("SELECT crash_multiplier FROM crash_rounds WHERE status = 'crashed' ORDER BY id DESC LIMIT 20");
            this.history = rows.map(r => ({ crash_multiplier: parseFloat(r.crash_multiplier) }));
        } catch (e) {
            this.history = [];
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
        
        console.log(`[CrashEngine] WAITING. Next crash @ ${this.crashPoint.toFixed(2)}x`);
        this.broadcastState();
        
        this.gameLoopTimeout = setTimeout(this.startRunningPhase, WAITING_TIME_MS);
    }
    
    async startRunningPhase() {
        if (this.gameLoopTimeout) clearTimeout(this.gameLoopTimeout);
        this.phase = 'RUNNING';

        try {
            const { rows } = await pool.query(
                "INSERT INTO crash_rounds (crash_multiplier, server_seed, public_hash, hashed_server_seed, status) VALUES ($1, $2, 'not_revealed_yet', $3, 'running') RETURNING id",
                [this.crashPoint, this.serverSeed, this.hashedServerSeed]
            );
            this.gameId = rows[0].id;
        } catch (err) {
            console.error('[CrashEngine] DB Error creating round:', err);
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

        await pool.query("UPDATE crash_rounds SET status = 'crashed' WHERE id = $1", [this.gameId]);
        
        const playersToUpdate = Object.keys(this.players).filter(addr => this.players[addr].status === 'placed');
        if (playersToUpdate.length > 0) {
            await pool.query(
                "UPDATE crash_bets SET status = 'lost' WHERE game_id = $1 AND user_wallet_address = ANY($2::varchar[]) AND status = 'placed'",
                [this.gameId, playersToUpdate]
            );
        }
        
        Object.values(this.players).forEach(p => { if (p.status === 'placed') p.status = 'lost'; });

        this.history.push({ crash_multiplier: this.crashPoint });
        if (this.history.length > 20) this.history.shift();

        this.broadcastState();
        this.gameLoopTimeout = setTimeout(this.startWaitingPhase, CRASHED_TIME_MS);
    }
    
    async handlePlaceBet({ userWalletAddress, betAmountArix, autoCashoutAt }) {
        if (this.phase !== 'WAITING') return { success: false, message: "Bets are closed for this round." };
        
        try {
            await pool.query('BEGIN');
            const { rowCount } = await pool.query( `UPDATE users SET claimable_arix_rewards = claimable_arix_rewards - $1 WHERE wallet_address = $2 AND claimable_arix_rewards >= $1`, [betAmountArix, userWalletAddress] );
            if (rowCount === 0) throw new Error('Insufficient ARIX balance.');
            
            await pool.query("INSERT INTO crash_bets (game_id, user_wallet_address, bet_amount_arix, status) VALUES ($1, $2, $3, 'placed')", [ this.gameId, userWalletAddress, betAmountArix ]);
            
            this.players[userWalletAddress] = { betAmount: betAmountArix, status: 'placed', autoCashoutAt };
            this.broadcastState();
            await pool.query('COMMIT');
            return { success: true, message: 'Bet placed!' };
        } catch (e) {
            await pool.query('ROLLBACK');
            return { success: false, message: e.message };
        }
    }
    
    async handleCashOut({ userWalletAddress }) {
        if (this.phase !== 'RUNNING' || !this.players[userWalletAddress] || this.players[userWalletAddress].status !== 'placed') return { success: false, message: 'Cannot cash out.' };
        
        const player = this.players[userWalletAddress];
        const cashOutMultiplier = this.multiplier;
        const payoutArix = parseFloat((player.betAmount * cashOutMultiplier).toFixed(9));

        try {
            await pool.query('BEGIN');
            await pool.query("UPDATE users SET claimable_arix_rewards = claimable_arix_rewards + $1 WHERE wallet_address = $2", [payoutArix, userWalletAddress]);
            await pool.query( "UPDATE crash_bets SET status = 'cashed_out', cash_out_multiplier = $1, payout_arix = $2 WHERE game_id = $3 AND user_wallet_address = $4", [cashOutMultiplier, payoutArix, this.gameId, userWalletAddress] );
            await pool.query('COMMIT');

            player.status = 'cashed_out';
            player.payout = payoutArix;
            player.cashOutAt = cashOutMultiplier;
            this.broadcastState();
            return { success: true, message: 'Cashed out!', cashOutMultiplier, payoutArix };
        } catch (e) {
            await pool.query('ROLLBACK');
            return { success: false, message: 'Server error during cash out.' };
        }
    }

    broadcastState() {
        if (!this.wss) return;
        this.wss.clients.forEach(client => {
            if (client.readyState === 1) client.send(JSON.stringify({ type: 'game_update', payload: this.getGameState() }));
        });
    }

    getGameState() {
        return {
            phase: this.phase,
            multiplier: this.phase === 'CRASHED' ? this.crashPoint : this.multiplier,
            history: this.history,
            players: Object.entries(this.players).map(([address, data]) => ({ user_wallet_address: address, bet_amount_arix: data.betAmount, status: data.status, cash_out_multiplier: data.cashOutAt })),
            hashedServerSeed: this.hashedServerSeed
        };
    }
    
    _calculateCrashPoint(serverSeed) {
        const hash = crypto.createHmac('sha256', serverSeed).update('ARIX_TERMINAL_PROVABLY_FAIR_SALT').digest('hex');
        const h = parseInt(hash.slice(0, 13), 16);
        const e = 2 ** 52;
        if (h % 33 === 0) return 1.00;
        const crashPoint = Math.floor((100 * e - h) / (e - h)) / 100;
        return Math.max(1.01, crashPoint);
    }
}

module.exports = new CrashGameEngine();