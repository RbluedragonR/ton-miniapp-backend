require('dotenv').config();

module.exports = {
    PORT: process.env.PORT || 3001,
    NODE_ENV: process.env.NODE_ENV || 'development', // Added NODE_ENV
    TON_NETWORK: process.env.TON_NETWORK || "testnet", // Ensure this is 'testnet' or 'mainnet'
    TON_ACCESS_API_KEY: process.env.TON_ACCESS_API_KEY, // Optional, for orbs-network/ton-access

    ARIX_TOKEN_MASTER_ADDRESS: process.env.ARIX_TOKEN_MASTER_ADDRESS || "EQCLU6KIPjZJbhyYlRfENc3nQck2DWulsUq2gJPyWEK9wfDd", // Example ARIX
    
    // USDT Configuration (CRITICAL for Payouts)
    USDT_REWARD_JETTON_MASTER_ADDRESS: process.env.USDT_REWARD_JETTON_MASTER_ADDRESS, // e.g., Address of jUSDT or your USDT variant
    BACKEND_USDT_WALLET_ADDRESS: process.env.BACKEND_USDT_WALLET_ADDRESS, // The backend's public wallet address holding USDT
    BACKEND_USDT_WALLET_MNEMONIC: process.env.BACKEND_USDT_WALLET_MNEMONIC, // MNEMONIC for the backend's USDT payout wallet - KEEP THIS SECRET AND SECURE
    
    STAKING_CONTRACT_ADDRESS: process.env.STAKING_CONTRACT_ADDRESS,
    STAKING_CONTRACT_JETTON_WALLET_ADDRESS: process.env.STAKING_CONTRACT_JETTON_WALLET_ADDRESS, // ARIX Staking SC's Jetton Wallet

    POSTGRES_URL: process.env.POSTGRES_URL,
    
    FRONTEND_URL: process.env.FRONTEND_URL || 'http://localhost:5173',
    LOG_LEVEL: process.env.LOG_LEVEL || 'info',
    CRON_SECRET: process.env.CRON_SECRET, // For securing cron job endpoint
};