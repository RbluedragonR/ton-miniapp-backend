
const axios = require('axios');




const OXYBLE_TOKEN_MASTER_ADDRESS = "EQCLU6KIPjZJbhyYlRfENc3nQck2DWulsUq2gJPyWEK9wfDd";

const STONFI_API_BASE_URL = "https://api.ston.fi/v1";

class PriceService {
    async getArxUsdtPrice() {
        
        console.log("[PriceService] Using OXYBLE_TOKEN_MASTER_ADDRESS:", OXYBLE_TOKEN_MASTER_ADDRESS);

        if (!OXYBLE_TOKEN_MASTER_ADDRESS || typeof OXYBLE_TOKEN_MASTER_ADDRESS !== 'string' || OXYBLE_TOKEN_MASTER_ADDRESS.trim() === "") {
            console.error("PriceService: OXYBLE_TOKEN_MASTER_ADDRESS is invalid or effectively not set (even if hardcoded). Value:", `"${OXYBLE_TOKEN_MASTER_ADDRESS}"`);
            return null;
        }

        const apiUrl = `${STONFI_API_BASE_URL}/assets/${OXYBLE_TOKEN_MASTER_ADDRESS.trim()}`;
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
                console.warn("PriceService: Could not extract OXYBLE price from STON.fi response structure. Full response:", JSON.stringify(response.data, null, 2));
                return null; 
            }
        } catch (error) {
            console.error(`PriceService: Error fetching OXYBLE/USDT price from ${apiUrl}. Error:`, error.message);
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
