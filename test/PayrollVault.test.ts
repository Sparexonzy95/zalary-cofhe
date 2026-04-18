import hre from "hardhat";
import { expect } from "chai";
import { CofheClient, Encryptable, FheTypes } from "@cofhe/sdk";
import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import { ConfidentialToken, PayrollVault } from "../typechain-types";
import { time } from "@nomicfoundation/hardhat-network-helpers";
import { ethers } from "hardhat";

describe("PayrollVault", () => {
  let token: ConfidentialToken;
  let vault: PayrollVault;
  let admin:    HardhatEthersSigner;
  let employer: HardhatEthersSigner;
  let alice:    HardhatEthersSigner;
  let bob:      HardhatEthersSigner;
  let employerClient: CofheClient;
  let aliceClient:    CofheClient;

  const ONE_WEEK = 86400 * 7;

  before(async () => {
    [admin, employer, alice, bob] = await hre.ethers.getSigners();
    employerClient = await hre.cofhe.createClientWithBatteries(employer);
    aliceClient    = await hre.cofhe.createClientWithBatteries(alice);
  });

  beforeEach(async () => {
    const TokenFactory = await hre.ethers.getContractFactory("ConfidentialToken");
    token = await TokenFactory.deploy("cUSDC", "cUSDC", 6, admin.address) as ConfidentialToken;

    const VaultFactory = await hre.ethers.getContractFactory("PayrollVault");
    vault = await VaultFactory.deploy(admin.address) as PayrollVault;

    const MINTER_ROLE = await token.MINTER_ROLE();
    const VAULT_ROLE  = await token.VAULT_ROLE();
    await token.connect(admin).grantRole(MINTER_ROLE, admin.address);
    await token.connect(admin).grantRole(VAULT_ROLE, vault.target);
    await vault.connect(admin).approveToken(token.target);

    // Refresh permits — block.timestamp advances across tests
    await employerClient.permits.createSelf({
      issuer: employer.address,
      name: "employer-permit",
      expiration: Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 365,
    });
    await aliceClient.permits.createSelf({
      issuer: alice.address,
      name: "alice-permit",
      expiration: Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 365,
    });

    await token.connect(admin).mintTo(employer.address, 10_000n);
  });

  // ── Helpers ───────────────────────────────────────────────────────

  // Activate with proof — employer decrypts fundedOnce and submits
  async function activateWithProof(payrollId: bigint) {
    const fundedHandle = await vault.connect(employer).getFundedOnceHandle(payrollId);
    const fundedResult = await employerClient
      .decryptForTx(fundedHandle)
      .withPermit()
      .execute();
    await vault.connect(employer).activatePayroll(
      payrollId,
      Boolean(fundedResult.decryptedValue),
      fundedResult.signature
    );
  }

  async function setupActivePayroll(
    salaries: bigint[],
    fundAmount: bigint
  ): Promise<{ payrollId: bigint; deadline: bigint }> {
    const employees = [alice.address, bob.address].slice(0, salaries.length);
    const deadline  = BigInt(await time.latest()) + BigInt(ONE_WEEK * 2);

    const tx      = await vault.connect(employer).createPayroll(token.target, deadline, salaries.length);
    const receipt = await tx.wait();
    const event   = receipt?.logs.find((l: any) => {
      try { return vault.interface.parseLog(l)?.name === "PayrollCreated"; } catch { return false; }
    });
    const payrollId = vault.interface.parseLog(event as any)?.args.payrollId as bigint;

    const encSalaries = await employerClient
      .encryptInputs(salaries.map(s => Encryptable.uint64(s)))
      .execute();
    await vault.connect(employer).uploadAllocations(payrollId, employees, encSalaries);
    await vault.connect(employer).finalizeAllocations(payrollId);

    const [encFund] = await employerClient
      .encryptInputs([Encryptable.uint64(fundAmount)])
      .execute();
    await vault.connect(employer).fundPayroll(payrollId, encFund);

    await activateWithProof(payrollId);

    return { payrollId, deadline };
  }

  async function claimFull(payrollId: bigint, employee: HardhatEthersSigner, client: CofheClient) {
    const tx      = await vault.connect(employee).requestClaim(payrollId);
    const receipt = await tx.wait();
    const event   = receipt?.logs.find((l: any) => {
      try { return vault.interface.parseLog(l)?.name === "ClaimRequested"; } catch { return false; }
    });
    const parsed    = vault.interface.parseLog(event as any);
    const requestId = parsed?.args.requestId as string;

    // okHandle now read from view helper — not emitted in event
    const okHandle = await vault.connect(employee).getMyPendingOkHandle(payrollId);

    const okResult = await client.decryptForTx(okHandle).withPermit().execute();
    await vault.connect(employee).finalizeClaim(
      payrollId, requestId,
      Boolean(okResult.decryptedValue),
      okResult.signature
    );
  }

  // ── Token whitelist ───────────────────────────────────────────────

  it("createPayroll: reverts with unapproved token", async () => {
    const deadline = BigInt(await time.latest()) + BigInt(ONE_WEEK * 2);
    await expect(vault.connect(employer).createPayroll(employer.address, deadline, 2))
      .to.be.revertedWithCustomError(vault, "TokenNotApproved");
  });

  // ── Create ────────────────────────────────────────────────────────

  it("createPayroll: stores payroll correctly", async () => {
    const deadline = BigInt(await time.latest()) + BigInt(ONE_WEEK * 2);
    const tx      = await vault.connect(employer).createPayroll(token.target, deadline, 2);
    const receipt = await tx.wait();
    const event   = receipt?.logs.find((l: any) => {
      try { return vault.interface.parseLog(l)?.name === "PayrollCreated"; } catch { return false; }
    });
    const id = vault.interface.parseLog(event as any)?.args.payrollId;
    const p  = await vault.payrolls(id);
    expect(p.employer).to.equal(employer.address);
    expect(p.employeeCount).to.equal(2);
    expect(p.status).to.equal(1);
  });

  it("createPayroll: reverts with zero employees", async () => {
    const deadline = BigInt(await time.latest()) + BigInt(ONE_WEEK * 2);
    await expect(vault.connect(employer).createPayroll(token.target, deadline, 0))
      .to.be.revertedWithCustomError(vault, "InvalidCount");
  });

  it("createPayroll: reverts with deadline too soon", async () => {
    const tooSoon = BigInt(await time.latest()) + 100n;
    await expect(vault.connect(employer).createPayroll(token.target, tooSoon, 1))
      .to.be.revertedWithCustomError(vault, "InvalidDeadline");
  });

  // ── Upload ────────────────────────────────────────────────────────

  it("uploadAllocations: stores encrypted salaries via getMyAllocation", async () => {
    const deadline = BigInt(await time.latest()) + BigInt(ONE_WEEK * 2);
    await vault.connect(employer).createPayroll(token.target, deadline, 2);
    const payrollId = 1n;
    const encrypted = await employerClient
      .encryptInputs([Encryptable.uint64(500n), Encryptable.uint64(800n)])
      .execute();
    await vault.connect(employer).uploadAllocations(payrollId, [alice.address, bob.address], encrypted);
    expect(await vault.hasAllocation(payrollId, alice.address)).to.be.true;

    // Read salary via view helper — allocation is now private
    const aliceCtHash = await vault.connect(alice).getMyAllocation(payrollId);
    await hre.cofhe.mocks.expectPlaintext(aliceCtHash, 500n);
  });

  it("uploadAllocations: reverts on duplicate employee", async () => {
    const deadline = BigInt(await time.latest()) + BigInt(ONE_WEEK * 2);
    await vault.connect(employer).createPayroll(token.target, deadline, 2);
    const payrollId = 1n;
    const [enc] = await employerClient.encryptInputs([Encryptable.uint64(500n)]).execute();
    await vault.connect(employer).uploadAllocations(payrollId, [alice.address], [enc]);
    const [enc2] = await employerClient.encryptInputs([Encryptable.uint64(600n)]).execute();
    await expect(vault.connect(employer).uploadAllocations(payrollId, [alice.address], [enc2]))
      .to.be.revertedWithCustomError(vault, "DuplicateEmployee");
  });

  // ── Activation guard ──────────────────────────────────────────────

  it("activatePayroll: reverts when funding silently failed (fundedOnce == false)", async () => {
    const deadline = BigInt(await time.latest()) + BigInt(ONE_WEEK * 2);
    await vault.connect(employer).createPayroll(token.target, deadline, 1);
    const payrollId = 1n;
    const [enc] = await employerClient.encryptInputs([Encryptable.uint64(100n)]).execute();
    await vault.connect(employer).uploadAllocations(payrollId, [alice.address], [enc]);
    await vault.connect(employer).finalizeAllocations(payrollId);

    // Fund with amount greater than balance — silent failure
    const [encBad] = await employerClient.encryptInputs([Encryptable.uint64(50_000n)]).execute();
    await vault.connect(employer).fundPayroll(payrollId, encBad);

    // fundedOnce should be false — try to activate
    const fundedHandle = await vault.connect(employer).getFundedOnceHandle(payrollId);
    const fundedResult = await employerClient.decryptForTx(fundedHandle).withPermit().execute();

    // fundedOnce should be false
    expect(Boolean(fundedResult.decryptedValue)).to.be.false;

    await expect(
      vault.connect(employer).activatePayroll(
        payrollId,
        Boolean(fundedResult.decryptedValue),
        fundedResult.signature
      )
    ).to.be.revertedWithCustomError(vault, "NotFunded");
  });

  // ── Full flow ─────────────────────────────────────────────────────

  it("full flow: create → upload → finalize → fund → activate", async () => {
    const { payrollId } = await setupActivePayroll([500n, 800n], 2000n);
    const p = await vault.payrolls(payrollId);
    expect(p.status).to.equal(3); // Active

    // Escrow via view helper — escrow is now private
    const escrowHandle = await vault.connect(employer).getEscrowHandle(payrollId);
    await hre.cofhe.mocks.expectPlaintext(escrowHandle, 2000n);
  });

  // ── Claim ─────────────────────────────────────────────────────────

  it("requestClaim: transfers salary, okHandle read from view helper not event", async () => {
    const { payrollId } = await setupActivePayroll([500n, 800n], 2000n);

    const tx      = await vault.connect(alice).requestClaim(payrollId);
    const receipt = await tx.wait();
    const event   = receipt?.logs.find((l: any) => {
      try { return vault.interface.parseLog(l)?.name === "ClaimRequested"; } catch { return false; }
    });
    const parsed = vault.interface.parseLog(event as any);

    // Event has payrollId, employee, requestId — NO okHandle
    expect(parsed?.args.payrollId).to.not.be.undefined;
    expect(parsed?.args.requestId).to.not.be.undefined;
    expect(parsed?.args.okHandle).to.be.undefined;

    // okHandle read from view helper
    const okHandle = await vault.connect(alice).getMyPendingOkHandle(payrollId);
    expect(okHandle).to.not.equal(ethers.ZeroHash);

    // Alice received salary
    const aliceAfter = await token.balanceOf(alice.address);
    await hre.cofhe.mocks.expectPlaintext(aliceAfter, 500n);

    // Escrow reduced
    const escrowHandle = await vault.connect(employer).getEscrowHandle(payrollId);
    await hre.cofhe.mocks.expectPlaintext(escrowHandle, 1500n);
  });

  it("finalizeClaim: marks claimed after valid proof", async () => {
    const { payrollId } = await setupActivePayroll([500n], 2000n);
    const tx      = await vault.connect(alice).requestClaim(payrollId);
    const receipt = await tx.wait();
    const event   = receipt?.logs.find((l: any) => {
      try { return vault.interface.parseLog(l)?.name === "ClaimRequested"; } catch { return false; }
    });
    const requestId = vault.interface.parseLog(event as any)?.args.requestId as string;
    const okHandle  = await vault.connect(alice).getMyPendingOkHandle(payrollId);

    const okResult = await aliceClient.decryptForTx(okHandle).withPermit().execute();
    await vault.connect(alice).finalizeClaim(
      payrollId, requestId,
      Boolean(okResult.decryptedValue),
      okResult.signature
    );
    expect(await vault.claimed(payrollId, alice.address)).to.be.true;
  });

  it("requestClaim: reverts if already claimed", async () => {
    const { payrollId } = await setupActivePayroll([500n], 2000n);
    await claimFull(payrollId, alice, aliceClient);
    await expect(vault.connect(alice).requestClaim(payrollId))
      .to.be.revertedWithCustomError(vault, "AlreadyClaimed");
  });

  it("requestClaim: reverts if no allocation", async () => {
    const { payrollId } = await setupActivePayroll([500n], 2000n);
    await expect(vault.connect(bob).requestClaim(payrollId))
      .to.be.revertedWithCustomError(vault, "AllocationMissing");
  });

  // ── Escrow invariant tests ────────────────────────────────────────

  it("[INVARIANT] fundPayroll: escrow does NOT increase when employer has insufficient balance", async () => {
    const deadline = BigInt(await time.latest()) + BigInt(ONE_WEEK * 2);
    await vault.connect(employer).createPayroll(token.target, deadline, 1);
    const payrollId = 1n;
    const [enc] = await employerClient.encryptInputs([Encryptable.uint64(500n)]).execute();
    await vault.connect(employer).uploadAllocations(payrollId, [alice.address], [enc]);
    await vault.connect(employer).finalizeAllocations(payrollId);

    // Fund with 50_000 — employer only has 10_000, silent failure
    const [encBad] = await employerClient.encryptInputs([Encryptable.uint64(50_000n)]).execute();
    await vault.connect(employer).fundPayroll(payrollId, encBad);

    // Escrow should still be 0
    const escrowHandle = await vault.connect(employer).getEscrowHandle(payrollId);
    await hre.cofhe.mocks.expectPlaintext(escrowHandle, 0n);

    // fundedOnce should be false — cannot activate
    const fundedHandle = await vault.connect(employer).getFundedOnceHandle(payrollId);
    const fundedPlaintext = await hre.cofhe.mocks.getPlaintext(fundedHandle);
    expect(fundedPlaintext).to.equal(0n);
  });

  it("[INVARIANT] requestClaim: escrow does NOT decrease when vault token balance insufficient", async () => {
    const { payrollId } = await setupActivePayroll([500n, 500n], 500n);

    // Alice claims successfully — escrow goes 0
    await claimFull(payrollId, alice, aliceClient);
    const escrowAfterAlice = await vault.connect(employer).getEscrowHandle(payrollId);
    await hre.cofhe.mocks.expectPlaintext(escrowAfterAlice, 0n);

    // Bob claims — escrow is 0, salary is 500, ok should be false
    const bobClient = await hre.cofhe.createClientWithBatteries(bob);
    const txBob     = await vault.connect(bob).requestClaim(payrollId);
    const receiptBob = await txBob.wait();
    const okHandleBob = await vault.connect(bob).getMyPendingOkHandle(payrollId);

    const okPlaintext = await hre.cofhe.mocks.getPlaintext(okHandleBob);
    expect(okPlaintext).to.equal(0n); // false — no funds

    // Escrow still 0
    const escrowAfterBob = await vault.connect(employer).getEscrowHandle(payrollId);
    await hre.cofhe.mocks.expectPlaintext(escrowAfterBob, 0n);

    // Bob token balance unchanged
    const bobBal = await token.balanceOf(bob.address);
    await hre.cofhe.mocks.expectPlaintext(bobBal, 0n);
  });

  it("[INVARIANT] failed claim → employer tops up → retry succeeds", async () => {
    const { payrollId } = await setupActivePayroll([500n], 100n);

    // First claim fails — escrow 100 < salary 500
    const tx1      = await vault.connect(alice).requestClaim(payrollId);
    const receipt1 = await tx1.wait();
    const requestId1 = vault.interface.parseLog(
      receipt1?.logs.find((l: any) => {
        try { return vault.interface.parseLog(l)?.name === "ClaimRequested"; } catch { return false; }
      }) as any
    )?.args.requestId as string;

    const okHandle1 = await vault.connect(alice).getMyPendingOkHandle(payrollId);
    const okResult1 = await aliceClient.decryptForTx(okHandle1).withPermit().execute();
    expect(Boolean(okResult1.decryptedValue)).to.be.false;

    // Escrow unchanged — still 100
    const escrowAfterFail = await vault.connect(employer).getEscrowHandle(payrollId);
    await hre.cofhe.mocks.expectPlaintext(escrowAfterFail, 100n);

    // Cancel pending claim
    await vault.connect(alice).cancelPendingClaim(
      payrollId, requestId1,
      Boolean(okResult1.decryptedValue),
      okResult1.signature
    );

    // Employer tops up — add 900 more
    const [encTopUp] = await employerClient.encryptInputs([Encryptable.uint64(900n)]).execute();
    await vault.connect(employer).fundPayroll(payrollId, encTopUp);

    const escrowAfterTopUp = await vault.connect(employer).getEscrowHandle(payrollId);
    await hre.cofhe.mocks.expectPlaintext(escrowAfterTopUp, 1000n);

    // Alice retries — succeeds
    const tx2      = await vault.connect(alice).requestClaim(payrollId);
    const receipt2 = await tx2.wait();
    const requestId2 = vault.interface.parseLog(
      receipt2?.logs.find((l: any) => {
        try { return vault.interface.parseLog(l)?.name === "ClaimRequested"; } catch { return false; }
      }) as any
    )?.args.requestId as string;

    const okHandle2 = await vault.connect(alice).getMyPendingOkHandle(payrollId);
    const okResult2 = await aliceClient.decryptForTx(okHandle2).withPermit().execute();
    expect(Boolean(okResult2.decryptedValue)).to.be.true;

    await vault.connect(alice).finalizeClaim(
      payrollId, requestId2,
      Boolean(okResult2.decryptedValue),
      okResult2.signature
    );

    expect(await vault.claimed(payrollId, alice.address)).to.be.true;
    const aliceBal = await token.balanceOf(alice.address);
    await hre.cofhe.mocks.expectPlaintext(aliceBal, 500n);
  });

  it("[INVARIANT] leftover withdrawal after failed funding attempt", async () => {
    const deadline = BigInt(await time.latest()) + BigInt(ONE_WEEK * 2);
    await vault.connect(employer).createPayroll(token.target, deadline, 1);
    const payrollId = 1n;
    const [enc] = await employerClient.encryptInputs([Encryptable.uint64(100n)]).execute();
    await vault.connect(employer).uploadAllocations(payrollId, [alice.address], [enc]);
    await vault.connect(employer).finalizeAllocations(payrollId);

    // Failed fund — 50_000 > balance
    const [encBad] = await employerClient.encryptInputs([Encryptable.uint64(50_000n)]).execute();
    await vault.connect(employer).fundPayroll(payrollId, encBad);

    // Escrow still 0
    const escrowAfterBad = await vault.connect(employer).getEscrowHandle(payrollId);
    await hre.cofhe.mocks.expectPlaintext(escrowAfterBad, 0n);

    // Correct fund — 500
    const [encGood] = await employerClient.encryptInputs([Encryptable.uint64(500n)]).execute();
    await vault.connect(employer).fundPayroll(payrollId, encGood);

    const escrowAfterGood = await vault.connect(employer).getEscrowHandle(payrollId);
    await hre.cofhe.mocks.expectPlaintext(escrowAfterGood, 500n);

    await activateWithProof(payrollId);
    await time.increaseTo(Number(deadline) + 1);
    await vault.connect(employer).closePayroll(payrollId);
    await vault.connect(employer).withdrawLeftovers(payrollId, employer.address);

    // Employer gets back exactly 500
    const employerBal = await token.balanceOf(employer.address);
    await hre.cofhe.mocks.expectPlaintext(employerBal, 10_000n);
  });

  // ── cancelPendingClaim ────────────────────────────────────────────

  it("cancelPendingClaim: clears state for retry", async () => {
    const { payrollId } = await setupActivePayroll([500n], 100n);

    const tx      = await vault.connect(alice).requestClaim(payrollId);
    const receipt = await tx.wait();
    const requestId = vault.interface.parseLog(
      receipt?.logs.find((l: any) => {
        try { return vault.interface.parseLog(l)?.name === "ClaimRequested"; } catch { return false; }
      }) as any
    )?.args.requestId as string;

    const okHandle = await vault.connect(alice).getMyPendingOkHandle(payrollId);
    const okResult = await aliceClient.decryptForTx(okHandle).withPermit().execute();
    expect(Boolean(okResult.decryptedValue)).to.be.false;

    await vault.connect(alice).cancelPendingClaim(
      payrollId, requestId,
      Boolean(okResult.decryptedValue),
      okResult.signature
    );

    const pendingRid = await vault.connect(alice).getMyPendingRequestId(payrollId);
    expect(pendingRid).to.equal(ethers.ZeroHash);
  });

  // ── Close + Withdraw ──────────────────────────────────────────────

  it("closePayroll + withdrawLeftovers: employer recovers remaining escrow", async () => {
    const { payrollId, deadline } = await setupActivePayroll([500n], 2000n);
    await claimFull(payrollId, alice, aliceClient);
    await time.increaseTo(Number(deadline) + 1);
    await vault.connect(employer).closePayroll(payrollId);
    await vault.connect(employer).withdrawLeftovers(payrollId, employer.address);
    const employerBal = await token.balanceOf(employer.address);
    await hre.cofhe.mocks.expectPlaintext(employerBal, 9500n);
  });

  // ── Cancel ────────────────────────────────────────────────────────

  it("cancelPayroll: works before activation", async () => {
    const deadline = BigInt(await time.latest()) + BigInt(ONE_WEEK * 2);
    await vault.connect(employer).createPayroll(token.target, deadline, 1);
    await vault.connect(employer).cancelPayroll(1n);
    const p = await vault.payrolls(1n);
    expect(p.status).to.equal(5);
  });

  it("cancelPayroll: reverts after activation", async () => {
    const { payrollId } = await setupActivePayroll([500n], 2000n);
    await expect(vault.connect(employer).cancelPayroll(payrollId))
      .to.be.revertedWithCustomError(vault, "BadStatus");
  });
});