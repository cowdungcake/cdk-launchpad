require("@nomicfoundation/hardhat-toolbox");
require("dotenv").config();

const { PRIVATE_KEY, BSC_TESTNET_RPC_URL, BSC_MAINNET_RPC_URL } = process.env;

function getAccountsFromEnv() {
  const raw = (PRIVATE_KEY || "").trim();
  if (!raw) {
    return [];
  }

  const key = raw.startsWith("0x") ? raw.slice(2) : raw;
  const valid = /^[0-9a-fA-F]{64}$/.test(key);

  if (!valid) {
    console.warn("Warning: PRIVATE_KEY in .env is invalid. Expected 64 hex chars (with or without 0x).");
    return [];
  }

  return [`0x${key}`];
}

const accounts = getAccountsFromEnv();

module.exports = {
  solidity: {
    version: "0.8.20",
    settings: {
      optimizer: {
        enabled: true,
        runs: 200
      }
    }
  },
  networks: {
    bscTestnet: {
      url: BSC_TESTNET_RPC_URL || "https://data-seed-prebsc-1-s1.binance.org:8545",
      chainId: 97,
      accounts
    },
    bscMainnet: {
      url: BSC_MAINNET_RPC_URL || "https://bsc-dataseed.binance.org",
      chainId: 56,
      accounts
    }
  }
};
