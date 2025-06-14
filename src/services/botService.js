const TelegramBot = require('node-telegram-bot-api');
const { TELEGRAM_BOT_TOKEN, TMA_URL } = require('../config/envConfig');

let bot;

const initBot = (app) => {
    if (!TELEGRAM_BOT_TOKEN) {
        console.error("CRITICAL ERROR: TELEGRAM_BOT_TOKEN environment variable is not set! Bot features will be disabled.");
        return;
    }

    bot = new TelegramBot(TELEGRAM_BOT_TOKEN);

    // Use a webhook in production for efficiency
    if (process.env.NODE_ENV === 'production') {
        const webhookUrl = `https://${process.env.RAILWAY_STATIC_URL || 'your-app-name.up.railway.app'}/telegram-webhook-${TELEGRAM_BOT_TOKEN.substring(0, 10)}`;
        bot.setWebHook(webhookUrl);
        
        app.post(`/telegram-webhook-${TELEGRAM_BOT_TOKEN.substring(0, 10)}`, (req, res) => {
            bot.processUpdate(req.body);
            res.sendStatus(200);
        });
        console.log(`Telegram bot webhook set up at ${webhookUrl}`);
    } else {
        // Use polling in development
        bot.deleteWebHook().then(() => bot.startPolling());
        console.log('Telegram bot started with polling for development.');
    }


    bot.onText(/\/start(?: (.+))?/, async (msg, match) => {
        const chatId = msg.chat.id;
        const userId = msg.from.id;
        const referrerPayload = match ? match[1] : null;

        let tmaLaunchUrl = TMA_URL;
        if (referrerPayload) {
            const url = new URL(TMA_URL);
            url.searchParams.append('ref', referrerPayload);
            tmaLaunchUrl = url.toString();
            console.log(`User ${userId} started bot with referrer payload: ${referrerPayload}.`);
        }

        const welcomeMessage = `Hello, ${msg.from.first_name || 'User'}! 👋\n\nWelcome to ARIX Terminal! Your portal to the ARIX ecosystem.\n\nClick the button below to launch the Mini App:`;
        const options = {
            reply_markup: {
                inline_keyboard: [
                    [{ text: '🚀 Open ARIX Terminal', web_app: { url: tmaLaunchUrl } }]
                ]
            }
        };

        try {
            await bot.sendMessage(chatId, welcomeMessage, options);
        } catch (error) {
            console.error("Error sending /start message:", error.response ? error.response.body : error.message);
        }
    });

    console.log('Telegram bot service initialized and /start command handler is active.');
};

module.exports = { initBot };
