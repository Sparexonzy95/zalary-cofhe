# Test Suite (42 Passing)

> Every test name. What each invariant test proves.

[← Back to README](../README.md)

Run the suite:

```bash
npx hardhat test
```

All 42 tests pass. The CoFHE mock environment deploys automatically via `@cofhe/hardhat-plugin`.

---

## ConfidentialToken (9 tests)

```
✅ mintTo: increases encrypted balance
✅ mintTo: reverts for zero amount
✅ mintTo: reverts without MINTER_ROLE
✅ mintTo: reverts for zero address
✅ transfer: moves encrypted balance from alice to bob
✅ transfer: silent fail when balance insufficient
✅ transfer: reverts on self-transfer
✅ burnFromHandle: reduces balance when token has handle access
✅ decryptForView: alice reads her own balance
```

---

## PayrollVault (20 tests)

```
✅ createPayroll: reverts with unapproved token
✅ createPayroll: stores payroll correctly
✅ createPayroll: reverts with zero employees
✅ createPayroll: reverts with deadline too soon
✅ uploadAllocations: stores encrypted salaries via getMyAllocation
✅ uploadAllocations: reverts on duplicate employee
✅ activatePayroll: reverts when funding silently failed (fundedOnce == false)
✅ full flow: create → upload → finalize → fund → activate
✅ requestClaim: transfers salary, okHandle read from view helper not event
✅ finalizeClaim: marks claimed after valid proof
✅ requestClaim: reverts if already claimed
✅ requestClaim: reverts if no allocation
✅ [INVARIANT] fundPayroll: escrow does NOT increase when employer has insufficient balance
✅ [INVARIANT] requestClaim: escrow does NOT decrease when vault token balance insufficient
✅ [INVARIANT] failed claim → employer tops up → retry succeeds
✅ [INVARIANT] leftover withdrawal after failed funding attempt
✅ cancelPendingClaim: clears state for retry
✅ closePayroll + withdrawLeftovers: employer recovers remaining escrow
✅ cancelPayroll: works before activation
✅ cancelPayroll: reverts after activation
```

---

## SwapRouter (13 tests)

```
✅ deposit: mints cUSDC equal to USDC deposited
✅ deposit: reverts on zero amount
✅ deposit: emits Deposited event
✅ requestWithdraw: stores pending state by withdrawKey, not just by wallet
✅ requestWithdraw: same key cannot be requested twice while still pending
✅ requestWithdraw: two different keys can coexist for the same wallet
✅ finalizeWithdraw: pays out USDC and clears only that withdrawKey
✅ finalizeWithdraw: reverts if no pending request for that key
✅ finalizeWithdraw: reverts on wrong requestId
✅ finalizeWithdraw: reverts on zero amount
✅ cancelPendingWithdraw: clears a bad/stuck pending withdraw for that key only
✅ cancelPendingWithdraw: reverts if withdraw can be finalized
✅ cancelPendingWithdraw: after cancel, same key can be requested again
```

---

## What the Invariant Tests Prove

The four `[INVARIANT]` tests are the most important tests in the suite. They verify that escrow accounting stays correct under adversarial conditions.

| Test | Adversarial Scenario | What It Proves |
|---|---|---|
| `fundPayroll: escrow unchanged` | Employer funds 50,000 but only has 10,000 balance | Escrow stays 0. `fundedOnce` stays false. Activation blocked. |
| `requestClaim: escrow unchanged` | 2 employees (500 each), escrow only 500. Bob claims after Alice drained escrow. | Bob's claim: escrow=0 < salary=500 → ok=false. Escrow stays 0. Bob gets 0 cUSDC. |
| `failed claim → top-up → retry` | Alice tries to claim 500 from escrow of 100. Fails. Employer adds 900. Alice retries. | Cancel clears state. Top-up works. Second claim succeeds. Final balances correct. |
| `leftover withdrawal after failed fund` | Employer funds 50,000 (fails), funds 500 (succeeds). Close. Withdraw. | Employer balance returns to original 10,000 (500 went in and came out correctly). |

Together, these four tests prove the protocol can safely hold real payroll funds under every failure mode we could think of.

---

## Related Docs

- [SECURITY.md](./SECURITY.md), the code-level invariants each test verifies
- [AUDIT.md](./AUDIT.md), which audit findings each test protects against
