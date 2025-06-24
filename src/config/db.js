// ar_backend/src/config/db.js

const knex = require('knex');
// We need to go up one level to find the knexfile.js in the root.
const knexConfig = require('../../knexfile.js'); 

const db = knex(knexConfig);

module.exports = db;