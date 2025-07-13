
require('dotenv').config();

module.exports = {
    PORT: process.env.PORT || 3001,
    NODE_ENV: process.env.NODE_ENV || 'development',
    TON_NETWORK: process.env.TON_NETWORK || "mainnet", 
    TON_ACCESS_API_KEY: process.env.TON_ACCESS_API_KEY, 

    
    OXYBLE_TOKEN_MASTER_ADDRESS: process.env.OXYBLE_TOKEN_MASTER_ADDRESS || "EQCLU6KIPjZJbhyYlRfENc3nQck2DWulsUq2gJPyWEK9wfDd", 
    STAKING_CONTRACT_ADDRESS: process.env.STAKING_CONTRACT_ADDRESS, 
    STAKING_CONTRACT_JETTON_WALLET_ADDRESS: process.env.STAKING_CONTRACT_JETTON_WALLET_ADDRESS, 

    
    
    USDT_JETTON_MASTER_ADDRESS: process.env.USDT_JETTON_MASTER_ADDRESS,
    
    BACKEND_USDT_WALLET_ADDRESS: process.env.BACKEND_USDT_WALLET_ADDRESS,
    
    BACKEND_USDT_WALLET_MNEMONIC: process.env.BACKEND_USDT_WALLET_MNEMONIC,

    
    POSTGRES_URL: process.env.POSTGRES_URL,

    
    FRONTEND_URL: process.env.FRONTEND_URL || 'http://localhost:5173',
    TELEGRAM_BOT_TOKEN: process.env.TELEGRAM_BOT_TOKEN,
    TMA_URL: process.env.FRONTEND_URL || 'https://tma-frontend-gray.vercel.app', 

    
    LOG_LEVEL: process.env.LOG_LEVEL || 'info',
    CRON_SECRET: process.env.CRON_SECRET, 
};