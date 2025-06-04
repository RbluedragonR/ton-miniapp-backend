const { Pool } = require('pg');

if (!process.env.POSTGRES_URL) {
  if (process.env.NODE_ENV !== 'test') { 
    console.warn("DATABASE_WARNING: POSTGRES_URL environment variable is not set. Database functionality will be unavailable.");
  }
}

const pool = process.env.POSTGRES_URL ? new Pool({
  connectionString: process.env.POSTGRES_URL,
  ssl: {
    rejectUnauthorized: false
  }
}) : null;


async function testDbConnection() {
  if (!pool) {
    console.log("DB: Pool is not initialized (POSTGRES_URL not set). Skipping DB connection test.");
    return;
  }
  try {
    const client = await pool.connect();
    console.log("DB: Successfully connected to PostgreSQL!");
    const res = await client.query('SELECT NOW()');
    console.log("DB: Current time from DB:", res.rows[0].now);
    client.release();
  } catch (err) {
    console.error("DB_ERROR: Failed to connect to PostgreSQL or execute query:", err.stack);
  }
}






module.exports = {
  query: (text, params) => {
    if (!pool) {
      throw new Error("Database pool is not initialized. POSTGRES_URL environment variable might be missing.");
    }
    return pool.query(text, params);
  },
  getClient: () => {
    if (!pool) {
      throw new Error("Database pool is not initialized. POSTGRES_URL environment variable might be missing.");
    }
    return pool.connect();
  }
};
