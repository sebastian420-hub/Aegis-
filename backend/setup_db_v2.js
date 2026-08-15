const { query } = require('./db');

async function setupDatabase() {
    try {
        console.log('Creating Sandbox SQLite Database...');
        
        // Drop if exists to reset state for testing
        await query('DROP TABLE IF EXISTS transfers;');

        console.log('Creating V2 CICO Transfer table...');
        await query(`
            CREATE TABLE transfers (
                transfer_id TEXT PRIMARY KEY,
                sender_wallet TEXT NOT NULL,
                receiver_wallet TEXT NOT NULL,
                amount_usdc REAL NOT NULL,
                otp TEXT NOT NULL,
                status TEXT NOT NULL DEFAULT 'PENDING_LOCK',
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            );
        `);

        console.log('Database V2 successfully initialized for Sandbox testing!');
        process.exit(0);
    } catch (err) {
        console.error('Error setting up DB:', err);
        process.exit(1);
    }
}

setupDatabase();
