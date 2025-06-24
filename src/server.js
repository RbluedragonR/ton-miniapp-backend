// ar_backend/src/server.js

if (process.env.NODE_ENV !== 'production') {
    require('dotenv').config();
}

const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const cors = require('cors');
const morgan = require('morgan');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');

// --- CORS CONFIGURATION ---
const allowedOrigins = [
    'https://tma-frontend-gray.vercel.app',
    'http://localhost:5173'
];
const corsOptions = {
    origin: function (origin, callback) {
        if (!origin || allowedOrigins.indexOf(origin) !== -1) {
            callback(null, true);
        } else {
            callback(new Error('Not allowed by CORS'));
        }
    }
};

// --- Route Imports ---
const userRoutes = require('./routes/userRoutes');
const earnRoutes = require('./routes/earnRoutes');
const taskRoutes = require('./routes/taskRoutes');
const referralRoutes = require('./routes/referralRoutes');
const swapRoutes = require('./routes/swapRoutes');
const gameRoutes = require('./routes/gameRoutes');
// const announcementRoutes = require('./routes/announcementRoutes');

// --- Service Imports ---
const botService = require('./services/botService'); 
const CrashGameEngine = require('./services/CrashGameEngine');
require('./config/database');

// --- App Initialization ---
const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

// --- Middleware ---
app.set('trust proxy', 1);
app.use(helmet());
app.use(cors(corsOptions));
app.use(express.json());
app.use(morgan('tiny'));

const limiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 200,
    standardHeaders: true,
    legacyHeaders: false,
});
app.use(limiter);

// --- WebSocket Server Logic ---
CrashGameEngine.start(wss);

// --- API Routes ---
app.use('/api/user', userRoutes);
app.use('/api/earn', earnRoutes);
app.use('/api/tasks', taskRoutes);
app.use('/api/referrals', referralRoutes);
app.use('/api/swap', swapRoutes);
// ### THIS IS THE FIX ###
// Changed from '/api/games' to '/api/game' to match the frontend calls.
app.use('/api/game', gameRoutes);
// app.use('/api/announcements', announcementRoutes);

// --- Telegram Webhook ---
app.post(`/telegram-webhook-${process.env.TELEGRAM_BOT_TOKEN}`, (req, res) => {
    botService.bot.processUpdate(req.body);
    res.sendStatus(200);
});

// --- Root Endpoint ---
app.get('/', (req, res) => {
    res.send('ARIX Terminal Backend is running.');
});

// --- Error Handling ---
app.use((err, req, res, next) => {
    console.error(`[Global Error Handler] ${err.stack}`);
    res.status(500).send('Something went wrong!');
});

// --- Server Startup ---
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`[ARIX Final Build] Server starting...`);
    console.log(`[Server] Listening on port ${PORT} in ${process.env.NODE_ENV || 'development'} mode.`);
});