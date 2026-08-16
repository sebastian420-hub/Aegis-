# Liquidity Routing & B2B OTC Integration (Path 1)

**Context:** The Aegis Protocol is designed not just as a consumer application, but as financial infrastructure. To scale globally without triggering crushing regulatory capital requirements (e.g., $1.5M USD for a Digital Asset Dealer license), the architecture is split into two distinct, non-custodial money flows: **Retail** and **Wholesale**.

---

## 1. The Retail Flow (P2P Street Layer)
*This is the core Smart Contract Escrow engine built in V2.*

**Target:** End Users (Migrant workers, freelancers) swapping crypto for cash.
**Counterparties:** End User ↔ Local Agent

### The Flow
1. **Initiation:** User has 100 USDC and requests 3,000 THB physical cash.
2. **Lock:** User's 100 USDC is locked in the `CoreEscrow.sol` smart contract.
3. **Fiat Settlement:** The Local Agent physically hands 3,000 THB to the User.
4. **Crypto Release:** The Arbiter Node verifies the payment and signs an EIP-712 release. The 100 USDC is transferred from the Escrow to the Agent.
5. **Burmanlabs Exposure:** $0. Burmanlabs acts strictly as a cryptographic verifier.

---

## 2. The Wholesale Flow (API Liquidity Layer)
*This is the B2B routing engine required to keep Agents capitalized.*

**Target:** Local Agents who have exhausted their Fiat or Crypto reserves.
**Counterparties:** Local Agent ↔ SEC-Licensed Institutional OTC Desk (e.g., Coins.co.th, InnovestX)

### The Flow (Rebalancing Example)
1. **Initiation:** An Agent has completed 50 retail trades. They now hold 5,000 USDC but have $0 THB left to service new users.
2. **API Routing:** The Agent clicks "Rebalance Liquidity" on the Burmanlabs Terminal. The Node.js server intercepts this and fires an API request to a partnered SEC-Licensed OTC Desk.
3. **Crypto Settlement:** The Agent's 5,000 USDC is routed to the OTC Desk's institutional wallet.
4. **Fiat Settlement:** The OTC Desk automatically wires ~150,000 THB from their corporate bank account directly into the Agent's local bank account.
5. **Burmanlabs Exposure:** $0. Burmanlabs acts strictly as the software routing engine.

---

## 3. The Legal & Economic Framework
By separating the Retail Escrow from the Wholesale Liquidity generation, Burmanlabs executes the ultimate "cheat code" for scaling fintech: **White-Labeling the Bank.**

### The Moat
* **No Capital Requirement:** Burmanlabs does not need to hold millions of dollars in a corporate treasury to provide liquidity to Agents. The licensed OTC partner provides the balance sheet.
* **No Custody Liability:** Because Burmanlabs never holds the fiat or the crypto in transit, the company avoids classification as a Money Transmitter or Digital Asset Custodian.

### Revenue Generation
Since Aegis cannot legally take an exchange spread on the OTC trade, revenue is extracted via B2B Software Agreements:
1. **Volume Rebates:** Burmanlabs aggregates millions of dollars in retail flow and feeds it exclusively to a single OTC partner. In exchange, the OTC partner pays Burmanlabs a backend "Software Routing Rebate" (e.g., a percentage of their trading profits).
2. **SaaS Terminal Fees:** Agents pay a monthly subscription fee (e.g., $50/mo) to access the "Burmanlabs Pro Terminal," which provides them with the dark-pool analytics and the instant 1-click OTC liquidity connection.
