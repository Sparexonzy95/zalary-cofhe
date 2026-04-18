// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "@fhenixprotocol/cofhe-contracts/FHE.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";

/**
 * @title ConfidentialToken (CoFHE)
 * @notice Confidential ERC20-like token. All balances are FHE-encrypted (euint64).
 */
contract ConfidentialToken is AccessControl {
    bytes32 public constant MINTER_ROLE = keccak256("MINTER_ROLE");
    bytes32 public constant BURNER_ROLE = keccak256("BURNER_ROLE");
    bytes32 public constant VAULT_ROLE  = keccak256("VAULT_ROLE");

    string public name;
    string public symbol;
    uint8  public decimals;

    mapping(address => euint64) public balanceOf;

    event TransferPrivate(address indexed from, address indexed to);
    event Minted(address indexed to);
    event Burned(address indexed from, bytes32 okHandle);

    error ZeroAddress();
    error ZeroAmount();
    error ExceedsUint64();
    error SelfTransfer();
    error HandleNotAllowed();

    constructor(
        string memory _name,
        string memory _symbol,
        uint8  _decimals,
        address admin
    ) {
        name     = _name;
        symbol   = _symbol;
        decimals = _decimals;
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
    }

    // ─────────────────────────────────────────────────────────────
    // Public transfer: user encrypts amount via SDK → InEuint64
    // ─────────────────────────────────────────────────────────────

    function transfer(address to, InEuint64 calldata encryptedAmount)
        external
        returns (ebool)
    {
        if (to == address(0))  revert ZeroAddress();
        if (to == msg.sender)  revert SelfTransfer();

        euint64 amount = FHE.asEuint64(encryptedAmount);
        FHE.allowThis(amount);
        return _transfer(msg.sender, to, amount, msg.sender);
    }

    // ─────────────────────────────────────────────────────────────
    // Handle-based transfer: called by PayrollVault (VAULT_ROLE)
    // Caller must call FHE.allowTransient(amount, address(this))
    // in the same transaction before calling this function.
    // Returns ebool success — caller gets ACL access to use it.
    // ─────────────────────────────────────────────────────────────

    function transferFromHandle(address from, address to, euint64 amount)
        external
        returns (ebool)
    {
        if (from == address(0) || to == address(0)) revert ZeroAddress();
        if (from == to) revert SelfTransfer();
        require(
            from == msg.sender || hasRole(VAULT_ROLE, msg.sender),
            "ConfidentialToken: not authorized"
        );
        require(FHE.isAllowed(amount, address(this)), "ConfidentialToken: handle not allowed");

        // Pass msg.sender so _transfer grants vault ACL access on returned success
        return _transfer(from, to, amount, msg.sender);
    }

    // ─────────────────────────────────────────────────────────────
    // Internal transfer — silent failure if balance insufficient.
    // caller parameter receives ACL access on the returned success handle
    // so the external caller can use it in FHE.select/FHE.and.
    // ─────────────────────────────────────────────────────────────

    function _transfer(address from, address to, euint64 amount, address caller)
        internal
        returns (ebool success)
    {
        success = FHE.gte(balanceOf[from], amount);

        euint64 moved   = FHE.select(success, amount, FHE.asEuint64(0));
        euint64 fromNew = FHE.sub(balanceOf[from], moved);
        euint64 toNew   = FHE.add(balanceOf[to],   moved);

        balanceOf[from] = fromNew;
        balanceOf[to]   = toNew;

        FHE.allow(fromNew, from);
        FHE.allow(toNew,   to);
        FHE.allowThis(fromNew);
        FHE.allowThis(toNew);

        FHE.allow(success, from);
        FHE.allowThis(success);
        // Grant caller (vault/router/user) access to success handle
        // Critical: caller needs this to use transferOk in FHE.select/FHE.and
        if (caller != from) {
            FHE.allow(success, caller);
        }

        emit TransferPrivate(from, to);
    }

    // ─────────────────────────────────────────────────────────────
    // Mint: plaintext amount, MINTER_ROLE only (SwapRouter)
    // ─────────────────────────────────────────────────────────────

    function mintTo(address to, uint256 amount)
        external
        onlyRole(MINTER_ROLE)
    {
        if (to == address(0))          revert ZeroAddress();
        if (amount == 0)               revert ZeroAmount();
        if (amount > type(uint64).max) revert ExceedsUint64();

        euint64 amt    = FHE.asEuint64(uint64(amount));
        euint64 newBal = FHE.add(balanceOf[to], amt);

        balanceOf[to] = newBal;
        FHE.allow(newBal, to);
        FHE.allowThis(newBal);

        emit Minted(to);
    }

    // ─────────────────────────────────────────────────────────────
    // Burn handle-based: called by SwapRouter (BURNER_ROLE)
    // Returns ebool — caller (SwapRouter) gets ACL access to use it.
    // ─────────────────────────────────────────────────────────────

    function burnFromHandle(address from, euint64 amount)
        external
        onlyRole(BURNER_ROLE)
        returns (ebool success)
    {
        if (from == address(0)) revert ZeroAddress();
        require(FHE.isAllowed(amount, address(this)), "ConfidentialToken: handle not allowed");

        success = FHE.gte(balanceOf[from], amount);
        euint64 burned = FHE.select(success, amount, FHE.asEuint64(0));
        euint64 newBal = FHE.sub(balanceOf[from], burned);

        balanceOf[from] = newBal;
        FHE.allow(newBal, from);
        FHE.allowThis(newBal);

        // from, caller (SwapRouter), and this contract all get access
        FHE.allow(success, from);
        FHE.allow(success, msg.sender);
        FHE.allowThis(success);

        emit Burned(from, ebool.unwrap(success));
    }
}
