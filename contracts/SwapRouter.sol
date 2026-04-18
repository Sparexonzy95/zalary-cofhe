// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "@fhenixprotocol/cofhe-contracts/FHE.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

interface IConfidentialToken {
    function mintTo(address to, uint256 amount) external;
    function burnFromHandle(address from, euint64 amount) external returns (ebool);
}

/**
 * @title SwapRouter (CoFHE)
 * @notice USDC <-> cUSDC gateway with claim/run-friendly keyed pending withdraws.
 *
 * Design:
 * - deposit is public (USDC in, cUSDC minted)
 * - withdraw is private
 * - pending withdraws are keyed by withdrawKey, not by wallet only
 * - one stuck request does not block another request for the same wallet
 * - bad/stuck requests can be cancelled by key
 */
contract SwapRouter is AccessControl, ReentrancyGuard {
    using SafeERC20 for IERC20;

    IERC20             public immutable usdc;
    IConfidentialToken public immutable cToken;

    // 1 atomic unit
    uint64 public constant MIN_WITHDRAW = 1;

    struct PendingWithdraw {
        address user;
        bytes32 amountHandle;
        bytes32 okHandle;
        bytes32 requestId;
    }

    // One pending slot per withdrawKey
    mapping(bytes32 => PendingWithdraw) private pendingWithdraws;

    // wallet-scoped nonce is still fine for uniqueness
    mapping(address => uint256) public withdrawNonce;

    error InvalidDecryptProof();
    error WithdrawNotRequested();
    error WithdrawAlreadyPendingForKey();
    error NotWithdrawOwner();
    error NotEnoughBalance();
    error ZeroAmount();
    error AmountTooSmall();
    error WithdrawCanBeFinalized();

    event Deposited(address indexed user, uint256 amount);

    event WithdrawRequested(
        address indexed user,
        bytes32 indexed withdrawKey,
        bytes32 requestId,
        uint256 nonce
    );

    event Withdrawn(
        address indexed user,
        bytes32 indexed withdrawKey,
        bytes32 requestId
    );

    event WithdrawCancelled(
        address indexed user,
        bytes32 indexed withdrawKey,
        bytes32 requestId
    );

    constructor(address admin, address usdcAddr, address confidentialTokenAddr) {
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        usdc   = IERC20(usdcAddr);
        cToken = IConfidentialToken(confidentialTokenAddr);
    }

    // ─────────────────────────────────────────────────────────────
    // Deposit: USDC -> cUSDC
    // ─────────────────────────────────────────────────────────────

    function deposit(uint256 amount) external {
        if (amount == 0) revert ZeroAmount();

        usdc.safeTransferFrom(msg.sender, address(this), amount);
        cToken.mintTo(msg.sender, amount);

        emit Deposited(msg.sender, amount);
    }

    // ─────────────────────────────────────────────────────────────
    // Step 1: requestWithdraw
    //
    // withdrawKey must be unique per claim/run/withdraw row.
    // Example off-chain:
    //   withdrawKey = keccak256(abi.encodePacked("zalary", chainId, withdrawId, user))
    // ─────────────────────────────────────────────────────────────

    function requestWithdraw(
        bytes32 withdrawKey,
        InEuint64 calldata encryptedAmount
    ) external returns (bytes32 amountHandle, bytes32 requestId) {
        PendingWithdraw storage existing = pendingWithdraws[withdrawKey];
        if (existing.requestId != bytes32(0)) revert WithdrawAlreadyPendingForKey();

        euint64 amt = FHE.asEuint64(encryptedAmount);

        FHE.allowThis(amt);
        FHE.allow(amt, msg.sender);
        FHE.allowTransient(amt, address(cToken));

        ebool ok = cToken.burnFromHandle(msg.sender, amt);

        bytes32 amtH = euint64.unwrap(amt);
        bytes32 okH  = ebool.unwrap(ok);

        FHE.allowThis(ok);
        FHE.allow(ok, msg.sender);

        uint256 nonce = withdrawNonce[msg.sender]++;
        requestId = keccak256(abi.encodePacked(withdrawKey, msg.sender, amtH, okH, nonce));

        pendingWithdraws[withdrawKey] = PendingWithdraw({
            user: msg.sender,
            amountHandle: amtH,
            okHandle: okH,
            requestId: requestId
        });

        emit WithdrawRequested(msg.sender, withdrawKey, requestId, nonce);
        return (amtH, requestId);
    }

    // ─────────────────────────────────────────────────────────────
    // Step 2: finalizeWithdraw
    // Finalizes only the specific withdrawKey
    // ─────────────────────────────────────────────────────────────

    function finalizeWithdraw(
        bytes32        withdrawKey,
        bytes32        requestId,
        uint64         amountPlain,
        bytes calldata amountSig,
        bool           okPlain,
        bytes calldata okSig
    ) external nonReentrant {
        PendingWithdraw memory p = pendingWithdraws[withdrawKey];

        if (p.user == address(0) || p.requestId == bytes32(0)) revert WithdrawNotRequested();
        if (p.user != msg.sender) revert NotWithdrawOwner();
        if (requestId != p.requestId) revert InvalidDecryptProof();

        require(
            FHE.verifyDecryptResult(euint64.wrap(p.amountHandle), amountPlain, amountSig),
            "SwapRouter: bad amount proof"
        );
        require(
            FHE.verifyDecryptResult(ebool.wrap(p.okHandle), okPlain, okSig),
            "SwapRouter: bad ok proof"
        );

        if (amountPlain == 0) revert ZeroAmount();
        if (amountPlain < MIN_WITHDRAW) revert AmountTooSmall();
        if (!okPlain) revert NotEnoughBalance();

        delete pendingWithdraws[withdrawKey];

        usdc.safeTransfer(msg.sender, uint256(amountPlain));

        emit Withdrawn(msg.sender, withdrawKey, requestId);
    }

    // ─────────────────────────────────────────────────────────────
    // Recovery path for bad/stuck pending withdraw
    //
    // Only cancels that one withdrawKey.
    // It does NOT affect any other run or claim.
    // ─────────────────────────────────────────────────────────────

    function cancelPendingWithdraw(
        bytes32        withdrawKey,
        bytes32        requestId,
        uint64         amountPlain,
        bytes calldata amountSig,
        bool           okPlain,
        bytes calldata okSig
    ) external nonReentrant {
        PendingWithdraw memory p = pendingWithdraws[withdrawKey];

        if (p.user == address(0) || p.requestId == bytes32(0)) revert WithdrawNotRequested();
        if (p.user != msg.sender) revert NotWithdrawOwner();
        if (requestId != p.requestId) revert InvalidDecryptProof();

        require(
            FHE.verifyDecryptResult(euint64.wrap(p.amountHandle), amountPlain, amountSig),
            "SwapRouter: bad amount proof"
        );
        require(
            FHE.verifyDecryptResult(ebool.wrap(p.okHandle), okPlain, okSig),
            "SwapRouter: bad ok proof"
        );

        // If this withdraw can be finalized successfully, do not allow cancel.
        if (okPlain && amountPlain >= MIN_WITHDRAW) revert WithdrawCanBeFinalized();

        delete pendingWithdraws[withdrawKey];

        emit WithdrawCancelled(msg.sender, withdrawKey, requestId);
    }

    // ─────────────────────────────────────────────────────────────
    // View helpers
    // ─────────────────────────────────────────────────────────────

    function getPendingWithdraw(bytes32 withdrawKey)
        external
        view
        returns (
            address user,
            bytes32 amountHandle,
            bytes32 okHandle,
            bytes32 requestId
        )
    {
        PendingWithdraw memory p = pendingWithdraws[withdrawKey];
        return (p.user, p.amountHandle, p.okHandle, p.requestId);
    }

    function getPendingAmountHandle(bytes32 withdrawKey) external view returns (bytes32) {
        return pendingWithdraws[withdrawKey].amountHandle;
    }

    function getPendingOkHandle(bytes32 withdrawKey) external view returns (bytes32) {
        return pendingWithdraws[withdrawKey].okHandle;
    }

    function getPendingRequestId(bytes32 withdrawKey) external view returns (bytes32) {
        return pendingWithdraws[withdrawKey].requestId;
    }

    function getPendingUser(bytes32 withdrawKey) external view returns (address) {
        return pendingWithdraws[withdrawKey].user;
    }
}