# Commission & Fee Economics Design (V3 Production)

**Context:** The V2 Sandbox currently uses a 1:1 hardcoded exchange rate with zero fees. This document outlines the mathematical and architectural upgrades required to make Aegis Protocol a profitable, revenue-generating business for both the Network Agents and the Protocol itself.

---

## 1. Agent Commission (The Free-Market Spread)
Agents must be financially incentivized to act as human ATMs. Rather than hardcoding a flat fee, Agents will earn commission via a free-market "spread" (Exchange Rate).

### The Math
* **Market Rate:** 1 USDC = 1 USD
* **Agent Rate:** 1.03 USDC = 1 USD (Agent charges a 3% premium for liquidity)
* **User Request:** User wants $100 physical cash.
* **Smart Contract Lock:** The User's wallet locks **103 USDC**.
* **Settlement:** The Agent hands over $100 fiat, and the Smart Contract releases 103 USDC to the Agent.
* **Profit:** The Agent instantly secures a $3 arbitrage profit.

### UI Upgrades Required
1. **Order Book Bidding:** Update the Next.js Agent Hub so Agents can post their own "Exchange Rates" (e.g., "I will pay $1 USD for every 1.05 USDC").
2. **User Checkout:** Update the User's Cash Out screen to calculate the final USDC cost based on the Agent's spread before locking the funds.

---

## 2. Protocol Revenue (Aegis Treasury)
While the Agent makes money on the spread, Aegis Protocol must make money on the sheer volume of transactions. We will implement a hardcoded **Protocol Fee** (e.g., 1%) directly into the immutable Smart Contract.

### The Smart Contract Upgrade
We will upgrade `CoreEscrow.sol` to mathematically guarantee that Aegis gets paid before the Agent gets paid.

**Solidity Changes Needed:**
```solidity
// Add global variables
address public feeTreasury; // The Aegis Corporate Wallet
uint256 public protocolFeeBps = 100; // 100 Basis Points = 1.00%

// Upgrade the releaseFunds() function
function releaseFunds(...) external nonReentrant {
    require(block.timestamp <= deadline, "Signature expired");
    // ... [EIP-712 Verification Logic] ...

    // Split the Payment
    uint256 fee = (amount * protocolFeeBps) / 10000;
    uint256 payout = amount - fee;

    // Send 1% to Aegis Protocol
    require(usdc.transfer(feeTreasury, fee), "Fee transfer failed");
    
    // Send 99% to the Agent
    require(usdc.transfer(settlerNode, payout), "Payout failed");
    
    // ... [Emit Events] ...
}
```

### The Math
Using the previous example where the User locked 103 USDC:
1. The Smart Contract verifies the Arbiter Signature.
2. It calculates the 1% Protocol Fee: `103 * 0.01 = 1.03 USDC`.
3. It sends **1.03 USDC** to the Aegis `feeTreasury`.
4. It sends the remaining **101.97 USDC** to the Agent.
5. **Result:** The Agent still makes a $1.97 profit, and Aegis Protocol makes $1.03 in pure passive revenue.

---

## 3. Implementation Checklist for V3
To implement this system, the following files must be modified:

- [ ] **`contracts/CoreEscrow.sol`**: Add `feeTreasury`, `protocolFeeBps`, and the math split in `releaseFunds`.
- [ ] **`backend/schema.sql`**: Add `exchange_rate` and `protocol_fee` columns to the `transfers` table.
- [ ] **`backend/server.js`**: Update the `/cashout/request` endpoint to accept dynamic exchange rates instead of forcing a 1:1 peg.
- [ ] **`frontend/src/app/page.js`**: Rebuild the UI to display the calculated spread (Agent Fee + Network Fee) so the User clearly understands the total cost before signing the transaction.
