// CICO Protocol: Multi-Scenario Network Simulation (Monte Carlo)

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
    }
    resetDaily() {
        this.dailyTxCount = 0;
        this.status = 'ACTIVE';
    }
}

class CICOEngine {
    constructor(nodes, maxDailyTx) {
        this.nodes = nodes;
        this.maxDailyTx = maxDailyTx; // Anti-mule limit
        this.stats = { totalTx: 0, failedTx: 0, rebalances: 0, volumeUSDC: 0, superAgent: 0 };
    }

    dispatchTransfer(originCountry, destCountry, usdcAmount) {
        const originNodes = this.nodes.filter(n => n.country === originCountry && n.status === 'ACTIVE');
        if (originNodes.length === 0) return false;
        
        const originNode = originNodes[Math.floor(Math.random() * originNodes.length)];
        
        const fiatIn = originCountry === 'TH' ? usdcAmount * THB_TO_USDC : usdcAmount * MMK_TO_USDC;
        const fiatOut = destCountry === 'TH' ? usdcAmount * THB_TO_USDC : usdcAmount * MMK_TO_USDC;

        const destNodes = this.nodes.filter(n => n.country === destCountry && n.status === 'ACTIVE' && n.fiat >= fiatOut);
        if (destNodes.length === 0) return false;

        destNodes.sort((a, b) => b.fiat - a.fiat);
        const destNode = destNodes[0];

        // EXECUTE
        originNode.fiat += fiatIn;
        originNode.usdc -= usdcAmount;
        originNode.dailyTxCount++;

        destNode.fiat -= fiatOut;
        destNode.usdc += usdcAmount;
        destNode.dailyTxCount++;

        if (originNode.dailyTxCount >= this.maxDailyTx) originNode.status = 'COOLDOWN';
        if (destNode.dailyTxCount >= this.maxDailyTx) destNode.status = 'COOLDOWN';

        this.stats.totalTx++;
        this.stats.volumeUSDC += usdcAmount;
        return true;
    }

    runRebalance() {
        for (let i = 0; i < this.nodes.length; i++) {
            let n1 = this.nodes[i];
            
            // Scenario A: Needs Fiat
            if (n1.fiat < 500 * (n1.country === 'TH' ? THB_TO_USDC : MMK_TO_USDC) && n1.usdc > 500) {
                let match = this.nodes.find(n2 => 
                    n2.country === n1.country && 
                    n2.fiat > 1500 * (n1.country === 'TH' ? THB_TO_USDC : MMK_TO_USDC) && 
                    n2.usdc < 200 && n2.id !== n1.id
                );
                
                let rebUSDC = 500;
                let rebFiat = n1.country === 'TH' ? rebUSDC * THB_TO_USDC : rebUSDC * MMK_TO_USDC;

                if (match) {
                    match.fiat -= rebFiat; match.usdc += rebUSDC;
                    n1.fiat += rebFiat; n1.usdc -= rebUSDC;
                    this.stats.rebalances++;
                } else {
                    n1.fiat += rebFiat; n1.usdc -= rebUSDC;
                    this.stats.superAgent++;
                }
            }

            // Scenario B: Needs USDC
            if (n1.usdc < 100 && n1.fiat > 1000 * (n1.country === 'TH' ? THB_TO_USDC : MMK_TO_USDC)) {
                let match = this.nodes.find(n2 => 
                    n2.country === n1.country && n2.usdc > 1000 && 
                    n2.fiat < 500 * (n1.country === 'TH' ? THB_TO_USDC : MMK_TO_USDC) && n2.id !== n1.id
                );
                let rebUSDC = 500;
                let rebFiat = n1.country === 'TH' ? rebUSDC * THB_TO_USDC : rebUSDC * MMK_TO_USDC;

                if (match) {
                    match.usdc -= rebUSDC; match.fiat += rebFiat;
                    n1.usdc += rebUSDC; n1.fiat -= rebFiat;
                    this.stats.rebalances++;
                } else {
                    n1.usdc += rebUSDC; n1.fiat -= rebFiat;
                    this.stats.superAgent++;
                }
            }
        }
    }
    endOfDay() { this.nodes.forEach(n => n.resetDaily()); }
}

function runScenario(name, thToMmProbability, maxTxLimit) {
    let nodes = [];
    for (let i=1; i<=5; i++) nodes.push(new Node(`TH_${i}`, 'TH', 35000, 1000)); 
    for (let i=1; i<=5; i++) nodes.push(new Node(`MM_${i}`, 'MM', 3000000, 1000));

    const engine = new CICOEngine(nodes, maxTxLimit);
    
    for (let day = 1; day <= 30; day++) {
        const txPerDay = Math.floor(Math.random() * 30) + 20; 
        for (let tx = 0; tx < txPerDay; tx++) {
            let origin = Math.random() < thToMmProbability ? 'TH' : 'MM';
            let dest = origin === 'TH' ? 'MM' : 'TH';
            let usdc = Math.floor(Math.random() * 90) + 10;
            if (!engine.dispatchTransfer(origin, dest, usdc)) engine.stats.failedTx++;
        }
        engine.runRebalance();
        engine.endOfDay();
    }
    
    console.log(`\n=========================================`);
    console.log(` SCENARIO: ${name}`);
    console.log(`=========================================`);
    console.log(`Total Moved: $${engine.stats.volumeUSDC.toLocaleString()} USDC`);
    console.log(`Failed Txs: ${engine.stats.failedTx}`);
    console.log(`P2P Dark Pool Rebalances: ${engine.stats.rebalances} (Nodes helping nodes)`);
    console.log(`Super-Agent Interventions: ${engine.stats.superAgent} (Hub bailouts)`);
}

// EXECUTE SCENARIOS
console.log("🚀 Running 3 Unique Macroeconomic Scenarios (30 Days Each)...\n");

runScenario("1. PERFECT SYMMETRY (50/50 Flow, 5 Tx/Day Limit)", 0.50, 5);
runScenario("2. ASYMMETRICAL FLIGHT (80/20 Flow, 5 Tx/Day Limit)", 0.80, 5);
runScenario("3. BANK CRACKDOWN (50/50 Flow, Tight 2 Tx/Day Limit)", 0.50, 2);
