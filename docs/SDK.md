# Client SDK Integration

> How to encrypt, decrypt, and interact with Zalary from JavaScript or TypeScript.

[← Back to README](../README.md)

Zalary uses `@cofhe/sdk` v0.4.0 for all client-side FHE operations: encryption with ZK proofs, EIP-712 permit management, and Threshold Network decryption.

---

## Setup

```typescript
import { createCofheConfig, createCofheClient } from '@cofhe/sdk/web';
import { Encryptable, FheTypes } from '@cofhe/sdk';
import { chains } from '@cofhe/sdk/chains';

const config = createCofheConfig({ supportedChains: [chains.baseSepolia] });
const client = createCofheClient(config);
await client.connect(publicClient, walletClient);
await client.permits.getOrCreateSelfPermit();
```

---

## Encrypt Values (Employer, for salary uploads)

```typescript
const encrypted = await client
  .encryptInputs([
    Encryptable.uint64(5000n),  // Alice's salary
    Encryptable.uint64(8000n),  // Bob's salary
  ])
  .execute();

// Pass encrypted[0], encrypted[1] to uploadAllocations or fundPayroll
await vault.uploadAllocations(payrollId, [alice, bob], encrypted);
```

---

## Decrypt for Display (read own balance or salary)

```typescript
const ctHash  = await confidentialToken.balanceOf(userAddress);
const balance = await client
  .decryptForView(ctHash, FheTypes.Uint64)
  .execute();

// balance: 5000n
```

This only reveals the plaintext to the client, never on-chain.

---

## Decrypt for On-Chain Proof (claims, activation, withdrawal)

When the contract needs to verify a decrypted value, use `decryptForTx`. This returns the plaintext and a Threshold Network signature that the contract verifies on-chain.

```typescript
// Employee reads their okHandle after requestClaim
const okHandle = await vault.getMyPendingOkHandle(payrollId);

const result = await client
  .decryptForTx(okHandle)
  .withPermit()
  .execute();

// result.decryptedValue: 1n (true) or 0n (false)
// result.signature:      Threshold Network ECDSA signature

if (Boolean(result.decryptedValue)) {
  // Claim succeeded, finalize
  await vault.finalizeClaim(
    payrollId,
    requestId,
    true,
    result.signature
  );
} else {
  // Escrow insufficient, cancel and retry after top-up
  await vault.cancelPendingClaim(
    payrollId,
    requestId,
    false,
    result.signature
  );
}
```

---

## Typical Integration Patterns

### Employer dashboard
- Read encrypted escrow via `getEscrowHandle(id)` + `decryptForView`
- Read `fundedOnce` via `getFundedOnceHandle(id)` + `decryptForTx` (for activation proof)
- Encrypt new salary allocations with `encryptInputs` before calling `uploadAllocations`
- Encrypt funding amounts with `encryptInputs` before calling `fundPayroll`

### Employee dashboard
- Read own salary via `getMyAllocation(id)` + `decryptForView`
- Read own cUSDC balance via `balanceOf(address)` + `decryptForView`
- After `requestClaim`, read `getMyPendingOkHandle(id)` + `decryptForTx` to get the proof for `finalizeClaim` or `cancelPendingClaim`

---

## Related Docs

- [API.md](./API.md), which functions expose which handles
- [ARCHITECTURE.md](./ARCHITECTURE.md), privacy model for each piece of data
