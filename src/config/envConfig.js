require('dotenv').config();

module.exports = {
    PORT: process.env.PORT || 3001,
    TON_NETWORK: process.env.TON_NETWORK || "testnet",
    TON_ACCESS_API_KEY: process.env.TON_ACCESS_API_KEY,
    ARIX_TOKEN_MASTER_ADDRESS: process.env.ARIX_TOKEN_MASTER_ADDRESS || "EQCLU6KIPjZJbhyYlRfENc3nQck2DWulsUq2gJPyWEK9wfDd",
    // USDT_REWARD_JETTON_MASTER_ADDRESS: process.env.USDT_REWARD_JETTON_MASTER_ADDRESS, // Not directly used for ARIX rewards
    STAKING_CONTRACT_ADDRESS: process.env.STAKING_CONTRACT_ADDRESS,
    POSTGRES_URL: process.env.POSTGRES_URL,
    // USDT_TREASURY_WALLET_MNEMONIC: process.env.USDT_TREASURY_WALLET_MNEMONIC, // Not used for ARIX rewards
    FRONTEND_URL: process.env.FRONTEND_URL || 'http://localhost:5173',
    LOG_LEVEL: process.env.LOG_LEVEL || 'info',
};
