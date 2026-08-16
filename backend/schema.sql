CREATE EXTENSION IF NOT EXISTS "pgcrypto"; -- For gen_random_uuid()

CREATE TABLE IF NOT EXISTS transfers (
    transfer_id UUID PRIMARY KEY,
    sender_wallet TEXT NOT NULL,
    agent_wallet TEXT,
    amount_usdc NUMERIC(18,6) NOT NULL,
    amount_fiat NUMERIC(12,2) NOT NULL,
    currency TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'PENDING_MATCH'
        CHECK (status IN (
            'PENDING_MATCH',
            'ACCEPTED',
            'LOCKED',
            'SLIP_UPLOADED',
            'OTP_VERIFIED',
            'CANCELLED'
        )),
    bank_details TEXT,
    otp TEXT,
    slip_url TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Index for Agents polling available orders quickly
CREATE INDEX IF NOT EXISTS idx_transfers_status ON transfers(status);
