// ar_backend/src/services/swapService.js
const pool = require('../config/database');
const userService = require('./userService');

// In a real app, this would come from a price feed API.
const OXYBLE_TO_USDT_RATE = 1.5;
const OXYBLE_TO_TON_RATE = 0.25;
const USDT_TO_TON_RATE = 0.15;

class SwapService {
    getSwapRate(from, to) {
        if (from === 'OXYBLE' && to === 'USDT') return OXYBLE_TO_USDT_RATE;
        if (from === 'USDT' && to === 'OXYBLE') return 1 / OXYBLE_TO_USDT_RATE;
        if (from === 'OXYBLE' && to === 'TON') return OXYBLE_TO_TON_RATE;
        if (from === 'TON' && to === 'OXYBLE') return 1 / OXYBLE_TO_TON_RATE;
        if (from === 'USDT' && to === 'TON') return USDT_TO_TON_RATE;
        if (from === 'TON' && to === 'USDT') return 1 / USDT_TO_TON_RATE;
        return null;
    }

    async executeSwap({ userWalletAddress, fromCurrency, toCurrency, fromAmount }) {
        const rate = this.getSwapRate(fromCurrency, toCurrency);
        if (rate === null || fromCurrency === toCurrency) {
            throw new Error('Invalid swap pair');
        }

        const fromAmountFloat = parseFloat(fromAmount);
        if (isNaN(fromAmountFloat) || fromAmountFloat <= 0) {
            throw new Error('Invalid amount');
        }

        const client = await pool.getClient();
        try {
            await client.query('BEGIN');

            const toAmount = fromAmountFloat * rate;
            
            const balanceUpdates = {};
            balanceUpdates[fromCurrency] = -fromAmountFloat;
            balanceUpdates[toCurrency] = toAmount;
            
            // Use the centralized, transaction-aware balance update function
            await userService.updateUserBalances(userWalletAddress, balanceUpdates, 'swap', {
                from: `${fromAmountFloat} ${fromCurrency}`,
                to: `${toAmount.toFixed(8)} ${toCurrency}`,
                rate: rate
            }, client);
            
            // Log the swap to the new `swaps` table
            await client.query(
                `INSERT INTO swaps (user_wallet_address, from_currency, to_currency, from_amount, to_amount, rate, created_at)
                 VALUES ($1, $2, $3, $4, $5, $6, NOW())`,
                [userWalletAddress, fromCurrency, toCurrency, fromAmountFloat, toAmount, rate]
            );

            await client.query('COMMIT');

            const updatedUser = await userService.fetchUserProfile(userWalletAddress);
            return { success: true, user: updatedUser, message: 'Swap successful' };

        } catch (error) {
            await client.query('ROLLBACK');
            console.error("Swap transaction failed:", error);
            throw error;
        } finally {
            client.release();
        }
    }
}

module.exports = new SwapService();
