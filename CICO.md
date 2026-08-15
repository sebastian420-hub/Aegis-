# **Technical Architecture Specification: Decentralized Cross-Border Liquidity & Settlement Network (CICO Protocol)**

**Document Version:** 1.0.0 **Target Infrastructure:** Polygon POS (USDC ERC-20), Node.js / TypeScript, PostgreSQL, Redis, EIP-712 **Corridor Scope:** Bi-directional Fiat \\leftrightarrow Stablecoin Settlement (e.g., THB / PromptPay \\leftrightarrow MMK / KPay)

## **1\. Executive Summary**

The **CICO (Cash-In / Cash-Out) Protocol** is an autonomous, decentralized cross-border clearing and settlement system. It decouples high-speed digital value transfer on-chain from local fiat liquidity distribution on the ground.  
Traditional cross-border remittances suffer from excessive fee structures, slow correspondent banking settlement (SWIFT), and single-point-of-failure vulnerabilities in hostile or capital-restricted environments.  
This architecture addresses these challenges by combining:

> 1. **Cryptographic Escrow & Gasless State Changes** (Polygon Layer-2 via EIP-712).  
> 2. **Heuristic-Resistant 1:1 Dispatch Engine** (Algorithmic load balancing across independent liquidity nodes to prevent bank velocity flags and account contamination).  
> 3. **Automated Inter-Agent "Dark Pool" Rebalancing** (An internal peer-to-peer liquidity order book eliminating reliance on centralized exchange off-ramps).

## **2\. System Architecture & Layer Topology**

The platform operates across three isolated layers to preserve operational security, financial resolution, and fault tolerance.  
`+-------------------------------------------------------------------------+`  
`|                       LAYER 3: EDGE & PHYSICAL LIQUIDITY               |`  
`|  [ End-User PWA / Mini-App ] <-------> [ Bi-Directional Agent Nodes ]    |`  
`|  - Fiat Cash-In / Out                  - Local Banking Apps (PromptPay) |`  
`|  - Metadata / Memo Payload             - Local Mobile Wallets (KPay)    |`  
`+-------------------------------------------------------------------------+`  
                                    `▲`  
                                    `│ WebSockets / EIP-712 RPC`  
                                    `▼`  
`+-------------------------------------------------------------------------+`  
`|                  LAYER 2: ORCHESTRATION & DISPATCH ENGINE               |`  
`|  [ Ingestion & Auth ]       [ Velocity Controller ]    [ Dark Pool ]    |`  
`|  - Signature Verification   - Anti-Mule Cooldown Engine- Agent OrderBook|`  
`|  - PostgreSQL State Matrix  - Redis Real-Time Cache    - Dynamic Spread |`  
`+-------------------------------------------------------------------------+`  
                                    `▲`  
                                    `│ Relayer RPC Transactions`  
                                    `▼`  
`+-------------------------------------------------------------------------+`  
`|                    LAYER 1: SETTLEMENT & ESCROW (ON-CHAIN)              |`  
`|  [ Polygon Blockchain ] <-----------------> [ CoreEscrow.sol ]          |`  
`|  - Native USDC Settlement                   - Non-Custodial Lock Engine |`  
`|  - State Verification                       - Multisig Arbiter Key      |`  
`+-------------------------------------------------------------------------+`

## **3\. Component Specifications**

### **3.1 Layer 1: Settlement & Escrow Layer**

> * **Network:** Polygon PoS (low latency, predictable sub-cent gas fees).  
> * **Asset:** USD Coin (USDC \- native contract).  
> * **Smart Contract (CoreEscrow.sol):** Acts as the trustless settlement vault. Holds user and agent collateral; handles programmatic locked deposits, batch releases, and multi-signature dispute resolution without taking custody of private keys.

### **3.2 Layer 2: Orchestration & Dispatch Engine**

> * **Runtime:** Node.js / TypeScript with an event-driven worker architecture.  
> * **Database (PostgreSQL):** Relational store managing transaction state, agent metadata, invite graph trees, and audit ledgers.  
> * **Cache & Memory Queue (Redis):** In-memory store for rate limiting, dynamic pricing calculation caching, and real-time agent presence/heartbeats.  
> * **Anti-Mule Heuristic Engine:** Enforces strict limits on agent banking accounts to avoid triggering automated Central Fraud Registry flags.

