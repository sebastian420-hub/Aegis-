# V3 Smart Contract Architecture (Technical Implementation Plan)

Before we write the Solidity code, we need to design the mechanics so they are secure, gas-efficient, and future-proof. Here are the "clever" solutions to implement the Protocol Fee and Agent Staking without bloating the smart contract.

---

## 1. The Clever Protocol Fee (Dynamic Off-Chain Calculation)

**The Naive Way:** Hardcode a `uint256 fee = 1%` into the smart contract and do the math on-chain. 
*Why it's bad:* You lose flexibility. If you want to run a "0% Fee Promo" for new users, you have to deploy a whole new smart contract. Division in Solidity is also gas-heavy and causes rounding errors.

**The Clever Way:** Let the Node.js Backend (the Arbiter) calculate the exact split and pass it into the cryptographic signature.

We will upgrade the `RELEASE_REQUEST_TYPEHASH`:
```solidity
// Old
ReleaseRequest(bytes32 transferId, address settlerNode, uint256 amount, uint256 deadline)

// New (Clever)
ReleaseRequest(bytes32 transferId, address settlerNode, uint256 settlerAmount, address feeTreasury, uint256 feeAmount, uint256 deadline)
```

**How it works in `releaseFunds`:**
```solidity
require(settlerAmount + feeAmount == lockedTransfers[transferId].amount, "Amount mismatch");

// The smart contract blindly trusts the Arbiter's math, as long as it equals the locked amount.
usdc.transfer(settlerNode, settlerAmount);
if (feeAmount > 0) {
    usdc.transfer(feeTreasury, feeAmount);
}
```
* **Result:** You can change your business model, run promotions, and adjust fees purely in your Node.js backend without ever touching the blockchain again.

---

## 2. Agent Staking & Cryptographic Slashing

**The Problem:** Anyone can create an Agent account, accept a user's cash-out order, and then never show up. The user's funds are stuck for 30 minutes, ruining the UX.
**The Goal:** Agents must deposit a "Stake" (e.g., 50 USDC). If they ghost a user, we slash their stake and give it to the user as an "Inconvenience Payout".

**The Naive Way:** Track active orders on-chain and write complex dispute logic in Solidity. (Extremely expensive gas fees).

**The Clever Way:** Use **Slashing Signatures**.
1. **Deposit:** Agents call `depositStake(amount)` to lock USDC in the contract.
2. **Backend Enforcement:** The Node.js server refuses to match an Agent with an order unless their on-chain stake is > 50 USDC.
3. **The Ghosting Event:** An Agent accepts an order but doesn't show up. The User clicks "Report Ghost" in the UI. 
4. **The Slashing Ticket:** The Node.js Backend verifies the timeout, and generates an EIP-712 `SlashingTicket` signature. It gives this signature to the aggrieved User.
5. **The Execution:** The User submits the signature to a new function: `slashAgent(agent, payoutAmount, signature)`. 
6. **The Result:** The smart contract deducts `payoutAmount` from the Agent's stake and sends it directly to the User.

### The Staking Logic mapped out:
```solidity
mapping(address => uint256) public agentStakes;
mapping(bytes32 => bool) public usedSlashTickets; // Prevent double-slashing

// Agent deposits funds to become active
function depositStake(uint256 amount) external {
    usdc.transferFrom(msg.sender, address(this), amount);
    agentStakes[msg.sender] += amount;
}

// User submits Arbiter's signature to claim their inconvenience fee from a bad agent
function executeSlash(
    bytes32 slashNonce, 
    address badAgent, 
    uint256 payoutAmount, 
    bytes calldata signature
) external {
    // 1. Verify Arbiter Signature (EIP-712)
    // 2. Deduct from agentStakes[badAgent]
    // 3. usdc.transfer(msg.sender, payoutAmount)
}
```

### Why this architecture is elite:
1. **Zero On-Chain Overhead:** The smart contract doesn't need to know *why* an agent is being slashed. It just verifies the Arbiter's signature and executes. 
2. **Self-Healing Network:** If an Agent provides bad service, they literally pay the user for wasting their time. This creates a hyper-reliable network of agents.
