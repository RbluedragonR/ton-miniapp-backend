const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const morgan = require('morgan');
const { FRONTEND_URL, NODE_ENV } = require('./config/envConfig');
const userRoutes = require('./routes/userRoutes');
const gameRoutes = require('./routes/gameRoutes');
const earnRoutes = require('./routes/earnRoutes');
const taskRoutes = require('./routes/taskRoutes');
const referralRoutes = require('./routes/referralRoutes');
const pushRoutes = require('./routes/pushRoutes');
const { generalErrorHandler, notFoundHandler } = require('./middlewares/errorHandler');

const app = express();

// Security middleware
app.use(helmet());

// CORS configuration
const whitelist = (process.env.CORS_WHITELIST || `${FRONTEND_URL},http://localhost:5173`).split(',');
console.log('[CORS Setup] Effective Whitelist:', whitelist);

const corsOptions = {
    origin: function (origin, callback) {
        if (!origin || whitelist.indexOf(origin) !== -1 || (origin && origin.startsWith('https://web.telegram.org'))) {
            callback(null, true);
        } else {
            console.error(`CORS Error: Origin '${origin}' not allowed.`);
            callback(new Error('Not allowed by CORS'));
        }
    },
    credentials: true
};
app.use(cors(corsOptions));

// Rate limiting
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 250, // limit each IP to 250 requests per windowMs
    standardHeaders: true,
    legacyHeaders: false,
});
app.use(limiter);

// Body parsing middleware
app.use(express.json({ limit: '10kb' }));
app.use(express.urlencoded({ extended: true, limit: '10kb' }));

// Logging middleware (only in development)
if (NODE_ENV === 'development') {
    app.use(morgan('dev'));
}

// Health check route
app.get('/', (req, res) => {
    res.json({ message: 'ARIX Terminal Backend is running!' });
});

// API routes
app.use('/api/users', userRoutes);
app.use('/api/game', gameRoutes);
app.use('/api/earn', earnRoutes);
app.use('/api/tasks', taskRoutes);
app.use('/api/referrals', referralRoutes);
app.use('/api/push', pushRoutes);

// Error handling middleware
app.use(notFoundHandler);
app.use(generalErrorHandler);

module.exports = app;
