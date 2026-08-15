CREATE EXTENSION IF NOT EXISTS "pgcrypto"; -- For gen_random_uuid()

CREATE TABLE IF NOT EXISTS transactions (
    tx_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    beneficiary_wallet TEXT NOT NULL,
    requested_thb NUMERIC(12,2) NOT NULL,
    locked_rate NUMERIC(12,6) NOT NULL,
    usdc_amount NUMERIC(18,6) NOT NULL,
    fee_amount NUMERIC(18,6) NOT NULL DEFAULT 0,
    reserved_amount NUMERIC(18,6),
    reservation_expiry TIMESTAMPTZ,
    rate_expiry TIMESTAMPTZ NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending_fiat'
        CHECK (status IN (
            'pending_fiat','fiat_confirmed','signature_issued',
            'claim_failed','claimed','expired','failed'
        )),
    signature TEXT,
    nonce_or_txid TEXT UNIQUE,
    stripe_payment_intent TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS processed_webhooks (
    event_id TEXT PRIMARY KEY,
    processed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS liquidity_pool (
    id INT PRIMARY KEY DEFAULT 1,
    total_escrowed NUMERIC(18,6) NOT NULL,
    total_reserved NUMERIC(18,6) NOT NULL DEFAULT 0,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO liquidity_pool (id, total_escrowed, total_reserved) 
VALUES (1, 1000.000000, 0)
ON CONFLICT (id) DO NOTHING;
