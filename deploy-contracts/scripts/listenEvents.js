// 目录结构：
// stablecoin-platform/
// ├── contracts/
// │   └── StableCoin.sol
// ├── scripts/
// │   ├── deploy.js
// │   └── listenEvents.js
// ├── server/
// │   ├── index.js
// │   └── services/
// │       ├── blockchain.js
// │       └── apiHandlers.js
// ├── .env
// ├── hardhat.config.js
// └── package.json

// scripts/listenEvents.js

const { ethers } = require("ethers");
const fs = require("fs");
const path = require("path");
require("dotenv").config();

const provider = new ethers.providers.JsonRpcProvider(process.env.SEPOLIA_RPC);
const wallet = new ethers.Wallet(process.env.PRIVATE_KEY, provider);

const abi = JSON.parse(fs.readFileSync(path.join(__dirname, "../artifacts/contracts/StableCoin.sol/StableCoin.json"))).abi;
const contract = new ethers.Contract(process.env.CONTRACT_ADDRESS, abi, wallet);

// 示例监听 Transfer
contract.on("Transfer", async (from, to, value, event) => {
    console.log(`📤 Transfer from ${from} to ${to} amount ${ethers.utils.formatUnits(value, 18)}`);
    // TODO: 如果 to 是赎回地址，调用法币打款服务
});

// 示例监听 CrossChainBurn（假设事件存在）
contract.on("CrossChainBurn", async (from, amount, destChain, event) => {
    console.log(`🔥 CrossChainBurn by ${from}, amount ${ethers.utils.formatUnits(amount, 18)}, to ${destChain}`);
    // TODO: 自动发起目标链 mint 流程
});

console.log("📡 Listening for events...");

// 提示：运行该脚本保持事件监听：
// node scripts/listenEvents.js

// TODO: 多签 Gnosis Safe SDK 集成将在后续接口中添加
