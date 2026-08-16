// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

contract CoreEscrow is ReentrancyGuard {
    using ECDSA for bytes32;

    IERC20 public usdc;
    address public arbiter;

    struct TransferLock {
        address sender;
        uint256 amount;
        bool isActive;
        uint256 lockedAt;
    }

    // Escrow State
    mapping(bytes32 => TransferLock) public lockedTransfers;
    mapping(bytes32 => bool) public usedSignatures;
    
    // Agent Staking State
    mapping(address => uint256) public agentStakes;
    mapping(bytes32 => bool) public usedSlashTickets;

    bytes32 private immutable _DOMAIN_SEPARATOR;

    // Upgraded TypeHashes for V3 Production
    bytes32 constant RELEASE_REQUEST_TYPEHASH = keccak256(
        "ReleaseRequest(bytes32 transferId,address settlerNode,uint256 settlerAmount,address feeTreasury,uint256 feeAmount,uint256 deadline)"
    );

    bytes32 constant SLASH_REQUEST_TYPEHASH = keccak256(
        "SlashRequest(bytes32 slashNonce,address badAgent,address recipient,uint256 payoutAmount)"
    );

    event FundsLocked(bytes32 indexed transferId, address indexed sender, uint256 amount);
    event FundsReleased(bytes32 indexed transferId, address indexed settlerNode, uint256 settlerAmount, uint256 feeAmount);
    event TransactionCancelled(bytes32 indexed transferId, address indexed sender, uint256 amount);
    event StakeDeposited(address indexed agent, uint256 amount);
    event StakeWithdrawn(address indexed agent, uint256 amount);
    event AgentSlashed(address indexed badAgent, address indexed recipient, uint256 amount, bytes32 slashNonce);

    constructor(address _usdc, address _arbiter) {
        usdc = IERC20(_usdc);
        arbiter = _arbiter;

        _DOMAIN_SEPARATOR = keccak256(
            abi.encode(
                keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"),
                keccak256(bytes("AegisProtocol")),
                keccak256(bytes("0.3")), // Upgraded to V3 Production
                80002, // Polygon Amoy
                address(this)
            )
        );
    }

    // --- AGENT STAKING ---
    function depositStake(uint256 amount) external nonReentrant {
        require(amount > 0, "Amount must be > 0");
        require(usdc.transferFrom(msg.sender, address(this), amount), "USDC transfer failed");
        agentStakes[msg.sender] += amount;
        emit StakeDeposited(msg.sender, amount);
    }

    function withdrawStake(uint256 amount) external nonReentrant {
        require(agentStakes[msg.sender] >= amount, "Insufficient stake");
        agentStakes[msg.sender] -= amount;
        require(usdc.transfer(msg.sender, amount), "USDC transfer failed");
        emit StakeWithdrawn(msg.sender, amount);
    }

    // --- ESCROW MECHANICS ---
    function lockFunds(bytes32 transferId, uint256 amount) external nonReentrant {
        require(amount > 0, "Amount must be greater than zero");
        require(!lockedTransfers[transferId].isActive, "Transfer ID already in use");
        
        require(usdc.transferFrom(msg.sender, address(this), amount), "USDC transfer failed");
        
        lockedTransfers[transferId] = TransferLock({
            sender: msg.sender,
            amount: amount,
            isActive: true,
            lockedAt: block.timestamp
        });

        emit FundsLocked(transferId, msg.sender, amount);
    }

    function releaseFunds(
        bytes32 transferId, 
        address settlerNode, 
        uint256 settlerAmount,
        address feeTreasury,
        uint256 feeAmount,
        uint256 deadline, 
        bytes calldata signature
    ) external nonReentrant {
        require(block.timestamp <= deadline, "Signature expired");
        require(!usedSignatures[transferId], "Transfer already settled");
        require(lockedTransfers[transferId].isActive, "No active lock for this transfer");
        require(lockedTransfers[transferId].amount == (settlerAmount + feeAmount), "Amount mismatch");

        bytes32 structHash = keccak256(
            abi.encode(
                RELEASE_REQUEST_TYPEHASH,
                transferId,
                settlerNode,
                settlerAmount,
                feeTreasury,
                feeAmount,
                deadline
            )
        );

        bytes32 hash = keccak256(abi.encodePacked("\x19\x01", _DOMAIN_SEPARATOR, structHash));
        require(ECDSA.recover(hash, signature) == arbiter, "Invalid arbiter signature");

        usedSignatures[transferId] = true;
        lockedTransfers[transferId].isActive = false;
        
        if (settlerAmount > 0) {
            require(usdc.transfer(settlerNode, settlerAmount), "Settler transfer failed");
        }
        if (feeAmount > 0) {
            require(usdc.transfer(feeTreasury, feeAmount), "Fee transfer failed");
        }
        
        emit FundsReleased(transferId, settlerNode, settlerAmount, feeAmount);
    }

    function refundExpired(bytes32 transferId) external nonReentrant {
        require(lockedTransfers[transferId].isActive, "No active lock");
        require(lockedTransfers[transferId].sender == msg.sender, "Not the sender");
        require(!usedSignatures[transferId], "Already settled");
        
        require(block.timestamp >= lockedTransfers[transferId].lockedAt + 30 minutes, "Lockup period has not expired");

        lockedTransfers[transferId].isActive = false;
        uint256 amount = lockedTransfers[transferId].amount;

        require(usdc.transfer(msg.sender, amount), "USDC transfer failed");
        emit TransactionCancelled(transferId, msg.sender, amount);
    }

    // --- SLASHING MECHANICS ---
    function slashAgent(
        bytes32 slashNonce,
        address badAgent,
        address recipient,
        uint256 payoutAmount,
        bytes calldata signature
    ) external nonReentrant {
        require(!usedSlashTickets[slashNonce], "Slash ticket already used");
        require(agentStakes[badAgent] >= payoutAmount, "Agent stake too low");

        bytes32 structHash = keccak256(
            abi.encode(
                SLASH_REQUEST_TYPEHASH,
                slashNonce,
                badAgent,
                recipient,
                payoutAmount
            )
        );

        bytes32 hash = keccak256(abi.encodePacked("\x19\x01", _DOMAIN_SEPARATOR, structHash));
        require(ECDSA.recover(hash, signature) == arbiter, "Invalid arbiter signature");

        usedSlashTickets[slashNonce] = true;
        agentStakes[badAgent] -= payoutAmount;
        
        require(usdc.transfer(recipient, payoutAmount), "Payout transfer failed");
        emit AgentSlashed(badAgent, recipient, payoutAmount, slashNonce);
    }
}
