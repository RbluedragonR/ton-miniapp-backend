// File: ar_terminal/backend/src/app.js
const express = require('express');
const cors = require('cors');
const { FRONTEND_URL } = require('./config/envConfig'); // For specific CORS origin
// const morgan = require('morgan'); // Optional: for HTTP request logging

// Import your route handlers
const earnRoutes = require('./routes/earnRoutes');
// const gameRoutes = require('./routes/gameRoutes'); // Uncomment when ready
// const userRoutes = require('./routes/userRoutes');   // Uncomment when ready

// Import error handling middleware
const { generalErrorHandler, notFoundHandler } = require('./middlewares/errorHandler');

const app = express();

// --- Middlewares ---

// CORS Configuration
// Use the specific FRONTEND_URL from your environment variables.
// Fallback to '*' for local development if FRONTEND_URL is not set,
// but in production, FRONTEND_URL should always be the exact URL of your deployed frontend.
const corsOrigin = FRONTEND_URL || '*'; 
const corsOptions = {
  origin: corsOrigin,
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"], // Ensure OPTIONS is included for pre-flight
  allowedHeaders: ["Content-Type", "Authorization"], // Add any other custom headers your frontend might send
  credentials: true // Set to true if your frontend needs to send cookies or Authorization headers
};

// Log the CORS origin being used for easier debugging
if (process.env.NODE_ENV !== 'test') { // Avoid logging during tests
    console.log(`CORS Origin configured for backend: ${corsOrigin}`);
    if (corsOrigin === '*' && process.env.NODE_ENV === 'production') {
        console.warn("CORS_WARNING: Origin is set to '*' in production. This is insecure. Please set a specific FRONTEND_URL.");
    } else if (!FRONTEND_URL && process.env.NODE_ENV !== 'development') {
        console.warn("CORS_WARNING: FRONTEND_URL is not set. CORS might not work as expected in this environment.");
    }
}


app.use(cors(corsOptions));
// Explicitly handle pre-flight requests for all routes
app.options('*', cors(corsOptions)); 

// To parse JSON request bodies
app.use(express.json()); 

// HTTP request logger (optional, useful for development)
// if (process.env.NODE_ENV === 'development') {
//   const morgan = require('morgan');
//   app.use(morgan('dev'));
// }

// --- API Routes ---

// Basic health check route for the root of the API
app.get('/', (req, res) => {
    res.status(200).json({ message: 'ARIX Terminal Backend API is running!' });
});

// Mount your specific application routes
app.use('/api/earn', earnRoutes);
// app.use('/api/game', gameRoutes); // Uncomment when game routes are implemented
// app.use('/api/user', userRoutes);   // Uncomment when user routes are implemented


// --- Error Handling Middlewares ---
// These should come AFTER all your routes

// Handle 404 errors (if no route was matched)
app.use(notFoundHandler);

// Handle all other errors (generic error handler)
app.use(generalErrorHandler);

module.exports = app;