import hre, { ethers } from "hardhat";
import { expect } from "chai";
import { CofheClient, Encryptable, FheTypes } from "@cofhe/sdk";
import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import { ConfidentialToken } from "../typechain-types";

describe("ConfidentialToken", () => {
  let token: ConfidentialToken;
  let admin: HardhatEthersSigner;
  let alice: HardhatEthersSigner;
  let bob:   HardhatEthersSigner;
  let aliceClient: CofheClient;

  before(async () => {
    [admin, alice, bob] = await hre.ethers.getSigners();
    aliceClient = await hre.cofhe.createClientWithBatteries(alice);
  });

  beforeEach(async () => {
    const Factory = await hre.ethers.getContractFactory("ConfidentialToken");
    token = await Factory.deploy("Confidential USDC", "cUSDC", 6, admin.address) as ConfidentialToken;
    const MINTER_ROLE = await token.MINTER_ROLE();
    const BURNER_ROLE = await token.BURNER_ROLE();
    await token.connect(admin).grantRole(MINTER_ROLE, admin.address);
    await token.connect(admin).grantRole(BURNER_ROLE, admin.address);
  });

  it("mintTo: increases encrypted balance", async () => {
    await hre.cofhe.mocks.withLogs("token.mintTo(alice, 1000)", async () => {
      await token.connect(admin).mintTo(alice.address, 1000n);
    });
    const ctHash = await token.balanceOf(alice.address);
    await hre.cofhe.mocks.expectPlaintext(ctHash, 1000n);
  });

  it("mintTo: reverts for zero amount", async () => {
    await expect(token.connect(admin).mintTo(alice.address, 0n))
      .to.be.revertedWithCustomError(token, "ZeroAmount");
  });

  it("mintTo: reverts without MINTER_ROLE", async () => {
    await expect(token.connect(alice).mintTo(alice.address, 100n)).to.be.reverted;
  });

  it("mintTo: reverts for zero address", async () => {
    await expect(token.connect(admin).mintTo(ethers.ZeroAddress, 100n))
      .to.be.revertedWithCustomError(token, "ZeroAddress");
  });

  it("transfer: moves encrypted balance from alice to bob", async () => {
    await token.connect(admin).mintTo(alice.address, 1000n);
    const [encryptedAmount] = await aliceClient
      .encryptInputs([Encryptable.uint64(400n)])
      .execute();
    await hre.cofhe.mocks.withLogs("token.transfer(bob, 400)", async () => {
      await token.connect(alice).transfer(bob.address, encryptedAmount);
    });
    const aliceBal = await token.balanceOf(alice.address);
    const bobBal   = await token.balanceOf(bob.address);
    await hre.cofhe.mocks.expectPlaintext(aliceBal, 600n);
    await hre.cofhe.mocks.expectPlaintext(bobBal, 400n);
  });

  it("transfer: silent fail when balance insufficient", async () => {
    await token.connect(admin).mintTo(alice.address, 100n);
    const [encryptedAmount] = await aliceClient
      .encryptInputs([Encryptable.uint64(500n)])
      .execute();
    await token.connect(alice).transfer(bob.address, encryptedAmount);
    const aliceBal = await token.balanceOf(alice.address);
    const bobBal   = await token.balanceOf(bob.address);
    await hre.cofhe.mocks.expectPlaintext(aliceBal, 100n);
    await hre.cofhe.mocks.expectPlaintext(bobBal, 0n);
  });

  it("transfer: reverts on self-transfer", async () => {
    await token.connect(admin).mintTo(alice.address, 100n);
    const [encryptedAmount] = await aliceClient
      .encryptInputs([Encryptable.uint64(50n)])
      .execute();
    await expect(token.connect(alice).transfer(alice.address, encryptedAmount))
      .to.be.revertedWithCustomError(token, "SelfTransfer");
  });

  // burnFromHandle is designed to be called by SwapRouter (BURNER_ROLE)
  // after it calls FHE.allowTransient(amount, address(cToken)).
  // In this unit test we simulate that by using transfer() to get a stored handle
  // that the token already has access to, then testing burn via the stored balance handle.
  // The real integration path is tested via SwapRouter tests.
  it("burnFromHandle: reduces balance when token has handle access", async () => {
    // Grant alice burner role
    const BURNER_ROLE = await token.BURNER_ROLE();
    await token.connect(admin).grantRole(BURNER_ROLE, admin.address);

    // Mint to alice — token gets allowThis on the balance handle
    await token.connect(admin).mintTo(alice.address, 1000n);

    // Get alice's balance handle — token already has access to it
    const aliceBalHandle = await token.balanceOf(alice.address);

    // Burn using the stored balance handle that token already has access to
    await hre.cofhe.mocks.withLogs("token.burnFromHandle(alice, balHandle)", async () => {
      await token.connect(admin).burnFromHandle(alice.address, aliceBalHandle);
    });

    // Balance should now be 0 (burned the full balance handle)
    const aliceBal = await token.balanceOf(alice.address);
    await hre.cofhe.mocks.expectPlaintext(aliceBal, 0n);
  });

  it("decryptForView: alice reads her own balance", async () => {
    await token.connect(admin).mintTo(alice.address, 750n);
    const ctHash  = await token.balanceOf(alice.address);
    const balance = await aliceClient
      .decryptForView(ctHash, FheTypes.Uint64)
      .execute();
    expect(balance).to.equal(750n);
  });
});