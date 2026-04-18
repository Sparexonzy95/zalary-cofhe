import { ethers } from "hardhat";

const ADDRESSES = {
  ConfidentialToken: "0x24902606cea8773ba88947B0FA8CD8c14367fD82",
  PayrollVault:      "0x247a454B99c2Fa901389414a3AEf09A36da77AB3",
  SwapRouter:        "0x600de9c607b3fdb6185b6De74cd9995eD2132Fc1",
};

async function main() {
  for (const [name, address] of Object.entries(ADDRESSES)) {
    const code = await ethers.provider.getCode(address);
    const deployed = code !== "0x";
    console.log(`${name}: ${address} → ${deployed ? "✅ DEPLOYED" : "❌ NOT FOUND"}`);
  }

  // Check roles
  const token = await ethers.getContractAt("ConfidentialToken", ADDRESSES.ConfidentialToken);

  const MINTER_ROLE = ethers.keccak256(ethers.toUtf8Bytes("MINTER_ROLE"));
  const BURNER_ROLE = ethers.keccak256(ethers.toUtf8Bytes("BURNER_ROLE"));
  const VAULT_ROLE  = ethers.keccak256(ethers.toUtf8Bytes("VAULT_ROLE"));

  const minter = await token.hasRole(MINTER_ROLE, ADDRESSES.SwapRouter);
  const burner = await token.hasRole(BURNER_ROLE, ADDRESSES.SwapRouter);
  const vault  = await token.hasRole(VAULT_ROLE,  ADDRESSES.PayrollVault);

  console.log(`\nRole checks:`);
  console.log(`SwapRouter  has MINTER_ROLE: ${minter ? "✅" : "❌"}`);
  console.log(`SwapRouter  has BURNER_ROLE: ${burner ? "✅" : "❌"}`);
  console.log(`PayrollVault has VAULT_ROLE: ${vault  ? "✅" : "❌"}`);
}

main().catch(console.error);