### **3.3 Layer 3: Edge & Liquidity Layer**

> * **Consumer Client:** Non-custodial Web3 Progressive Web App (PWA) or Telegram WebApp running Web3Auth / embedded key management.  
> * **Agent Terminal:** Specialized dashboard displaying available working capital, float ratios, real-time dispatch alerts, and internal rebalance matching.

## **4\. End-to-End Core Workflows**

### **4.1 Cross-Border Cash-In \\rightarrow Cash-Out Flow**

`[User A (Sender)]       [Node A (Origin)]       [Engine / Relayer]      [Node B (Settler)]     [Recipient B]`  
        `│                       │                       │                       │                   │`  
        `│── 1. Fiat Deposit ───>│                       │                       │                   │`  
        `│                       │── 2. Sign EIP-712 ───>│                       │                   │`  
        `│                       │   (Lock USDC Intent)  │                       │                   │`  
        `│                       │                       │── 3. Match Order ────>│                   │`  
        `│                       │                       │   (Dispatch Order)    │                   │`  
        `│                       │                       │                       │── 4. Send Fiat ──>│`  
        `│                       │                       │                       │   (+ Memo Note)   │`  
        `│                       │                       │<── 5. Proof of Payout─│                   │`  
        `│                       │                       │    (Bank Slip/Ref)    │                   │`  
        `│                       │                       │── 6. Release USDC ───>│                   │`  
        `│                       │                       │   (Settles to Node B) │                   │`

> 1. **Deposit (Origin Corridor):** User A hands physical cash or sends local digital fiat to Node A.  
> 2. **Intent Creation:** Node A approves the transaction in-app. The client signs an EIP-712 typed message authorizing the transfer of USDC from Node A's wallet to CoreEscrow.sol.  
> 3. **Dispatch Matching:** The Dispatch Engine evaluates active nodes in the destination corridor. It identifies Node B (an active node with sufficient fiat balance and zero velocity cooldown violations) and assigns the order.  
> 4. **Fiat Execution:** Node B receives a push dispatch containing:  
   * Target Fiat Network (e.g., PromptPay / KPay)  
   * Recipient Account Identifier  
   * Exact Payout Amount  
   * **Mandatory Reconciliation Memo** (e.g., "INV-98124 / School Fees")  
> 5. **Verification & Attestation:** Node B transfers the fiat to Recipient B and uploads the settlement reference / transaction slip.  
> 6. **Settlement Execution:** The engine validates the proof, triggers the relayer to invoke settleOrder() on CoreEscrow.sol, and transfers the locked USDC plus fee commission directly into Node B’s crypto wallet.

### **4.2 Automated Agent Rebalancing ("Dark Pool" OTC Engine)**

When an agent's fiat-to-crypto ratio deviates beyond operational limits, the platform facilitates an automated internal swap between complementary nodes without requiring external exchange interfaces.  
`Agent A (Dry on Fiat / Heavy on USDC)                 Agent B (Heavy on Fiat / Needs USDC)`  
                    `│                                                     │`  
                    `│─── 1. "Rebalance Intent" (1,500 USDC) ─────────────>│`  
                    `│                                                     │`  
                    `│<── 2. Matched by Engine (1:1 Internal OrderBook) ──>│`  
                    `│                                                     │`  
                    `│    [Engine locks 1,500 USDC in Escrow]              │`  
                    `│                                                     │`  
                    `│<── 3. Single Batch Fiat Transfer (e.g., 51,000 THB)─│`  
                    `│       (Low-velocity, high-ticket transfer)          │`  
                    `│                                                     │`  
                    `│─── 4. Attests "Fiat Received" ─────────────────────>│`  
                    `│                                                     │`  
                    `│    [Smart Contract Releases 1,500 USDC to Agent B]  │`

## **5\. Algorithmic Dispatch & Risk Control Engine**

### **5.1 Velocity Capping & Anti-Mule Heuristics**

