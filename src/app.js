// File: ar_terminal/backend/src/app.js
const express = require('express');
const cors = require('cors');
const { FRONTEND_URL } = require('./config/envConfig');

const earnRoutes = require('./routes/earnRoutes');
const gameRoutes = require('./routes/gameRoutes'); // Assuming gameRoutes.js exists
const taskRoutes = require('./routes/taskRoutes'); // New task routes
// const userRoutes = require('./routes/userRoutes');

const { generalErrorHandler, notFoundHandler } = require('./middlewares/errorHandler');

const app = express();

const corsOrigin = FRONTEND_URL || '*'; 
const corsOptions = {
  origin: corsOrigin,
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization", "x-admin-secret"], // Added x-admin-secret
  credentials: true 
};

if (process.env.NODE_ENV !== 'test') {
    console.log(`CORS Origin configured for backend: ${corsOrigin}`);
    if (corsOrigin === '*' && process.env.NODE_ENV === 'production') {
        console.warn("CORS_WARNING: Origin is set to '*' in production. This is insecure. Please set a specific FRONTEND_URL.");
    } else if (!FRONTEND_URL && process.env.NODE_ENV !== 'development') {
        console.warn("CORS_WARNING: FRONTEND_URL is not set. CORS might not work as expected in this environment.");
    }
}

app.use(cors(corsOptions));
app.options('*', cors(corsOptions)); 
app.use(express.json()); 

app.get('/', (req, res) => {
    res.status(200).json({ message: 'ARIX Terminal Backend API is running!' });
});

app.use('/api/earn', earnRoutes);
app.use('/api/game', gameRoutes); // Ensure gameRoutes.js is created and gameController.js exists
app.use('/api/task', taskRoutes); // Mount task routes
// app.use('/api/user', userRoutes);

app.use(notFoundHandler);
app.use(generalErrorHandler);

module.exports = app;