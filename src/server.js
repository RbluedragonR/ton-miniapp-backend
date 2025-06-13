require('dotenv').config();
const http = require('http');
const { WebSocketServer } = require('ws');
const app = require('./app');
const { initBot } = require('./services/botService');
const CrashGameEngine = require('./services/CrashGameEngine');

const PORT = process.env.PORT || 3001;

// Create an HTTP server from the Express app
const server = http.createServer(app);

// Initialize WebSocket Server and attach it to the HTTP server
const wss = new WebSocketServer({ server });
console.log('[Server] WebSocket server initialized.');

// Start the singleton Crash Game Engine and pass it the WebSocket server instance
CrashGameEngine.start(wss);

// Initialize Telegram Bot if you have one
// initBot();

server.listen(PORT, () => {
  console.log(`[Server] HTTP and WebSocket server running on port ${PORT}`);
  console.log(`TON Network: ${process.env.TON_NETWORK || 'mainnet'}`);
});

module.exports = server;
