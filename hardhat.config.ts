import { HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-toolbox";
import "@cofhe/hardhat-plugin";
import * as dotenv from "dotenv";

dotenv.config();

const PRIVATE_KEY = process.env.PRIVATE_KEY ?? "0x" + "0".repeat(64);

const config: HardhatUserConfig = {
  solidity: {
    version: "0.8.28",
    settings: {
      evmVersion: "cancun",
      optimizer: {
        enabled: true,
        runs: 200,
      },
    },
  },

  networks: {
    hardhat: {
      chainId: 31337,
    },
    "eth-sepolia": {
      url: process.env.SEPOLIA_RPC_URL ?? "https://rpc.sepolia.org",
      accounts: [PRIVATE_KEY],
    },
    "arb-sepolia": {
      url: process.env.ARB_SEPOLIA_RPC_URL ?? "https://sepolia-rollup.arbitrum.io/rpc",
      accounts: [PRIVATE_KEY],
    },
    "base-sepolia": {
      url: process.env.BASE_SEPOLIA_RPC_URL ?? "https://sepolia.base.org",
      accounts: [PRIVATE_KEY],
    },
  },

  cofhe: {
    logMocks: true,
    gasWarning: false,
  },

  typechain: {
    outDir: "typechain-types",
    target: "ethers-v6",
  },

  paths: {
    sources:   "./contracts",
    tests:     "./test",
    cache:     "./cache",
    artifacts: "./artifacts",
  },

  mocha: {
    timeout: 120000,
    spec:    "test/**/*.test.ts",
  },
};

export default config;