// CICO V2: Advanced Economic & Network Simulation

const THB_TO_USDC = 35;
const MMK_TO_USDC = 3000;

class Node {
    constructor(id, country, initialFiat, initialUSDC) {
        this.id = id;
        this.country = country;
        this.fiat = initialFiat;
        this.usdc = initialUSDC;
        this.dailyTxCount = 0;
        this.status = 'ACTIVE';
        this.profitUSDC = 0; // Track retail commission
    }
    resetDaily() {
        this.dailyTxCount = 0;
        this.status = 'ACTIVE';
    }
}

class CICOEngine {
    constructor(nodes, maxDailyTx) {
        this.nodes = nodes;
        this.maxDailyTx = maxDailyTx;
        this.stats = { 
            totalTx: 0, 
            failedTx: 0, 
            volumeUSDC: 0, 
            platformRevenue: 0, // Toll bridge
            superAgentProfit: 0, // Spread profit
            surgeEvents: 0
        };
    }

    dispatchTransfer(originCountry, destCountry, sendAmountUSDC) {
        const originNodes = this.nodes.filter(n => n.country === originCountry && n.status === 'ACTIVE');
        if (originNodes.length === 0) return false;
        
        const originNode = originNodes[Math.floor(Math.random() * originNodes.length)];
        const destNodes = this.nodes.filter(n => n.country === destCountry && n.status === 'ACTIVE');
        
        // Dynamic Pricing / Surge Logic
        let totalFeePercent = 0.04; // Base 4%
        let platformShare = 0.02;   // Platform takes 2%
        let originShare = 0.01;     // Origin Node takes 1%
        let destShare = 0.01;       // Dest Node takes 1%

        // If less than 20% of destination nodes are active, trigger SURGE PRICING
        const totalDestNodesInCountry = this.nodes.filter(n => n.country === destCountry).length;
        if (destNodes.length / totalDestNodesInCountry <= 0.20) {
            totalFeePercent = 0.06; // Spike fee to 6%
            platformShare = 0.04;   // Platform keeps the extra 2%
            this.stats.surgeEvents++;
        }

        // Apply Fees
        const feeUSDC = sendAmountUSDC * totalFeePercent;
        const settlementAmountUSDC = sendAmountUSDC - feeUSDC;

        const fiatIn = originCountry === 'TH' ? sendAmountUSDC * THB_TO_USDC : sendAmountUSDC * MMK_TO_USDC;
        const fiatOut = destCountry === 'TH' ? settlementAmountUSDC * THB_TO_USDC : settlementAmountUSDC * MMK_TO_USDC;

        // Find Destination Node with enough fiat
        const capableDestNodes = destNodes.filter(n => n.fiat >= fiatOut);
        if (capableDestNodes.length === 0) return false;

        capableDestNodes.sort((a, b) => b.fiat - a.fiat); // Load balance
        const destNode = capableDestNodes[0];

        // EXECUTE SETTLEMENT
        // Origin Node collects Cash, escrows USDC
        originNode.fiat += fiatIn;
        originNode.usdc -= sendAmountUSDC;
        originNode.profitUSDC += (sendAmountUSDC * originShare);
        originNode.usdc += (sendAmountUSDC * originShare); // Profit stays in USDC
        originNode.dailyTxCount++;

        // Dest Node pays out Cash, receives USDC from escrow
        destNode.fiat -= fiatOut;
        destNode.usdc += settlementAmountUSDC;
        destNode.profitUSDC += (sendAmountUSDC * destShare);
        destNode.usdc += (sendAmountUSDC * destShare); // Profit stays in USDC
        destNode.dailyTxCount++;

        // Platform Profit
        this.stats.platformRevenue += (sendAmountUSDC * platformShare);
        
        // Anti-Mule Checks
        if (originNode.dailyTxCount >= this.maxDailyTx) originNode.status = 'COOLDOWN';
        if (destNode.dailyTxCount >= this.maxDailyTx) destNode.status = 'COOLDOWN';

        this.stats.totalTx++;
        this.stats.volumeUSDC += sendAmountUSDC;
        return true;
    }

