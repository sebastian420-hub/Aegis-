const { ethers } = require("ethers");

async function main() {
  const provider = new ethers.JsonRpcProvider("http://127.0.0.1:8545");
  const richSigner = new ethers.Wallet("0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80", provider);

  const USDC_ADDRESS = "0xa513E6E4b8f2a923D98304ec87F64353C4D5C853";
  const USDC_ABI = ["function mint(address to, uint256 amount) public"];
  const usdc = new ethers.Contract(USDC_ADDRESS, USDC_ABI, richSigner);

  const addresses = [
    "0xb87cee1bc8a1554d06d527962b66cc19bd48f51e",
    "0xb4a4d0f2a12e23fd9fbcb682039a81e3c0d4543e"
  ];

  let nonce = await provider.getTransactionCount(richSigner.address);
  for (const addr of addresses) {
    try {
      console.log(`Minting 1000 USDC to ${addr} with nonce ${nonce}...`);
      const tx = await usdc.mint(addr, ethers.parseUnits("1000", 6), { nonce });
      await tx.wait();
      console.log(`Success for ${addr}`);
      nonce++;
    } catch (e) {
      console.error(`Failed for ${addr}:`, e.message);
    }
  }
}

main();
