# Zalary, Confidential On-Chain Payroll

> Payroll cannot exist on public blockchains today.
> Not because of scalability. Not because of UX.
> Because salaries are not supposed to be public.
>
> Zalary fixes this with Fhenix CoFHE.

Submitted for **Fhenix Buildathon, Wave 2**.

---

## TL;DR (60 seconds)

Zalary is a **fully working confidential payroll protocol** built on Fhenix CoFHE. Companies and DAOs can pay contributors on-chain without exposing any salary amount, ever.

- ✅ **3 contracts deployed** on Base Sepolia
- ✅ **42 passing tests** including 4 escrow invariant proofs
- ✅ **Security audit complete**: 19 findings, all resolved (8 Critical, 5 High, 3 Medium, 3 Low)
- ✅ **All financial data encrypted** (`euint64`, `ebool`) with zero trusted hardware
- ✅ **Full lifecycle working**: fund, claim, finalize, withdraw, retry

🎥 **Walkthrough video:** [youtu.be/U8S_2PYxBMw](https://youtu.be/U8S_2PYxBMw?feature=shared)

---

## Proof This Is Real

| | |
|---|---|
| **Deployed** | 3 contracts live on Base Sepolia, addresses below |
| **Tested** | 42 passing tests including 4 dedicated escrow invariant proofs |
| **Audited** | 19 findings resolved (8 Critical, 5 High, 3 Medium, 3 Low) |
| **Video** | Full test suite + deployment walkthrough on video |
| **Reproducible** | Judge can verify end-to-end in 3 terminal commands |

This is not a prototype. It is production-shape infrastructure.

---

## Judge Checklist (3-minute verification)

You can fully verify Zalary in under 3 minutes. No frontend required.

**1. Run the test suite**
- [ ] `npx hardhat test` → all **42 tests pass**
- [ ] Includes 4 escrow invariant proofs → see [docs/TESTS.md](./docs/TESTS.md)

**2. Verify the deployment**
- [ ] Contracts deployed on Base Sepolia (addresses below)
- [ ] `npx hardhat run --network base-sepolia scripts/confirm.ts` → roles configured correctly

**3. Validate the core guarantees**
- [ ] Escrow cannot break under silent FHE transfer failures → see [docs/SECURITY.md](./docs/SECURITY.md)
- [ ] Payroll cannot activate without real funding (`fundedOnce` is `ebool`)
- [ ] Failed claims can be safely cancelled and retried

**4. Review the audit**
- [ ] 19 findings identified → all fixed → see [docs/AUDIT.md](./docs/AUDIT.md)
- [ ] No salary data leaks via events, handles, or state

---

## Deployed Contracts (Base Sepolia)

| Contract | Address |
|---|---|
| ConfidentialToken (cUSDC) | [`0xD1A0Ecf8f8430F37627b8B329acb3Bc027F136cF`](https://sepolia.basescan.org/address/0xD1A0Ecf8f8430F37627b8B329acb3Bc027F136cF) |
| PayrollVault | [`0xdDc2C6A6d9B28680e0ca92fED9DffAB173CD6EDa`](https://sepolia.basescan.org/address/0xdDc2C6A6d9B28680e0ca92fED9DffAB173CD6EDa) |
| SwapRouter | [`0x97f27875c279907f7d461Eb32375BF1d4c294613`](https://sepolia.basescan.org/address/0x97f27875c279907f7d461Eb32375BF1d4c294613) |

**Chain ID:** `84532`

---

## Try It (3 commands)

```bash
# 1. Install
npm install

# 2. Run all 42 tests (CoFHE mocks deploy automatically)
npx hardhat test

# 3. Verify deployed contract configuration on Base Sepolia
npx hardhat run --network base-sepolia scripts/confirm.ts
```

That's it. The contracts are live. The tests are reproducible. The addresses resolve on BaseScan.

For deploying your own instance or integrating the SDK → [docs/SETUP.md](./docs/SETUP.md)

---

## What Zalary Does

**Employers** create a payroll run, upload encrypted salaries, fund an encrypted escrow, and activate. **Employees** claim their salary with one transaction and receive encrypted cUSDC, which they can swap back to USDC at any time.

At no point does any salary, escrow balance, or withdrawal amount appear on-chain in readable form. A third-party explorer sees "employee X claimed from payroll Y" and nothing else.

📖 Full architecture and protocol flow → [docs/ARCHITECTURE.md](./docs/ARCHITECTURE.md)

---

## The Problem

Every organization runs payroll. Weekly. Monthly. Forever. Enterprises, DAOs, and crypto-native companies all want on-chain settlement but cannot broadcast employee compensation publicly. Employment contracts forbid it. Analytics tools scrape it. Competitors exploit it.

So they settle through Deel, Rippling, Gusto, and banks, accepting delays, fees, and counterparty risk.

**Global payroll is a $200B+ market. On-chain penetration is effectively zero, not because the infrastructure is bad, but because the privacy is wrong.**

Zalary is the infrastructure that fixes the privacy so the market can open.

---

## What Makes Zalary Different

Most confidential token projects assume FHE transfers work like ERC20 transfers. **They don't.** FHE transfers never revert on insufficient balance. They silently move zero and return `ebool(false)`. This is intentional, because reverting would leak balance information through a side channel.

But it means naive accounting breaks immediately. An employer with zero balance can call `fundPayroll(100_000)`, the transfer silently fails, and escrow jumps by 100,000 phantom units. Employees then claim against funds that don't exist. Accounting is corrupted.

Zalary solves this with **four escrow invariants**, all enforced in the contract and all backed by dedicated tests:

1. **`fundPayroll`** only credits escrow for transfers that actually arrived
2. **`requestClaim`** only debits escrow for salaries that actually paid out (using `FHE.and(escrowOk, transferOk)`)
3. **`withdrawLeftovers`** only zeros escrow on confirmed transfer
4. **Activation guard**: `fundedOnce` is an `ebool` that only flips true when a real transfer succeeds. Activation requires a Threshold Network proof that it equals `true`, verified on-chain via `FHE.verifyDecryptResult`.

This is the difference between a demo and a protocol that can safely hold real payroll funds.

📖 Full invariant analysis with code → [docs/SECURITY.md](./docs/SECURITY.md)

---

## Wave 1 → Wave 2

| | Wave 1 (Ideation) | Wave 2 (This Submission) |
|---|---|---|
| **What existed** | Pitch and architecture sketch | 3 deployed contracts, 42 tests, audit resolved |
| **Status** | ✅ Idea validated ($500 grant) | ✅ Working on-chain protocol |

---

## Documentation

All technical depth lives in `/docs`:

| Document | What's Inside |
|---|---|
| [docs/ARCHITECTURE.md](./docs/ARCHITECTURE.md) | Three-contract design, full protocol flows (employer, employee, on/off ramp) |
| [docs/SECURITY.md](./docs/SECURITY.md) | The four escrow invariants explained with Solidity snippets |
| [docs/AUDIT.md](./docs/AUDIT.md) | All 19 audit findings with fix descriptions |
| [docs/TESTS.md](./docs/TESTS.md) | Every test name across all 3 suites + what the invariant tests prove |
| [docs/API.md](./docs/API.md) | Complete function reference for all three contracts + roles |
| [docs/SDK.md](./docs/SDK.md) | Client SDK integration (encryption, permits, decryption) |
| [docs/SETUP.md](./docs/SETUP.md) | Full setup, deploy, and verification instructions |

---

## Roadmap

| Wave | Milestone | Status |
|---|---|---|
| **Wave 1** | Ideation, market thesis, architecture sketch | ✅ Complete ($500 grant) |
| **Wave 2** | 3 contracts, 42 tests, Base Sepolia deploy, audit resolved | ✅ **This submission** |
| **Wave 3** | Frontend migration from `@inco/js` to `@cofhe/sdk` | 🔜 Next |
| **Wave 4** | Gas optimization, multi-employee concurrent claims, recurring schedules | Planned |
| **Wave 5** | Mainnet, institutional onboarding, compliance documentation | Planned |

---

## Team

Zalary is built by a small team of onchain engineers with backgrounds in DeFi protocol engineering, confidential computing, and payroll infrastructure. We shipped Wave 1 (ideation) solo, earned the $500 grant, and delivered Wave 2 (full protocol with audit) within the deliverable window.

---

## Why This Matters for Fhenix

Payroll is not a clever demo use case. It is the highest-frequency financial operation at every organization on earth. A working confidential payroll protocol on Fhenix is the clearest signal that CoFHE can carry real financial workloads at production scale.

Zalary is the first such protocol. Wave 2 ships it.

---

## License

MIT

---

## Final Note

Blockchains have solved trading. Lending. Payments.

They have not solved payroll.

Not because of scalability.
Because of privacy.

**Zalary is the first protocol that makes confidential payroll possible on-chain. Not as a concept. As working infrastructure.**
