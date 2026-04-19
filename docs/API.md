# Contract API Reference

> Every function. Access control. Description.

[← Back to README](../README.md)

---

## ConfidentialToken

Encrypted ERC20-like token. All balances are `euint64` handles.

| Function | Access | Description |
|---|---|---|
| `transfer(to, InEuint64)` | Any holder | Encrypted transfer with silent failure. Returns `ebool`. |
| `transferFromHandle(from, to, euint64)` | Owner or `VAULT_ROLE` | Handle-based transfer. Caller must `FHE.allowTransient` first. |
| `mintTo(to, amount)` | `MINTER_ROLE` | Mint from plaintext (SwapRouter deposit flow). |
| `burnFromHandle(from, euint64)` | `BURNER_ROLE` | Burn encrypted amount (SwapRouter withdrawal flow). |
| `balanceOf(address)` | Public | Returns `euint64` balance handle. Decrypt with permit. |

---

## PayrollVault

Payroll lifecycle and encrypted escrow.

| Function | Access | Description |
|---|---|---|
| `createPayroll(token, deadline, count)` | Any address | Create payroll. Deadline must be at least 1 day from now. |
| `uploadAllocations(id, employees[], amounts[])` | Employer | Upload encrypted salaries. Can call in chunks. |
| `finalizeAllocations(id)` | Employer | Lock allocations. Requires `uploadedCount == employeeCount`. |
| `fundPayroll(id, InEuint64)` | Employer | Fund escrow. Repeatable for top-ups. |
| `activatePayroll(id, fundedPlaintext, sig)` | Employer | Activate with Threshold Network proof of funding. |
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

---

## SwapRouter

USDC to cUSDC gateway with keyed concurrent withdrawals.

| Function | Access | Description |
|---|---|---|
| `deposit(amount)` | Any user | USDC in, cUSDC minted. |
| `requestWithdraw(key, InEuint64)` | Any holder | Burn cUSDC, store pending state by `withdrawKey`. |
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

All roles are configured during deployment via the Hardhat Ignition module at `ignition/modules/ZalaryDeploy.ts`.

---

## Technical Stack

| Component | Version |
|---|---|
| Solidity | 0.8.28 (EVM: Cancun) |
| @fhenixprotocol/cofhe-contracts | v0.1.3 |
| @cofhe/sdk | v0.4.0 |
| @cofhe/hardhat-plugin | v0.4.0 |
| OpenZeppelin | v5.x (AccessControl, ReentrancyGuard, SafeERC20) |
| Hardhat + Ignition | v2.x |
| TypeScript | v5.x |

---

## Related Docs

- [ARCHITECTURE.md](./ARCHITECTURE.md), how the contracts fit together
- [SDK.md](./SDK.md), client-side integration with `@cofhe/sdk`
