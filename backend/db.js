const { Pool } = require('pg');
require('dotenv').config();

// Initialize the PostgreSQL connection pool
// It will automatically use the DATABASE_URL environment variable if provided
const pool = new Pool({
    connectionString: process.env.DATABASE_URL || 'postgres://localhost:5432/aegis_v3',
    // Uncomment the line below if deploying to Render/Heroku which require SSL
    // ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

pool.on('error', (err, client) => {
    console.error('Unexpected error on idle client', err);
    process.exit(-1);
});

async function query(text, params) {
    const start = Date.now();
    const res = await pool.query(text, params);
    const duration = Date.now() - start;
    // console.log('Executed query', { text, duration, rows: res.rowCount });
    return res;
}

module.exports = { query, pool };
