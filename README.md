# Zalary, Confidential On-Chain Payroll

> Payroll is the highest-frequency financial operation at every organization on earth. It is also the one use case that cannot exist on public blockchains today, because salaries are not supposed to be public. Zalary fixes that with Fhenix CoFHE.

Submitted for **Fhenix Buildathon, Wave 2**.

---

## Deployed Contracts (Base Sepolia)

| Contract | Address |
|---|---|
| ConfidentialToken (cUSDC) | [`0xD1A0Ecf8f8430F37627b8B329acb3Bc027F136cF`](https://sepolia.basescan.org/address/0xD1A0Ecf8f8430F37627b8B329acb3Bc027F136cF) |
| PayrollVault | [`0xdDc2C6A6d9B28680e0ca92fED9DffAB173CD6EDa`](https://sepolia.basescan.org/address/0xdDc2C6A6d9B28680e0ca92fED9DffAB173CD6EDa) |
| SwapRouter | [`0x97f27875c279907f7d461Eb32375BF1d4c294613`](https://sepolia.basescan.org/address/0x97f27875c279907f7d461Eb32375BF1d4c294613) |

Chain ID: `84532`

🎥 **Deployment and test walkthrough:** [youtu.be/U8S_2PYxBMw](https://youtu.be/U8S_2PYxBMw?feature=shared)

---

## Why This Matters for Fhenix

Payroll is not a clever demo use case. It is the single highest-frequency financial operation at every organization on earth, and the one that is structurally incompatible with public blockchains until a confidentiality layer like Fhenix CoFHE exists.

A working confidential payroll protocol on Fhenix is the clearest signal that CoFHE can carry real financial workloads, weekly, at production scale, for real people with real comp. It is the use case that moves Fhenix from "infrastructure builders experiment with" to "infrastructure that holds payroll for the first institution onboarding to Web3."

Zalary is the first such protocol. Wave 2 ships it.

---

## The Problem Nobody Has Solved

Every organization, from a 3-person DAO to a 50,000-person enterprise, runs payroll. Weekly. Monthly. Forever. It is the single most repeated financial operation in the economy.

And it is structurally incompatible with public blockchains.

- **Enterprises can't use it.** Employment contracts have salary confidentiality clauses. Broadcasting comp data on a public ledger violates them in most jurisdictions.
- **DAOs can't use it.** Contributor salaries become public the moment they hit-chain. Analytics tools scrape them, competitors poach them, recruiters spam them.
- **Crypto-native companies can't use it.** Every payroll transaction becomes a press release for your burn rate and your org chart.

Today these groups settle through off-chain rails like Deel, Rippling, Remote, Gusto, and traditional banks, accepting the settlement delays, fees, and counterparty risk that come with them. They want on-chain settlement. They cannot accept on-chain transparency.

**This is a $200B+ annual TAM gap.** Global payroll is one of the largest software markets in the world. On-chain payroll's current penetration is effectively zero, not because the infrastructure is bad, but because the privacy is wrong.

Zalary is the infrastructure that fixes the privacy so the market can open.

---

## Who Zalary Is Built For

### Primary: Crypto-native companies and DAOs paying contributors
They already want to pay in stablecoins. They already want the settlement efficiency of on-chain rails. They are blocked only by the fact that their current stablecoin payroll exposes every contributor's compensation on a public explorer.

**What they get from Zalary:** same stablecoin rails, salaries never public, no counterparty off-ramp.

### Secondary: Web3-adjacent treasuries (foundations, grant programs, token issuers)
They have the strongest privacy requirements (foundation grant amounts are sensitive, contributor comp from token treasuries is scrutinized) and already operate on-chain.

**What they get from Zalary:** compliant confidential distribution of treasury funds to individuals, auditable to the foundation itself via permit, invisible to the public.

### Future: Enterprises entering Web3 for on-chain settlement
The market that has been asked-about for years but cannot move until confidential financial primitives exist at production grade. Fhenix CoFHE is that primitive. Zalary is the first payroll product to use it.

---

## Why This Wins Against Off-Chain Payroll

| | Traditional payroll (Deel/Gusto) | Transparent on-chain payroll | **Zalary** |
|---|---|---|---|
| **Settlement time** | 2 to 5 business days | ~seconds | ~seconds |
| **Cross-border cost** | 2 to 8% per transfer | gas only | gas only |
| **Salary privacy** | ✅ private | ❌ fully public | ✅ FHE-encrypted |
| **Counterparty risk** | platform holds funds | none | none |
| **Audit trail** | platform-controlled | public ledger | employee/employer permit-gated |
| **Compliance-safe** | ✅ | ❌ | ✅ |
| **Required to trust hardware** | N/A | N/A | ❌ no TEE, no SGX |

Zalary delivers the settlement speed of on-chain payroll and the privacy of traditional payroll with no trusted hardware, no custodian, and no centralized KMS. That combination has not existed before Fhenix CoFHE.

---

## Try It (3 commands)

Contracts are live on Base Sepolia. After cloning and installing:

```bash
# 1. Run the full test suite (42 tests, all passing)
npx hardhat test

# 2. Check deployed contract configuration on Base Sepolia
npx hardhat run --network base-sepolia scripts/confirm.ts

# 3. Interact with the live contracts using the addresses above
# (See "Full Protocol Flow" section below)
```

A judge can verify in under 3 minutes that:

1. All 42 tests pass locally (including 4 escrow invariant proofs)
2. The deployed contracts have their roles correctly configured on Base Sepolia
3. The contract addresses resolve to verified bytecode on BaseScan

---

## The Product

### Employer experience

```
1. Create a payroll run (choose token, deadline, employee count)
2. Upload a CSV of employees and salaries, each amount encrypted client-side with @cofhe/sdk
3. Fund the payroll, employer's cUSDC moves into an encrypted escrow
4. Activate the run, employees can now claim
5. After the deadline, withdraw any unclaimed escrow
```

### Employee experience

```
1. Connect wallet, see that a payroll is claimable (no amounts visible to others)
2. Click "Claim", one transaction, paid instantly in cUSDC
3. Convert cUSDC to USDC any time via the built-in SwapRouter
```

At no point does any amount, salary, escrow, or withdrawal, appear anywhere on-chain in readable form. A third-party explorer sees "employee X claimed from payroll Y" and nothing else.

### What makes this actually work

- **Encrypted escrow accounting** that stays correct even when FHE transfers silently fail (4 invariants, all tested, see below)
- **Keyed withdrawals** so one stuck claim never blocks another employee or another run
- **Two-step claims** with Threshold Network proof verification on-chain, employees get mathematically confirmed receipts
- **Retry path** if employer underfunded the escrow, the employee's failed claim can be cancelled and retried after a top-up without any state corruption

---

## From Ideation to Protocol: Wave 1 to Wave 2

**Wave 1 was ideation.** We showed up with the pitch, the market thesis, and the architecture diagrams. No contracts shipped. We earned a **$500 grant** on the strength of the idea and the team.

**Wave 2 is the protocol.** Three production-grade contracts, 42 tests, all four escrow invariants proven, deployed and live on Base Sepolia. The idea is now code you can interact with on-chain today.

| | Wave 1 (Ideation) | Wave 2 (Protocol, this submission) |
|---|---|---|
| **What existed** | Pitch, market thesis, architecture sketch | 3 deployed contracts, 42 passing tests, live on Base Sepolia |
| **Encryption primitive** | (Planned) | `euint64` via Fhenix CoFHE |
| **Client SDK** | (Planned) | `@cofhe/sdk` v0.4.0 client-side encryption |
| **Decryption** | (Planned) | Threshold Network signatures, verified on-chain via `FHE.verifyDecryptResult` |
| **Trust model** | (Planned) | Lattice-based cryptography, no TEE, no KMS, no trusted hardware |
| **Status** | ✅ Idea validated ($500 grant) | ✅ **Working on-chain protocol** |

### What Wave 2 shipped

| Deliverable | Status |
|---|---|
| `ConfidentialToken.sol`, FHE-encrypted ERC20-like token with silent-failure transfers | ✅ Complete |
| `PayrollVault.sol`, confidential payroll vault with encrypted escrow and 4 invariants | ✅ Complete |
| `SwapRouter.sol`, USDC to cUSDC gateway with keyed concurrent withdrawals | ✅ Complete |
| Full test suite, **42 tests** across 3 contracts, including 4 invariant proofs | ✅ All passing |
| Deployment to Base Sepolia via Hardhat Ignition | ✅ Deployed |
| Security audit with 19 findings resolved | ✅ Complete (see below) |
| Deployment and test walkthrough video | ✅ [Watch](https://youtu.be/U8S_2PYxBMw?feature=shared) |

---

## Architecture

```
User ──► SwapRouter ──► ConfidentialToken (cUSDC)
              │                   │
              │           PayrollVault
              │                   │
         USDC Pool         Encrypted Escrow
```

Three contracts, clean separation:

**ConfidentialToken.** An encrypted ERC20-like token. All balances are `euint64` FHE ciphertexts. No plaintext balance is ever stored on-chain. Transfers use `FHE.gte` plus `FHE.select` for silent failure. If balance is insufficient, zero is moved with no revert and no information leak. The returned `ebool success` tells the caller whether the transfer worked, enabling downstream FHE logic (`FHE.and`, `FHE.select`). Supports ZK-verified user transfers (`InEuint64`), vault-initiated handle-based transfers (`VAULT_ROLE`), and burn-on-withdrawal (`BURNER_ROLE`).

**PayrollVault.** The core business contract. Manages the full payroll lifecycle: creation, salary allocation, escrow funding, activation, employee claims, closure, and leftover withdrawal. Every piece of financial data (salaries, escrow, funding status) is encrypted. Enforces four critical escrow invariants that prevent accounting drift when FHE transfers silently fail.

**SwapRouter.** The USDC to cUSDC gateway. Deposit is public (USDC in, cUSDC minted). Withdrawal is private, amount revealed only to the withdrawing user via Threshold Network decryption. Pending withdrawals are keyed by `bytes32 withdrawKey` (not just wallet address), so one stuck request never blocks another for the same user, critical for payroll, where every claim triggers a downstream withdrawal.

---

## Full Protocol Flow

### Employer: create, fund, activate

```
1. createPayroll(token, deadline, employeeCount)
2. uploadAllocations(payrollId, employees, encryptedSalaries[])
3. finalizeAllocations(payrollId)
4. fundPayroll(payrollId, encryptedAmount)          ← repeatable for top-ups
5. // Off-chain: decrypt fundedOnce handle to prove funding succeeded
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

2. // Off-chain: read okHandle from getMyPendingOkHandle()
   // Decrypt via Threshold Network: decryptForTx(okHandle).withPermit().execute()

3a. If ok == true  → finalizeClaim(payrollId, requestId, true, sig)
                     → Employee marked as claimed ✓

3b. If ok == false → cancelPendingClaim(payrollId, requestId, false, sig)
                     → State cleared, employer tops up, employee retries
```

### USDC on/off ramp

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

## Security: Escrow Invariants

FHE token transfers **never revert** on insufficient balance. They silently move zero and return `ebool(false)`. This is by design (reverting would leak balance information). Every function that updates escrow gates its accounting on the actual transfer result.

These invariants are not decorative. They are the difference between a demo and a protocol that can hold real money.

### Invariant 1: fundPayroll, escrow never overstated
```solidity
transferOk   = token.transferFromHandle(employer → vault, amt)
actualFunded = FHE.select(transferOk, amt, 0)      // zero if transfer failed
escrow      += actualFunded                         // only credit what actually arrived
```

### Invariant 2: requestClaim, escrow never understated
```solidity
escrowOk    = FHE.gte(escrow, salary)               // can escrow cover this?
transferOk  = token.transferFromHandle(vault → employee, pay)
ok          = FHE.and(escrowOk, transferOk)          // both must hold
actualPaid  = FHE.select(ok, salary, 0)
escrow     -= actualPaid                             // only debit what actually moved
```

### Invariant 3: withdrawLeftovers, escrow only zeroed on confirmed transfer
```solidity
transferOk = token.transferFromHandle(vault → employer, remaining)
escrow     = FHE.select(transferOk, 0, remaining)   // keep old value if failed
```

### Invariant 4: Activation guard, fundedOnce as ebool
```solidity
// fundedOnce is NOT a bool, it's an ebool (FHE-encrypted boolean)
ebool newFundedOnce = FHE.or(fundedOnce[payrollId], transferOk);
// becomes true ONLY when a real transfer succeeds
```

Activation requires the employer to decrypt `fundedOnce` off-chain, submit a Threshold Network signature proving it equals `true`, and the contract verifies via `FHE.verifyDecryptResult`. A payroll where every funding attempt silently failed **cannot** be activated. `activatePayroll` reverts with `NotFunded()`.

### Additional Security

- **ReentrancyGuard** on all state-modifying functions with external calls
- **Private mappings** for `allocation`, `escrow`, `pendingOkHandle`, `pendingRequestId`, accessible only via `msg.sender`-gated view functions
- **okHandle excluded from events.** `ClaimRequested` does not emit `okHandle`, preventing handle enumeration
- **Role separation.** `MINTER_ROLE`, `BURNER_ROLE`, `VAULT_ROLE`, `ADMIN_ROLE` assigned per-contract at deployment
- **Token whitelist.** PayrollVault only accepts tokens approved via `approveToken()`

---

## Security: Audit Results

Zalary was audited before deployment. **19 findings across all severity levels were identified and resolved.** Every fix is present in the deployed contracts on Base Sepolia.

| Severity | Issue | Status |
|---|---|---|
| Critical | Public decrypt rights on sensitive FHE handles (`allowPublic`) | Fixed: restricted to user + contract only |
| Critical | Employee stuck with no retry when escrow insufficient | Fixed: `cancelPendingClaim()` |
| Critical | Double `requestWithdraw` burns cUSDC twice | Fixed: `WithdrawAlreadyPending` guard |
| Critical | No token whitelist, malicious token exploit | Fixed: `approvedTokens` whitelist |
| Critical | `fundPayroll` inflated escrow on silent transfer failure | Fixed: `escrow += select(transferOk, amt, 0)` |
| Critical | `requestClaim` reduced escrow on silent transfer failure | Fixed: `ok = escrowOk AND transferOk`, subtract `actualPaid` |
| Critical | `withdrawLeftovers` zeroed escrow on silent transfer failure | Fixed: `escrow = select(transferOk, 0, remaining)` |
| Critical | `fundedOnce` bool, could activate unfunded payroll | Fixed: `fundedOnce` is `ebool` with Threshold Network proof |
| High | `allowTransient` missing in `fundPayroll`, `requestClaim`, `withdrawLeftovers` | Fixed: all three functions |
| High | `Withdrawn` event leaked withdrawal amount | Fixed: amount removed from event |
| High | Handles emitted in events, metadata exposure | Fixed: all handles removed from events |
| High | Pending state publicly accessible via getters | Fixed: all pending state private |
| High | Dead `pendingPayHandle` storage | Fixed: removed entirely |
| Medium | No minimum deadline buffer | Fixed: `MIN_DEADLINE_BUFFER = 1 day` |
| Medium | No minimum withdrawal amount | Fixed: `MIN_WITHDRAW = 1 USDC` |
| Medium | Missing `FHE.isAllowed()` on incoming handles | Fixed: explicit check in `transferFromHandle` and `burnFromHandle` |
| Low | Caller ACL missing on returned success `ebool` | Fixed: `caller` parameter in `_transfer()` |
| Low | `allocation` and `escrow` publicly enumerable | Fixed: private with view helpers |
| Low | `okHandle` in `ClaimRequested` event | Fixed: removed, read from `getMyPendingOkHandle()` |

**8 Critical, 5 High, 3 Medium, 3 Low, all resolved.** Every single one is backed by a test in the suite that verifies the fix works.

---

## Privacy Design Decisions

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

## Test Results (42 Passing)

```
  ConfidentialToken (9 tests)
    ✅ mintTo: increases encrypted balance
    ✅ mintTo: reverts for zero amount
    ✅ mintTo: reverts without MINTER_ROLE
    ✅ mintTo: reverts for zero address
    ✅ transfer: moves encrypted balance from alice to bob
    ✅ transfer: silent fail when balance insufficient
    ✅ transfer: reverts on self-transfer
    ✅ burnFromHandle: reduces balance when token has handle access
    ✅ decryptForView: alice reads her own balance

  PayrollVault (20 tests)
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

  SwapRouter (13 tests)
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

  42 passing
```

### What the Invariant Tests Prove

| Test | Scenario | Proves |
|---|---|---|
| `fundPayroll: escrow unchanged` | Fund 50,000 but only have 10,000 | Escrow stays 0. `fundedOnce` stays false. Activation blocked. |
| `requestClaim: escrow unchanged` | 2 employees (500 each), escrow only 500 | Alice claims OK. Bob: escrow=0 < salary=500, ok=false. Escrow stays 0. |
| `failed claim → top-up → retry` | Claim 500 from escrow of 100. Fails. Top up 900. Retry. | Cancel clears state. Top-up works. Second claim succeeds. |
| `leftover withdrawal after failed fund` | Fund 50,000 (fails), fund 500 (succeeds). Close. Withdraw. | Employer balance = original 10,000 (500 round-tripped correctly). |

Run the test suite:
```bash
npx hardhat test
```

---

## Contract API Reference

### ConfidentialToken

| Function | Access | Description |
|---|---|---|
| `transfer(to, InEuint64)` | Any holder | Encrypted transfer with silent failure. Returns `ebool`. |
| `transferFromHandle(from, to, euint64)` | Owner or `VAULT_ROLE` | Handle-based transfer. Caller must `FHE.allowTransient` first. |
| `mintTo(to, amount)` | `MINTER_ROLE` | Mint from plaintext (SwapRouter deposit flow). |
| `burnFromHandle(from, euint64)` | `BURNER_ROLE` | Burn encrypted amount (SwapRouter withdrawal flow). |
| `balanceOf(address)` | Public | Returns `euint64` balance handle. Decrypt with permit. |

### PayrollVault

| Function | Access | Description |
|---|---|---|
| `createPayroll(token, deadline, count)` | Any address | Create payroll. Deadline ≥ 1 day from now. |
| `uploadAllocations(id, employees[], amounts[])` | Employer | Upload encrypted salaries. Can call in chunks. |
| `finalizeAllocations(id)` | Employer | Lock allocations. `uploadedCount == employeeCount` required. |
| `fundPayroll(id, InEuint64)` | Employer | Fund escrow. Repeatable for top-ups. |
| `activatePayroll(id, fundedPlaintext, sig)` | Employer | Activate with Threshold Network proof. |
| `requestClaim(id)` | Employee | Attempt salary claim. Stores `okHandle` privately. |
| `finalizeClaim(id, requestId, okPlain, sig)` | Employee | Finalize with proof. Requires `ok == true`. |
| `cancelPendingClaim(id, requestId, okPlain, sig)` | Employee | Cancel failed claim. Requires `ok == false`. |
| `closePayroll(id)` | Employer | Close after deadline. |
| `withdrawLeftovers(id, to)` | Employer | Recover remaining escrow. |
| `cancelPayroll(id)` | Employer | Cancel before activation. |
| `getMyAllocation(id)` | Employee | Read own encrypted salary handle. |
| `getEscrowHandle(id)` | Employer | Read encrypted escrow handle. |
| `getFundedOnceHandle(id)` | Employer | Read `fundedOnce` for activation proof. |
| `getMyPendingOkHandle(id)` | Employee | Read pending claim ok handle. |
| `getMyPendingRequestId(id)` | Employee | Read pending request ID. |

### SwapRouter

| Function | Access | Description |
|---|---|---|
| `deposit(amount)` | Any user | USDC in, cUSDC minted. |
| `requestWithdraw(key, InEuint64)` | Any holder | Burn cUSDC, store pending by key. |
| `finalizeWithdraw(key, id, amt, amtSig, ok, okSig)` | Request owner | Verify proofs, USDC out. |
| `cancelPendingWithdraw(key, id, amt, amtSig, ok, okSig)` | Request owner | Clear stuck request (`ok == false` required). |
| `getPendingAmountHandle(key)` | Public | Read pending amount handle. |
| `getPendingOkHandle(key)` | Public | Read pending ok handle. |

---

## Roles and Permissions

| Role | Holder | Can Call |
|---|---|---|
| `MINTER_ROLE` | SwapRouter | `mintTo()` on ConfidentialToken |
| `BURNER_ROLE` | SwapRouter | `burnFromHandle()` on ConfidentialToken |
| `VAULT_ROLE` | PayrollVault | `transferFromHandle()` on ConfidentialToken |
| `ADMIN_ROLE` | Deployer | `approveToken()`, `revokeToken()` on PayrollVault |
| `DEFAULT_ADMIN_ROLE` | Deployer | Grant and revoke all roles |

All roles configured during deployment via Hardhat Ignition.

---

## Project Structure

```
zalary-cofhe/
├── contracts/
│   ├── ConfidentialToken.sol     # Encrypted ERC20-like token (euint64 balances)
│   ├── PayrollVault.sol          # Payroll lifecycle, encrypted escrow, two-step claims
│   ├── SwapRouter.sol            # USDC ↔ cUSDC gateway with keyed withdrawals
│   └── test/
│       └── MockERC20.sol         # Mintable ERC20 mock for SwapRouter tests
├── test/
│   ├── ConfidentialToken.test.ts # 9 tests
│   ├── PayrollVault.test.ts      # 20 tests (incl. 4 invariant proofs)
│   └── SwapRouter.test.ts       # 13 tests
├── ignition/
│   └── modules/
│       └── ZalaryDeploy.ts       # Hardhat Ignition: deploy + roles + token approval
├── scripts/
│   └── confirm.ts                # Post-deploy verification
├── hardhat.config.ts
├── package.json
└── .env.example
```

---

## Setup and Development

### Prerequisites

- Node.js 18+
- npm or yarn

### Install

```bash
npm install
```

### Configure environment

```bash
cp .env.example .env
# Add PRIVATE_KEY and BASE_SEPOLIA_RPC_URL
```

### Compile

```bash
npx hardhat compile
```

### Test

```bash
npx hardhat test
```

All 42 tests pass. The CoFHE mock environment deploys automatically.

### Deploy to Base Sepolia

```bash
npx hardhat ignition deploy ignition/modules/ZalaryDeploy.ts --network base-sepolia
```

### Verify deployment

```bash
npx hardhat run --network base-sepolia scripts/confirm.ts
```

---

## Client SDK Integration

The protocol uses `@cofhe/sdk` v0.4.0 for all client-side FHE operations.

### Setup

```typescript
import { createCofheConfig, createCofheClient } from '@cofhe/sdk/web';
import { Encryptable, FheTypes } from '@cofhe/sdk';
import { chains } from '@cofhe/sdk/chains';

const config = createCofheConfig({ supportedChains: [chains.baseSepolia] });
const client = createCofheClient(config);
await client.connect(publicClient, walletClient);
await client.permits.getOrCreateSelfPermit();
```

### Encrypt values

```typescript
const encrypted = await client
  .encryptInputs([Encryptable.uint64(salary)])
  .execute();
// Pass encrypted[0] to uploadAllocations or fundPayroll
```

### Decrypt for display

```typescript
const ctHash  = await confidentialToken.balanceOf(userAddress);
const balance = await client
  .decryptForView(ctHash, FheTypes.Uint64)
  .execute();
```

### Decrypt for transaction (claims, activation, withdrawal)

```typescript
const okHandle = await vault.getMyPendingOkHandle(payrollId);
const result   = await client
  .decryptForTx(okHandle)
  .withPermit()
  .execute();

if (Boolean(result.decryptedValue)) {
  // Claim succeeded, finalize
  await vault.finalizeClaim(payrollId, requestId, true, result.signature);
} else {
  // Escrow insufficient, cancel and retry after top-up
  await vault.cancelPendingClaim(payrollId, requestId, false, result.signature);
}
```

---

## Technical Stack

| Component | Version |
|---|---|
| Solidity | 0.8.28 (EVM: Cancun) |
| CoFHE Contracts | @fhenixprotocol/cofhe-contracts v0.1.3 |
| CoFHE SDK | @cofhe/sdk v0.4.0 |
| CoFHE Hardhat Plugin | @cofhe/hardhat-plugin v0.4.0 |
| OpenZeppelin | v5.x (AccessControl, ReentrancyGuard, SafeERC20) |
| Hardhat + Ignition | v2.x |
| TypeScript | v5.x |

---

## Roadmap

| Wave | Milestone | Status |
|---|---|---|
| **Wave 1** | Ideation, product vision, market thesis, architecture sketch | ✅ Complete ($500 grant) |
| **Wave 2** | Full CoFHE rewrite, 3 contracts, 42 tests, Base Sepolia deployment, audit resolved | ✅ **This submission** |
| **Wave 3** | End-to-end frontend migration from `@inco/js` to `@cofhe/sdk` | 🔜 Next |
| **Wave 4** | Gas optimization, multi-employee concurrent claims, recurring schedules | Planned |
| **Wave 5** | Mainnet preparation, institutional onboarding, compliance docs | Planned |

---

## Team

Zalary is built by a small team of onchain engineers with backgrounds in DeFi protocol engineering, confidential computing, and payroll infrastructure. We shipped Wave 1 (ideation) solo, earned the $500 grant, and delivered Wave 2 (full protocol with audit) within the deliverable window.

---

## License

MIT

---

*Zalary. Confidential payroll is the use case that brings institutions to FHE infrastructure.*