    runSuperAgentRebalance() {
        // Only doing Super-Agent rebalance to track OTC Profit
        for (let i = 0; i < this.nodes.length; i++) {
            let n = this.nodes[i];
            const SPREAD = 0.02; // Super Agent charges 2% to provide liquidity
            
            // Scenario A: Node needs Fiat (Has excess USDC)
            if (n.fiat < 500 * (n.country === 'TH' ? THB_TO_USDC : MMK_TO_USDC) && n.usdc > 500) {
                let rebUSDC = 500;
                let baseFiat = n.country === 'TH' ? rebUSDC * THB_TO_USDC : rebUSDC * MMK_TO_USDC;
                
                // Super Agent applies 2% penalty (gives 2% LESS fiat for the 500 USDC)
                let givenFiat = baseFiat * (1 - SPREAD);
                
                n.fiat += givenFiat;
                n.usdc -= rebUSDC;
                this.stats.superAgentProfit += (rebUSDC * SPREAD);
            }

            // Scenario B: Node needs USDC (Has excess Fiat)
            if (n.usdc < 100 && n.fiat > 1000 * (n.country === 'TH' ? THB_TO_USDC : MMK_TO_USDC)) {
                let rebUSDC = 500;
                let baseFiat = n.country === 'TH' ? rebUSDC * THB_TO_USDC : rebUSDC * MMK_TO_USDC;

                // Super Agent applies 2% penalty (requires 2% MORE fiat to give 500 USDC)
                let requiredFiat = baseFiat * (1 + SPREAD);
                
                n.usdc += rebUSDC;
                n.fiat -= requiredFiat;
                this.stats.superAgentProfit += (rebUSDC * SPREAD);
            }
        }
    }
    endOfDay() { this.nodes.forEach(n => n.resetDaily()); }
}

// --- RUN ADVANCED SIMULATION ---
console.log("🚀 Starting Advanced Economic Simulation (30 Days)...");
console.log("Setting up 50 Nodes (25 TH, 25 MM) | Limit: 5 Tx/Day...");
console.log("Simulating 80/20 Imbalance with Dynamic Surge Pricing...\n");

let nodes = [];
for (let i=1; i<=25; i++) nodes.push(new Node(`TH_${i}`, 'TH', 35000, 1000)); 
for (let i=1; i<=25; i++) nodes.push(new Node(`MM_${i}`, 'MM', 3000000, 1000));

const engine = new CICOEngine(nodes, 5);

for (let day = 1; day <= 30; day++) {
    const txPerDay = Math.floor(Math.random() * 100) + 150; // 150 to 250 tx a day

    for (let tx = 0; tx < txPerDay; tx++) {
        let origin = Math.random() < 0.8 ? 'TH' : 'MM';
        let dest = origin === 'TH' ? 'MM' : 'TH';
        let usdc = Math.floor(Math.random() * 90) + 10;
        if (!engine.dispatchTransfer(origin, dest, usdc)) engine.stats.failedTx++;
    }
    
    engine.runSuperAgentRebalance();
    engine.endOfDay();
}

console.log(`=========================================`);
console.log(` FINANCIAL P&L STATEMENT (30 DAYS)`);
console.log(`=========================================`);
console.log(`Gross Transacted Volume: $${engine.stats.volumeUSDC.toLocaleString()} USDC`);
console.log(`Total Transactions Executed: ${engine.stats.totalTx}`);
console.log(`Failed Transactions (Capacity hit): ${engine.stats.failedTx}`);
console.log(`Surge Pricing Events Triggered: ${engine.stats.surgeEvents}`);

console.log(`\n💰 PLATFORM REVENUE (YOUR PROFIT)`);
console.log(`Toll Bridge Fees (Base + Surge): $${Math.round(engine.stats.platformRevenue).toLocaleString()} USDC`);
console.log(`Super-Agent OTC Arbitrage:       $${Math.round(engine.stats.superAgentProfit).toLocaleString()} USDC`);
console.log(`-----------------------------------------`);
console.log(`Total Platform Profit:           $${Math.round(engine.stats.platformRevenue + engine.stats.superAgentProfit).toLocaleString()} USDC`);

console.log(`\n🏪 RETAIL NODE ECONOMICS`);
let thProfits = 0;
let mmProfits = 0;
nodes.forEach(n => {
    if (n.country === 'TH') thProfits += n.profitUSDC;
    if (n.country === 'MM') mmProfits += n.profitUSDC;
});
console.log(`Avg Thai Node Profit (Passive):  $${Math.round(thProfits / 25)} USDC per node`);
console.log(`Avg Myanmar Node Profit (Passive):$${Math.round(mmProfits / 25)} USDC per node`);