To protect human agents from automated banking surveillance algorithms, the Dispatch Engine maintains a strict operational state machine per node:  
\\text{Daily Tx Count} \\le \\text{Max Daily Tx} \\quad (\\text{Default: } 5\) \\text{Daily Volume} \\le \\text{Max Daily Volume} \\quad (\\text{Default: } \\$1,000 \\text{ equivalent})  
                  `+-----------------------------------+`  
                  `|              ACTIVE               |`  
                  `| Available for automatic dispatch  |`  
                  `+-----------------------------------+`  
                                    `│`  
               `Tx Count == Max  OR  Volume == Max`  
                                    `▼`  
                  `+-----------------------------------+`  
                  `|           COOLING DOWN            |`  
                  `| Suspended from pool (24-48 hrs)   |`  
                  `+-----------------------------------+`  
                                    `│`  
                           `Cron: 00:00:00 UTC`  
                                    `▼`  
                  `+-----------------------------------+`  
                  `|          STATE RESTORED           |`  
                  `|     Counters set to 0 -> ACTIVE   |`  
                  `+-----------------------------------+`

### **5.2 Dynamic Corridor Pricing & Inventory Curve**

When one-way capital flight causes an asset imbalance in a specific corridor, the engine algorithmically adjusts the spread using an inventory-ratio pricing formula to suppress outbound drain and incentivize inbound liquidity:  
> R \= \\frac{\\text{Current Available Corridor USDC}}{\\text{Target Reserve Capacity}} \\text{Fee}\_{\\text{outbound}} \= \\text{BaseFee} \+ k \\cdot (1 \- R)^2 \\quad (\\text{for } R \< 1\) \\text{Rebate}\_{\\text{inbound}} \= \\text{BaseRebate} \+ c \\cdot (1 \- R) \\quad (\\text{Incentive to Arbitrageurs})

> * k: Sensitivity constant tuning the steepness of the outbound penalty curve.  
> * c: Arbitrage incentive scaling factor.

## **6\. Database Schema (PostgreSQL DDL)**

`-- Extension requirements`  
`CREATE EXTENSION IF NOT EXISTS "uuid-ossp";`

`-- 1. Nodes & Liquidity Float`  
`CREATE TABLE nodes (`  
    `id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),`  
    `wallet_address VARCHAR(42) UNIQUE NOT NULL,`  
    `fiat_provider VARCHAR(50) NOT NULL,       -- 'PROMPTPAY', 'KPAY', 'KBZ_BANK'`  
    `fiat_account_id VARCHAR(255) NOT NULL,     -- Destination identifier (phone, acc number)`  
    `fiat_account_name VARCHAR(255) NOT NULL,`  
      
    `-- Collateral & Balances`  
    `collateral_usdc DECIMAL(18,6) DEFAULT 0.000000,`  
    `available_fiat_balance DECIMAL(18,2) DEFAULT 0.00,`  
      
    `-- Heuristic Velocity Constraints`  
    `daily_tx_count INT DEFAULT 0,`  
    `max_daily_tx INT DEFAULT 5,`  
    `daily_volume_fiat DECIMAL(18,2) DEFAULT 0.00,`  
    `max_daily_volume_fiat DECIMAL(18,2) DEFAULT 35000.00,`  
      
    `status VARCHAR(30) DEFAULT 'ACTIVE',      -- 'ACTIVE', 'COOLING_DOWN', 'SUSPENDED', 'OFFLINE'`  
    `last_cooldown_reset TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,`  
    `created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP`  
`);`

