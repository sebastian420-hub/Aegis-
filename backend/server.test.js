process.env.ARBITER_PRIVATE_KEY = "0x0123456789012345678901234567890123456789012345678901234567890123";
process.env.CORE_ESCROW_ADDRESS = "0x1111111111111111111111111111111111111111";
process.env.STRIPE_SECRET_KEY = "sk_test_mock";
process.env.STRIPE_WEBHOOK_SECRET = "whsec_mock";

const request = require('supertest');
const { ethers } = require('ethers');

// Mock Database
jest.mock('./db', () => ({
    query: jest.fn(),
    pool: {}
}));
const { query } = require('./db');

// Mock Stripe
const mockPaymentIntentCreate = jest.fn();
const mockConstructEvent = jest.fn();
jest.mock('stripe', () => {
    return jest.fn(() => ({
        paymentIntents: { create: mockPaymentIntentCreate },
        webhooks: { constructEvent: mockConstructEvent }
    }));
});

const app = require('./server');

describe('Core Orchestrator API', () => {
    afterEach(() => {
        jest.clearAllMocks();
    });

    describe('POST /request-funds', () => {
        it('should return 400 for invalid wallet', async () => {
            const res = await request(app).post('/request-funds').send({
                beneficiary_wallet: 'invalid_address',
                requested_thb: 1000
            });
            expect(res.statusCode).toBe(400);
            expect(res.body.error).toBe('Invalid beneficiary wallet address');
        });

        it('should return 503 if insufficient liquidity', async () => {
            const wallet = ethers.Wallet.createRandom().address;
            
            query.mockResolvedValueOnce({
                rows: [{ total_escrowed: 10, total_reserved: 5 }] 
            });

            const res = await request(app).post('/request-funds').send({
                beneficiary_wallet: wallet,
                requested_thb: 1000 
            });

            expect(res.statusCode).toBe(503);
            expect(res.body.error).toBe('Insufficient liquidity');
        });

        it('should succeed when liquidity is available', async () => {
            const wallet = ethers.Wallet.createRandom().address;
            
            query.mockResolvedValueOnce({
                rows: [{ total_escrowed: 1000, total_reserved: 0 }] 
            });
            query.mockResolvedValueOnce({});
            query.mockResolvedValueOnce({});

            mockPaymentIntentCreate.mockResolvedValueOnce({
                id: 'pi_mock123',
                next_action: {
                    promptpay_display_qr_code: {
                        hosted_instructions_url: 'https://mock.stripe.com/qr'
                    }
                }
            });

            const res = await request(app).post('/request-funds').send({
                beneficiary_wallet: wallet,
                requested_thb: 1000
            });

            expect(res.statusCode).toBe(200);
            expect(res.body).toHaveProperty('tx_id');
            expect(res.body.qr_code_url).toBe('https://mock.stripe.com/qr');
            expect(res.body).toHaveProperty('rate_expiry');
            expect(query).toHaveBeenCalledTimes(3); 
            expect(mockPaymentIntentCreate).toHaveBeenCalled();
        });
    });

    describe('GET /transaction/:tx_id/status', () => {
        it('should return transaction status', async () => {
            query.mockResolvedValueOnce({
                rows: [{ status: 'pending_fiat', signature: null, rate_expiry: new Date().toISOString() }]
            });

            const res = await request(app).get('/transaction/mock-uuid-123/status');
            
            expect(res.statusCode).toBe(200);
            expect(res.body.status).toBe('pending_fiat');
        });

        it('should return 404 if not found', async () => {
            query.mockResolvedValueOnce({ rows: [] });
            const res = await request(app).get('/transaction/mock-uuid-123/status');
            expect(res.statusCode).toBe(404);
        });
    });

    describe('POST /webhook/stripe', () => {
        it('should process webhook and issue signature', async () => {
            mockConstructEvent.mockReturnValueOnce({
                id: 'evt_mock123',
                type: 'payment_intent.succeeded',
                data: {
                    object: {
                        metadata: { tx_id: 'mock-tx-uuid' }
                    }
                }
            });

            query.mockResolvedValueOnce({ rows: [{ event_id: 'evt_mock123' }] });
            query.mockResolvedValueOnce({
                rows: [{
                    tx_id: 'mock-tx-uuid',
                    status: 'pending_fiat',
                    rate_expiry: new Date(Date.now() + 100000).toISOString(),
                    usdc_amount: '28.571428',
                    beneficiary_wallet: ethers.Wallet.createRandom().address
                }]
            });
            query.mockResolvedValueOnce({});
            query.mockResolvedValueOnce({});

            const res = await request(app)
                .post('/webhook/stripe')
                .set('stripe-signature', 'mock-sig')
                .send(Buffer.from(JSON.stringify({})));

            expect(res.statusCode).toBe(200);
            expect(res.text).toBe('Webhook processed');
            expect(query).toHaveBeenCalledTimes(4); 
        });

        it('should fail if rate expired', async () => {
            mockConstructEvent.mockReturnValueOnce({
                id: 'evt_mock123',
                type: 'payment_intent.succeeded',
                data: {
                    object: {
                        metadata: { tx_id: 'mock-tx-uuid' }
                    }
                }
            });

            query.mockResolvedValueOnce({ rows: [{ event_id: 'evt_mock123' }] });
            query.mockResolvedValueOnce({
                rows: [{
                    tx_id: 'mock-tx-uuid',
                    status: 'pending_fiat',
                    rate_expiry: new Date(Date.now() - 600000).toISOString(),
                    reserved_amount: '28.57'
                }]
            });
            query.mockResolvedValueOnce({});
            query.mockResolvedValueOnce({});

            const res = await request(app)
                .post('/webhook/stripe')
                .set('stripe-signature', 'mock-sig')
                .send(Buffer.from(JSON.stringify({})));

            expect(res.statusCode).toBe(200);
            expect(res.text).toBe('Rate expired');
            expect(query.mock.calls[2][0]).toContain("UPDATE transactions SET status = 'expired'");
            expect(query.mock.calls[3][0]).toContain("UPDATE liquidity_pool SET total_reserved = total_reserved - $1");
        });
    });
});
