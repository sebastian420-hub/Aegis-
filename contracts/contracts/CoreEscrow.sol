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

    // Maps a unique UUID (transferId) to the locked funds
    mapping(bytes32 => TransferLock) public lockedTransfers;
    mapping(bytes32 => bool) public usedSignatures;

    // hardcoded chainId for Polygon Amoy (80002)
    bytes32 private immutable _DOMAIN_SEPARATOR;

    bytes32 constant RELEASE_REQUEST_TYPEHASH = keccak256(
        "ReleaseRequest(bytes32 transferId,address settlerNode,uint256 amount,uint256 deadline)"
    );

    event FundsLocked(bytes32 indexed transferId, address indexed sender, uint256 amount);
    event FundsReleased(bytes32 indexed transferId, address indexed settlerNode, uint256 amount);
    event TransactionCancelled(bytes32 indexed transferId, address indexed sender, uint256 amount);

    constructor(address _usdc, address _arbiter) {
        usdc = IERC20(_usdc);
        arbiter = _arbiter;

        _DOMAIN_SEPARATOR = keccak256(
            abi.encode(
                keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"),
                keccak256(bytes("AegisProtocol")),
                keccak256(bytes("0.2")), // Upgraded to v0.2 for CICO
                80002,
                address(this)
            )
        );
    }

    /**
     * @dev Sender (Node A / Customer) calls this to lock USDC for a specific transfer
     */
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

    /**
     * @dev Node B calls this (or Relayer calls it) with Arbiter's signature verifying the OTP
     */
    function releaseFunds(
        bytes32 transferId, 
        address settlerNode, 
        uint256 amount, 
        uint256 deadline, 
        bytes calldata signature
    ) external nonReentrant {
        require(block.timestamp <= deadline, "Signature expired");
        require(!usedSignatures[transferId], "Transfer already settled");
        require(lockedTransfers[transferId].isActive, "No active lock for this transfer");
        require(lockedTransfers[transferId].amount == amount, "Amount mismatch");

        bytes32 structHash = keccak256(
            abi.encode(
                RELEASE_REQUEST_TYPEHASH,
                transferId,
                settlerNode,
                amount,
                deadline
            )
        );

        bytes32 hash = keccak256(
            abi.encodePacked(
                "\x19\x01",
                _DOMAIN_SEPARATOR,
                structHash
            )
        );
        
        address signer = ECDSA.recover(hash, signature);
        require(signer == arbiter, "Invalid arbiter signature");

        // Checks-effects-interactions
        usedSignatures[transferId] = true;
        lockedTransfers[transferId].isActive = false;
        
        require(usdc.transfer(settlerNode, amount), "USDC transfer failed");
        emit FundsReleased(transferId, settlerNode, amount);
    }

    /**
     * @dev Allows sender to reclaim funds if transfer fails, but only after a 30-minute lockup period.
     *      This prevents the sender from stealing funds while the agent is actively handing them fiat.
     */
    function refundExpired(bytes32 transferId) external nonReentrant {
        require(lockedTransfers[transferId].isActive, "No active lock");
        require(lockedTransfers[transferId].sender == msg.sender, "Not the sender");
        require(!usedSignatures[transferId], "Already settled");
        
        // PANIC BUTTON TIMEOUT: 30 minutes
        require(block.timestamp >= lockedTransfers[transferId].lockedAt + 30 minutes, "Lockup period has not expired");

        lockedTransfers[transferId].isActive = false;
        uint256 amount = lockedTransfers[transferId].amount;

        require(usdc.transfer(msg.sender, amount), "USDC transfer failed");
        emit TransactionCancelled(transferId, msg.sender, amount);
    }
}
