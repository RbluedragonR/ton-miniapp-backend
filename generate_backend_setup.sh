#!/bin/bash

# Script to auto-generate Node.js/Express backend structure and boilerplate
# IMPORTANT: Run this script from within the 'ar_terminal/backend' directory.

echo "Generating Node.js/Express backend structure..."

# 0. Create package.json
cat << 'EOF' > ./package.json
{
  "name": "ar_terminal_backend",
  "version": "1.0.0",
  "description": "Backend for ARIX Terminal TMA",
  "main": "src/server.js",
  "scripts": {
    "start": "node src/server.js",
    "dev": "nodemon src/server.js",
    "test": "echo \"Error: no test specified\" && exit 1"
  },
  "keywords": [
    "ton",
    "tma",
    "arix",
    "express"
  ],
  "author": "",
  "license": "ISC",
  "dependencies": {
    "@orbs-network/ton-access": "^2.3.3",
    "@ton/core": "^0.56.3",
    "@ton/crypto": "^3.2.0",
    "@ton/ton": "^0.16.0",
    "axios": "^1.6.8",
    "cors": "^2.8.5",
    "dotenv": "^16.4.5",
    "express": "^4.19.2",
    "pg": "^8.11.5"
  },
  "devDependencies": {
    "nodemon": "^3.1.0"
  }
}
EOF
echo "Created package.json"

# 1. Create .env.example
cat << 'EOF' > ./.env.example
# Server Configuration
PORT=3001

# TON Network Configuration
TON_NETWORK="testnet" # "mainnet" or "testnet"
# TON_ACCESS_API_KEY="" # Optional: Your Ton Access API key if you have one for dedicated access

# Token and Contract Addresses
ARIX_TOKEN_MASTER_ADDRESS="EQCLU6KIPjZJbhyYlRfENc3nQck2DWulsUq2gJPyWEK9wfDd"
USDT_REWARD_JETTON_MASTER_ADDRESS="YOUR_ACTUAL_USDT_JETTON_MASTER_ADDRESS_ON_TON" # e.g., jUSDT mainnet: EQBynBO23ywHy_CgarY9NK9FTz0yDsG82PtcbSTQgGoXwiuA
STAKING_CONTRACT_ADDRESS="YOUR_DEPLOYED_STAKING_CONTRACT_ADDRESS_ON_TON"

# Database (Vercel Postgres or any PostgreSQL)
POSTGRES_URL="your_postgres_connection_string" # e.g., postgresql://user:password@host:port/database

# Treasury Wallet (EXTREMELY SENSITIVE - DO NOT COMMIT REAL MNEMONIC TO GIT)
# This should be set as a secure environment variable in your deployment (e.g., Vercel)
USDT_TREASURY_WALLET_MNEMONIC="your twenty four word seed phrase for the usdt treasury wallet for payouts"

# API Keys (if any others are needed)
# STONFI_API_KEY="" # STON.fi public endpoints usually don't require a key

# Logging Level (optional)
LOG_LEVEL="info"
EOF
echo "Created .env.example (Remember to create a .env file with your actual values and keep it secure)"

# 2. Create vercel.json for Vercel deployment
cat << 'EOF' > ./vercel.json
{
  "version": 2,
  "builds": [
    {
      "src": "src/server.js",
      "use": "@vercel/node"
    }
  ],
  "routes": [
    {
      "src": "/api/(.*)",
      "dest": "src/server.js"
    },
    {
      "src": "/(.*)",
      "dest": "src/server.js"
    }
  ]
}
EOF
echo "Created vercel.json"

# 3. Create directory structure (if not already present by setup_project.sh)
mkdir -p ./src/controllers
mkdir -p ./src/routes
mkdir -p ./src/services
mkdir -p ./src/models 
mkdir -p ./src/config
mkdir -p ./src/middlewares
mkdir -p ./src/utils

# 4. Create src/server.js
cat << 'EOF' > ./src/server.js
require('dotenv').config();
const app = require('./app');

const PORT = process.env.PORT || 3001;

app.listen(PORT, () => {
  console.log(`ARIX Terminal Backend listening on port ${PORT}`);
  console.log(`TON Network: ${process.env.TON_NETWORK || 'not set'}`);
});
EOF
echo "Created src/server.js"

# 5. Create src/app.js
cat << 'EOF' > ./src/app.js
const express = require('express');
const cors = require('cors');
// const morgan = require('morgan'); // Optional: for HTTP request logging

