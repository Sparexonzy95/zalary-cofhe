# Architecture

> Three contracts. Clean separation. Everything financial is encrypted.

[← Back to README](../README.md)

---

## System Overview

```
User ──► SwapRouter ──► ConfidentialToken (cUSDC)
              │                   │
              │           PayrollVault
              │                   │
         USDC Pool         Encrypted Escrow
```

Three contracts, clean separation:

### ConfidentialToken

An encrypted ERC20-like token. All balances are `euint64` FHE ciphertexts. No plaintext balance is ever stored on-chain. Transfers use `FHE.gte` plus `FHE.select` for silent failure. If balance is insufficient, zero is moved with no revert and no information leak. The returned `ebool success` tells the caller whether the transfer worked, enabling downstream FHE logic (`FHE.and`, `FHE.select`).

Supports three transfer modes:
- User-initiated (`InEuint64` from `@cofhe/sdk`)
- Vault-initiated handle-based transfers (`VAULT_ROLE`)
- Burn-on-withdrawal (`BURNER_ROLE`)

### PayrollVault

The core business contract. Manages the full payroll lifecycle: creation, salary allocation, escrow funding, activation, employee claims, closure, and leftover withdrawal. Every piece of financial data (salaries, escrow, funding status) is encrypted. Enforces four critical escrow invariants that prevent accounting drift when FHE transfers silently fail.

### SwapRouter

The USDC to cUSDC gateway. Deposit is public (USDC in, cUSDC minted). Withdrawal is private, amount revealed only to the withdrawing user via Threshold Network decryption. Pending withdrawals are keyed by `bytes32 withdrawKey` (not just wallet address), so one stuck request never blocks another for the same user, critical for payroll, where every claim triggers a downstream withdrawal.

---

## Full Protocol Flow

### Employer: create, fund, activate

```
1. createPayroll(token, deadline, employeeCount)
2. uploadAllocations(payrollId, employees, encryptedSalaries[])
3. finalizeAllocations(payrollId)
4. fundPayroll(payrollId, encryptedAmount)          ← repeatable for top-ups
5. Off-chain: decrypt fundedOnce handle to prove funding succeeded
6. activatePayroll(payrollId, fundedPlaintext, fundedSig)

After deadline:
7. closePayroll(payrollId)
8. withdrawLeftovers(payrollId, to)                  ← recover unclaimed escrow
```

### Employee: claim, finalize

```
1. requestClaim(payrollId)
   → On-chain: FHE.gte(escrow, salary) → transfer attempt
   → Stores: okHandle + requestId (private, msg.sender-gated)

2. Off-chain: read okHandle from getMyPendingOkHandle()
   Decrypt via Threshold Network: decryptForTx(okHandle).withPermit().execute()

3a. If ok == true  → finalizeClaim(payrollId, requestId, true, sig)
                     → Employee marked as claimed ✓

3b. If ok == false → cancelPendingClaim(payrollId, requestId, false, sig)
                     → State cleared, employer tops up, employee retries
```

### USDC on/off ramp (SwapRouter)

```
// Deposit (public amount, private balance after)
USDC.approve(SwapRouter, amount)
SwapRouter.deposit(amount)                           → cUSDC minted (balance now encrypted)

// Withdrawal (private throughout)
SwapRouter.requestWithdraw(withdrawKey, encAmt)      → cUSDC burned, handles stored by key

// Off-chain: decrypt both handles via Threshold Network

SwapRouter.finalizeWithdraw(key, requestId, ...)     → USDC paid out, only that key cleared

// If burn failed (insufficient cUSDC balance):
SwapRouter.cancelPendingWithdraw(key, ...)           → clears stuck request (ok must be false)
```

---

## Privacy Model

| What | Visible On-Chain | Who Can Decrypt |
|---|---|---|
| Employee salary | **Encrypted** (`euint64`) | Employee only (permit) |
| Vault escrow | **Encrypted** (`euint64`) | Employer only (permit) |
| fundedOnce | **Encrypted** (`ebool`) | Employer only (permit) |
| Claim success | **Encrypted** (`ebool`) | Employee only (permit) |
| Withdrawal amount | **Encrypted** (`euint64`) | Withdrawing user only (permit) |
| cUSDC balance | **Encrypted** (`euint64`) | Balance owner only (permit) |
| Deposit amount | **Yes** | Public (USDC is plaintext ERC20) |
| Payroll metadata | **Yes** | Public (counts, deadline, status) |

**Why deposit is public:** USDC entering the system is a plaintext ERC20 `transferFrom`. Once converted to cUSDC, the balance is fully private.

**Why okHandle is not in the ClaimRequested event:** The employee reads it directly from `getMyPendingOkHandle()`, a `msg.sender`-gated view function. Emitting it would expose the handle to third-party observers.

---

## Why This Beats Off-Chain Payroll

| | Traditional payroll (Deel/Gusto) | Transparent on-chain | **Zalary** |
|---|---|---|---|
| **Settlement time** | 2 to 5 business days | ~seconds | ~seconds |
| **Cross-border cost** | 2 to 8% per transfer | gas only | gas only |
| **Salary privacy** | ✅ private | ❌ fully public | ✅ FHE-encrypted |
| **Counterparty risk** | platform holds funds | none | none |
| **Audit trail** | platform-controlled | public ledger | employee/employer permit-gated |
| **Compliance-safe** | ✅ | ❌ | ✅ |
| **Trusted hardware required** | N/A | N/A | ❌ no TEE, no SGX |

Zalary delivers the settlement speed of on-chain payroll and the privacy of traditional payroll, with no trusted hardware, no custodian, and no centralized KMS. That combination has not existed before Fhenix CoFHE.

---

## Related Docs

- [SECURITY.md](./SECURITY.md), the 4 escrow invariants that hold this together
- [API.md](./API.md), complete function reference
- [TESTS.md](./TESTS.md), every test name and what it proves
