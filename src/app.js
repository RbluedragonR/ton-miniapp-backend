// File: ar_backend/src/app.js
const express = require('express');
const cors = require('cors');
const { FRONTEND_URL } = require('./config/envConfig'); // Your Vercel frontend URL

// Import route handlers
const earnRoutes = require('./routes/earnRoutes');
const gameRoutes = require('./routes/gameRoutes');
const taskRoutes = require('./routes/taskRoutes');
const pushRoutes = require('./routes/pushRoutes');
const userRoutes = require('./routes/userRoutes'); // Now correctly required

// Import error handling middleware
const { generalErrorHandler, notFoundHandler } = require('./middlewares/errorHandler');

const app = express();

// --- Comprehensive CORS Configuration ---
const whitelist = [];

// Your production frontend URL from environment variables
if (FRONTEND_URL) {
    whitelist.push(FRONTEND_URL);
    console.log(`CORS: Production FRONTEND_URL (${FRONTEND_URL}) added to whitelist.`);
} else if (process.env.NODE_ENV === 'production') {
    console.error("CORS_CRITICAL_ERROR: FRONTEND_URL environment variable is not set in production! Your frontend will be blocked by CORS.");
}

// Specific known frontend URLs (e.g., your Vercel preview or specific domains)
const knownFrontendUrls = [
    'https://tma-frontend-gray.vercel.app' // Your specific frontend URL
    // Add other specific URLs if needed, like custom domains
];
knownFrontendUrls.forEach(url => {
    if (!whitelist.includes(url)) {
        whitelist.push(url);
    }
});

// Whitelist for local development
if (process.env.NODE_ENV !== 'production') {
    const localDevUrls = ['http://localhost:5173', 'http://127.0.0.1:5173']; // Common Vite ports
    localDevUrls.forEach(url => {
        if (!whitelist.includes(url)) {
            whitelist.push(url);
        }
    });
    console.log(`CORS: Local development URLs added to whitelist: ${localDevUrls.join(', ')}`);
}

const corsOptions = {
  origin: function (origin, callback) {
    // Allow requests with no origin (like mobile apps, curl, Postman, server-to-server)
    // OR if the origin is in our whitelist.
    if (!origin || whitelist.includes(origin)) {
      callback(null, true);
    } else {
      console.error(`CORS Error: Origin ${origin} not allowed. Whitelisted: [${whitelist.join(', ')}]`);
      callback(new Error(`Origin ${origin} not allowed by CORS policy.`));
    }
  },
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"], // Added PATCH
  allowedHeaders: [
    "Content-Type", 
    "Authorization", 
    "X-Requested-With", 
    "Accept", 
    "Origin", 
    "x-admin-secret", // If you use this for admin endpoints
    // Add any other custom headers your frontend might send
  ],
  credentials: true, // Important for cookies or authorization headers
  optionsSuccessStatus: 200 // For legacy browser compatibility with OPTIONS
};

console.log(`CORS: Final effective whitelist for origin check: [${whitelist.join(', ')}]`);

// Use CORS middleware for all routes
app.use(cors(corsOptions));

// It's good practice to handle OPTIONS requests explicitly for all routes,
// although `cors(corsOptions)` applied globally often handles this.
// This ensures pre-flight requests are always handled with your CORS config.
app.options('*', cors(corsOptions)); 

// To parse JSON request bodies
app.use(express.json({ limit: '1mb' })); // Set a reasonable payload limit
// To parse URL-encoded request bodies
app.use(express.urlencoded({ extended: true, limit: '1mb' }));


// --- API Routes ---
app.get('/', (req, res) => {
    res.status(200).json({ message: 'ARIX Terminal Backend API is running smoothly!' });
});

app.use('/api/earn', earnRoutes);
app.use('/api/game', gameRoutes);
app.use('/api/task', taskRoutes);
app.use('/api/push', pushRoutes);
app.use('/api/user', userRoutes); // Correctly mounted user routes

// --- Error Handling Middlewares ---
// These should come AFTER all your routes
app.use(notFoundHandler);
app.use(generalErrorHandler);

module.exports = app;