const earnRoutes = require('./routes/earnRoutes');
// const gameRoutes = require('./routes/gameRoutes'); // For Coinflip later
// const userRoutes = require('./routes/userRoutes');   // For User profile later
const { generalErrorHandler, notFoundHandler } = require('./middlewares/errorHandler');

const app = express();

// Middlewares
app.use(cors({
  origin: process.env.FRONTEND_URL || '*', // Configure for your TMA's origin in production
  methods: ["GET", "POST", "PUT", "DELETE"],
  allowedHeaders: ["Content-Type", "Authorization"]
}));
app.use(express.json());
// if (process.env.NODE_ENV === 'development') {
//   app.use(morgan('dev'));
// }

// API Routes
app.get('/', (req, res) => {
    res.status(200).json({ message: 'ARIX Terminal Backend API is running!' });
});

app.use('/api/earn', earnRoutes);
// app.use('/api/game', gameRoutes);
// app.use('/api/user', userRoutes);

// Error Handling Middlewares
app.use(notFoundHandler);
app.use(generalErrorHandler);

module.exports = app;
EOF
echo "Created src/app.js"

# 6. Create src/middlewares/errorHandler.js
cat << 'EOF' > ./src/middlewares/errorHandler.js
const notFoundHandler = (req, res, next) => {
    const error = new Error(`Not Found - ${req.originalUrl}`);
    error.status = 404;
    next(error);
};

const generalErrorHandler = (error, req, res, next) => {
    const statusCode = error.status || 500;
    console.error(`[${statusCode}] ${error.message} - ${req.originalUrl} - ${req.method} - ${req.ip}`);
    console.error(error.stack); // Log stack trace for debugging

    res.status(statusCode).json({
        error: {
            message: error.message,
            // stack: process.env.NODE_ENV === 'development' ? error.stack : undefined, // Optionally show stack in dev
        },
    });
};

module.exports = { notFoundHandler, generalErrorHandler };
EOF
echo "Created src/middlewares/errorHandler.js"


# 7. Create src/config/database.js (for Vercel Postgres / pg)
cat << 'EOF' > ./src/config/database.js
const { Pool } = require('pg');

if (!process.env.POSTGRES_URL) {
  if (process.env.NODE_ENV !== 'test') { // Don't warn in test environments
    console.warn("DATABASE_WARNING: POSTGRES_URL environment variable is not set. Database functionality will be unavailable.");
  }
}

const pool = process.env.POSTGRES_URL ? new Pool({
  connectionString: process.env.POSTGRES_URL,
  ssl: {
    rejectUnauthorized: false // Required for Vercel Postgres, Heroku, etc.
  }
}) : null;

// Test query function
async function testDbConnection() {
  if (!pool) {
    console.log("DB: Pool is not initialized (POSTGRES_URL not set). Skipping DB connection test.");
    return;
  }
  try {
    const client = await pool.connect();
    console.log("DB: Successfully connected to PostgreSQL!");
    const res = await client.query('SELECT NOW()');
    console.log("DB: Current time from DB:", res.rows[0].now);
    client.release();
  } catch (err) {
    console.error("DB_ERROR: Failed to connect to PostgreSQL or execute query:", err.stack);
  }
}

// Call test connection on module load (optional, for immediate feedback during startup)
// if (process.env.NODE_ENV !== 'test') {
//   testDbConnection();
// }

module.exports = {
  query: (text, params) => {
    if (!pool) {
      throw new Error("Database pool is not initialized. POSTGRES_URL environment variable might be missing.");
    }
    return pool.query(text, params);
  },
  getClient: () => {
    if (!pool) {
      throw new Error("Database pool is not initialized. POSTGRES_URL environment variable might be missing.");
    }
    return pool.connect();
  }
};
EOF
echo "Created src/config/database.js"

# Create initial DB schema script (conceptual, run manually against your DB)
mkdir -p ./db_migrations
cat << 'EOF' > ./db_migrations/001_initial_schema.sql
-- Initial Schema for ARIX Terminal Backend
-- Run this manually against your PostgreSQL database

