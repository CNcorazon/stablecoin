require("@nomicfoundation/hardhat-toolbox");
require("dotenv").config();

const { PRIVATE_KEY, SEPOLIA_RPC, BSC_TESTNET_RPC } = process.env;

module.exports = {
  solidity: {
    version: "0.8.28",
    settings: {
      optimizer: {
        enabled: true,
        runs: 200,
      },
    },
  },
  networks: {
    localhost: {
      url: "http://127.0.0.1:8545"
    },

    sepolia: {
      url: SEPOLIA_RPC,
      accounts: [PRIVATE_KEY],
    },

    bscTestnet: {
      url: BSC_TESTNET_RPC,
      accounts: [PRIVATE_KEY],
      // chainId: 97,
      // gasPrice: 10000000000, // 10 gwei
      // gas: 8000000,
    },
  },
};
