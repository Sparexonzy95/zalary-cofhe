// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "@fhenixprotocol/cofhe-contracts/FHE.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

interface IConfidentialTokenTransfers {
    function transferFromHandle(address from, address to, euint64 amount) external returns (ebool);
}

/**
 * @title PayrollVault (CoFHE)
 * @notice Confidential payroll vault — salaries and escrow always encrypted.
 *
 * @dev Key invariants:
 *      1. escrow[payrollId] never overstates managed funds due to silent transfer failure.
 *         fundPayroll, requestClaim, and withdrawLeftovers all tie escrow updates to
 *         actual token transfer results, not assumed success.
 *
 *      2. fundedOnce is an ebool tied to confirmed positive funding.
 *         Activation requires at least one successful nonzero fund transfer.
 *         A payroll cannot be activated on a funding attempt that silently failed.
 *
 *      3. allocation and escrow mappings are private.
 *         Employees read their salary via getMyAllocation().
 *         Employers read escrow via getEscrowHandle().
 *         This prevents ciphertext-handle enumeration by third parties.
 *
 *      4. ClaimRequested does not emit okHandle.
 *         Employee reads okHandle via getMyPendingOkHandle() after requestClaim.
 */
contract PayrollVault is AccessControl, ReentrancyGuard {
    bytes32 public constant ADMIN_ROLE = keccak256("ADMIN_ROLE");

    uint64 public constant MIN_DEADLINE_BUFFER = 1 days;

    enum Status { None, Created, AllocationsFinalized, Active, Closed, Cancelled }

    struct Payroll {
        address employer;
        address token;
        uint64  deadline;
        uint16  employeeCount;
        uint16  uploadedCount;
        Status  status;
        // fundedOnce removed from bool — now tracked as ebool in fundedOnceHandle
    }

    // ─── Approved tokens ──────────────────────────────────────────
    mapping(address => bool) public approvedTokens;

    // ─── Errors ───────────────────────────────────────────────────
    error UnknownPayroll();
    error NotEmployer();
    error BadStatus();
    error InvalidDeadline();
    error InvalidCount();
    error LengthMismatch();
    error DuplicateEmployee();
    error AllocationMissing();
    error AlreadyClaimed();
    error DeadlinePassed();
    error NotYetDeadline();
    error NothingToWithdraw();
    error ZeroAddress();
    error ClaimNotRequested();
    error InvalidDecryptProof();
    error NotEnoughBalance();
    error TokenNotApproved();
    error NoPendingClaim();
    error NotFunded();

    // ─── Events ───────────────────────────────────────────────────
    event TokenApproved(address indexed token);
    event TokenRevoked(address indexed token);
    event PayrollCreated(
        uint256 indexed payrollId,
        address indexed employer,
        address indexed token,
        uint64 deadline,
        uint16 employeeCount
    );
    event AllocationsUploaded(uint256 indexed payrollId, uint256 chunkCount, uint16 totalUploaded);
    event AllocationsFinalized(uint256 indexed payrollId);
    // escrowHandle kept — employer needs it for UI display
    event PayrollFunded(uint256 indexed payrollId, address indexed employer, bytes32 escrowHandle);
    event PayrollActivated(uint256 indexed payrollId);
    // okHandle removed — employee reads from getMyPendingOkHandle()
    event ClaimRequested(
        uint256 indexed payrollId,
        address indexed employee,
        bytes32 requestId
    );
    event ClaimFinalized(uint256 indexed payrollId, address indexed employee, bytes32 requestId);
    event PendingClaimCancelled(uint256 indexed payrollId, address indexed employee);
    event PayrollClosed(uint256 indexed payrollId);
    event PayrollCancelled(uint256 indexed payrollId);
    event LeftoversWithdrawn(uint256 indexed payrollId, address indexed to);

    // ─── State ────────────────────────────────────────────────────
    uint256 public nextPayrollId;

    mapping(uint256 => Payroll) public payrolls;

    // Private — access via view helpers to prevent handle enumeration
    mapping(uint256 => mapping(address => euint64)) private allocation;
    mapping(uint256 => mapping(address => bool))    public  hasAllocation;
    mapping(uint256 => mapping(address => bool))    public  claimed;
    mapping(uint256 => euint64)                     private escrow;

    // fundedOnce as ebool — proves confirmed successful funding, not just an attempt
    mapping(uint256 => ebool) private fundedOnce;

    // Pending claim state — private, read via view helpers
    mapping(uint256 => mapping(address => bytes32)) private pendingOkHandle;
    mapping(uint256 => mapping(address => bytes32)) private pendingRequestId;
    mapping(uint256 => mapping(address => uint256)) private claimNonce;

    constructor(address admin) {
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(ADMIN_ROLE, admin);
        nextPayrollId = 1;
    }

    // ─────────────────────────────────────────────────────────────
    // Token whitelist
    // ─────────────────────────────────────────────────────────────

    function approveToken(address token) external onlyRole(ADMIN_ROLE) {
        if (token == address(0)) revert ZeroAddress();
        approvedTokens[token] = true;
        emit TokenApproved(token);
    }

    function revokeToken(address token) external onlyRole(ADMIN_ROLE) {
        approvedTokens[token] = false;
        emit TokenRevoked(token);
    }

    // ─────────────────────────────────────────────────────────────
    // 1. Create
    // ─────────────────────────────────────────────────────────────

    function createPayroll(
        address token,
        uint64  deadline,
        uint16  employeeCount
    ) external returns (uint256 payrollId) {
        if (token == address(0))                                       revert ZeroAddress();
        if (!approvedTokens[token])                                    revert TokenNotApproved();
        if (employeeCount == 0)                                        revert InvalidCount();
        if (deadline < uint64(block.timestamp) + MIN_DEADLINE_BUFFER) revert InvalidDeadline();

        payrollId = nextPayrollId++;

        payrolls[payrollId] = Payroll({
            employer:      msg.sender,
            token:         token,
            deadline:      deadline,
            employeeCount: employeeCount,
            uploadedCount: 0,
            status:        Status.Created
        });

        // Initialize escrow and fundedOnce as encrypted zeros
        euint64 z  = FHE.asEuint64(0);
        ebool   fz = FHE.asEbool(false);
        escrow[payrollId]     = z;
        fundedOnce[payrollId] = fz;
        FHE.allowThis(z);
        FHE.allowThis(fz);
        // Employer needs access to fundedOnce from creation
        FHE.allow(fz, msg.sender);

        emit PayrollCreated(payrollId, msg.sender, token, deadline, employeeCount);
    }

    // ─────────────────────────────────────────────────────────────
    // 2. Upload allocations
    // ─────────────────────────────────────────────────────────────

    function uploadAllocations(
        uint256      payrollId,
        address[]    calldata employees,
        InEuint64[]  calldata encryptedAmounts
    ) external {
        Payroll storage p = payrolls[payrollId];
        if (p.employer == address(0))   revert UnknownPayroll();
        if (p.employer != msg.sender)   revert NotEmployer();
        if (p.status != Status.Created) revert BadStatus();

        uint256 n = employees.length;
        if (n == 0 || n != encryptedAmounts.length) revert LengthMismatch();

        for (uint256 i = 0; i < n; i++) {
            address emp = employees[i];
            if (emp == address(0))             revert ZeroAddress();
            if (hasAllocation[payrollId][emp]) revert DuplicateEmployee();

            euint64 amt = FHE.asEuint64(encryptedAmounts[i]);

            allocation[payrollId][emp]    = amt;
            hasAllocation[payrollId][emp] = true;

            FHE.allowThis(amt);
            FHE.allow(amt, p.token);
            FHE.allow(amt, emp);  // employee can decrypt their own salary

            p.uploadedCount += 1;
            if (p.uploadedCount > p.employeeCount) revert InvalidCount();
        }

        emit AllocationsUploaded(payrollId, n, p.uploadedCount);
    }

    // ─────────────────────────────────────────────────────────────
    // 3. Finalize allocations
    // ─────────────────────────────────────────────────────────────

    function finalizeAllocations(uint256 payrollId) external {
        Payroll storage p = payrolls[payrollId];
        if (p.employer == address(0))           revert UnknownPayroll();
        if (p.employer != msg.sender)           revert NotEmployer();
        if (p.status != Status.Created)         revert BadStatus();
        if (p.uploadedCount != p.employeeCount) revert InvalidCount();

        p.status = Status.AllocationsFinalized;
        emit AllocationsFinalized(payrollId);
    }

    // ─────────────────────────────────────────────────────────────
    // 4. Fund payroll
    //
    // fundedOnce is an ebool updated via FHE.or(fundedOnce, transferOk).
    // It becomes true only when at least one real transfer succeeded.
    // A payroll funded with 0 (silent failure) cannot be activated.
    // ─────────────────────────────────────────────────────────────

    function fundPayroll(uint256 payrollId, InEuint64 calldata encryptedAmount)
        external
        nonReentrant
    {
        Payroll storage p = payrolls[payrollId];
        if (p.employer == address(0)) revert UnknownPayroll();
        if (p.employer != msg.sender) revert NotEmployer();
        // Allow funding in AllocationsFinalized (initial) or Active (top-up)
        if (p.status != Status.AllocationsFinalized &&
            p.status != Status.Active) revert BadStatus();

        euint64 amt = FHE.asEuint64(encryptedAmount);
        FHE.allowThis(amt);
        FHE.allowTransient(amt, p.token);

        // Capture actual transfer result
        ebool transferOk = IConfidentialTokenTransfers(p.token)
            .transferFromHandle(msg.sender, address(this), amt);
        FHE.allowThis(transferOk);

        // Only credit escrow what actually moved
        euint64 actualFunded = FHE.select(transferOk, amt, FHE.asEuint64(0));
        euint64 newEscrow    = FHE.add(escrow[payrollId], actualFunded);
        escrow[payrollId]    = newEscrow;
        FHE.allowThis(newEscrow);

        // fundedOnce = fundedOnce OR transferOk
        // Becomes true only when a real transfer succeeds
        ebool newFundedOnce    = FHE.or(fundedOnce[payrollId], transferOk);
        fundedOnce[payrollId]  = newFundedOnce;
        FHE.allowThis(newFundedOnce);
        // Employer needs access to decrypt fundedOnce for activatePayroll proof
        FHE.allow(newFundedOnce, msg.sender);

        emit PayrollFunded(payrollId, msg.sender, euint64.unwrap(newEscrow));
    }

    // ─────────────────────────────────────────────────────────────
    // 5. Activate
    //
    // Requires fundedOnce == true (proven by Threshold Network signature).
    // Employer must decrypt fundedOnce off-chain and submit proof.
    // This ensures activation cannot happen on a silently-failed funding attempt.
    // ─────────────────────────────────────────────────────────────

    function activatePayroll(
        uint256        payrollId,
        bool           fundedPlaintext,
        bytes calldata fundedSig
    ) external {
        Payroll storage p = payrolls[payrollId];
        if (p.employer == address(0))                revert UnknownPayroll();
        if (p.employer != msg.sender)                revert NotEmployer();
        if (p.status != Status.AllocationsFinalized) revert BadStatus();

        // Verify funding proof from Threshold Network
        bytes32 fundedH = ebool.unwrap(fundedOnce[payrollId]);
        require(
            FHE.verifyDecryptResult(ebool.wrap(fundedH), fundedPlaintext, fundedSig),
            "PayrollVault: invalid funded proof"
        );
        if (!fundedPlaintext) revert NotFunded();

        p.status = Status.Active;
        emit PayrollActivated(payrollId);
    }

    // ─────────────────────────────────────────────────────────────
    // 6a. Request claim — Step 1
    // ─────────────────────────────────────────────────────────────

    function requestClaim(uint256 payrollId)
        external
        nonReentrant
        returns (bytes32 requestId)
    {
        Payroll storage p = payrolls[payrollId];
        if (p.employer == address(0))       revert UnknownPayroll();
        if (p.status != Status.Active)      revert BadStatus();
        if (block.timestamp > p.deadline)   revert DeadlinePassed();
        if (claimed[payrollId][msg.sender]) revert AlreadyClaimed();
        if (pendingRequestId[payrollId][msg.sender] != bytes32(0)) revert AlreadyClaimed();

        euint64 salary = allocation[payrollId][msg.sender];
        if (euint64.unwrap(salary) == bytes32(0)) revert AllocationMissing();

        FHE.allow(salary, msg.sender);
        FHE.allow(salary, p.token);
        FHE.allowThis(salary);

        euint64 curEscrow = escrow[payrollId];

        // Step 1: check escrow sufficiency
        ebool   escrowOk = FHE.gte(curEscrow, salary);
        euint64 pay      = FHE.select(escrowOk, salary, FHE.asEuint64(0));

        FHE.allowThis(pay);
        FHE.allow(pay, msg.sender);
        FHE.allowTransient(pay, p.token);

        // Step 2: execute transfer — capture actual result
        ebool transferOk = IConfidentialTokenTransfers(p.token)
            .transferFromHandle(address(this), msg.sender, pay);
        FHE.allowThis(transferOk);

        // Step 3: ok = escrowOk AND transferOk
        // Proves both conditions — escrow had funds AND token actually moved them
        ebool ok = FHE.and(escrowOk, transferOk);
        FHE.allowThis(ok);
        FHE.allow(ok, msg.sender);

        // Step 4: subtract only what actually moved
        euint64 actualPaid = FHE.select(ok, salary, FHE.asEuint64(0));
        euint64 newEscrow  = FHE.sub(curEscrow, actualPaid);
        escrow[payrollId]  = newEscrow;
        FHE.allowThis(newEscrow);

        uint256 nonce = claimNonce[payrollId][msg.sender]++;
        requestId = keccak256(
            abi.encodePacked(payrollId, msg.sender, ebool.unwrap(ok), euint64.unwrap(pay), nonce)
        );

        pendingOkHandle[payrollId][msg.sender]  = ebool.unwrap(ok);
        pendingRequestId[payrollId][msg.sender] = requestId;

        // okHandle not emitted — employee reads via getMyPendingOkHandle()
        emit ClaimRequested(payrollId, msg.sender, requestId);
    }

    // ─────────────────────────────────────────────────────────────
    // 6b. Finalize claim — Step 2
    // ─────────────────────────────────────────────────────────────

    function finalizeClaim(
        uint256        payrollId,
        bytes32        requestId,
        bool           okPlaintext,
        bytes calldata okSig
    ) external nonReentrant {
        Payroll storage p = payrolls[payrollId];
        if (p.employer == address(0))       revert UnknownPayroll();
        if (p.status != Status.Active)      revert BadStatus();
        if (block.timestamp > p.deadline)   revert DeadlinePassed();
        if (claimed[payrollId][msg.sender]) revert AlreadyClaimed();

        bytes32 storedRid = pendingRequestId[payrollId][msg.sender];
        bytes32 okH       = pendingOkHandle[payrollId][msg.sender];

        if (storedRid == bytes32(0) || okH == bytes32(0)) revert ClaimNotRequested();
        if (requestId != storedRid)                        revert InvalidDecryptProof();

        require(
            FHE.verifyDecryptResult(ebool.wrap(okH), okPlaintext, okSig),
            "PayrollVault: invalid decrypt proof"
        );

        if (!okPlaintext) revert NotEnoughBalance();

        claimed[payrollId][msg.sender] = true;

        pendingOkHandle[payrollId][msg.sender]  = bytes32(0);
        pendingRequestId[payrollId][msg.sender] = bytes32(0);

        emit ClaimFinalized(payrollId, msg.sender, requestId);
    }

    // ─────────────────────────────────────────────────────────────
    // 6c. Cancel pending claim
    // ─────────────────────────────────────────────────────────────

    function cancelPendingClaim(
        uint256        payrollId,
        bytes32        requestId,
        bool           okPlaintext,
        bytes calldata okSig
    ) external nonReentrant {
        Payroll storage p = payrolls[payrollId];
        if (p.employer == address(0))       revert UnknownPayroll();
        if (p.status != Status.Active)      revert BadStatus();
        if (claimed[payrollId][msg.sender]) revert AlreadyClaimed();

        bytes32 storedRid = pendingRequestId[payrollId][msg.sender];
        bytes32 okH       = pendingOkHandle[payrollId][msg.sender];

        if (storedRid == bytes32(0) || okH == bytes32(0)) revert NoPendingClaim();
        if (requestId != storedRid)                        revert InvalidDecryptProof();

        require(
            FHE.verifyDecryptResult(ebool.wrap(okH), okPlaintext, okSig),
            "PayrollVault: invalid decrypt proof"
        );

        require(!okPlaintext, "PayrollVault: use finalizeClaim - payment succeeded");

        pendingOkHandle[payrollId][msg.sender]  = bytes32(0);
        pendingRequestId[payrollId][msg.sender] = bytes32(0);

        emit PendingClaimCancelled(payrollId, msg.sender);
    }

    // ─────────────────────────────────────────────────────────────
    // 7. Close
    // ─────────────────────────────────────────────────────────────

    function closePayroll(uint256 payrollId) external {
        Payroll storage p = payrolls[payrollId];
        if (p.employer == address(0))      revert UnknownPayroll();
        if (p.employer != msg.sender)      revert NotEmployer();
        if (p.status != Status.Active)     revert BadStatus();
        if (block.timestamp <= p.deadline) revert NotYetDeadline();

        p.status = Status.Closed;
        emit PayrollClosed(payrollId);
    }

    // ─────────────────────────────────────────────────────────────
    // Cancel (before activation only)
    // ─────────────────────────────────────────────────────────────

    function cancelPayroll(uint256 payrollId) external {
        Payroll storage p = payrolls[payrollId];
        if (p.employer == address(0)) revert UnknownPayroll();
        if (p.employer != msg.sender) revert NotEmployer();
        if (
            p.status != Status.Created &&
            p.status != Status.AllocationsFinalized
        ) revert BadStatus();

        p.status = Status.Cancelled;
        emit PayrollCancelled(payrollId);
    }

    // ─────────────────────────────────────────────────────────────
    // Withdraw leftovers
    // ─────────────────────────────────────────────────────────────

    function withdrawLeftovers(uint256 payrollId, address to) external nonReentrant {
        Payroll storage p = payrolls[payrollId];
        if (p.employer == address(0)) revert UnknownPayroll();
        if (p.employer != msg.sender) revert NotEmployer();
        if (to == address(0))         revert ZeroAddress();
        if (
            p.status != Status.Closed &&
            p.status != Status.Cancelled
        ) revert BadStatus();

        euint64 remaining = escrow[payrollId];
        if (euint64.unwrap(remaining) == bytes32(0)) revert NothingToWithdraw();

        FHE.allowThis(remaining);
        FHE.allow(remaining, msg.sender);
        FHE.allowTransient(remaining, p.token);

        // Capture transfer result — do not zero escrow on silent failure
        ebool transferOk = IConfidentialTokenTransfers(p.token)
            .transferFromHandle(address(this), to, remaining);
        FHE.allowThis(transferOk);

        // Only zero escrow if transfer actually moved funds
        euint64 newEscrow = FHE.select(transferOk, FHE.asEuint64(0), remaining);
        escrow[payrollId] = newEscrow;
        FHE.allowThis(newEscrow);

        emit LeftoversWithdrawn(payrollId, to);
    }

    // ─────────────────────────────────────────────────────────────
    // View helpers — scoped to msg.sender or public read
    // ─────────────────────────────────────────────────────────────

    /// @notice Employee reads their own encrypted salary handle
    function getMyAllocation(uint256 payrollId) external view returns (euint64) {
        return allocation[payrollId][msg.sender];
    }

    /// @notice Employer reads the encrypted escrow handle for their payroll
    function getEscrowHandle(uint256 payrollId) external view returns (euint64) {
        Payroll storage p = payrolls[payrollId];
        if (p.employer == address(0)) revert UnknownPayroll();
        if (p.employer != msg.sender) revert NotEmployer();
        return escrow[payrollId];
    }

    /// @notice Employer reads fundedOnce handle to prepare activatePayroll proof
    function getFundedOnceHandle(uint256 payrollId) external view returns (ebool) {
        Payroll storage p = payrolls[payrollId];
        if (p.employer == address(0)) revert UnknownPayroll();
        if (p.employer != msg.sender) revert NotEmployer();
        return fundedOnce[payrollId];
    }

    /// @notice Employee reads their pending requestId
    function getMyPendingRequestId(uint256 payrollId) external view returns (bytes32) {
        return pendingRequestId[payrollId][msg.sender];
    }

    /// @notice Employee reads their pending okHandle to prepare finalizeClaim proof
    function getMyPendingOkHandle(uint256 payrollId) external view returns (bytes32) {
        return pendingOkHandle[payrollId][msg.sender];
    }
}
