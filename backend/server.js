require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { ethers } = require('ethers');
const { query } = require('./db');
const crypto = require('crypto');

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 3001;
const ARBITER_PRIVATE_KEY = process.env.ARBITER_PRIVATE_KEY;
const CORE_ESCROW_ADDRESS = process.env.CORE_ESCROW_ADDRESS;
const FEE_TREASURY_ADDRESS = process.env.FEE_TREASURY_ADDRESS || "0x9999999999999999999999999999999999999999";

// ==========================================
// Aegis Protocol V3: Production Arbiter Engine
// ==========================================

// 1. User broadcasts they want to sell USDC for Fiat
app.post('/cashout/request', async (req, res) => {
    try {
        const { sender_wallet, amount_usdc, amount_fiat, currency, bank_details } = req.body;
        
        if (!ethers.isAddress(sender_wallet)) return res.status(400).json({ error: 'Invalid wallet' });

        const transfer_id = crypto.randomUUID();

        await query(`
            INSERT INTO transfers (transfer_id, sender_wallet, amount_usdc, amount_fiat, currency, status, bank_details)
            VALUES ($1, $2, $3, $4, $5, 'PENDING_MATCH', $6)
        `, [transfer_id, sender_wallet, amount_usdc, amount_fiat, currency, bank_details]);

        res.json({ success: true, transfer_id });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// 2. Agents poll this to see available orders in their area
app.get('/cashout/feed', async (req, res) => {
    try {
        const { rows } = await query(`SELECT * FROM transfers WHERE status = 'PENDING_MATCH'`);
        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: 'Internal server error' });
    }
});

// 3. An Agent accepts an order
app.post('/cashout/accept', async (req, res) => {
    try {
        const { transfer_id, agent_wallet } = req.body;
        if (!ethers.isAddress(agent_wallet)) return res.status(400).json({ error: 'Invalid agent wallet' });

        // Generate the 6-digit OTP now that an agent is assigned
        const otp = Math.floor(100000 + Math.random() * 900000).toString();

        const { rowCount } = await query(`
            UPDATE transfers 
            SET status = 'ACCEPTED', agent_wallet = $1, otp = $2 
            WHERE transfer_id = $3 AND status = 'PENDING_MATCH'
        `, [agent_wallet, otp, transfer_id]);

        if (rowCount === 0) return res.status(400).json({ error: 'Order already taken or invalid' });

        res.json({ success: true, message: "Order claimed!" });
    } catch (err) {
        res.status(500).json({ error: 'Internal server error' });
    }
});

// 4. Sender polls this to get status and OTP once Agent accepts
app.get('/cashout/status/:id', async (req, res) => {
    try {
        const { rows } = await query(`SELECT status, agent_wallet, otp, slip_url FROM transfers WHERE transfer_id = $1`, [req.params.id]);
        if (rows.length === 0) return res.status(404).json({ error: 'Not found' });
        res.json(rows[0]);
    } catch (err) {
        res.status(500).json({ error: 'Internal server error' });
    }
});

// 5. Sender confirms they locked funds on-chain
app.post('/confirm-lock', async (req, res) => {
    try {
        const { transfer_id, txHash } = req.body;
        
        const provider = new ethers.JsonRpcProvider("http://127.0.0.1:8545");
        
        const receipt = await provider.waitForTransaction(txHash, 1, 15000);
        if (!receipt || receipt.status === 0) {
            return res.status(400).json({ error: 'Transaction failed or not found' });
        }

        if (receipt.to.toLowerCase() !== CORE_ESCROW_ADDRESS.toLowerCase()) {
            return res.status(400).json({ error: 'Transaction sent to wrong contract' });
        }

        await query(`UPDATE transfers SET status = 'LOCKED' WHERE transfer_id = $1 AND status = 'ACCEPTED'`, [transfer_id]);
        res.json({ success: true });
    } catch (err) {
        console.error("Lock error:", err);
        res.status(500).json({ error: 'Internal server error verifying transaction' });
    }
});

// Helper to generate V3 EIP-712 Release Signatures
async function generateV3ReleaseSignature(transfer_id, agent_wallet, amount_usdc) {
    const wallet = new ethers.Wallet(ARBITER_PRIVATE_KEY);
    const domain = {
        name: "AegisProtocol",
        version: "0.3",
        chainId: 80002,
        verifyingContract: CORE_ESCROW_ADDRESS
    };

    const types = {
        ReleaseRequest: [
            { name: "transferId", type: "bytes32" },
            { name: "settlerNode", type: "address" },
            { name: "settlerAmount", type: "uint256" },
            { name: "feeTreasury", type: "address" },
            { name: "feeAmount", type: "uint256" },
            { name: "deadline", type: "uint256" }
        ]
    };

    const bytes32TransferId = ethers.id(transfer_id); 
    const totalAmountWei = ethers.parseUnits(Number(amount_usdc).toFixed(6), 6);
    
    // V3 Dynamic Fee Calculation: 1% Fee (100 basis points)
    const feeAmount = (totalAmountWei * 100n) / 10000n;
    const settlerAmount = totalAmountWei - feeAmount;
    
    const isProduction = process.env.NODE_ENV === "production";
    const deadlineDelay = isProduction ? 3600 : (86400 * 365);
    const deadline = Math.floor(Date.now() / 1000) + deadlineDelay;

    const value = {
        transferId: bytes32TransferId,
        settlerNode: agent_wallet,
        settlerAmount: settlerAmount.toString(),
        feeTreasury: FEE_TREASURY_ADDRESS,
        feeAmount: feeAmount.toString(),
        deadline: deadline
    };

    const signature = await wallet.signTypedData(domain, types, value);

    return {
        signature,
        settlerAmount: settlerAmount.toString(),
        feeTreasury: FEE_TREASURY_ADDRESS,
        feeAmount: feeAmount.toString(),
        deadline
    };
}

// 6. Agent verifies OTP to claim funds (QR Flow)
app.post('/verify-otp', async (req, res) => {
    try {
        const { transfer_id, otp, agent_wallet } = req.body;

        const { rows } = await query(`SELECT * FROM transfers WHERE transfer_id = $1`, [transfer_id]);
        if (rows.length === 0) return res.status(404).json({ error: 'Transfer not found' });
        
        const transfer = rows[0];

        if (transfer.status !== 'LOCKED') return res.status(400).json({ error: 'Funds are not locked on-chain yet' });
        if (transfer.agent_wallet.toLowerCase() !== agent_wallet.toLowerCase()) return res.status(403).json({ error: 'Not your order' });
        if (transfer.otp !== otp) return res.status(401).json({ error: 'Invalid OTP' });

        const sigData = await generateV3ReleaseSignature(transfer_id, agent_wallet, transfer.amount_usdc);

        await query(`UPDATE transfers SET status = 'OTP_VERIFIED' WHERE transfer_id = $1`, [transfer_id]);

        res.json({
            success: true,
            ...sigData
        });

    } catch (err) {
        res.status(500).json({ error: 'Internal server error' });
    }
});

// 7. Agent uploads payment slip for Digital Transfer
app.post('/cashout/upload-slip', async (req, res) => {
    try {
        const { transfer_id, agent_wallet, slip_url } = req.body;
        
        const { rows } = await query(`SELECT * FROM transfers WHERE transfer_id = $1`, [transfer_id]);
        if (rows.length === 0) return res.status(404).json({ error: 'Transfer not found' });
        
        const transfer = rows[0];
        if (transfer.agent_wallet.toLowerCase() !== agent_wallet.toLowerCase()) return res.status(403).json({ error: 'Not your order' });
        if (transfer.status !== 'LOCKED') return res.status(400).json({ error: 'Funds are not locked on-chain yet' });

        await query(`UPDATE transfers SET status = 'SLIP_UPLOADED', slip_url = $1 WHERE transfer_id = $2`, [slip_url, transfer_id]);
        res.json({ success: true });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// 8. Sender confirms they received payment (Slip Flow)
app.post('/cashout/confirm-payment', async (req, res) => {
    try {
        const { transfer_id, sender_wallet } = req.body;
        
        const { rows } = await query(`SELECT * FROM transfers WHERE transfer_id = $1`, [transfer_id]);
        if (rows.length === 0) return res.status(404).json({ error: 'Transfer not found' });
        
        const transfer = rows[0];
        if (transfer.sender_wallet.toLowerCase() !== sender_wallet.toLowerCase()) return res.status(403).json({ error: 'Not your order' });
        if (transfer.status !== 'SLIP_UPLOADED') return res.status(400).json({ error: 'No slip uploaded yet' });

        const sigData = await generateV3ReleaseSignature(transfer_id, transfer.agent_wallet, transfer.amount_usdc);

        await query(`UPDATE transfers SET status = 'OTP_VERIFIED' WHERE transfer_id = $1`, [transfer_id]);

        res.json({
            success: true,
            ...sigData,
            agent_wallet: transfer.agent_wallet
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// 9. V3: User reports a ghosting agent to claim Inconvenience Slashing Payout
app.post('/cashout/report-ghost', async (req, res) => {
    try {
        const { transfer_id, sender_wallet } = req.body;
        
        const { rows } = await query(`SELECT * FROM transfers WHERE transfer_id = $1`, [transfer_id]);
        if (rows.length === 0) return res.status(404).json({ error: 'Transfer not found' });
        
        const transfer = rows[0];
        if (transfer.sender_wallet.toLowerCase() !== sender_wallet.toLowerCase()) return res.status(403).json({ error: 'Not your order' });
        if (transfer.status !== 'LOCKED' && transfer.status !== 'ACCEPTED') return res.status(400).json({ error: 'Order not in ghostable state' });

        // Generate V3 Slashing Ticket (Penalty: 5 USDC)
        const wallet = new ethers.Wallet(ARBITER_PRIVATE_KEY);
        const domain = {
            name: "AegisProtocol",
            version: "0.3",
            chainId: 80002,
            verifyingContract: CORE_ESCROW_ADDRESS
        };

        const types = {
            SlashRequest: [
                { name: "slashNonce", type: "bytes32" },
                { name: "badAgent", type: "address" },
                { name: "recipient", type: "address" },
                { name: "payoutAmount", type: "uint256" }
            ]
        };

        const slashNonce = ethers.id(transfer_id + "_slash");
        const payoutAmount = ethers.parseUnits("5.0", 6); // 5 USDC

        const value = {
            slashNonce,
            badAgent: transfer.agent_wallet,
            recipient: sender_wallet,
            payoutAmount: payoutAmount.toString()
        };

        const signature = await wallet.signTypedData(domain, types, value);

        await query(`UPDATE transfers SET status = 'CANCELLED' WHERE transfer_id = $1`, [transfer_id]);

        res.json({
            success: true,
            signature,
            slashNonce,
            badAgent: transfer.agent_wallet,
            payoutAmount: payoutAmount.toString()
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Internal server error' });
    }
});


app.get('/cashout/my-locks/:wallet', async (req, res) => {
    try {
        const { rows } = await query(`SELECT * FROM transfers WHERE sender_wallet = $1 AND status = 'LOCKED'`, [req.params.wallet]);
        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/cashout/cancel/:id', async (req, res) => {
    try {
        await query(`UPDATE transfers SET status = 'CANCELLED' WHERE transfer_id = $1`, [req.params.id]);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

if (require.main === module) {
    app.listen(PORT, () => console.log(`V3 Arbiter Engine running on port ${PORT}`));
}
module.exports = app;
