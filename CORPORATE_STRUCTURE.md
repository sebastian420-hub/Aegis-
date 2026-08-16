# Corporate Structure & Brand Architecture

**Context:** To successfully scale in emerging markets (specifically Southeast Asia), the company must present itself differently to users, institutional partners, and regulators. This document outlines the dual-brand strategy and the legal positioning required to avoid being classified as an unlicensed financial institution.

---

## 1. Brand Hierarchy (The Dual-Brand Strategy)

Like Stripe (B2B) and Link (B2C), we separate the underlying infrastructure from the consumer-facing product.

### The Foundation: Aegis Protocol (B2B & Investor Facing)
* **What it is:** The technological layer. It encompasses the Smart Contract Escrow, the backend routing engine, and the EIP-712 cryptographic verification.
* **Who sees it:** Venture Capitalists, SEC-licensed OTC Desks, and software developers.
* **The Pitch:** *"Aegis Protocol is a non-custodial financial routing engine that provides secure, verifiable escrow mechanics for decentralized cash-in/cash-out networks."*

### The Application: Node (B2C Consumer Facing)
* **What it is:** The mobile-first web app that users and local agents interact with daily. Completely stripped of crypto jargon. 
* **Who sees it:** Migrant workers, local merchants, freelancers.
* **The Pitch:** *"Node is the fastest way to turn your digital money into physical cash at a local shop near you."*
* **The Tagline:** *"Node. Powered by Aegis Protocol."*

---

## 2. Legal Entity Structuring (The "Software Co." Play)

The biggest threat to this business is being regulated out of existence before launching. If the government views you as a Bank or a Money Transmitter, you will be shut down for operating without a $1.5M+ capital license.

### The Legal Shield: You are a Software Company
You must incorporate and operate strictly as a **B2B Software Development Company** (e.g., *Burmanlabs* or *Aegis Technologies*). 

**Why this works legally:**
1. **No Custody:** You never hold the user's fiat. You never hold the user's crypto. The Smart Contract (math) holds the crypto, and the Local Agent holds the fiat.
2. **No Money Transmission:** When an Agent needs bulk liquidity, you route their API request to a fully licensed Institutional OTC Desk. The OTC desk handles the actual money transmission.
3. **Pure Software Revenue:** Your company makes money by charging a "Software Routing Fee" (a percentage of the transaction volume routed to your OTC partners) or a "SaaS Terminal Fee" to your Agents. You are legally selling software access, not banking services.

---

## 3. Regulatory Positioning (Thailand & Emerging Markets)

If approached by the Thai SEC or the Bank of Thailand, your corporate defense is airtight:
* *"We are a technology provider. We build open-source smart contracts and user interfaces."*
* *"We do not touch Thai Baht. All Thai Baht transfers happen either peer-to-peer (outside our control) or through our SEC-licensed OTC partners (who handle all KYC/AML reporting)."*
* *"We do not custody Digital Assets. Users hold their own private keys locally on their devices."*

---

## 4. The Pitch Alignment (Who hears what)

When you are raising capital or building partnerships, tailor the corporate structure to the audience:

| Audience | The Core Message | Why they care |
| :--- | :--- | :--- |
| **Venture Capitalists** | We are a high-margin software infrastructure company disrupting the $800B remittance market. | Infinite scalability with zero capital requirements (because we use the OTC's balance sheet). |
| **SEC-Licensed OTC Desks** | We are an API routing engine that aggregates retail liquidity. | We bring them massive, free trade volume without them spending money on marketing. |
| **Local Node Agents** | We provide the terminal and the network to help you make a 3% commission on your spare cash. | Passive income and increased foot traffic to their primary business. |
| **End Users** | Get your cash in 30 seconds at the shop next door. | Cheaper and faster than Western Union. |
