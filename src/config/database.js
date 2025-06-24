// src/config/database.js

const { Pool } = require('pg');

// server.js handles loading .env for local development.
// On Railway, this is now the correct, hardcoded private URL you set in the dashboard.
const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
    console.error("FATAL ERROR: DATABASE_URL is not set in environment variables.");
    process.exit(1);
}

const pool = new Pool({
  connectionString: connectionString,
  ssl: {
    rejectUnauthorized: false
  },
  max: 15,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000,
});

console.log('[Database] Pool configured. Verifying connection...');

// A simple connection test to confirm everything is working on startup.
pool.query('SELECT NOW()', (err, res) => {
    if (err) {
        console.error('--- FATAL DATABASE CONNECTION FAILED ---');
        console.error(err);
        // In a real scenario, you might want the app to exit if it can't connect.
        // process.exit(1);
    } else {
        console.log('[Database] Connection successful.');
    }
});


async function query(text, params) {
  const client = await pool.connect();
  try {
    return await client.query(text, params);
  } finally {
    client.release();
  }
}

async function getClient() {
  return await pool.connect();
}

module.exports = {
  query,
  getClient,
};