`-- 2. Master Transactions Ledger`  
`CREATE TABLE transactions (`  
    `id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),`  
    `sender_wallet VARCHAR(42) NOT NULL,`  
      
    `-- Origin / Cash-In Attributes`  
    `origin_corridor VARCHAR(10) NOT NULL,      -- 'TH', 'MM'`  
    `origin_node_id UUID REFERENCES nodes(id),`  
      
    `-- Destination / Cash-Out Attributes`  
    `dest_corridor VARCHAR(10) NOT NULL,        -- 'MM', 'TH'`  
    `dest_fiat_provider VARCHAR(50) NOT NULL,`  
    `dest_fiat_account VARCHAR(255) NOT NULL,`  
    `dest_fiat_name VARCHAR(255) NOT NULL,`  
      
    `-- Financial Specifications`  
    `amount_fiat_in DECIMAL(18,2) NOT NULL,`  
    `amount_fiat_out DECIMAL(18,2) NOT NULL,`  
    `amount_usdc_principal DECIMAL(18,6) NOT NULL,`  
    `platform_fee_usdc DECIMAL(18,6) NOT NULL,`  
    `agent_commission_usdc DECIMAL(18,6) NOT NULL,`  
      
    `-- Context / Reconciliation`  
    `reconciliation_memo VARCHAR(255) NOT NULL,`  
      
    `-- Assignment & Status`  
    `assigned_settler_node_id UUID REFERENCES nodes(id),`  
    `status VARCHAR(40) DEFAULT 'PENDING_MATCH',`   
    `-- 'PENDING_MATCH', 'DISPATCHED', 'FIAT_SENT', 'SETTLED_ONCHAIN', 'DISPUTED'`  
      
    `onchain_tx_hash VARCHAR(66),`  
    `fiat_payment_reference VARCHAR(255),`  
    `created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,`  
    `updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP`  
`);`

`-- 3. Inter-Agent Rebalancing Order Book (Dark Pool)`  
`CREATE TABLE rebalance_orders (`  
    `id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),`  
    `maker_node_id UUID REFERENCES nodes(id) NOT NULL,`  
    `taker_node_id UUID REFERENCES nodes(id),`  
      
    `amount_usdc DECIMAL(18,6) NOT NULL,`  
    `amount_fiat DECIMAL(18,2) NOT NULL,`  
    `fiat_currency VARCHAR(10) NOT NULL,        -- 'THB', 'MMK'`  
      
    `escrow_intent_hash VARCHAR(66),`  
    `status VARCHAR(30) DEFAULT 'OPEN',        -- 'OPEN', 'MATCHED', 'FIAT_CONFIRMED', 'SETTLED'`  
    `created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,`  
    `completed_at TIMESTAMP WITH TIME ZONE`  
`);`

`-- 4. Audit & Verification Trail`  
`CREATE TABLE audit_logs (`  
    `id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),`  
    `transaction_id UUID REFERENCES transactions(id),`  
    `actor_address VARCHAR(42) NOT NULL,`  
    `action VARCHAR(50) NOT NULL,`  
    `metadata JSONB,`  
    `created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP`  
`);`

## **7\. Smart Contract Specification (CoreEscrow.sol)**

`// SPDX-License-Identifier: MIT`  
`pragma solidity ^0.8.20;`

`interface IERC20 {`  
    `function transfer(address to, uint256 value) external returns (bool);`  
    `function transferFrom(address from, address to, uint256 value) external returns (bool);`  
`}`

`/**`  
 `* @title CoreEscrow`  
 `* @dev Manages non-custodial locks, atomic batch settlements, and multi-sig arbitration.`  
 `*/`  
