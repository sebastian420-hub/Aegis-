import { expect } from "chai";
import hardhat from "hardhat";
const { ethers } = hardhat;

describe("CoreEscrow", function () {
  let MockUSDC, usdc, CoreEscrow, escrow;
  let owner, arbiter, depositor, beneficiary, relayer, other;

  beforeEach(async function () {
    [owner, arbiter, depositor, beneficiary, relayer, other] = await ethers.getSigners();

    const MockUSDCFactory = await ethers.getContractFactory("MockUSDC");
    usdc = await MockUSDCFactory.deploy();
    await usdc.waitForDeployment();

    const CoreEscrowFactory = await ethers.getContractFactory("CoreEscrow");
    escrow = await CoreEscrowFactory.deploy(await usdc.getAddress(), arbiter.address);
    await escrow.waitForDeployment();

    // Mint USDC to depositor
    await usdc.mint(depositor.address, ethers.parseUnits("1000", 6));
  });

  async function getSignature(txId, beneficiaryAddress, amount, deadline, signer) {
    const domain = {
      name: "AegisProtocol",
      version: "0.1",
      chainId: 80002, // Hardcoded in contract
      verifyingContract: await escrow.getAddress()
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
      txId,
      beneficiary: beneficiaryAddress,
      amount,
      deadline
    };

    return await signer.signTypedData(domain, types, value);
  }

  describe("depositFunds", function () {
    it("Should deposit funds successfully", async function () {
      const amount = ethers.parseUnits("100", 6);
      await usdc.connect(depositor).approve(await escrow.getAddress(), amount);
      
      await expect(escrow.connect(depositor).depositFunds(amount))
        .to.emit(escrow, "FundsDeposited")
        .withArgs(depositor.address, amount);
        
      expect(await escrow.depositBalances(depositor.address)).to.equal(amount);
      expect(await usdc.balanceOf(await escrow.getAddress())).to.equal(amount);
    });

    it("Should revert if amount is 0", async function () {
      await expect(escrow.connect(depositor).depositFunds(0))
        .to.be.revertedWith("Amount must be greater than zero");
    });
  });

  describe("releaseFunds", function () {
    let txId, amount, deadline;
    beforeEach(async function () {
      amount = ethers.parseUnits("100", 6);
      await usdc.connect(depositor).approve(await escrow.getAddress(), amount);
      await escrow.connect(depositor).depositFunds(amount);

      txId = ethers.id("test-tx-id-1");
      const latestBlock = await ethers.provider.getBlock("latest");
      deadline = latestBlock.timestamp + 3600; 
    });

    it("Should release funds with valid signature", async function () {
      const signature = await getSignature(txId, beneficiary.address, amount, deadline, arbiter);
      
      const req = { txId, beneficiary: beneficiary.address, amount, deadline };
      
      await expect(escrow.connect(relayer).releaseFunds(req, signature))
        .to.emit(escrow, "FundsReleased")
        .withArgs(txId, beneficiary.address, amount);

      expect(await usdc.balanceOf(beneficiary.address)).to.equal(amount);
      expect(await escrow.usedTxIds(txId)).to.equal(true);
    });

    it("Should revert if signature is invalid", async function () {
      const signature = await getSignature(txId, beneficiary.address, amount, deadline, owner);
      const req = { txId, beneficiary: beneficiary.address, amount, deadline };
      
      await expect(escrow.connect(relayer).releaseFunds(req, signature))
        .to.be.revertedWith("Invalid signature");
    });

    it("Should revert if expired", async function () {
      const expiredDeadline = (await ethers.provider.getBlock("latest")).timestamp - 1;
      const signature = await getSignature(txId, beneficiary.address, amount, expiredDeadline, arbiter);
      const req = { txId, beneficiary: beneficiary.address, amount, deadline: expiredDeadline };
      
      await expect(escrow.connect(relayer).releaseFunds(req, signature))
        .to.be.revertedWith("Signature expired");
    });

    it("Should revert if already processed (replay protection)", async function () {
      const signature = await getSignature(txId, beneficiary.address, amount, deadline, arbiter);
      const req = { txId, beneficiary: beneficiary.address, amount, deadline };
      
      await escrow.connect(relayer).releaseFunds(req, signature);
      
      await expect(escrow.connect(relayer).releaseFunds(req, signature))
        .to.be.revertedWith("Transaction already processed");
    });
  });

  describe("cancelTransaction", function () {
    let txId, amount;
    beforeEach(async function () {
      amount = ethers.parseUnits("50", 6);
      await usdc.connect(depositor).approve(await escrow.getAddress(), amount);
      await escrow.connect(depositor).depositFunds(amount);
      txId = ethers.id("test-tx-id-2");
    });

    it("Should cancel and refund depositor", async function () {
      await expect(escrow.connect(depositor).cancelTransaction(txId, amount))
        .to.emit(escrow, "TransactionCancelled")
        .withArgs(txId, depositor.address, amount);

      expect(await escrow.usedTxIds(txId)).to.equal(true);
      expect(await escrow.depositBalances(depositor.address)).to.equal(0);
    });

    it("Should revert if insufficient balance", async function () {
      const tooMuch = ethers.parseUnits("100", 6);
      await expect(escrow.connect(depositor).cancelTransaction(txId, tooMuch))
        .to.be.revertedWith("Insufficient deposit balance");
    });
  });
});
