import hre from "hardhat";
import { expect } from "chai";
import { CofheClient, Encryptable } from "@cofhe/sdk";
import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import { ConfidentialToken, SwapRouter } from "../typechain-types";
import { ethers } from "hardhat";

describe("SwapRouter", () => {
  let token: ConfidentialToken;
  let router: SwapRouter;
  let usdc: any;
  let admin: HardhatEthersSigner;
  let alice: HardhatEthersSigner;
  let aliceClient: CofheClient;

  before(async () => {
    [admin, alice] = await hre.ethers.getSigners();
    aliceClient = await hre.cofhe.createClientWithBatteries(alice);
  });

  beforeEach(async () => {
    const MockERC20 = await hre.ethers.getContractFactory("MockERC20");
    usdc = await MockERC20.deploy("USD Coin", "USDC", 6);

    const TokenFactory = await hre.ethers.getContractFactory("ConfidentialToken");
    token = await TokenFactory.deploy("cUSDC", "cUSDC", 6, admin.address) as ConfidentialToken;

    const RouterFactory = await hre.ethers.getContractFactory("SwapRouter");
    router = await RouterFactory.deploy(admin.address, usdc.target, token.target) as SwapRouter;

    const MINTER_ROLE = await token.MINTER_ROLE();
    const BURNER_ROLE = await token.BURNER_ROLE();

    await token.connect(admin).grantRole(MINTER_ROLE, router.target);
    await token.connect(admin).grantRole(BURNER_ROLE, router.target);

    // preload router with enough USDC for payouts
    await usdc.mint(router.target, 100_000_000n);

    await aliceClient.permits.createSelf({
      issuer: alice.address,
      name: "test-permit",
      expiration: Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 365,
    });
  });

  // ── Helpers ──────────────────────────────────────────────────────

  function makeKey(label: string): string {
    return ethers.keccak256(ethers.toUtf8Bytes(label));
  }

  async function depositUsdc(amount: bigint) {
    await usdc.mint(alice.address, amount);
    await usdc.connect(alice).approve(router.target, amount);
    await router.connect(alice).deposit(amount);
  }

  async function requestAndGetProofs(withdrawKey: string, withdrawAmount: bigint) {
    const [encAmount] = await aliceClient
      .encryptInputs([Encryptable.uint64(withdrawAmount)])
      .execute();

    const reqTx = await router.connect(alice).requestWithdraw(withdrawKey as `0x${string}`, encAmount);
    const reqReceipt = await reqTx.wait();

    const reqEvent = reqReceipt?.logs.find((l: any) => {
      try {
        return router.interface.parseLog(l)?.name === "WithdrawRequested";
      } catch {
        return false;
      }
    });

    const parsed = router.interface.parseLog(reqEvent as any);
    const requestId = parsed?.args.requestId as string;

    const amtHandle = await router.connect(alice).getPendingAmountHandle(withdrawKey as `0x${string}`);
    const okHandle  = await router.connect(alice).getPendingOkHandle(withdrawKey as `0x${string}`);

    const amtResult = await aliceClient.decryptForTx(amtHandle).withPermit().execute();
    const okResult  = await aliceClient.decryptForTx(okHandle).withPermit().execute();

    return { requestId, amtResult, okResult };
  }

  // ── Deposit ──────────────────────────────────────────────────────

  it("deposit: mints cUSDC equal to USDC deposited", async () => {
    await depositUsdc(1000n);
    const ctHash = await token.balanceOf(alice.address);
    await hre.cofhe.mocks.expectPlaintext(ctHash, 1000n);
  });

  it("deposit: reverts on zero amount", async () => {
    await expect(router.connect(alice).deposit(0n))
      .to.be.revertedWithCustomError(router, "ZeroAmount");
  });

  it("deposit: emits Deposited event", async () => {
    await usdc.mint(alice.address, 500n);
    await usdc.connect(alice).approve(router.target, 500n);
    await expect(router.connect(alice).deposit(500n))
      .to.emit(router, "Deposited")
      .withArgs(alice.address, 500n);
  });

  // ── requestWithdraw ──────────────────────────────────────────────

  it("requestWithdraw: stores pending state by withdrawKey, not just by wallet", async () => {
    await depositUsdc(1000n);

    const key = makeKey("withdraw-key-1");
    const [encAmount] = await aliceClient.encryptInputs([Encryptable.uint64(300n)]).execute();

    const tx = await router.connect(alice).requestWithdraw(key as `0x${string}`, encAmount);
    const receipt = await tx.wait();

    const event = receipt?.logs.find((l: any) => {
      try {
        return router.interface.parseLog(l)?.name === "WithdrawRequested";
      } catch {
        return false;
      }
    });

    expect(event).to.not.be.undefined;
    const parsed = router.interface.parseLog(event as any);

    expect(parsed?.args.user).to.equal(alice.address);
    expect(parsed?.args.withdrawKey).to.equal(key);
    expect(parsed?.args.requestId).to.not.equal(ethers.ZeroHash);

    const amtH = await router.connect(alice).getPendingAmountHandle(key as `0x${string}`);
    const okH  = await router.connect(alice).getPendingOkHandle(key as `0x${string}`);

    expect(amtH).to.not.equal(ethers.ZeroHash);
    expect(okH).to.not.equal(ethers.ZeroHash);

    const cBal = await token.balanceOf(alice.address);
    await hre.cofhe.mocks.expectPlaintext(cBal, 700n);
  });

  it("requestWithdraw: same key cannot be requested twice while still pending", async () => {
    await depositUsdc(2000n);

    const key = makeKey("same-key");
    const [enc1] = await aliceClient.encryptInputs([Encryptable.uint64(300n)]).execute();
    await router.connect(alice).requestWithdraw(key as `0x${string}`, enc1);

    const [enc2] = await aliceClient.encryptInputs([Encryptable.uint64(200n)]).execute();
    await expect(
      router.connect(alice).requestWithdraw(key as `0x${string}`, enc2)
    ).to.be.revertedWithCustomError(router, "WithdrawAlreadyPendingForKey");
  });

  it("requestWithdraw: two different keys can coexist for the same wallet", async () => {
    await depositUsdc(2000n);

    const keyA = makeKey("key-A");
    const keyB = makeKey("key-B");

    const [encA] = await aliceClient.encryptInputs([Encryptable.uint64(300n)]).execute();
    const [encB] = await aliceClient.encryptInputs([Encryptable.uint64(200n)]).execute();

    await router.connect(alice).requestWithdraw(keyA as `0x${string}`, encA);
    await router.connect(alice).requestWithdraw(keyB as `0x${string}`, encB);

    const amtHA = await router.connect(alice).getPendingAmountHandle(keyA as `0x${string}`);
    const amtHB = await router.connect(alice).getPendingAmountHandle(keyB as `0x${string}`);

    expect(amtHA).to.not.equal(ethers.ZeroHash);
    expect(amtHB).to.not.equal(ethers.ZeroHash);
    expect(amtHA).to.not.equal(amtHB);

    const cBal = await token.balanceOf(alice.address);
    await hre.cofhe.mocks.expectPlaintext(cBal, 1500n);
  });

  // ── finalizeWithdraw ─────────────────────────────────────────────

  it("finalizeWithdraw: pays out USDC and clears only that withdrawKey", async () => {
    await depositUsdc(1_500_000n);

    const keyA = makeKey("finalize-A");
    const keyB = makeKey("finalize-B");

    await requestAndGetProofs(keyA, 1_000_000n);
    const { requestId, amtResult, okResult } = await requestAndGetProofs(keyB, 500_000n);

    const usdcBefore = await usdc.balanceOf(alice.address);

    const finalizeTx = await router.connect(alice).finalizeWithdraw(
      keyB as `0x${string}`,
      requestId,
      amtResult.decryptedValue as bigint,
      amtResult.signature,
      Boolean(okResult.decryptedValue),
      okResult.signature
    );
    const finalizeReceipt = await finalizeTx.wait();

    const usdcAfter = await usdc.balanceOf(alice.address);
    expect(usdcAfter - usdcBefore).to.equal(500_000n);

    const withdrawEvent = finalizeReceipt?.logs.find((l: any) => {
      try {
        return router.interface.parseLog(l)?.name === "Withdrawn";
      } catch {
        return false;
      }
    });

    const parsed = router.interface.parseLog(withdrawEvent as any);
    expect(parsed?.args.user).to.equal(alice.address);
    expect(parsed?.args.withdrawKey).to.equal(keyB);
    expect(parsed?.args.requestId).to.equal(requestId);

    // keyB cleared
    expect(await router.connect(alice).getPendingAmountHandle(keyB as `0x${string}`))
      .to.equal(ethers.ZeroHash);

    // keyA still exists
    expect(await router.connect(alice).getPendingAmountHandle(keyA as `0x${string}`))
      .to.not.equal(ethers.ZeroHash);
  });

  it("finalizeWithdraw: reverts if no pending request for that key", async () => {
    const key = makeKey("missing-key");

    await expect(
      router.connect(alice).finalizeWithdraw(
        key as `0x${string}`,
        ethers.ZeroHash,
        100n,
        "0x",
        true,
        "0x"
      )
    ).to.be.revertedWithCustomError(router, "WithdrawNotRequested");
  });

  it("finalizeWithdraw: reverts on wrong requestId", async () => {
    await depositUsdc(1_000_000n);

    const key = makeKey("wrong-request-id");
    const { amtResult, okResult } = await requestAndGetProofs(key, 1_000_000n);

    await expect(
      router.connect(alice).finalizeWithdraw(
        key as `0x${string}`,
        ethers.ZeroHash,
        amtResult.decryptedValue as bigint,
        amtResult.signature,
        Boolean(okResult.decryptedValue),
        okResult.signature
      )
    ).to.be.revertedWithCustomError(router, "InvalidDecryptProof");
  });

  it("finalizeWithdraw: reverts on zero amount", async () => {
    await depositUsdc(2_000_000n);

    const key = makeKey("zero-amount");
    const { requestId, amtResult, okResult } = await requestAndGetProofs(key, 0n);

    await expect(
      router.connect(alice).finalizeWithdraw(
        key as `0x${string}`,
        requestId,
        amtResult.decryptedValue as bigint,
        amtResult.signature,
        Boolean(okResult.decryptedValue),
        okResult.signature
      )
    ).to.be.revertedWithCustomError(router, "ZeroAmount");
  });

  // ── cancelPendingWithdraw ───────────────────────────────────────

  it("cancelPendingWithdraw: clears a bad/stuck pending withdraw for that key only", async () => {
    // Alice only has 100 cUSDC but requests 300
    await depositUsdc(100n);

    const key = makeKey("cancel-bad-pending");
    const { requestId, amtResult, okResult } = await requestAndGetProofs(key, 300n);

    expect(Boolean(okResult.decryptedValue)).to.equal(false);

    const cancelTx = await router.connect(alice).cancelPendingWithdraw(
      key as `0x${string}`,
      requestId,
      amtResult.decryptedValue as bigint,
      amtResult.signature,
      Boolean(okResult.decryptedValue),
      okResult.signature
    );

    await expect(cancelTx)
      .to.emit(router, "WithdrawCancelled")
      .withArgs(alice.address, key, requestId);

    expect(await router.connect(alice).getPendingAmountHandle(key as `0x${string}`))
      .to.equal(ethers.ZeroHash);
  });

  it("cancelPendingWithdraw: reverts if withdraw can be finalized", async () => {
    await depositUsdc(500n);

    const key = makeKey("cancel-should-fail");
    const { requestId, amtResult, okResult } = await requestAndGetProofs(key, 300n);

    expect(Boolean(okResult.decryptedValue)).to.equal(true);

    await expect(
      router.connect(alice).cancelPendingWithdraw(
        key as `0x${string}`,
        requestId,
        amtResult.decryptedValue as bigint,
        amtResult.signature,
        Boolean(okResult.decryptedValue),
        okResult.signature
      )
    ).to.be.revertedWithCustomError(router, "WithdrawCanBeFinalized");
  });

  it("cancelPendingWithdraw: after cancel, same key can be requested again", async () => {
    await depositUsdc(100n);

    const key = makeKey("retry-after-cancel");
    const first = await requestAndGetProofs(key, 300n);

    await router.connect(alice).cancelPendingWithdraw(
      key as `0x${string}`,
      first.requestId,
      first.amtResult.decryptedValue as bigint,
      first.amtResult.signature,
      Boolean(first.okResult.decryptedValue),
      first.okResult.signature
    );

    await usdc.mint(alice.address, 300n);
    await usdc.connect(alice).approve(router.target, 300n);
    await router.connect(alice).deposit(300n);

    const second = await requestAndGetProofs(key, 200n);
    expect(second.requestId).to.not.equal(ethers.ZeroHash);
    expect(await router.connect(alice).getPendingAmountHandle(key as `0x${string}`))
      .to.not.equal(ethers.ZeroHash);
  });
});