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

// Security middleware with Railway-optimized settings
app.use(helmet({
    contentSecurityPolicy: false, // Disable for Railway compatibility
    crossOriginEmbedderPolicy: false
}));

// CORS configuration optimized for Railway and Telegram
const corsOrigins = process.env.CORS_WHITELIST 
    ? process.env.CORS_WHITELIST.split(',')
    : [FRONTEND_URL, 'http://localhost:5173', 'https://web.telegram.org'];

console.log('[CORS Setup] Allowed Origins:', corsOrigins);

const corsOptions = {
    origin: function (origin, callback) {
        // Allow Railway internal requests (no origin)
        if (!origin) return callback(null, true);
        
        // Allow Telegram WebApp requests
        if (origin.includes('web.telegram.org')) return callback(null, true);
        
        // Allow Railway domains
        if (origin.includes('railway.app')) return callback(null, true);
        
        // Check whitelist
        if (corsOrigins.some(allowedOrigin => origin.includes(allowedOrigin))) {
            return callback(null, true);
        }
        
        console.warn(`CORS Warning: Origin '${origin}' not in whitelist`);
        callback(new Error('Not allowed by CORS'));
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
};
app.use(cors(corsOptions));

// Rate limiting with Railway-friendly settings
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 500, // Higher limit for Railway
    message: { error: 'Too many requests, please try again later.' },
    standardHeaders: true,
    legacyHeaders: false,
    skip: (req) => {
        // Skip rate limiting for Railway health checks
        return req.headers['user-agent']?.includes('Railway') || false;
    }
});
app.use(limiter);

// Body parsing middleware with size limits
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Enhanced logging for Railway
if (NODE_ENV === 'development') {
    app.use(morgan('dev'));
} else {
    app.use(morgan('combined'));
}

// Railway health check endpoint
app.get('/health', (req, res) => {
    res.status(200).json({ 
        status: 'healthy', 
        timestamp: new Date().toISOString(),
        environment: NODE_ENV 
    });
});

// Main health check route
app.get('/', (req, res) => {
    res.json({ 
        message: 'ARIX Terminal Backend is running on Railway!',
        version: '1.0.0',
        status: 'active'
    });
});

// API routes with error boundary
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
