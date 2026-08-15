# Aegis Protocol V0.1 - Local E2E Sandbox Guide

This guide explains how to spin up the entire Aegis Protocol stack (Smart Contracts, Backend API, Postgres DB, and Next.js Frontend) on your local machine for end-to-end testing.

## Prerequisites
- Node.js (v18+)
- PostgreSQL installed and running locally
- A Stripe account (Sandbox mode)
- [Stripe CLI](https://stripe.com/docs/stripe-cli) installed

---

## 1. Database Setup
1. Ensure PostgreSQL is running on your machine.
2. Create a new database for Aegis:
   ```bash
   createdb aegis_v0
   ```
3. Navigate to the backend directory and execute the schema:
   ```bash
   cd "Aegis Protocol/backend"
   psql -d aegis_v0 -f schema.sql
   ```

## 2. Backend Orchestrator Setup
1. Inside the `backend/` directory, create a `.env` file:
   ```env
   PORT=3000
   DATABASE_URL=postgres://localhost:5432/aegis_v0
   STRIPE_SECRET_KEY=sk_test_... (From your Stripe Dashboard)
   STRIPE_WEBHOOK_SECRET=whsec_... (You'll get this in step 3)
   ARBITER_PRIVATE_KEY=0x1234... (Your testnet wallet private key)
   CORE_ESCROW_ADDRESS=0xMockEscrowContractAddress
   ```
2. Open two terminal windows for the backend:
   - **Terminal 1 (API):** `node server.js`
   - **Terminal 2 (Worker):** `node worker.js`

## 3. Stripe Webhook Listener
To simulate fiat confirmations, you need to forward Stripe webhooks to your local backend.
1. Open a new terminal and log in to Stripe:
   ```bash
   stripe login
   ```
2. Start forwarding to your Express app:
   ```bash
   stripe listen --forward-to localhost:3000/webhook/stripe
   ```
3. **Important:** The CLI will output a webhook signing secret (`whsec_...`). Copy this and add it to your `backend/.env` file under `STRIPE_WEBHOOK_SECRET`, then restart the `server.js` process.

## 4. Frontend UI Setup
1. Open a new terminal and navigate to the frontend:
   ```bash
   cd "Aegis Protocol/frontend"
   ```
2. Start the Next.js development server. Because the backend is running on port 3000, Next.js will likely run on port 3001.
   ```bash
   npm run dev
   ```
3. Open your browser to `http://localhost:3001`.

## 5. Simulating the Full E2E Flow
1. **Request Funds:** On the Next.js frontend, enter a dummy Ethereum wallet address (e.g., `0x742d35Cc6634C0532925a3b844Bc454e4438f44e`) and request `1000` THB. Click Initialize.
2. **QR Screen:** The UI will transition to the QR Code and the 15-minute countdown timer. The transaction status is now `pending_fiat`.
3. **Simulate Payment:** To trigger the webhook for this specific transaction, go to your **Stripe Dashboard -> Payments**, find the newly created *Incomplete* PaymentIntent, and simulate a successful payment. (Alternatively, you can write a quick script to confirm the specific PaymentIntent ID using the Stripe SDK).
4. **Completion:** The Stripe webhook will hit your backend, transition the state to `fiat_confirmed`, generate the EIP-712 signature, and advance to `signature_issued`. 
5. The frontend polling will detect this, simulate the relayer submission, and automatically transition to the final glowing **Success Screen**!