CREATE TABLE IF NOT EXISTS users (
    wallet_address VARCHAR(68) PRIMARY KEY, -- TON wallet addresses are typically base64, length can vary
    telegram_id BIGINT UNIQUE,
    username VARCHAR(255),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS staking_plans (
    plan_id SERIAL PRIMARY KEY,
    plan_key VARCHAR(50) UNIQUE NOT NULL, -- e.g., 'QUICK_BOOST_30D'
    title VARCHAR(100) NOT NULL,
    duration_days INTEGER NOT NULL,
    apr_percent NUMERIC(5, 2) NOT NULL, -- e.g., 12.50 for 12.50%
    min_stake_arix NUMERIC(20, 9) DEFAULT 0, -- Assuming ARIX has 9 decimals
    max_stake_arix NUMERIC(20, 9),
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS user_stakes (
    stake_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_wallet_address VARCHAR(68) NOT NULL REFERENCES users(wallet_address),
    staking_plan_id INTEGER NOT NULL REFERENCES staking_plans(plan_id),
    arix_amount_staked NUMERIC(20, 9) NOT NULL, -- Stored in human-readable form, converted from smallest units
    usdt_value_at_stake_time NUMERIC(20, 6) NOT NULL, -- Assuming USDT has 6 decimals for display/calculation consistency
    stake_timestamp TIMESTAMP WITH TIME ZONE NOT NULL,
    unlock_timestamp TIMESTAMP WITH TIME ZONE NOT NULL,
    onchain_stake_tx_boc TEXT, -- Store the BOC or tx hash
    status VARCHAR(20) NOT NULL DEFAULT 'active', -- e.g., 'active', 'unstaked', 'early_unstaked', 'completed'
    usdt_reward_calculated NUMERIC(20, 6),
    usdt_reward_paid NUMERIC(20, 6) DEFAULT 0,
    onchain_unstake_tx_boc TEXT,
    onchain_reward_payout_tx_hash TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_user_stakes_wallet_address ON user_stakes(user_wallet_address);
CREATE INDEX IF NOT EXISTS idx_user_stakes_status ON user_stakes(status);

-- You might want a table for game history, tasks, etc. later

-- Example Staking Plan Data (insert manually or via a seed script)
-- INSERT INTO staking_plans (plan_key, title, duration_days, apr_percent, min_stake_arix) VALUES
-- ('QUICK_30D', 'Quick Boost', 30, 8.00, 100),
-- ('STEADY_90D', 'Steady Growth', 90, 12.00, 500),
-- ('LONG_180D', 'Long Haul', 180, 18.00, 1000);

EOF
echo "Created db_migrations/001_initial_schema.sql (Run this manually against your DB)"


# 8. Create src/routes/earnRoutes.js
cat << 'EOF' > ./src/routes/earnRoutes.js
const express = require('express');
const earnController = require('../controllers/earnController');

const router = express.Router();

router.get('/config', earnController.getStakingConfig);
router.post('/stake', earnController.recordUserStake);
router.get('/stakes/:userWalletAddress', earnController.getUserStakes);
router.post('/initiate-unstake', earnController.initiateUnstake); // New: User requests to unstake
router.post('/confirm-unstake', earnController.confirmUnstakeAndProcessRewards); // User confirms on-chain unstake

module.exports = router;
EOF
echo "Created src/routes/earnRoutes.js"

# 9. Create src/controllers/earnController.js
cat << 'EOF' > ./src/controllers/earnController.js
const earnService = require('../services/earnService');
const priceService = require('../services/priceService');
const { ARIX_TOKEN_MASTER_ADDRESS, USDT_REWARD_JETTON_MASTER_ADDRESS, STAKING_CONTRACT_ADDRESS } = require('../config/envConfig');


exports.getStakingConfig = async (req, res, next) => {
    try {
        const plans = await earnService.getActiveStakingPlans();
        const config = {
            stakingContractAddress: STAKING_CONTRACT_ADDRESS,
            arxToken: {
                masterAddress: ARIX_TOKEN_MASTER_ADDRESS,
                decimals: 9, // Standard for Jettons like ARIX
            },
            usdtRewardToken: {
                masterAddress: USDT_REWARD_JETTON_MASTER_ADDRESS,
                name: "jUSDT (example)", // This could be fetched from Jetton metadata
                decimals: 6, // Standard for jUSDT
            },
            stakingPlans: plans.map(p => ({
                key: p.plan_key, // For frontend key
                id: p.plan_id,
                title: p.title,
                durationDays: p.duration_days,
                aprPercent: parseFloat(p.apr_percent), // Ensure it's a number
                minStakeArix: parseFloat(p.min_stake_arix)
            })),
        };
        res.status(200).json(config);
    } catch (error) {
        next(error);
    }
};

exports.recordUserStake = async (req, res, next) => {
    try {
        const { planKey, arixAmount, userWalletAddress, transactionBoc } = req.body;
        if (!planKey || !arixAmount || !userWalletAddress || !transactionBoc) {
            return res.status(400).json({ message: "Missing required stake information." });
        }

        const arxUsdtPrice = await priceService.getArxUsdtPrice();
        if (arxUsdtPrice === null) { // Check for null specifically if getArxUsdtPrice can return it
             console.warn("Could not fetch ARIX/USDT price. Staking recorded without USDT value.");
             // Potentially allow staking but flag it, or deny. For now, let's use a default or error.
             // return res.status(503).json({ message: "Service unavailable: Could not fetch ARIX/USDT price." });
        }
        // Ensure arixAmount is a number
        const numericArixAmount = parseFloat(arixAmount);
        if (isNaN(numericArixAmount)) {
            return res.status(400).json({ message: "Invalid ARIX amount."});
        }

        const usdtValueAtStakeTime = arxUsdtPrice !== null ? numericArixAmount * arxUsdtPrice : 0;


        // TODO: Backend verification of transactionBoc against TON blockchain.
        // This involves decoding the BOC, checking sender, recipient (staking contract's jetton wallet), amount.
        // This is a critical security step.

        const newStake = await earnService.createStake({
            planKey,
            arixAmount: numericArixAmount,
            userWalletAddress,
            transactionBoc,
            usdtValueAtStakeTime,
        });

        res.status(201).json({ message: "Stake recorded successfully. Awaiting on-chain confirmation processing.", stake: newStake });
    } catch (error) {
        console.error("CTRL: Error recording stake:", error);
        next(error);
    }
};

exports.getUserStakes = async (req, res, next) => {
    try {
        const { userWalletAddress } = req.params;
        const stakes = await earnService.findActiveStakesByUserWithDetails(userWalletAddress);
        res.status(200).json(stakes);
    } catch (error) {
        next(error);
    }
};

exports.initiateUnstake = async (req, res, next) => {
    try {
        const { userWalletAddress, stakeId } = req.body;
        if (!userWalletAddress || !stakeId) {
            return res.status(400).json({ message: "User wallet address and stake ID are required." });
        }
        // This service method would check if the stake can be unstaked,
        // calculate any early unstake penalties based on policy, etc.
        // It might return information the user needs to confirm the unstake on-chain.
        // For now, let's assume it just acknowledges.
        const result = await earnService.prepareUnstake(userWalletAddress, stakeId);
        res.status(200).json(result); // e.g., { message: "Unstake initiated, proceed with on-chain transaction.", details: {...} }
    } catch (error) {
        next(error);
    }
};

exports.confirmUnstakeAndProcessRewards = async (req, res, next) => {
    try {
        const { userWalletAddress, stakeId, unstakeTransactionBoc } = req.body;
        if (!userWalletAddress || !stakeId || !unstakeTransactionBoc) {
            return res.status(400).json({ message: "Missing required unstake confirmation information." });
        }

        // TODO: Backend verification of unstakeTransactionBoc.

        const result = await earnService.finalizeUnstakeAndPayRewards(userWalletAddress, stakeId, unstakeTransactionBoc);
        res.status(200).json(result); // e.g., { message: "Unstake confirmed and rewards processed.", rewardPaid: 1.23 }
    } catch (error) {
        next(error);
    }
};
EOF
echo "Created src/controllers/earnController.js"

# 10. Create src/services/earnService.js
cat << 'EOF' > ./src/services/earnService.js
const db = require('../config/database');
const { USDT_TREASURY_WALLET_MNEMONIC } = require('../config/envConfig');
const { getKeyPairFromSeed } = require('@ton/crypto'); // For treasury wallet
const { WalletContractV4, TonClient, Address, Cell, toNano, fromNano, internal } = require("@ton/ton");
const { getHttpEndpoint } = require("@orbs-network/ton-access");
const { createJettonTransferMessage, getJettonWalletAddress } = require('../utils/tonUtils'); // Assuming tonUtils.js exists

const ARIX_DECIMALS = 9;
const USDT_DECIMALS = 6; // Common for jUSDT

class EarnService {
    async getActiveStakingPlans() {
        const { rows } = await db.query("SELECT * FROM staking_plans WHERE is_active = TRUE ORDER BY duration_days ASC");
        return rows;
    }

    async createStake({ planKey, arixAmount, userWalletAddress, transactionBoc, usdtValueAtStakeTime }) {
        const plans = await this.getActiveStakingPlans();
        const plan = plans.find(p => p.plan_key === planKey);

        if (!plan) throw new Error("Invalid staking plan key.");

        const stakeTimestamp = new Date();
        const unlockTimestamp = new Date(stakeTimestamp.getTime() + plan.duration_days * 24 * 60 * 60 * 1000);

        const { rows } = await db.query(
            `INSERT INTO user_stakes (user_wallet_address, staking_plan_id, arix_amount_staked, usdt_value_at_stake_time, stake_timestamp, unlock_timestamp, onchain_stake_tx_boc, status)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
            [userWalletAddress, plan.plan_id, arixAmount, usdtValueAtStakeTime, stakeTimestamp, unlockTimestamp, transactionBoc, 'pending_confirmation'] // Status 'pending_confirmation' until backend verifies tx
        );
        return rows[0];
    }

    async findActiveStakesByUserWithDetails(userWalletAddress) {
        const query = `
            SELECT 
                us.stake_id,
                sp.title AS plan_title,
                sp.duration_days AS plan_duration_days,
                sp.apr_percent AS plan_apr_percent,
                us.arix_amount_staked,
                us.usdt_value_at_stake_time,
                us.stake_timestamp,
                us.unlock_timestamp,
                us.status,
                (us.unlock_timestamp - NOW()) AS time_remaining_interval,
                (EXTRACT(EPOCH FROM (us.unlock_timestamp - NOW())) / (24 * 60 * 60))::INTEGER AS remaining_days
            FROM user_stakes us
            JOIN staking_plans sp ON us.staking_plan_id = sp.plan_id
            WHERE us.user_wallet_address = $1 AND us.status = 'active' -- Or include 'pending_confirmation'
            ORDER BY us.stake_timestamp DESC;
        `;
        const { rows } = await db.query(query, [userWalletAddress]);
        
        return rows.map(row => ({
            ...row,
            // Calculate accrued reward conceptually (actual calculation might be more complex)
            // This is a simplified linear accrual for display. Real accrual happens at unstake.
            accruedReward: row.status === 'active' ? 
                (parseFloat(row.usdt_value_at_stake_time) * (parseFloat(row.plan_apr_percent) / 100) * ((new Date() - new Date(row.stake_timestamp)) / (1000 * 60 * 60 * 24))) / row.plan_duration_days 
                : 0,
            arixAmountStaked: parseFloat(row.arix_amount_staked),
            usdtValueAtStakeTime: parseFloat(row.usdt_value_at_stake_time)
        }));
    }
    
    async prepareUnstake(userWalletAddress, stakeId) {
        const { rows } = await db.query("SELECT * FROM user_stakes WHERE stake_id = $1 AND user_wallet_address = $2", [stakeId, userWalletAddress]);
        if (rows.length === 0) throw new Error("Stake not found or not owned by user.");
        const stake = rows[0];

        if (stake.status !== 'active') throw new Error(`Stake is not active. Current status: ${stake.status}`);

        const now = new Date();
        const unlockTime = new Date(stake.unlock_timestamp);
        let earlyUnstakePenaltyPercent = 0; // Read from config or plan
        let message = "Ready to unstake.";

        if (now < unlockTime) {
            // Apply early unstake policy
            earlyUnstakePenaltyPercent = 2.0; // Example: 2% penalty on ARIX
            message = `Early unstake: A ${earlyUnstakePenaltyPercent}% penalty on staked ARIX will apply. All accrued USDT rewards will be forfeited.`;
        }
        // The actual unstake transaction will be initiated by the user on the frontend,
        // calling the staking smart contract. This backend step is for pre-validation.
        return { 
            message, 
            stakeId: stake.stake_id, 
            isEarly: now < unlockTime, 
            penaltyPercent: earlyUnstakePenaltyPercent 
        };
    }

    async finalizeUnstakeAndPayRewards(userWalletAddress, stakeId, unstakeTransactionBoc) {
        // 1. Verify unstakeTransactionBoc on-chain (IMPORTANT)
        // This involves ensuring the user successfully called the unstake method on your staking contract
        // and that the ARIX was returned (or penalized amount).

        // 2. Fetch stake details from DB
        const { rows } = await db.query(
            "SELECT us.*, sp.apr_percent, sp.duration_days FROM user_stakes us JOIN staking_plans sp ON us.staking_plan_id = sp.plan_id WHERE us.stake_id = $1 AND us.user_wallet_address = $2",
            [stakeId, userWalletAddress]
        );
        if (rows.length === 0) throw new Error("Stake not found for finalization.");
        const stake = rows[0];

        if (stake.status !== 'active' && stake.status !== 'pending_unstake') { // Assuming a 'pending_unstake' status
             throw new Error(`Stake status (${stake.status}) does not allow finalization.`);
        }

        // 3. Calculate USDT rewards
        let usdtRewardAmount = 0;
        const now = new Date();
        const unlockTime = new Date(stake.unlock_timestamp);
        const stakeTime = new Date(stake.stake_timestamp);

        if (now >= unlockTime) { // Standard unstake, full term completed
            const daysStaked = stake.duration_days; // Use full plan duration
            usdtRewardAmount = (parseFloat(stake.usdt_value_at_stake_time) * (parseFloat(stake.apr_percent) / 100) * daysStaked) / 365; // Simple APR calculation
        } else {
            // Early unstake: As per policy, rewards are forfeited
            usdtRewardAmount = 0; 
        }
        
        usdtRewardAmount = parseFloat(usdtRewardAmount.toFixed(USDT_DECIMALS)); // Ensure correct precision

        // 4. Update stake in DB
        const newStatus = (now < unlockTime) ? 'early_unstaked' : 'completed';
        await db.query(
            "UPDATE user_stakes SET status = $1, usdt_reward_calculated = $2, onchain_unstake_tx_boc = $3, updated_at = NOW() WHERE stake_id = $4",
            [newStatus, usdtRewardAmount, unstakeTransactionBoc, stakeId]
        );

        // 5. Securely trigger USDT payout from treasury (if rewardAmount > 0)
        let payoutTxHash = null;
        if (usdtRewardAmount > 0) {
            console.log(`Initiating payout of ${usdtRewardAmount} USDT to ${userWalletAddress}`);
            try {
                payoutTxHash = await this.sendUsdtFromTreasury(userWalletAddress, usdtRewardAmount);
                await db.query(
                    "UPDATE user_stakes SET usdt_reward_paid = $1, onchain_reward_payout_tx_hash = $2 WHERE stake_id = $3",
                    [usdtRewardAmount, payoutTxHash, stakeId]
                );
                 console.log(`USDT Payout successful for stake ${stakeId}, tx: ${payoutTxHash}`);
            } catch (payoutError) {
                console.error(`CRITICAL: USDT Payout FAILED for stake ${stakeId} to ${userWalletAddress} for ${usdtRewardAmount} USDT:`, payoutError);
                // Implement retry mechanism or manual alert system
                // For now, just log, but this needs robust handling
            }
        }

        return {
            message: `Unstake finalized. Status: ${newStatus}. USDT Reward: ${usdtRewardAmount}.`,
            usdtRewardPaid: usdtRewardAmount,
            payoutTransactionHash: payoutTxHash
        };
    }

    async sendUsdtFromTreasury(recipientAddress, amountUsdt) {
        if (!USDT_TREASURY_WALLET_MNEMONIC) {
            console.error("CRITICAL: USDT_TREASURY_WALLET_MNEMONIC is not set. Cannot process payout.");
            throw new Error("Treasury wallet not configured for payouts.");
        }
        if (amountUsdt <= 0) {
            console.log("No USDT reward to pay out.");
            return null;
        }

        const client = new TonClient({ endpoint: await getHttpEndpoint({ network: process.env.TON_NETWORK || 'testnet' }) });
        const mnemonicArray = USDT_TREASURY_WALLET_MNEMONIC.split(" ");
        const keyPair = await getKeyPairFromSeed(mnemonicArray);
        
        const workchain = 0; // Usually 0 for masterchain
        const treasuryWallet = WalletContractV4.create({ workchain, publicKey: keyPair.publicKey });
        const contract = client.open(treasuryWallet);

        const treasuryUsdtJettonWalletAddress = await getJettonWalletAddress(treasuryWallet.address.toString(), process.env.USDT_REWARD_JETTON_MASTER_ADDRESS);
        if (!treasuryUsdtJettonWalletAddress) {
            throw new Error("Treasury does not have a USDT Jetton Wallet or it could not be found.");
        }

        const amountInSmallestUnits = BigInt(Math.round(amountUsdt * (10**USDT_DECIMALS)));

        const transferMessage = createJettonTransferMessage(
            amountInSmallestUnits,
            recipientAddress, // Recipient is the user
            treasuryWallet.address.toString(), // Response address is treasury itself
            toNano('0.05'), // Forward amount for the recipient's jetton wallet to process
            null // No specific forward payload for a simple user payout
        );

        const seqno = await contract.getSeqno();
        const result = await contract.sendTransfer({
            seqno: seqno,
            secretKey: keyPair.secretKey,
            messages: [
                internal({
                    to: Address.parse(treasuryUsdtJettonWalletAddress),
                    value: toNano('0.1'), // Value to send to treasury's jetton wallet for its own gas + forward
                    body: transferMessage,
                    bounce: true,
                })
            ]
        });
        
        // Note: sendTransfer doesn't directly return tx hash.
        // You'd typically monitor the treasury wallet's transactions externally or wait for seqno to increment.
        // For simplicity, we're not implementing full tx hash retrieval here.
        console.log(`USDT transfer message sent from treasury for seqno ${seqno}. Recipient: ${recipientAddress}, Amount: ${amountUsdt} USDT`);
        return `simulated_treasury_payout_seqno_${seqno}`; // Placeholder for actual tx hash
    }
}

module.exports = new EarnService();
EOF
echo "Created src/services/earnService.js"

# 11. Create src/services/priceService.js
cat << 'EOF' > ./src/services/priceService.js
const axios = require('axios');
const { ARIX_TOKEN_MASTER_ADDRESS } = require('../config/envConfig');

const STONFI_API_BASE_URL = "https://api.ston.fi/v1";

class PriceService {
    async getArxUsdtPrice() {
        if (!ARIX_TOKEN_MASTER_ADDRESS) {
            console.error("ARIX_TOKEN_MASTER_ADDRESS is not set in environment variables.");
            return null;
        }
        try {
            // STON.fi API endpoint for asset price (check their docs for current structure)
            // This might be /assets/{jetton_master_address} or require querying a specific ARIX/jUSDT pool
            const response = await axios.get(`${STONFI_API_BASE_URL}/assets/${ARIX_TOKEN_MASTER_ADDRESS}`);
            
            // The actual path to price in STON.fi response can vary.
            // Example: response.data.price_usd or response.data.asset_data.price_usd
            // Or if it's a pool: response.data.token0_price_in_token1 etc.
            // This needs to be verified against live STON.fi API response for ARIX.
            let price = null;
            if (response.data && response.data.price_usd) {
                 price = parseFloat(response.data.price_usd);
            } else if (response.data && response.data.asset_data && response.data.asset_data.price_usd) {
                price = parseFloat(response.data.asset_data.price_usd);
            } else if (response.data && response.data.dex_price_usd) { // Another common field name
                price = parseFloat(response.data.dex_price_usd);
            }
             // Add more checks based on actual STON.fi response structure for ARIX

            if (price !== null && !isNaN(price)) {
                return price;
            } else {
                console.warn("Could not extract ARIX price from STON.fi response structure:", response.data);
                // Fallback if live price cannot be determined, log this issue.
                // For dev, you might return a known test price, but in prod, this is an error.
                return 0.00321; // Last known example, VERY BAD for production.
            }
        } catch (error) {
            console.error("Error fetching ARIX/USDT price from STON.fi:", error.message);
            if (error.response) {
                console.error("STON.fi API Error Response Data:", error.response.data);
            }
            // Fallback or throw error
            return null; // Indicate failure to get price
        }
    }
}

module.exports = new PriceService();
EOF
echo "Created src/services/priceService.js"

# 12. Create src/config/envConfig.js to manage environment variables
cat << 'EOF' > ./src/config/envConfig.js
require('dotenv').config();

module.exports = {
    PORT: process.env.PORT || 3001,
    TON_NETWORK: process.env.TON_NETWORK || "testnet",
    TON_ACCESS_API_KEY: process.env.TON_ACCESS_API_KEY,
    ARIX_TOKEN_MASTER_ADDRESS: process.env.ARIX_TOKEN_MASTER_ADDRESS,
    USDT_REWARD_JETTON_MASTER_ADDRESS: process.env.USDT_REWARD_JETTON_MASTER_ADDRESS,
    STAKING_CONTRACT_ADDRESS: process.env.STAKING_CONTRACT_ADDRESS,
    POSTGRES_URL: process.env.POSTGRES_URL,
    USDT_TREASURY_WALLET_MNEMONIC: process.env.USDT_TREASURY_WALLET_MNEMONIC,
    FRONTEND_URL: process.env.FRONTEND_URL || 'http://localhost:5173', // Default Vite dev port
    LOG_LEVEL: process.env.LOG_LEVEL || 'info',
};
EOF
echo "Created src/config/envConfig.js"

# 13. Create src/utils/tonUtils.js (if not already created by frontend script, or to ensure it's here)
mkdir -p ./src/utils
cat << 'EOF' > ./src/utils/tonUtils.js
const { TonClient, Address, Cell, toNano, fromNano, internal } = require("@ton/ton");
const { getHttpEndpoint } = require("@orbs-network/ton-access");
const { TON_NETWORK, TON_ACCESS_API_KEY } = require('../config/envConfig');

async function getTonClient() {
  const endpointOptions = { network: TON_NETWORK };
  if (TON_ACCESS_API_KEY) {
    endpointOptions.apiKey = TON_ACCESS_API_KEY;
  }
  const endpoint = await getHttpEndpoint(endpointOptions);
  return new TonClient({ endpoint });
}

async function getJettonWalletAddress(ownerAddressString, jettonMasterAddressString) {
  if (!ownerAddressString || !jettonMasterAddressString) {
    console.warn("getJettonWalletAddress: Missing owner or master address.");
    return null;
  }
  try {
    const client = await getTonClient();
    const masterAddress = Address.parse(jettonMasterAddressString);
    const owner = Address.parse(ownerAddressString);

    const result = await client.runMethod(
      masterAddress,
      "get_wallet_address",
      [{ type: "slice", cell: new Cell().asBuilder().storeAddress(owner).endCell() }]
    );
    return result.stack.readAddress().toString({ bounceable: true, testOnly: TON_NETWORK === 'testnet' });
  } catch (error) {
    // console.error(`Error getting Jetton wallet for owner ${ownerAddressString} and master ${jettonMasterAddressString}:`, error.message);
    return null;
  }
}

function createJettonTransferMessage(
  jettonAmount, // BigInt, in smallest units
  toAddressString,    // string, recipient's main address (e.g. staking contract)
  responseAddressString, // string, where to send response/refunds (user's main address)
  forwardTonAmount = toNano("0.05"), // Amount of TON to forward for gas
  forwardPayload = null // Cell, optional custom payload for the recipient
) {
  const body = new Cell();
  body.bits.writeUint(0x0f8a7ea5, 32); // op-code for jetton transfer
  body.bits.writeUint(Date.now(), 64); // query_id (can be anything, using timestamp for some uniqueness)
  body.bits.writeCoins(jettonAmount);
  body.bits.writeAddress(Address.parse(toAddressString));
  body.bits.writeAddress(Address.parse(responseAddressString));
  
  body.bits.writeBit(0); // No custom_payload for this basic transfer to staking contract

  body.bits.writeCoins(forwardTonAmount);

  if (forwardPayload instanceof Cell && !forwardPayload.isExotic && forwardPayload.refs.length <= 1 && forwardPayload.bits.length <= (1023 - 1 - 1 - 32 - 64 - 267 - 267 - 1 - 124)) { // Basic check
    body.bits.writeBit(0); // Store forward_payload inline if it fits
    body.bits.writeCell(forwardPayload);
  } else if (forwardPayload instanceof Cell) {
    body.bits.writeBit(1); // Store as a reference
    body.refs.push(forwardPayload);
  } else {
    body.bits.writeBit(0); // No forward_payload
  }
  
  return body;
}


module.exports = { 
    getTonClient, 
    getJettonWalletAddress,
    createJettonTransferMessage
};
EOF
echo "Created src/utils/tonUtils.js"


echo ""
echo "Backend structure and boilerplate generated successfully in 'ar_terminal/backend'."
echo "Next Steps:"
echo "1. Run 'npm install' or 'yarn install' in 'ar_terminal/backend' to install dependencies."
echo "2. Create a '.env' file in 'ar_terminal/backend' based on '.env.example' and fill in your actual values."
echo "   - Set up Vercel Postgres and get the POSTGRES_URL."
echo "   - Provide your USDT Treasury Wallet Mnemonic (VERY SENSITIVE, manage securely in Vercel env vars for deployment)."
echo "   - Provide your deployed STAKING_CONTRACT_ADDRESS and USDT_REWARD_JETTON_MASTER_ADDRESS."
echo "3. Manually run the SQL schema in 'db_migrations/001_initial_schema.sql' against your PostgreSQL database."
echo "4. Implement the TODOs in the service files, especially for on-chain transaction verification and secure treasury operations."
echo "5. Test thoroughly, starting with 'npm run dev'."
echo "6. Deploy to Vercel by connecting your Git repository and configuring environment variables in Vercel project settings."

