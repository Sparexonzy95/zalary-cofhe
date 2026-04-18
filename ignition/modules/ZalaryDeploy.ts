import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";
import { ethers } from "ethers";

const MINTER_ROLE = ethers.keccak256(ethers.toUtf8Bytes("MINTER_ROLE"));
const BURNER_ROLE = ethers.keccak256(ethers.toUtf8Bytes("BURNER_ROLE"));
const VAULT_ROLE  = ethers.keccak256(ethers.toUtf8Bytes("VAULT_ROLE"));

const BASE_SEPOLIA_USDC = "0x036CbD53842c5426634e7929541eC2318f3dCF7e";

const ZalaryDeploy = buildModule("ZalaryDeploy", (m) => {
  const deployer = m.getAccount(0);

  const usdcAddress   = m.getParameter("usdcAddress",   BASE_SEPOLIA_USDC);
  const tokenName     = m.getParameter("tokenName",     "Confidential USDC");
  const tokenSymbol   = m.getParameter("tokenSymbol",   "cUSDC");
  const tokenDecimals = m.getParameter("tokenDecimals", 6);

  // 1. ConfidentialToken
  const confidentialToken = m.contract("ConfidentialToken", [
    tokenName, tokenSymbol, tokenDecimals, deployer,
  ]);

  // 2. SwapRouter
  const swapRouter = m.contract("SwapRouter", [
    deployer, usdcAddress, confidentialToken,
  ]);

  // 3. PayrollVault
  const payrollVault = m.contract("PayrollVault", [deployer]);

  // 4. Grant roles on ConfidentialToken
  m.call(confidentialToken, "grantRole", [MINTER_ROLE, swapRouter], { id: "grantMinterToSwapRouter" });
  m.call(confidentialToken, "grantRole", [BURNER_ROLE, swapRouter], { id: "grantBurnerToSwapRouter" });
  m.call(confidentialToken, "grantRole", [VAULT_ROLE, payrollVault], { id: "grantVaultToPayrollVault" });

  // 5. Approve ConfidentialToken in PayrollVault whitelist (C-02)
  m.call(payrollVault, "approveToken", [confidentialToken], { id: "approveTokenInVault" });

  return { confidentialToken, swapRouter, payrollVault };
});

export default ZalaryDeploy;