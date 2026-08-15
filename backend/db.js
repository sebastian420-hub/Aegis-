const sqlite3 = require('sqlite3').verbose();
const { open } = require('sqlite');
const path = require('path');

let dbInstance = null;

async function getDb() {
    if (!dbInstance) {
        dbInstance = await open({
            filename: path.join(__dirname, 'sandbox.db'),
            driver: sqlite3.Database
        });
    }
    return dbInstance;
}

// Wrapper to mimic the PostgreSQL query structure
async function query(text, params) {
    const db = await getDb();
    
    // Convert PostgreSQL $1, $2 syntax to SQLite ?, ? syntax
    let sqliteText = text.replace(/\$\d+/g, '?');
    
    // If it's a SELECT statement, return { rows: [] }
    if (sqliteText.trim().toUpperCase().startsWith('SELECT')) {
        const rows = await db.all(sqliteText, params);
        return { rows };
    }
    
    // For INSERT, UPDATE, DELETE
    const result = await db.run(sqliteText, params);
    return { rows: [], rowCount: result.changes };
}

module.exports = { query };
