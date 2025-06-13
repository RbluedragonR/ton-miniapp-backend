const express = require('express');
const cors = require('cors');
const { FRONTEND_URL, NODE_ENV, TELEGRAM_BOT_TOKEN, TMA_URL } = require('./config/envConfig');
const TelegramBot = require('node-telegram-bot-api');

// Service and Route Imports
const userService = require('./services/userService');
const { startCrashGameEngine } = require('./services/gameService'); // MODIFIED: Import the crash game starter

const earnRoutes = require('./routes/earnRoutes');
const gameRoutes = require('./routes/gameRoutes');
const taskRoutes = require('./routes/taskRoutes');
const pushRoutes = require('./routes/pushRoutes');
const userRoutes = require('./routes/userRoutes');
const referralRoutes = require('./routes/referralRoutes'); 

const { generalErrorHandler, notFoundHandler } = require('./middlewares/errorHandler');

const app = express();


// --- CORS Configuration ---
const whitelist = [FRONTEND_URL, TMA_URL];
if (NODE_ENV !== 'production') {
    whitelist.push('http://localhost:5173', 'http://127.0.1:5173');
}
console.log(`[CORS Setup] Effective Whitelist: ${JSON.stringify(whitelist)}`);

const corsOptions = {
    origin: function (origin, callback) {
        if (!origin || whitelist.includes(origin) || (origin && origin.startsWith('https://web.telegram.org'))) { 
            callback(null, true);
        } else {
            console.error(`[CORS Error] Origin '${origin}' not allowed. Whitelisted: [${whitelist.join(', ')}]`);
            callback(new Error(`Origin '${origin}' not allowed by CORS policy.`));
        }
    },
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "X-Requested-With", "Accept", "Origin", "x-admin-secret"],
    credentials: true,
    optionsSuccessStatus: 200
};

app.options('*', cors(corsOptions));
app.use(cors(corsOptions));
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));


// --- Telegram Bot Setup ---
let bot;
if (TELEGRAM_BOT_TOKEN) {
    bot = new TelegramBot(TELEGRAM_BOT_TOKEN);
    
    app.post(`/telegram-webhook-${TELEGRAM_BOT_TOKEN.substring(0,10)}`, (req, res) => { 
        bot.processUpdate(req.body);
        res.sendStatus(200);
    });

    bot.onText(/\/start(?: (.+))?/, async (msg, match) => {
        const chatId = msg.chat.id;
        const userId = msg.from.id; 
        const username = msg.from.username || msg.from.first_name || `User${userId}`;
        const referrerPayload = match ? match[1] : null; 

        let tmaLaunchUrl = TMA_URL;
        if (referrerPayload) {
            const url = new URL(TMA_URL);
            url.searchParams.append('ref', referrerPayload);
            tmaLaunchUrl = url.toString();
            console.log(`User ${userId} started bot with referrer payload: ${referrerPayload}. Launch URL: ${tmaLaunchUrl}`);
        } else {
            console.log(`User ${userId} started bot without referrer payload. Launch URL: ${tmaLaunchUrl}`);
        }

        const welcomeMessage = `Hello, ${msg.from.first_name || 'User'}! 👋\n\nWelcome to ARIX Terminal! Your portal to the ARIX ecosystem.\n\nClick the button below to launch the Mini App:`;
        const options = {
            reply_markup: {
                inline_keyboard: [[{ text: '🚀 Open ARIX Terminal', web_app: { url: tmaLaunchUrl } }]]
            }
        };
        try {
            await bot.sendMessage(chatId, welcomeMessage, options);
        } catch (error) {
            console.error("Error sending /start message:", error.response ? error.response.body : error.message);
        }
    });

} else {
    console.error("CRITICAL ERROR: TELEGRAM_BOT_TOKEN environment variable is not set! Bot features will be disabled.");
}

// --- Background Service Initialization ---
startCrashGameEngine(); // MODIFIED: Start the crash game loop when the application starts.


// --- API Routes ---
app.get('/', (req, res) => {
    res.setHeader('Content-Type', 'application/json');
    res.status(200).json({ message: 'ARIX Terminal Backend API is alive and running!' });
});

app.use('/api/earn', earnRoutes);
app.use('/api/game', gameRoutes);
app.use('/api/task', taskRoutes);
app.use('/api/push', pushRoutes);
app.use('/api/user', userRoutes);
app.use('/api/referral', referralRoutes); 


// --- Error Handling ---
app.use(notFoundHandler);
app.use(generalErrorHandler);

module.exports = app;
