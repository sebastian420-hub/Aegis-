const hre = require("hardhat");
const fs = require("fs");
const path = require("path");

async function main() {
  console.log("Deploying contracts to Hardhat Local Node...");

  // 1. Deploy Mock USDC
  const MockUSDC = await hre.ethers.getContractFactory("MockUSDC");
  const usdc = await MockUSDC.deploy();
  await usdc.waitForDeployment();
  const usdcAddress = await usdc.getAddress();
  console.log(`MockUSDC deployed to: ${usdcAddress}`);

  // 2. Deploy CoreEscrow (Arbiter is Hardhat Account #0)
  const arbiterAddress = "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266";
  const CoreEscrow = await hre.ethers.getContractFactory("CoreEscrow");
  const escrow = await CoreEscrow.deploy(usdcAddress, arbiterAddress);
  await escrow.waitForDeployment();
  const escrowAddress = await escrow.getAddress();
  console.log(`CoreEscrow deployed to: ${escrowAddress}`);

  // 3. Write addresses to backend .env so it can use them
  const backendEnvPath = path.join(__dirname, "../../backend/.env");
  const arbiterPk = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80"; // Hardhat Account #0
  
  const envContent = `PORT=3001
ARBITER_PRIVATE_KEY=${arbiterPk}
CORE_ESCROW_ADDRESS=${escrowAddress}
USDC_ADDRESS=${usdcAddress}
`;
  fs.writeFileSync(backendEnvPath, envContent);
  console.log("Updated backend/.env with contract addresses and Arbiter key (Account 0)");

  console.log("Deployment Complete!");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
