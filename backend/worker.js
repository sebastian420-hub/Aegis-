require('dotenv').config();
const cron = require('node-cron');
const { query } = require('./db');
const fetch = require('node-fetch'); // Need to install node-fetch or use built-in fetch if Node >= 18

cron.schedule('*/60 * * * * *', async () => {
    console.log('Running stuck claims reconciliation worker...');
    try {
        const { rows } = await query(`
            SELECT tx_id, beneficiary_wallet, usdc_amount, signature, reserved_amount
            FROM transactions 
            WHERE status = 'signature_issued' 
            AND updated_at < NOW() - INTERVAL '2 minutes'
        `);

        for (const tx of rows) {
            console.log(`Processing stuck tx: ${tx.tx_id}`);
            
            // Mocking the relay-submit API call (simulating relayer confirmation)
            const success = true; 

            if (success) {
                await query(`UPDATE transactions SET status = 'claimed' WHERE tx_id = $1`, [tx.tx_id]);
                await query(`
                    UPDATE liquidity_pool 
                    SET total_escrowed = total_escrowed - $1, total_reserved = total_reserved - $1 
                    WHERE id = 1
                `, [tx.reserved_amount]);
                console.log(`Successfully resolved and claimed tx: ${tx.tx_id}`);
            } else {
                // Future expansion: Track retry count, fail after 3 tries.
                console.log(`Relay failed for tx: ${tx.tx_id}`);
            }
        }
    } catch (err) {
        console.error('Worker error:', err);
    }
});

console.log('Reconciliation worker started (runs every 60s).');
