// File: ar_backend/src/app.js
const express = require('express');
const cors = require('cors');
const { FRONTEND_URL, NODE_ENV } = require('./config/envConfig'); // Your Vercel frontend URL

// Import route handlers - paths are relative to this app.js file
const earnRoutes = require('./routes/earnRoutes');
const gameRoutes = require('./routes/gameRoutes');
const taskRoutes = require('./routes/taskRoutes');
const pushRoutes = require('./routes/pushRoutes');
const userRoutes = require('./routes/userRoutes'); // Correctly required



// Import error handling middleware and tea
const { generalErrorHandler, notFoundHandler } = require('./middlewares/errorHandler');

// --- NEW: Telegram Bot API Library Import ---
const TelegramBot = require('node-telegram-bot-api');

const app = express();

// --- Comprehensive CORS Configuration ---
const configuredFrontendUrl = FRONTEND_URL; // e.g., https://tma-frontend-gray.vercel.app
const knownGoodFrontendUrl = 'https://tma-frontend-gray.vercel.app'; // Explicitly add your primary frontend URL

const whitelist = [];

if (configuredFrontendUrl) {
    whitelist.push(configuredFrontendUrl);
}
if (!whitelist.includes(knownGoodFrontendUrl)) { // Ensure the hardcoded one is there if not already by FRONTEND_URL
    whitelist.push(knownGoodFrontendUrl);
}

// For local development convenience
if (NODE_ENV !== 'production') {
    const localDevOrigins = ['http://localhost:5173', 'http://127.0.0.1:5173']; // Common Vite ports
    localDevOrigins.forEach(url => {
        if (!whitelist.includes(url)) {
            whitelist.push(url);
        }
    });
}

console.log(`[CORS Setup] Effective Whitelist: ${JSON.stringify(whitelist)}`);
if (NODE_ENV === 'production' && (!configuredFrontendUrl || !whitelist.includes(knownGoodFrontendUrl))) {
    console.error(`[CORS CRITICAL WARNING] Production environment is missing FRONTEND_URL for ${knownGoodFrontendUrl} or it's not in the whitelist!`);
}


const corsOptions = {
  origin: function (origin, callback) {
    // Allow requests with no origin (e.g., server-to-server, mobile apps, curl, Postman)
    // OR if the origin is in our whitelist.
    if (!origin || whitelist.includes(origin)) {
      callback(null, true);
    } else {
      console.error(`[CORS Error] Origin '${origin}' not allowed. Whitelisted: [${whitelist.join(', ')}]`);
      callback(new Error(`Origin '${origin}' not allowed by CORS policy.`)); // This error will be caught by Express error handlers
    }
  },
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: [
    "Content-Type", 
    "Authorization", 
    "X-Requested-With", 
    "Accept", 
    "Origin", 
    "x-admin-secret", // For admin endpoints
    // Add any other custom headers your frontend might send
  ],
  credentials: true, 
  optionsSuccessStatus: 200 
};

// Global OPTIONS handler first with comprehensive CORS settings
app.options('*', cors(corsOptions)); 

// Then apply CORS to all subsequent routes
app.use(cors(corsOptions)); 

app.use(express.json({ limit: '1mb' })); 
app.use(express.urlencoded({ extended: true, limit: '1mb' }));

// --- NEW: Telegram Bot Initialization and Webhook Setup ---
// Your bot token from BotFather (MUST be in Vercel Environment Variables: TELEGRAM_BOT_TOKEN)
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
if (!TELEGRAM_BOT_TOKEN) {
    console.error("CRITICAL ERROR: TELEGRAM_BOT_TOKEN environment variable is not set!");
    // In a production environment, you might want to exit or disable bot features gracefully.
    // For now, we'll log and proceed, but the bot won't function without the token.
}

// Create a bot instance (no polling here, we'll use webhooks)
const bot = new TelegramBot(TELEGRAM_BOT_TOKEN);

// NEW: Telegram Webhook Endpoint
// This route will receive updates from Telegram when users interact with your bot.
// The URL for this endpoint will be: YOUR_VERCEL_BACKEND_URL/telegram-webhook
app.post('/telegram-webhook', (req, res) => {
    // Process the incoming update from Telegram
    // The node-telegram-bot-api library handles parsing the update
    bot.processUpdate(req.body);
    // Important: Always send a 200 OK response to Telegram to acknowledge receipt
    res.sendStatus(200);
});

// NEW: /start command handler for your Telegram bot
// This function will be called when a user sends the /start command to your bot.
bot.onText(/\/start/, (msg) => {
    const chatId = msg.chat.id; // Get the chat ID to send the message back to the user
    const userName = msg.from.first_name || 'there'; // Get the user's first name, default to 'there' if not available

    // The welcome message content
    const welcomeMessage = `Hello, ${userName}! 👋\n\nWelcome to ARIX Terminal TMA! Your portal to the ARIX ecosystem.\n\nClick the button below to launch the Mini App:`;

    // Options for the message, including the inline keyboard with a Web App button
    const options = {
        reply_markup: {
            inline_keyboard: [
                [
                    {
                        text: 'Open ARIX Terminal', // Text displayed on the button
                        web_app: { url: 'https://tma-frontend-gray.vercel.app/' } // The URL of your Vercel frontend TMA
                    }
                ]
            ]
        }
    };

    // Send the message with the button to the user
    bot.sendMessage(chatId, welcomeMessage, options)
        .catch(error => {
            // Log any errors that occur during message sending
            console.error("Error sending /start message:", error.response ? error.response.body : error.message);
        });
});

// --- API Routes (Your existing routes) ---
app.get('/', (req, res) => {
    // Simple health check, should always work if the server is up
    res.setHeader('Content-Type', 'application/json'); // Good practice to set content type
    res.status(200).json({ message: 'ARIX Terminal Backend API is alive and running!' });
});

app.use('/api/earn', earnRoutes);
app.use('/api/game', gameRoutes);
app.use('/api/task', taskRoutes);
app.use('/api/push', pushRoutes);
app.use('/api/user', userRoutes); // User routes now correctly mounted

// --- Error Handling Middlewares ---
app.use(notFoundHandler); // Catches 404s
app.use(generalErrorHandler); // Catches all other errors passed via next(error)

module.exports = app;