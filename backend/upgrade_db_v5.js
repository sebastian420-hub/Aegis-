const { query } = require('./db');

async function upgradeDatabase() {
    try {
        console.log('Upgrading SQLite Database to V5 (Adding bank_details)...');
        
        await query('ALTER TABLE transfers ADD COLUMN bank_details TEXT;');

        console.log('Database successfully upgraded to V5!');
        process.exit(0);
    } catch (err) {
        console.error('Error upgrading DB:', err);
        process.exit(1);
    }
}

upgradeDatabase();
