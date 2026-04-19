# Setup and Development

> Full install, test, deploy, and verify instructions.

[← Back to README](../README.md)

---

## Prerequisites

- Node.js 18+
- npm or yarn

---

## Install

```bash
git clone https://github.com/Sparexonzy95/zalary-cofhe.git
cd zalary-cofhe
npm install
```

---

## Configure Environment

```bash
cp .env.example .env
```

Edit `.env` and add your values:

```
BASE_SEPOLIA_RPC_URL=https://sepolia.base.org
PRIVATE_KEY=your_private_key_here
```

**Never commit your `.env` file.** `.gitignore` already excludes it.

---

## Compile Contracts

```bash
npx hardhat compile
```

Uses Solidity 0.8.28 with `evmVersion: cancun`.

---

## Run Tests

```bash
npx hardhat test
```

All 42 tests pass. The CoFHE mock environment deploys automatically via `@cofhe/hardhat-plugin`. You do not need any testnet RPC to run the tests.

---

## Deploy to Base Sepolia

```bash
npx hardhat ignition deploy ignition/modules/ZalaryDeploy.ts --network base-sepolia
```

The Ignition module handles:

1. Deploy `ConfidentialToken`
2. Deploy `SwapRouter` (wired to USDC and cUSDC)
3. Deploy `PayrollVault`
4. Grant `MINTER_ROLE` and `BURNER_ROLE` to SwapRouter
5. Grant `VAULT_ROLE` to PayrollVault
6. Approve cUSDC in PayrollVault via `approveToken()`

---

## Verify Deployment

```bash
npx hardhat run --network base-sepolia scripts/confirm.ts
```

This script reads the deployed contracts and checks:

- ✅ SwapRouter holds `MINTER_ROLE` on ConfidentialToken
- ✅ SwapRouter holds `BURNER_ROLE` on ConfidentialToken
- ✅ PayrollVault holds `VAULT_ROLE` on ConfidentialToken
- ✅ cUSDC is approved in PayrollVault
- ✅ SwapRouter is wired to correct USDC and cUSDC addresses

If all checks pass, the deployment is configured correctly and ready to use.

---

## Deployed Contracts (Base Sepolia)

| Contract | Address |
|---|---|
| ConfidentialToken (cUSDC) | [`0xD1A0Ecf8f8430F37627b8B329acb3Bc027F136cF`](https://sepolia.basescan.org/address/0xD1A0Ecf8f8430F37627b8B329acb3Bc027F136cF) |
| PayrollVault | [`0xdDc2C6A6d9B28680e0ca92fED9DffAB173CD6EDa`](https://sepolia.basescan.org/address/0xdDc2C6A6d9B28680e0ca92fED9DffAB173CD6EDa) |
| SwapRouter | [`0x97f27875c279907f7d461Eb32375BF1d4c294613`](https://sepolia.basescan.org/address/0x97f27875c279907f7d461Eb32375BF1d4c294613) |

Chain ID: `84532`

---

## Project Structure

```
zalary-cofhe/
├── contracts/
│   ├── ConfidentialToken.sol     # Encrypted ERC20-like token (euint64 balances)
│   ├── PayrollVault.sol          # Payroll lifecycle, encrypted escrow, two-step claims
│   ├── SwapRouter.sol            # USDC to cUSDC gateway with keyed withdrawals
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
├── docs/                          # All technical documentation
│   ├── ARCHITECTURE.md
│   ├── SECURITY.md
│   ├── AUDIT.md
│   ├── TESTS.md
│   ├── API.md
│   ├── SDK.md
│   └── SETUP.md (this file)
├── hardhat.config.ts
├── package.json
└── .env.example
```

---

## Related Docs

- [ARCHITECTURE.md](./ARCHITECTURE.md), system design
- [API.md](./API.md), function reference
- [SDK.md](./SDK.md), client-side integration
