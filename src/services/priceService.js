// File: ar_terminal/backend/src/services/priceService.js
const axios = require('axios');
// We are removing this import for now to hardcode the address:
// const { ARIX_TOKEN_MASTER_ADDRESS } = require('../config/envConfig');

// HARDCODED FOR TESTING - Replace with envConfig import for production
const ARIX_TOKEN_MASTER_ADDRESS = "EQCLU6KIPjZJbhyYlRfENc3nQck2DWulsUq2gJPyWEK9wfDd";

const STONFI_API_BASE_URL = "https://api.ston.fi/v1";

class PriceService {
    async getArxUsdtPrice() {
        // Log the address being used (it's now the hardcoded one)
        console.log("[PriceService] Using ARIX_TOKEN_MASTER_ADDRESS:", ARIX_TOKEN_MASTER_ADDRESS);

        if (!ARIX_TOKEN_MASTER_ADDRESS || typeof ARIX_TOKEN_MASTER_ADDRESS !== 'string' || ARIX_TOKEN_MASTER_ADDRESS.trim() === "") {
            console.error("PriceService: ARIX_TOKEN_MASTER_ADDRESS is invalid or effectively not set (even if hardcoded). Value:", `"${ARIX_TOKEN_MASTER_ADDRESS}"`);
            return null;
        }

        const apiUrl = `${STONFI_API_BASE_URL}/assets/${ARIX_TOKEN_MASTER_ADDRESS.trim()}`;
        console.log("[PriceService] Attempting to fetch price from URL:", apiUrl);

        try {
            const response = await axios.get(apiUrl);
            
            let price = null;
            if (response.data && response.data.asset && response.data.asset.dex_usd_price) {
                price = parseFloat(response.data.asset.dex_usd_price);
            } else if (response.data && response.data.asset && response.data.asset.dex_price_usd) {
                price = parseFloat(response.data.asset.dex_price_usd);
            } else if (response.data?.price_usd) {
                 price = parseFloat(response.data.price_usd);
            } else if (response.data?.asset_data?.price_usd) { 
                price = parseFloat(response.data.asset_data.price_usd);
            }

            if (price !== null && !isNaN(price)) {
                console.log("[PriceService] Successfully fetched and parsed price:", price);
                return price;
            } else {
                console.warn("PriceService: Could not extract ARIX price from STON.fi response structure. Full response:", JSON.stringify(response.data, null, 2));
                return null; 
            }
        } catch (error) {
            console.error(`PriceService: Error fetching ARIX/USDT price from ${apiUrl}. Error:`, error.message);
            if (error.isAxiosError && error.response) {
                console.error("PriceService: STON.fi API Error Response Status:", error.response.status);
                console.error("PriceService: STON.fi API Error Response Data:", JSON.stringify(error.response.data, null, 2));
            } else if (error.isAxiosError && error.request) {
                console.error("PriceService: STON.fi API No response received. Request details (might be extensive):", error.request);
            } else {
                console.error("PriceService: Non-Axios error during price fetch:", error);
            }
            return null;
        }
    }
}

module.exports = new PriceService();
