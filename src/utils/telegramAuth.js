const crypto = require('crypto');

/**
 * Verify Telegram WebApp authentication data
 * @param {string} initData - The initData string from Telegram WebApp
 * @param {string} botToken - Your bot token
 * @returns {boolean} - True if valid, false otherwise
 */
function checkTelegramAuth(initData, botToken) {
    try {
        if (!initData || !botToken) {
            return false;
        }

        // Parse initData (query string format)
        const params = new URLSearchParams(initData);
        const hash = params.get('hash');
        
        if (!hash) {
            return false;
        }

        // Remove hash from params for verification
        params.delete('hash');

        // Sort and join params
        const dataCheckString = Array.from(params)
            .map(([k, v]) => `${k}=${v}`)
            .sort()
            .join('\n');

        // Create secret key using HMAC-SHA256
        const secret = crypto.createHmac('sha256', 'WebAppData').update(botToken).digest();

        // Compute hash
        const computedHash = crypto.createHmac('sha256', secret).update(dataCheckString).digest('hex');

        return computedHash === hash;
    } catch (error) {
        console.error('Error checking Telegram auth:', error);
        return false;
    }
}

/**
 * Extract user data from Telegram initData
 * @param {string} initData - The initData string from Telegram WebApp
 * @returns {object|null} - User data or null if invalid
 */
function extractTelegramUserData(initData) {
    try {
        if (!initData) {
            return null;
        }

        const params = new URLSearchParams(initData);
        const userStr = params.get('user');
        
        if (!userStr) {
            return null;
        }

        const userData = JSON.parse(decodeURIComponent(userStr));
        return {
            id: userData.id,
            username: userData.username,
            first_name: userData.first_name,
            last_name: userData.last_name,
            language_code: userData.language_code,
            is_premium: userData.is_premium,
            allows_write_to_pm: userData.allows_write_to_pm
        };
    } catch (error) {
        console.error('Error extracting Telegram user data:', error);
        return null;
    }
}

/**
 * Get Telegram WebApp info from initData
 * @param {string} initData - The initData string from Telegram WebApp
 * @returns {object|null} - WebApp info or null if invalid
 */
function extractTelegramWebAppInfo(initData) {
    try {
        if (!initData) {
            return null;
        }

        const params = new URLSearchParams(initData);
        const webAppInfoStr = params.get('web_app_info');
        
        if (!webAppInfoStr) {
            return null;
        }

        const webAppInfo = JSON.parse(decodeURIComponent(webAppInfoStr));
        return {
            name: webAppInfo.name,
            short_name: webAppInfo.short_name,
            description: webAppInfo.description,
            photo_url: webAppInfo.photo_url,
            gif_url: webAppInfo.gif_url,
            video_url: webAppInfo.video_url,
            tme_url: webAppInfo.tme_url,
            platform: webAppInfo.platform,
            version: webAppInfo.version,
            botInline: webAppInfo.botInline
        };
    } catch (error) {
        console.error('Error extracting Telegram WebApp info:', error);
        return null;
    }
}

module.exports = {
    checkTelegramAuth,
    extractTelegramUserData,
    extractTelegramWebAppInfo
}; 