`contract CoreEscrow {`  
    `address public immutable arbiter;`  
    `IERC20 public immutable usdcToken;`

    `struct LockRecord {`  
        `address originNode;`  
        `uint256 principalAmount;`  
        `uint256 platformFee;`  
        `uint256 agentCommission;`  
        `bool isSettled;`  
    `}`

    `// Maps transaction UUID (converted to bytes32) to its on-chain lock state`  
    `mapping(bytes32 => LockRecord) public escrowLocks;`  
    `// Tracks agent collateral stakes`  
    `mapping(address => uint256) public agentCollateral;`

    `event FundsLocked(bytes32 indexed txId, address indexed originNode, uint256 totalAmount);`  
    `event OrderSettled(bytes32 indexed txId, address indexed settlerNode, uint256 totalPayout);`  
    `event DisputeResolved(bytes32 indexed txId, address indexed recipient, uint256 amount);`

    `modifier onlyArbiter() {`  
        `require(msg.sender == arbiter, "AUTH: Caller is not the authorized arbiter");`  
        `_;`  
    `}`

    `constructor(address _usdcToken, address _arbiter) {`  
        `require(_usdcToken != address(0) && _arbiter != address(0), "INVALID_PARAMS");`  
        `usdcToken = IERC20(_usdcToken);`  
        `arbiter = _arbiter;`  
    `}`

    `/**`  
     `* @notice Locks origin agent USDC into the escrow contract.`  
     `*/`  
    `function lockDeposit(`  
        `bytes32 txId,`  
        `address originNode,`  
        `uint256 principal,`  
        `uint256 platformFee,`  
        `uint256 agentCommission`  
    `) external onlyArbiter {`  
        `require(escrowLocks[txId].principalAmount == 0, "ESCROW: Tx already exists");`

        `uint256 total = principal + platformFee + agentCommission;`  
        `require(usdcToken.transferFrom(originNode, address(this), total), "TRANSFER_FAILED");`

        `escrowLocks[txId] = LockRecord({`  
            `originNode: originNode,`  
            `principalAmount: principal,`  
            `platformFee: platformFee,`  
            `agentCommission: agentCommission,`  
            `isSettled: false`  
        `});`

        `emit FundsLocked(txId, originNode, total);`  
    `}`

    `/**`  
     `* @notice Releases locked principal and commission to the settler node upon validated fiat payout.`  
     `*/`  
    `function settleOrder(`  
        `bytes32 txId,`  
        `address settlerNode,`  
        `address feeTreasury`  
    `) external onlyArbiter {`  
        `LockRecord storage record = escrowLocks[txId];`  
        `require(record.principalAmount > 0, "ESCROW: Invalid lock record");`  
        `require(!record.isSettled, "ESCROW: Already settled");`

        `record.isSettled = true;`

        `uint256 settlerPayout = record.principalAmount + record.agentCommission;`  
        `uint256 fee = record.platformFee;`

        `require(usdcToken.transfer(settlerNode, settlerPayout), "SETTLER_PAYOUT_FAILED");`  
        `require(usdcToken.transfer(feeTreasury, fee), "FEE_TRANSFER_FAILED");`

        `emit OrderSettled(txId, settlerNode, settlerPayout);`  
    `}`

    `/**`  
     `* @notice Fallback function to resolve stuck orders or fraudulent proofs.`  
     `*/`  
    `function resolveDispute(`  
        `bytes32 txId,`  
        `address refundRecipient`  
    `) external onlyArbiter {`  
        `LockRecord storage record = escrowLocks[txId];`  
        `require(record.principalAmount > 0 && !record.isSettled, "ESCROW: Unresolvable");`

        `record.isSettled = true;`  
        `uint256 total = record.principalAmount + record.platformFee + record.agentCommission;`

        `require(usdcToken.transfer(refundRecipient, total), "REFUND_FAILED");`  
        `emit DisputeResolved(txId, refundRecipient, total);`  
    `}`  
`}`

## **8\. Phased Implementation Roadmap**

  `PHASE 1: THE DARK POOL BOOTSTRAP`  
  `├── Architecture: Private Node.js relayer + Invite-only PWA`  
  `├── Liquidity: 20-50 Collateralized Human Micro-Nodes`  
  `├── Goal: Validate unit economics (2% spread) & verify EIP-712 stability`  
  `└── Risk Mitigation: Hard daily velocity caps (<= 5 tx/day/node)`  
            `│`  
            `▼`  
  `PHASE 2: THE AUTONOMOUS AGENT PROTOCOL`  
  `├── Architecture: Open Agent Terminal with In-App Rebalancing`  
  `├── Liquidity: Self-sovereign OTC market making`  
  `├── Goal: Expand to multiple corridors; autonomous dynamic spread pricing`  
  `└── Risk Mitigation: Automated staking slasher contract & fraud dispute multisig`  
            `│`  
            `▼`  
  `PHASE 3: INSTITUTIONAL RAILS (BaaS GATEWAY)`  
  `├── Architecture: Corporate Delaware / Singapore Entity + Bank APIs`  
  `├── Liquidity: Integrated BaaS Providers (Stripe, DeeMoney, 2C2P)`  
  `├── Goal: High-ticket B2B cross-border supply chain settlement`  
  `└── Risk Mitigation: Full KYB verification & compliant corporate liquidity vaults`  
