const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const morgan = require('morgan');
const http = require('http');
const { WebSocketServer } = require('ws');

// --- Config and Service Imports ---
const { NODE_ENV } = require('./config/envConfig');
const { generalErrorHandler, notFoundHandler } = require('./middlewares/errorHandler');
const { bot } = require('./services/botService');

// --- Route Imports ---
const userRoutes = require('./routes/userRoutes');
const gameRoutes = require('./routes/gameRoutes');
const earnRoutes = require('./routes/earnRoutes');
const taskRoutes = require('./routes/taskRoutes');
const referralRoutes = require('./routes/referralRoutes');
const pushRoutes = require('./routes/pushRoutes');
const swapRoutes = require('./routes/swapRoutes');

// --- Initialization ---
const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server }); // Create the WebSocket Server

// --- Core Middleware ---
app.set('trust proxy', 1);
app.use(helmet({ contentSecurityPolicy: false, crossOriginEmbedderPolicy: false }));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(NODE_ENV === 'development' ? morgan('dev') : morgan('combined'));

// --- CORS Configuration ---
const corsOrigins = process.env.CORS_WHITELIST
    ? process.env.CORS_WHITELIST.split(',')
    : [process.env.FRONTEND_URL, 'http://localhost:5173', 'https://web.telegram.org'];
app.use(cors({
    origin: (origin, callback) => {
        if (!origin || corsOrigins.includes(origin) || (origin && origin.endsWith('.telegram.org'))) {
            return callback(null, true);
        }
        console.warn(`[CORS] Blocked origin: ${origin}`);
        return callback(new Error('Not allowed by CORS'));
    },
    credentials: true,
}));

// --- Rate Limiting ---
app.use(rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 500,
    standardHeaders: true,
    legacyHeaders: false,
}));

// --- API Routes ---
app.get('/', (req, res) => res.json({ message: 'ARIX Terminal Backend is running!' }));
app.get('/health', (req, res) => res.status(200).json({ status: 'healthy' }));

app.use('/api/users', userRoutes);
app.use('/api/game', gameRoutes);
app.use('/api/earn', earnRoutes);
app.use('/api/tasks', taskRoutes);
app.use('/api/referrals', referralRoutes);
app.use('/api/push', pushRoutes);
app.use('/api/swap', swapRoutes);

// --- Telegram Webhook Route ---
app.post(`/telegram-webhook-${process.env.TELEGRAM_BOT_TOKEN}`, (req, res) => {
    bot.processUpdate(req.body);
    res.sendStatus(200);
});

// --- Error Handling ---
app.use(notFoundHandler);
app.use(generalErrorHandler);

// Export the server and wss so server.js can start them and pass wss to the engine
module.exports = { server, wss };
