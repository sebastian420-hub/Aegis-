const { query } = require('./db');

async function setupDatabase() {
    try {
        console.log('Creating Dispatcher SQLite Database...');
        
        await query('DROP TABLE IF EXISTS transfers;');

        console.log('Creating Unified Matchmaking Transfer table...');
        await query(`
            CREATE TABLE transfers (
                transfer_id TEXT PRIMARY KEY,
                sender_wallet TEXT NOT NULL,
                agent_wallet TEXT, -- Null until an agent accepts the order
                amount_usdc REAL NOT NULL,
                amount_fiat REAL NOT NULL,
                currency TEXT NOT NULL,
                otp TEXT, -- Generated only after agent accepts
                status TEXT NOT NULL DEFAULT 'PENDING_MATCH',
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            );
        `);

        console.log('Dispatcher DB successfully initialized!');
        process.exit(0);
    } catch (err) {
        console.error('Error setting up DB:', err);
        process.exit(1);
    }
}

setupDatabase();
