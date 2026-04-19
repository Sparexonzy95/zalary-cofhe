# Security: The 4 Escrow Invariants

> This is the hard part of building on FHE. And we solved it.

[← Back to README](../README.md)

---

## Why Escrow Accounting Is Non-Trivial on FHE

FHE token transfers **never revert** on insufficient balance. They silently move zero and return `ebool(false)`.

This is by design. Reverting would leak balance information through a side channel, defeating the point of encryption. But it means naive accounting corrupts escrow immediately.

**Example of what a naive implementation does:**

```solidity
token.transferFromHandle(employer, vault, amt);
escrow += amt;  // assumes it worked, it might not have
```

If the employer has zero balance, the transfer silently fails. Escrow still jumps by `amt`. Employees then claim against phantom funds. Accounting is corrupted.

**Every function in Zalary that updates escrow gates its accounting on the actual transfer result.** Four invariants enforce this across the full lifecycle.

These invariants are not decorative. They are the difference between a demo and a protocol that can hold real money.

---

## Invariant 1: `fundPayroll` cannot overstate escrow

```solidity
ebool   transferOk   = token.transferFromHandle(employer, vault, amt);
euint64 actualFunded = FHE.select(transferOk, amt, FHE.asEuint64(0));
escrow              += actualFunded;  // only credit what actually arrived
```

Escrow only grows by what actually moved. If the employer's transfer silently failed, `actualFunded` is 0 and escrow is unchanged.

**Test:** `[INVARIANT] fundPayroll: escrow does NOT increase when employer has insufficient balance`

---

## Invariant 2: `requestClaim` cannot understate escrow

```solidity
ebool   escrowOk    = FHE.gte(curEscrow, salary);        // can escrow cover this?
euint64 pay         = FHE.select(escrowOk, salary, 0);    // pay 0 if not
ebool   transferOk  = token.transferFromHandle(vault, employee, pay);
ebool   ok          = FHE.and(escrowOk, transferOk);      // BOTH must hold
euint64 actualPaid  = FHE.select(ok, salary, FHE.asEuint64(0));
euint64 newEscrow   = FHE.sub(curEscrow, actualPaid);     // only debit what moved
```

Escrow is only debited by what actually moved. If escrow was insufficient OR the token transfer failed, `actualPaid` is 0 and escrow is unchanged.

Note the use of `FHE.and` to combine two separate conditions. Both `escrowOk` (vault has enough encrypted escrow) and `transferOk` (token actually moved the funds) must be true for the claim to succeed.

**Test:** `[INVARIANT] requestClaim: escrow does NOT decrease when vault token balance insufficient`

---

## Invariant 3: `withdrawLeftovers` only zeros escrow on confirmed transfer

```solidity
ebool   transferOk = token.transferFromHandle(vault, employer, remaining);
euint64 newEscrow  = FHE.select(transferOk, FHE.asEuint64(0), remaining);
//                               ^^^^^^^^^^                    ^^^^^^^^^
//                    zero only if confirmed        keep old value if failed
```

If the final withdrawal transfer somehow fails, escrow retains its previous value rather than being zeroed incorrectly.

**Test:** `[INVARIANT] leftover withdrawal after failed funding attempt`

---

## Invariant 4: Activation guard, `fundedOnce` as `ebool`

```solidity
// fundedOnce is NOT a bool. It is an ebool (FHE-encrypted boolean).
ebool newFundedOnce = FHE.or(fundedOnce[payrollId], transferOk);
// becomes true ONLY when a real transfer succeeds
```

Activation requires:

1. The employer decrypts `fundedOnce` off-chain via `decryptForTx`
2. Submits the plaintext and a Threshold Network signature
3. The contract verifies via `FHE.verifyDecryptResult`
4. `if (!fundedPlaintext) revert NotFunded();`

A payroll where every funding attempt silently failed **cannot** be activated. The employer cannot produce a valid `true` proof because no Threshold Network node will sign one. `activatePayroll` reverts.

**Test:** `activatePayroll: reverts when funding silently failed (fundedOnce == false)`

---

## Retry Path: Failed Claims Can Be Recovered

A naive implementation reverts on insufficient escrow, leaving the employee with a failed transaction and no clear recovery. Zalary provides a full retry path:

```
1. requestClaim fails (ok == false)
2. Employee calls cancelPendingClaim(id, requestId, false, sig)
   → State cleared. Requires Threshold Network proof that ok == false.
3. Employer calls fundPayroll(id, topUpAmount)
4. Employee calls requestClaim again → succeeds
```

**Test:** `[INVARIANT] failed claim → employer tops up → retry succeeds`

This test walks through the full cycle: claim fails → cancel → top up → retry → success, asserting escrow and balances are correct at every step.

---

## Additional Security Measures

- **ReentrancyGuard** on all state-modifying functions with external calls
- **Private mappings** for `allocation`, `escrow`, `pendingOkHandle`, `pendingRequestId`, `fundedOnce`, accessible only via `msg.sender`-gated view functions
- **okHandle excluded from events**: `ClaimRequested` emits `payrollId`, `employee`, and `requestId` but NOT `okHandle`. The employee reads it from `getMyPendingOkHandle()`. This prevents handle enumeration by third-party observers.
- **Role separation**: `MINTER_ROLE`, `BURNER_ROLE`, `VAULT_ROLE`, `ADMIN_ROLE`, assigned per-contract at deployment
- **Token whitelist**: PayrollVault only accepts tokens approved by `ADMIN_ROLE` via `approveToken()`
- **ACL scoping**: Handles are granted access only to exactly the parties that need them. The internal `_transfer` function takes a `caller` parameter so the external caller (vault, router) receives access on the returned success `ebool` to use in downstream `FHE.select` / `FHE.and` logic.

---

## Related Docs

- [AUDIT.md](./AUDIT.md), 19 findings resolved, mapped to specific fixes
- [TESTS.md](./TESTS.md), every test name and what each invariant test proves
- [ARCHITECTURE.md](./ARCHITECTURE.md), how the three contracts fit together
