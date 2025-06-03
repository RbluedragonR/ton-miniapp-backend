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

// --- API Routes ---
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