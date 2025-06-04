

const ARIX_DECIMALS = 9;
const USDT_DECIMALS = 6; // Standard for jUSDT or most USDT variants
const USD_DECIMALS = 2; // For displaying USD values if needed in logs/admin

const TON_TRANSACTION_FEES = { // Approximate fees in nanoTONs
    JETTON_TRANSFER_FROM_WALLET: 150000000, // ~0.15 TON (includes gas for JW + fwd fee for recipient JW)
    WALLET_DEPLOYMENT: 5000000,          // ~0.005 TON if wallet not yet deployed
    BASE_JETTON_PAYOUT_PROCESSING: 100000000, // ~0.1 TON for the main wallet to send to its Jetton Wallet
    USDT_WITHDRAWAL_MIN_TON_BALANCE: 200000000, // ~0.2 TON (ensure payout wallet has enough for fees)
};

const MIN_USDT_WITHDRAWAL_USD_VALUE = 3; // Minimum $3 USDT for withdrawal

// OP Codes for TEP-74 Jetton standard (used in verification if needed)
const OP_JETTON_TRANSFER = 0x0f8a7ea5;
const OP_JETTON_INTERNAL_TRANSFER = 0x178d4519;
const OP_JETTON_TRANSFER_NOTIFICATION = 0x7362d09c;

module.exports = {
    ARIX_DECIMALS,
    USDT_DECIMALS,
    USD_DECIMALS,
    TON_TRANSACTION_FEES,
    MIN_USDT_WITHDRAWAL_USD_VALUE,
    OP_JETTON_TRANSFER,
    OP_JETTON_INTERNAL_TRANSFER,
    OP_JETTON_TRANSFER_NOTIFICATION,
};