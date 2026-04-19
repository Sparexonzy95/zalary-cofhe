# Zalary, Confidential On-Chain Payroll

> Payroll cannot exist on public blockchains today, because salaries are not supposed to be public.
>
> Zalary fixes that with Fhenix CoFHE.

Submitted for **Fhenix Buildathon, Wave 2**.

---

## TL;DR

Zalary is a **fully working confidential payroll protocol** on Fhenix CoFHE. Companies fund payroll in encrypted tokens. Employees claim salaries without anyone seeing amounts. Accounting correctness is enforced by cryptographic invariants.

**Think Stripe for payroll, but salaries are never visible, even on-chain.**

🎥 [Walkthrough video of testing and deployment](https://youtu.be/U8S_2PYxBMw?feature=shared)

---

## Live System (Verify in 3 Minutes)

Zalary is deployed, tested, and auditable right now. No screenshots, no slide decks. Every claim below is verifiable from this repo or on-chain.

- **3 contracts live** on Base Sepolia (addresses below, click to verify on BaseScan)
- **42/42 tests passing** locally, including 4 escrow invariant proofs
- **Security audit resolved**: 19 findings, every fix present in the deployed bytecode
- **Full end-to-end payroll flow** working: fund, claim, finalize, withdraw, retry

| Contract | Address |
|---|---|
| ConfidentialToken (cUSDC) | [`0xD1A0Ecf8f8430F37627b8B329acb3Bc027F136cF`](https://sepolia.basescan.org/address/0xD1A0Ecf8f8430F37627b8B329acb3Bc027F136cF) |
| PayrollVault | [`0xdDc2C6A6d9B28680e0ca92fED9DffAB173CD6EDa`](https://sepolia.basescan.org/address/0xdDc2C6A6d9B28680e0ca92fED9DffAB173CD6EDa) |
| SwapRouter | [`0x97f27875c279907f7d461Eb32375BF1d4c294613`](https://sepolia.basescan.org/address/0x97f27875c279907f7d461Eb32375BF1d4c294613) |

**Chain ID:** `84532`

---

## The Problem

Payroll is the most common financial operation in the world. But it cannot exist on public blockchains because salaries are sensitive data.

- DAOs expose contributor salaries the moment they pay on-chain
- Companies violate confidentiality clauses by publishing comp data
- Web3 payroll today runs entirely off-chain (Deel, Gusto, banks)

Zalary makes confidential payroll possible on-chain for the first time.

---

## Why Zalary Wins

| | Traditional (Deel / Gusto) | Transparent on-chain | **Zalary** |
|---|---|---|---|
| **Salary privacy** | ✅ private | ❌ fully public | ✅ FHE-encrypted |
| **Settlement speed** | 2 to 5 days | seconds | seconds |
| **Counterparty risk** | platform holds funds | none | none |
| **Trust model** | platform custody | public ledger | no custody, no trusted hardware |

On-chain speed. Traditional privacy. No TEE, no custodian, no KMS.

---

## Who It's For

Any team that pays people in crypto but cannot expose salaries publicly.

- **Crypto-native companies and DAOs** paying contributors in stablecoins
- **Web3 treasuries** distributing grants or contributor comp privately
- **Enterprises** that want on-chain settlement without transparency

---

## Security (Core Innovation)

Normal payroll systems assume transfers either succeed or revert. FHE breaks this assumption. Transfers can fail silently without reverting, returning `ebool(false)` instead of throwing.

This is by design (reverting would leak balance information), but it breaks naive escrow accounting.

We built **4 invariants** to guarantee correctness even when transfers fail silently. Every invariant is tested and passing.

1. **Fund invariant**, escrow only credits what actually arrived
2. **Claim invariant**, escrow only debits what actually moved
3. **Retry invariant**, failed claims can be cancelled and retried safely
4. **Activation invariant**, `fundedOnce` is an `ebool`, cannot activate an unfunded payroll

📖 Full invariant analysis with Solidity code → [docs/SECURITY.md](./docs/SECURITY.md)

---

## Try It (3 commands)

Run this locally to verify the full protocol in under 60 seconds:

```bash
npm install
npx hardhat test                                              # 42 passing
npx hardhat run --network base-sepolia scripts/confirm.ts     # verifies deploy
```

---

## Architecture

```
User ──► SwapRouter ──► ConfidentialToken (cUSDC)
              │                   │
              │           PayrollVault
              │                   │
         USDC Pool         Encrypted Escrow
```

Three contracts, clean separation. All financial data is `euint64` encrypted.

📖 Full architecture and protocol flows → [docs/ARCHITECTURE.md](./docs/ARCHITECTURE.md)

---

## Full Protocol Flow

### Employer
```
1. createPayroll(token, deadline, employeeCount)
2. uploadAllocations(payrollId, employees, encryptedSalaries[])
3. fundPayroll(payrollId, encryptedAmount)
4. activatePayroll(payrollId, fundedProof, sig)
5. After deadline: closePayroll + withdrawLeftovers
```

### Employee
```
1. requestClaim(payrollId)          → encrypted salary moves to employee
2. Decrypt okHandle off-chain
3. finalizeClaim (if ok) or cancelPendingClaim (if failed, for retry)
```

### USDC on/off ramp
```
1. deposit(usdcAmount)               → cUSDC minted
2. requestWithdraw(key, encAmount)   → cUSDC burned
3. finalizeWithdraw(key, proofs)     → USDC paid out
```

---

## Wave 1 → Wave 2

| | Wave 1 | Wave 2 (this submission) |
|---|---|---|
| **Stage** | Ideation | Working protocol |
| **Output** | Pitch and architecture | 3 deployed contracts, 42 tests, audit resolved |
| **Result** | ✅ $500 grant | ✅ Live on Base Sepolia |

---

## Documentation

All technical depth lives in `/docs`:

| Document | What's Inside |
|---|---|
| [ARCHITECTURE.md](./docs/ARCHITECTURE.md) | Three-contract design, full protocol flows, privacy model |
| [SECURITY.md](./docs/SECURITY.md) | The 4 escrow invariants with Solidity code |
| [AUDIT.md](./docs/AUDIT.md) | All 19 audit findings mapped to fixes |
| [TESTS.md](./docs/TESTS.md) | Every test name, invariant test scenarios |
| [API.md](./docs/API.md) | Complete function reference and roles |
| [SDK.md](./docs/SDK.md) | Client-side integration with `@cofhe/sdk` |
| [SETUP.md](./docs/SETUP.md) | Install, deploy, verify instructions |

---

## Roadmap

| Wave | Milestone | Status |
|---|---|---|
| **Wave 1** | Ideation | ✅ Complete ($500 grant) |
| **Wave 2** | Protocol: 3 contracts, 42 tests, audit | ✅ **This submission** |
| **Wave 3** | Frontend migration to `@cofhe/sdk` | 🔜 Next |
| **Wave 4** | Gas optimization, recurring schedules | Planned |
| **Wave 5** | Mainnet, institutional onboarding | Planned |

---

## Team

Zalary is built by a small team of onchain engineers with backgrounds in DeFi protocol engineering, confidential computing, and payroll infrastructure. We shipped Wave 1 (ideation) solo, earned the $500 grant, and delivered Wave 2 (full protocol with audit) within the deliverable window.

---

## License

MIT

---

## Why This Wins

**Zalary is the first working confidential payroll system on Fhenix.**

Not a simulation. Not a design. A fully deployed, cryptographically enforced payroll system with real escrow, real claims, and real privacy.