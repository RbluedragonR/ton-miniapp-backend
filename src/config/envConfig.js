// File: ar_backend/src/config/envConfig.js
require('dotenv').config();

module.exports = {
    PORT: process.env.PORT || 3001,
    NODE_ENV: process.env.NODE_ENV || 'development',
    TON_NETWORK: process.env.TON_NETWORK || "mainnet", // 'testnet' or 'mainnet'
    TON_ACCESS_API_KEY: process.env.TON_ACCESS_API_KEY, // Optional, for orbs-network/ton-access

    // ARIX Token and Staking Contract (for ARIX principal)
    ARIX_TOKEN_MASTER_ADDRESS: process.env.ARIX_TOKEN_MASTER_ADDRESS || "EQCLU6KIPjZJbhyYlRfENc3nQck2DWulsUq2gJPyWEK9wfDd", // Your ARIX Jetton Master
    STAKING_CONTRACT_ADDRESS: process.env.STAKING_CONTRACT_ADDRESS, // Your ARIX Staking Smart Contract address
    STAKING_CONTRACT_JETTON_WALLET_ADDRESS: process.env.STAKING_CONTRACT_JETTON_WALLET_ADDRESS, // ARIX Staking SC's ARIX Jetton Wallet

    // USDT Configuration (CRITICAL for Rewards & Payouts)
    // Ensure this is the master address of the USDT Jetton you will use for rewards (e.g., jUSDT on TON)
    USDT_JETTON_MASTER_ADDRESS: process.env.USDT_JETTON_MASTER_ADDRESS,
    // Your backend's wallet that holds USDT for payouts
    BACKEND_USDT_WALLET_ADDRESS: process.env.BACKEND_USDT_WALLET_ADDRESS,
    // MNEMONIC for the backend's USDT payout wallet - KEEP THIS SECRET AND SECURE
    BACKEND_USDT_WALLET_MNEMONIC: process.env.BACKEND_USDT_WALLET_MNEMONIC,

    // Database
    POSTGRES_URL: process.env.POSTGRES_URL,

    // Frontend & Bot
    FRONTEND_URL: process.env.FRONTEND_URL || 'http://localhost:5173',
    TELEGRAM_BOT_TOKEN: process.env.TELEGRAM_BOT_TOKEN,
    TMA_URL: process.env.TMA_URL || 'https://your-tma-frontend-url.vercel.app', // Your deployed TMA frontend URL for referral links

    // Misc
    LOG_LEVEL: process.env.LOG_LEVEL || 'info',
    CRON_SECRET: process.env.CRON_SECRET, // For securing cron job endpoint
};