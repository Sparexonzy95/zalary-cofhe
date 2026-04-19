# Security Audit Results

> 19 findings identified. All resolved. Every fix is present in the deployed contracts on Base Sepolia.

[← Back to README](../README.md)

---

## Summary

| Severity | Count | Status |
|---|---|---|
| Critical | 8 | ✅ All fixed |
| High | 5 | ✅ All fixed |
| Medium | 3 | ✅ All fixed |
| Low | 3 | ✅ All fixed |
| **Total** | **19** | **✅ All resolved** |

Every fix is backed by a test in the suite that verifies the issue cannot reoccur.

---

## Critical Findings (8)

| # | Issue | Fix |
|---|---|---|
| C1 | Public decrypt rights on sensitive FHE handles (`allowPublic`) | Restricted to user + contract only |
| C2 | Employee stuck with no retry when escrow insufficient | Added `cancelPendingClaim()` |
| C3 | Double `requestWithdraw` burns cUSDC twice | `WithdrawAlreadyPending` guard |
| C4 | No token whitelist, malicious token exploit | `approvedTokens` whitelist |
| C5 | `fundPayroll` inflated escrow on silent transfer failure | `escrow += FHE.select(transferOk, amt, 0)` |
| C6 | `requestClaim` reduced escrow on silent transfer failure | `ok = FHE.and(escrowOk, transferOk)`, subtract `actualPaid` |
| C7 | `withdrawLeftovers` zeroed escrow on silent transfer failure | `escrow = FHE.select(transferOk, 0, remaining)` |
| C8 | `fundedOnce` was a plaintext bool, could activate unfunded payroll | `fundedOnce` is now `ebool` with Threshold Network proof |

---

## High Findings (5)

| # | Issue | Fix |
|---|---|---|
| H1 | `allowTransient` missing in `fundPayroll`, `requestClaim`, `withdrawLeftovers` | Added to all three functions |
| H2 | `Withdrawn` event leaked the withdrawal amount | Amount removed from event |
| H3 | Handles emitted in events caused metadata exposure | All handles removed from events |
| H4 | Pending state publicly accessible via auto-generated getters | All pending state made `private` |
| H5 | Dead `pendingPayHandle` storage | Removed entirely |

---

## Medium Findings (3)

| # | Issue | Fix |
|---|---|---|
| M1 | No minimum deadline buffer | `MIN_DEADLINE_BUFFER = 1 day` |
| M2 | No minimum withdrawal amount | `MIN_WITHDRAW = 1 USDC` |
| M3 | Missing `FHE.isAllowed()` on incoming handles | Explicit check in `transferFromHandle` and `burnFromHandle` |

---

## Low Findings (3)

| # | Issue | Fix |
|---|---|---|
| L1 | Caller ACL missing on returned success `ebool` | `caller` parameter added to internal `_transfer()` |
| L2 | `allocation` and `escrow` publicly enumerable | Made `private` with `msg.sender`-gated view helpers |
| L3 | `okHandle` emitted in `ClaimRequested` event | Removed; read from `getMyPendingOkHandle()` |

---

## How to Verify

Every fix is present in the deployed contracts. You can:

1. Read the source at `contracts/ConfidentialToken.sol`, `contracts/PayrollVault.sol`, `contracts/SwapRouter.sol`
2. Cross-reference with the tests in `test/` that verify each fix works
3. Check the deployed bytecode on BaseScan against the source

The 4 escrow-accounting fixes (C5, C6, C7, C8) are the most critical. They are explained in detail with code in [SECURITY.md](./SECURITY.md) and each has a dedicated `[INVARIANT]` test in [TESTS.md](./TESTS.md).

---

## Related Docs

- [SECURITY.md](./SECURITY.md), the 4 escrow invariants explained with full Solidity snippets
- [TESTS.md](./TESTS.md), full test suite, invariant test scenarios
