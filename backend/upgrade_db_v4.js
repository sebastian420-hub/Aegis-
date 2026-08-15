const { query } = require('./db');

async function upgradeDatabase() {
    try {
        console.log('Upgrading SQLite Database to V4 (Adding slip_url)...');
        
        await query('ALTER TABLE transfers ADD COLUMN slip_url TEXT;');

        console.log('Database successfully upgraded to V4!');
        process.exit(0);
    } catch (err) {
        console.error('Error upgrading DB:', err);
        process.exit(1);
    }
}

upgradeDatabase();
