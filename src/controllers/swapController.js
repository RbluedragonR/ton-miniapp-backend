// ar_backend/src/controllers/swapController.js
const swapService = require('../services/swapService');
const { Address } = require('@ton/core');

const isValidTonAddress = (addr) => {
    if (!addr) return false;
    try {
        Address.parse(addr);
        return true;
    } catch (e) {
        return false;
    }
};

exports.getQuote = (req, res, next) => {
    try {
        const { from, to } = req.query;
        if (!from || !to) {
            return res.status(400).json({ message: 'Missing "from" or "to" query parameters.' });
        }
        const rate = swapService.getSwapRate(from.toUpperCase(), to.toUpperCase());
        if (rate === null) {
            return res.status(400).json({ message: 'Invalid swap pair provided.'});
        }
        res.status(200).json({ from, to, rate });
    } catch (error) {
        next(error);
    }
};

exports.performSwap = async (req, res, next) => {
    try {
        const { userWalletAddress, fromCurrency, toCurrency, fromAmount } = req.body;
        if (!userWalletAddress || !fromCurrency || !toCurrency || !fromAmount) {
            return res.status(400).json({ message: 'Missing required swap information.' });
        }
        if (!isValidTonAddress(userWalletAddress)) {
            return res.status(400).json({ message: "Invalid userWalletAddress format." });
        }
        
        const result = await swapService.executeSwap({
            userWalletAddress, 
            fromCurrency: fromCurrency.toUpperCase(), 
            toCurrency: toCurrency.toUpperCase(), 
            fromAmount
        });

        res.status(200).json(result);
    } catch (error) {
        if (error.message.includes('Insufficient funds') || error.message.includes('Invalid swap pair') || error.message.includes('Invalid amount')) {
            return res.status(400).json({ message: error.message });
        }
        next(error);
    }
};
