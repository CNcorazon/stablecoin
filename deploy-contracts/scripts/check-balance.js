const { ethers } = require("hardhat");
const fs = require('fs');
const path = require('path');

async function main() {
    console.log("💰 检查用户余额...");

    // 读取配置
    const configFile = path.join(__dirname, '../deployments/crosschain-config.json');
    if (!fs.existsSync(configFile)) {
        throw new Error("未找到跨链配置文件");
    }

    const config = JSON.parse(fs.readFileSync(configFile, 'utf8'));
    const network = await ethers.provider.getNetwork();

    let currentConfig;
    if (network.chainId === 11155111n) {
        currentConfig = config.sepolia;
        console.log("🔗 当前网络: Sepolia");
    } else if (network.chainId === 97n) {
        currentConfig = config.bscTestnet;
        console.log("🔗 当前网络: BSC Testnet");
    } else {
        throw new Error("不支持的网络");
    }

    const token = await ethers.getContractAt("XDStablecoin", currentConfig.contracts.token);

    // 检查多个地址的余额
    const [deployer, user1] = await ethers.getSigners();
    const addresses = [
        { name: "部署者", address: deployer.address },
        { name: "用户1", address: user1 ? user1.address : "0x340ED8A73959215C74dc0BF53959d9A80d8D4a46" }
    ];

    console.log("\n📊 余额查询结果:");
    for (const addr of addresses) {
        try {
            const balance = await token.balanceOf(addr.address);
            console.log(`${addr.name}: ${ethers.formatEther(balance)} XD (${addr.address})`);
        } catch (error) {
            console.log(`${addr.name}: 查询失败 (${addr.address})`);
        }
    }

    // 显示合约总供应量
    const totalSupply = await token.totalSupply();
    console.log(`\n📈 总供应量: ${ethers.formatEther(totalSupply)} XD`);
}

if (require.main === module) {
    main().catch((error) => {
        console.error(error);
        process.exitCode = 1;
    });
} 