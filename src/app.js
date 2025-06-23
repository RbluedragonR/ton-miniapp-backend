// ar_backend/src/app.js
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const morgan = 'morgan'; // This seems to be a typo in your original file, should be require('morgan')
const { FRONTEND_URL, NODE_ENV } = require('./config/envConfig');
const userRoutes = require('./routes/userRoutes');
const gameRoutes = require('./routes/gameRoutes');
const earnRoutes = require('./routes/earnRoutes');
const taskRoutes = require('./routes/taskRoutes');
const referralRoutes = require('./routes/referralRoutes');
const pushRoutes = require('./routes/pushRoutes');
const swapRoutes = require('./routes/swapRoutes'); // New Swap Routes
const { generalErrorHandler, notFoundHandler } = require('./middlewares/errorHandler');

const app = express();

// Trust proxy setting for deployment environments like Railway/Heroku
app.set('trust proxy', 1);

app.use(helmet({
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false
}));

const corsOrigins = process.env.CORS_WHITELIST 
    ? process.env.CORS_WHITELIST.split(',')
    : [FRONTEND_URL, 'http://localhost:5173', 'https://web.telegram.org'];

console.log('[CORS Setup] Allowed Origins:', corsOrigins);

const corsOptions = {
    origin: function (origin, callback) {
        if (!origin) return callback(null, true);
        if (corsOrigins.some(allowedOrigin => origin && (origin.includes(allowedOrigin) || origin.startsWith('https://web.telegram.org')))) {
            return callback(null, true);
        }
        if (origin.includes('railway.app')) return callback(null, true);
        console.warn(`CORS Warning: Origin '${origin}' not in whitelist`);
        callback(new Error('Not allowed by CORS'));
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
};
app.use(cors(corsOptions));

const limiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 500,
    message: { error: 'Too many requests, please try again later.' },
    standardHeaders: true,
    legacyHeaders: false,
    skip: (req) => req.headers['user-agent']?.includes('Railway') || false
});
app.use(limiter);

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Correcting the morgan import if it was intended
const morganLogger = require('morgan');
if (NODE_ENV === 'development') {
    app.use(morganLogger('dev'));
} else {
    app.use(morganLogger('combined'));
}


app.get('/health', (req, res) => {
    res.status(200).json({ 
        status: 'healthy', 
        timestamp: new Date().toISOString(),
        environment: NODE_ENV 
    });
});

app.get('/', (req, res) => {
    res.json({ 
        message: 'ARIX Terminal Backend is running on Railway!',
        version: '1.0.0',
        status: 'active'
    });
});

// Registering all routes
app.use('/api/users', userRoutes);
app.use('/api/game', gameRoutes);
app.use('/api/earn', earnRoutes);
app.use('/api/tasks', taskRoutes);
app.use('/api/referrals', referralRoutes);
app.use('/api/push', pushRoutes);
app.use('/api/swap', swapRoutes); // ADDED SWAP ROUTE

app.use(notFoundHandler);
app.use(generalErrorHandler);

module.exports = app;
