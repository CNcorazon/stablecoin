const { ethers } = require("hardhat");
const fs = require('fs');

async function checkBridgePermissions() {
    console.log("🔐 检查桥合约权限...");

    const config = JSON.parse(fs.readFileSync('./deployments/crosschain-config.json', 'utf8'));
    const network = await ethers.provider.getNetwork();

    let currentConfig;
    if (network.chainId === 11155111n) {
        currentConfig = config.sepolia;
        console.log("网络: Sepolia");
    } else if (network.chainId === 97n) {
        currentConfig = config.bscTestnet;
        console.log("网络: BSC Testnet");
    } else {
        throw new Error("不支持的网络");
    }

    const token = await ethers.getContractAt("XDStablecoin", currentConfig.contracts.token);
    const bridge = await ethers.getContractAt("XDStablecoinCCIPBridge", currentConfig.contracts.bridge);
    const accessManager = await ethers.getContractAt("XDAccessManager", currentConfig.contracts.accessManager);

    console.log("\n📊 合约地址:");
    console.log("- Token:", currentConfig.contracts.token);
    console.log("- Bridge:", currentConfig.contracts.bridge);
    console.log("- AccessManager:", currentConfig.contracts.accessManager);

    try {
        // 检查桥合约的 CCIP 路由器
        const router = await bridge.getRouter();
        console.log("\n🌐 CCIP 路由器:", router);

        // 检查允许的链和发送者
        const sepoliaSelector = "16015286601757825753";
        const bscSelector = "13264668187771770619";

        const allowedSourceSepolia = await bridge.allowlistedSourceChains(sepoliaSelector);
        const allowedSourceBSC = await bridge.allowlistedSourceChains(bscSelector);
        const allowedDestSepolia = await bridge.allowlistedDestinationChains(sepoliaSelector);
        const allowedDestBSC = await bridge.allowlistedDestinationChains(bscSelector);

        console.log("\n🔗 链允许状态:");
        console.log("- Sepolia 作为源链:", allowedSourceSepolia);
        console.log("- BSC 作为源链:", allowedSourceBSC);
        console.log("- Sepolia 作为目标链:", allowedDestSepolia);
        console.log("- BSC 作为目标链:", allowedDestBSC);

        // 检查发送者允许状态
        const otherBridgeAddress = network.chainId === 11155111n ?
            config.bscTestnet.contracts.bridge : config.sepolia.contracts.bridge;

        const allowedSender = await bridge.allowlistedSenders(otherBridgeAddress);
        console.log("\n📤 发送者允许状态:");
        console.log("- 对方桥合约地址:", otherBridgeAddress);
        console.log("- 是否允许:", allowedSender);

        // 检查权限管理器中的角色
        const ADMIN_ROLE = await accessManager.ADMIN_ROLE();
        console.log("\n👑 权限检查:");
        console.log("- ADMIN_ROLE:", ADMIN_ROLE.toString());

        // 检查桥合约是否有管理员权限
        try {
            const hasAdminRole = await accessManager.hasRole(ADMIN_ROLE, currentConfig.contracts.bridge);
            console.log("- 桥合约有管理员权限:", hasAdminRole);
        } catch (error) {
            console.log("- 桥合约权限检查失败:", error.message);
        }

        // 检查关键函数的权限设置
        const crosschainMintSelector = ethers.id("crosschainMint(address,uint256)").slice(0, 10);
        const crosschainBurnSelector = ethers.id("crosschainBurn(address,uint256)").slice(0, 10);

        try {
            const mintRole = await accessManager.getTargetFunctionRole(currentConfig.contracts.token, crosschainMintSelector);
            const burnRole = await accessManager.getTargetFunctionRole(currentConfig.contracts.token, crosschainBurnSelector);

            console.log("- crosschainMint 需要角色:", mintRole.toString());
            console.log("- crosschainBurn 需要角色:", burnRole.toString());
        } catch (error) {
            console.log("- 函数权限检查失败:", error.message);
        }

    } catch (error) {
        console.log("❌ 权限检查失败:", error.message);
    }
}

checkBridgePermissions().catch(console.error); 