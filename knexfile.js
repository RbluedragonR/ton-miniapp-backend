// ar_backend/knexfile.js

// This loads environment variables from .env for local development
// and from Railway's settings in production.
require('dotenv').config();

// We use the same logic as database.js to pick the right URL.
const connectionString = process.env.DATABASE_PRIVATE_URL || process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error("DATABASE_URL or DATABASE_PRIVATE_URL is not defined. Please check your environment variables.");
}

module.exports = {
  client: 'pg',
  connection: {
    connectionString,
    ssl: { rejectUnauthorized: false },
  },
  pool: {
    min: 2,
    max: 10,
  },
  migrations: {
    tableName: 'knex_migrations',
    // You can point this to a migrations directory if you start using Knex migrations.
    // For now, it's just needed for the connection to work.
    directory: './db/migrations' 
  },
};