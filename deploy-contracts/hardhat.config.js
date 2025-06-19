require("@nomicfoundation/hardhat-toolbox");
require("dotenv").config();

const { PRIVATE_KEY, SEPOLIA_RPC } = process.env;

module.exports = {
  solidity: "0.8.20",
  networks: {
    localhost: {},

    sepolia: {
      url: SEPOLIA_RPC,
      accounts: [PRIVATE_KEY],
    },
  },
};
