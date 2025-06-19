// stablecoin-api/index.js
const express = require("express");
const { ethers } = require("hardhat");
require("dotenv/config");
const { initContractPool, getContractFromPool } = require("./lib/contractPool");
const axios = require("axios");
const path = require('path');

const app = express();
app.use(express.json());
// 设置 public 文件夹为静态目录
app.use(express.static(path.join(__dirname, 'public')));

const PORT = process.env.PORT || 3000;

// 暴露 contractPool 初始化 promise，用于测试准备
let contractPool = [];
const ready = (async () => {
    contractPool = await initContractPool();
})();

// 所有接口定义如下
app.post("/mint", async (req, res) => {
    try {
        const { to, amount } = req.body;
        const stableCoin = getContractFromPool();
        const tx = await stableCoin.mint(to, ethers.parseUnits(amount, 18));
        await tx.wait();
        res.json({ success: true, txHash: tx.hash, message: "Minted" });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post("/burn", async (req, res) => {
    try {
        const { amount } = req.body;
        const stableCoin = getContractFromPool();
        const tx = await stableCoin.burn(ethers.parseUnits(amount, 18));
        await tx.wait();
        res.json({ success: true, txHash: tx.hash, message: "Burned" });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post("/transfer", async (req, res) => {
    try {
        const { to, amount } = req.body;
        const stableCoin = getContractFromPool();
        const tx = await stableCoin.transfer(to, ethers.parseUnits(amount, 18));
        await tx.wait();
        res.json({ success: true, txHash: tx.hash, message: "Transferred" });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post("/pause", async (_, res) => {
    try {
        const stableCoin = getContractFromPool();
        const tx = await stableCoin.pause();
        await tx.wait();
        res.json({ success: true, message: "Paused" });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post("/unpause", async (_, res) => {
    try {
        const stableCoin = getContractFromPool();
        const tx = await stableCoin.unpause();
        await tx.wait();
        res.json({ success: true, message: "Unpaused" });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post("/grant-minter", async (req, res) => {
    try {
        const { address } = req.body;
        const stableCoin = getContractFromPool();
        const MINTER_ROLE = ethers.keccak256(ethers.toUtf8Bytes("MINTER_ROLE"));
        const tx = await stableCoin.grantRole(MINTER_ROLE, address);
        await tx.wait();
        res.json({ success: true, message: "Granted MINTER_ROLE" });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post("/blacklist/add", async (req, res) => {
    try {
        const { address } = req.body;
        const stableCoin = getContractFromPool();
        const tx = await stableCoin.addToBlacklist(address);
        await tx.wait();
        res.json({ success: true, message: "Added to blacklist" });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post("/blacklist/remove", async (req, res) => {
    try {
        const { address } = req.body;
        const stableCoin = getContractFromPool();
        const tx = await stableCoin.removeFromBlacklist(address);
        await tx.wait();
        res.json({ success: true, message: "Removed from blacklist" });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// 启动服务（仅当直接运行时）
if (require.main === module) {
    ready.then(() => {
        app.listen(PORT, () => console.log(`✅ Server running on port ${PORT}`));
    });
}

// 获取交易信息和状态
app.get("/tx/:hash", async (req, res) => {
    try {
        const txHash = req.params.hash;

        // 获取 provider（如果你没有 global provider，可以用 contract.provider）
        const stableCoin = getContractFromPool();
        const provider = stableCoin.runner.provider;

        // 获取交易详情
        const tx = await provider.getTransaction(txHash);
        if (!tx) {
            return res.status(404).json({ error: "Transaction not found" });
        }

        // 获取交易收据（包含是否成功等信息）
        const receipt = await provider.getTransactionReceipt(txHash);

        res.json({
            hash: tx.hash,
            from: tx.from,
            to: tx.to,
            data: tx.data,
            status: receipt?.status === 1 ? "Success" : "Failed",
            blockNumber: receipt?.blockNumber,
            gasUsed: receipt?.gasUsed?.toString(),
            confirmations: receipt?.confirmations,
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

const { HttpsProxyAgent } = require('https-proxy-agent');
const proxy = "http://127.0.0.1:7890"; // 代理地址
const agent = new HttpsProxyAgent(proxy);
app.get("/contract-txs/:contractAddress", async (req, res) => {
    const contractAddress = req.params.contractAddress;
    const apiKey = process.env.ETHERSCAN_API_KEY;

    try {
        const response = await axios.get("https://api-sepolia.etherscan.io/api", {
            httpsAgent: agent, // 👈 加上代理
            params: {
                module: "account",
                action: "txlist",
                address: contractAddress,
                startblock: 0,
                endblock: 99999999,
                sort: "desc",
                apikey: apiKey,
            },
        });

        if (response.data.status === "1") {
            res.json({ transactions: response.data.result });
        } else {
            res.status(404).json({ error: response.data.message });
        }
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});


const provider = new ethers.JsonRpcProvider(process.env.SEPOLIA_RPC);
const abi = require("./artifacts/contracts/StableCoin.sol/StableCoin.json").abi;
const contractAddress = process.env.CONTRACT_ADDRESS;
const wallet = new ethers.Wallet(process.env.PRIVATE_KEY, provider);
const ethContract = new ethers.Contract(contractAddress, abi, wallet);

// 监听Burn事件,进行赎回或跨链转移
ethContract.on("Transfer", (from, to, value, event) => {
    if (from === ethers.ZeroAddress) {
        console.log("🔥 检测到 Burn（销毁）事件：", from, value.toString());
        // 此处你可以调用币安链的 mint 接口
    }
});


// 👇 为测试导出 app 和 ready promise
module.exports = { app, ready };
