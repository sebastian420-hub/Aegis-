# Aegis Protocol (V2 Sandbox)

Aegis Protocol is a decentralized, non-custodial Cash-In/Cash-Out (CICO) network. It acts as the physical ATM layer for Web3, allowing users to safely swap physical cash for digital crypto (USDC) via a peer-to-peer network of human agents. 

This repository contains the V2 Sandbox, which runs locally on a Hardhat blockchain and uses embedded "Burner Wallets" to provide a Web2-like UX.

---

## 🏗 System Architecture

The protocol consists of three main layers:

1. **Smart Contracts (`/contracts`)**
   - **`CoreEscrow.sol`**: The decentralized Escrow engine. It locks the User's crypto and only releases it to the Agent when an EIP-712 cryptographic signature is provided.

2. **Backend Arbiter (`/backend`)**
   - **`server.js`**: A Node.js API backed by SQLite (`transfers.db`). It handles order matchmaking, tracks UUIDs, processes digital bank slips, and acts as the "Arbiter Node" to generate off-chain EIP-712 signatures.

3. **Frontend Dashboard (`/frontend`)**
   - **Next.js**: The user-facing application. It generates invisible `ethers.js` Burner Wallets in `localStorage`, creates QR codes for physical cash trades, and seamlessly executes smart contract calls without requiring MetaMask.

---

## 🚀 How to Run the Local Sandbox

To test the entire system end-to-end on your local machine, you need to spin up all three layers. Open three separate terminal windows.

### Terminal 1: Start the Blockchain (Hardhat)
This boots up a local Ethereum network and deploys the Escrow contract.
```bash
cd "Aegis Protocol/contracts"
npx hardhat node
```
*(Leave this terminal running. It will log all smart contract transactions.)*

### Terminal 2: Start the Backend Arbiter
This starts the matchmaking engine and signature generator on `localhost:3001`.
```bash
cd "Aegis Protocol/backend"
node server.js
```
*(Leave this terminal running. It will log API requests and signature generation.)*

### Terminal 3: Start the Frontend UI
This starts the Next.js web application on `localhost:3000`.
```bash
cd "Aegis Protocol/frontend"
npm run dev
```
*(Leave this terminal running.)*

---

## 🧪 Testing the E2E "Cash Out" Flow

1. Open your browser to **`http://localhost:3000`**.
2. **The User Perspective:**
   - In the "Cash Out" tab, enter `100` as the amount.
   - Select either **Physical Cash (QR)** or **Digital Wire (Bank Slip)**.
   - Click "Initialize Cash Out". The system will lock 100 USDC in the smart contract and display a QR code.
3. **The Agent Perspective:**
   - Open a second browser tab (or use your phone) and go to `http://localhost:3000`.
   - Click the **Agent Hub** tab.
   - You will see the pending 100 USDC order. Click **Accept & Fulfill**.
   - **For QR:** Scan the User's QR code.
   - **For Bank Slip:** Upload a dummy image of a bank receipt.
4. **The Settlement:**
   - The backend validates the proof and generates an EIP-712 signature.
   - The frontend automatically broadcasts the `releaseFunds` transaction.
   - The smart contract verifies the signature and transfers the 100 USDC to the Agent.

---

## 📚 Strategic Documentation
For a deep dive into how this scales to a multi-million dollar business, read the architectural blueprints included in the repository:
- `MACRO_ARCHITECTURE.md` - Overall system design.
- `CICO.md` - Cash-In / Cash-Out Mechanics.
- `COMMISSION_SYSTEM_DESIGN.md` - How the Agents and the Protocol generate revenue.
- `LIQUIDITY_ROUTING_DESIGN.md` - B2B OTC routing strategy for institutional scale.
- `GRASSROOTS_GTM_STRATEGY.md` - Go-To-Market playbook.
- `PRODUCTION_VULNERABILITY_SOLUTIONS.md` - The roadmap for V3 (Passkeys & Agent Staking).
