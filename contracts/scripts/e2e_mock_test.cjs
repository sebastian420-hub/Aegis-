const { ethers } = require("hardhat");

async function main() {
    console.log("🚀 Starting End-to-End Mock Test (Core Engine)...\n");

    // 1. Setup Mock Accounts
    const [deployer, arbiter, customer] = await ethers.getSigners();
    console.log(`Arbiter (Backend) Address: ${arbiter.address}`);
    console.log(`Customer (Frontend) Address: ${customer.address}\n`);

    // 2. Deploy Mock USDC
    console.log("Deploying Mock USDC...");
    const USDC = await ethers.getContractFactory("MockUSDC");
    const usdc = await USDC.deploy();
    await usdc.waitForDeployment();
    const usdcAddress = await usdc.getAddress();
    console.log(`✅ Mock USDC deployed at: ${usdcAddress}`);

    // 3. Deploy CoreEscrow
    console.log("Deploying CoreEscrow...");
    const Escrow = await ethers.getContractFactory("CoreEscrow");
    const escrow = await Escrow.deploy(usdcAddress, arbiter.address);
    await escrow.waitForDeployment();
    const escrowAddress = await escrow.getAddress();
    console.log(`✅ CoreEscrow deployed at: ${escrowAddress}\n`);

    // 4. Fund the Vault (Pre-funded Liquidity)
    console.log("Funding the Vault with 100 USDC...");
    const mintAmount = ethers.parseUnits("100", 6);
    await usdc.mint(deployer.address, mintAmount);
    await usdc.approve(escrowAddress, mintAmount);
    await escrow.depositFunds(mintAmount);
    console.log("✅ Vault Funded. Current Vault Balance:", ethers.formatUnits(await usdc.balanceOf(escrowAddress), 6), "USDC\n");

    // ==========================================
    // BACKEND LOGIC: Generate EIP-712 Signature
    // ==========================================
    console.log("⚙️  [Backend] Fiat payment cleared. Generating EIP-712 Signature...");
    const txId = ethers.id("tx_12345"); // Mock Transaction ID
    const requestAmount = ethers.parseUnits("28", 6); // 28 USDC requested
    const deadline = Math.floor(Date.now() / 1000) + 3600; // 1 hour from now

    // EIP-712 Domain matching the Smart Contract
    const domain = {
        name: "AegisProtocol",
        version: "0.1",
        chainId: 80002, // MUST match the hardcoded 80002 in CoreEscrow.sol
        verifyingContract: escrowAddress
    };

    const types = {
        ReleaseRequest: [
            { name: "txId", type: "bytes32" },
            { name: "beneficiary", type: "address" },
            { name: "amount", type: "uint256" },
            { name: "deadline", type: "uint256" }
        ]
    };

    const value = {
        txId: txId,
        beneficiary: customer.address,
        amount: requestAmount,
        deadline: deadline
    };

    // The Arbiter (Backend) signs the exact request
    const signature = await arbiter.signTypedData(domain, types, value);
    console.log(`✅ Signature generated: ${signature}\n`);


    // ==========================================
    // RELAYER LOGIC: Submit to Blockchain
    // ==========================================
    console.log("⚙️  [Relayer] Submitting signature to the blockchain to release funds...");
    const customerInitialBalance = await usdc.balanceOf(customer.address);
    console.log(`Customer Initial Balance: ${ethers.formatUnits(customerInitialBalance, 6)} USDC`);

    // Anyone can call this function and pay gas, but the signature must be valid
    const tx = await escrow.connect(deployer).releaseFunds(
        value,
        signature
    );
    await tx.wait();

    const customerFinalBalance = await usdc.balanceOf(customer.address);
    console.log(`✅ Transaction Confirmed!`);
    console.log(`Customer Final Balance: ${ethers.formatUnits(customerFinalBalance, 6)} USDC\n`);

    // Verify Replay Protection
    console.log("🛡️  Testing Replay Protection: Trying to use the same signature twice...");
    try {
        await escrow.connect(deployer).releaseFunds(
            value,
            signature
        );
        console.log("❌ ERROR: Replay succeeded (this should not happen)");
    } catch (err) {
        console.log(`✅ Replay Protection worked! Transaction rejected: ${err.message.substring(0, 80)}...\n`);
    }

    console.log("🎉 End-to-End Core Engine Test Successful!");
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
