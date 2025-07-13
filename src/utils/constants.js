// ar_backend/src/utils/constants.js
const BOT_COMMANDS = {
  START: 'start',
  GAMES: 'games',
  EARN: 'earn',
  REFER: 'refer',
  TASKS: 'tasks',
  WALLET: 'wallet',
  PUSH: 'push',
};

// Payout multipliers for Plinko based on rows and risk
// Index corresponds to the bucket the ball falls into
const PLINKO_MULTIPLIERS = {
    8: {
        low: [5.6, 2.1, 1.1, 1, 0.5, 1, 1.1, 2.1, 5.6],
        medium: [13, 3, 1.3, 0.7, 0.4, 0.7, 1.3, 3, 13],
        high: [29, 4, 1.5, 0.5, 0.3, 0.5, 1.5, 4, 29]
    },
    10: {
        low: [8.9, 3, 1.4, 1.1, 1, 0.5, 1, 1.1, 1.4, 3, 8.9],
        medium: [22, 5, 2, 1.1, 0.6, 0.5, 0.6, 1.1, 2, 5, 22],
        high: [76, 10, 3, 1, 0.5, 0.3, 0.5, 1, 3, 10, 76]
    },
    12: {
        low: [15, 4, 1.9, 1.2, 1, 1, 0.5, 1, 1, 1.2, 1.9, 4, 15],
        medium: [38, 9, 3, 1.5, 0.9, 0.6, 0.4, 0.6, 0.9, 1.5, 3, 9, 38],
        high: [170, 18, 6, 2, 1, 0.5, 0.3, 0.5, 1, 2, 6, 18, 170]
    },
    14: {
        low: [18, 5, 3, 1.5, 1.2, 1.1, 1, 0.5, 1, 1.1, 1.2, 1.5, 3, 5, 18],
        medium: [56, 15, 6, 3, 1.4, 0.8, 0.6, 0.4, 0.6, 0.8, 1.4, 3, 6, 15, 56],
        high: [350, 40, 12, 5, 1.5, 0.7, 0.5, 0.3, 0.5, 0.7, 1.5, 5, 12, 40, 350]
    },
    16: {
        low: [22, 8, 4, 2, 1.6, 1.2, 1.1, 1, 0.5, 1, 1.1, 1.2, 1.6, 2, 4, 8, 22],
        medium: [110, 25, 10, 5, 2, 1, 0.7, 0.5, 0.4, 0.5, 0.7, 1, 2, 5, 10, 25, 110],
        high: [1000, 130, 30, 10, 4, 1.5, 0.5, 0.4, 0.3, 0.4, 0.5, 1.5, 4, 10, 30, 130, 1000]
    }
};

// --- On-Chain & Token Specific Constants ---
const OXYBLE_DECIMALS = 9;
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
  BOT_COMMANDS,
  PLINKO_MULTIPLIERS,
  OXYBLE_DECIMALS,
  USDT_DECIMALS,
  USD_DECIMALS,
  TON_TRANSACTION_FEES,
  MIN_USDT_WITHDRAWAL_USD_VALUE,
  OP_JETTON_TRANSFER,
  OP_JETTON_INTERNAL_TRANSFER,
  OP_JETTON_TRANSFER_NOTIFICATION,
};
