const { ethers } = require("hardhat");
const fs = require('fs');
const path = require('path');

// CCIP 链选择器
const CHAIN_SELECTORS = {
    sepolia: "16015286601757825753",
    bscTestnet: "13264668187771770619"
};

// 配置跨链设置的独立脚本
async function configureCrossChain() {
    console.log("🌉 开始配置跨链设置...");

    // 读取配置文件
    const configFile = path.join(__dirname, '../deployments/crosschain-config.json');
    if (!fs.existsSync(configFile)) {
        throw new Error("❌ 配置文件不存在，请先完成两个网络的部署");
    }

    const config = JSON.parse(fs.readFileSync(configFile, 'utf8'));

    // 检查两个网络是否都已部署
    if (!config.sepolia || !config.bscTestnet) {
        throw new Error("❌ 请确保在 Sepolia 和 BSC Testnet 都已部署合约");
    }

    const network = await ethers.provider.getNetwork();
    const [deployer] = await ethers.getSigners();

    let currentConfig, remoteConfig, networkName, remoteNetworkName;

    if (network.chainId === 11155111n) {
        currentConfig = config.sepolia;
        remoteConfig = config.bscTestnet;
        networkName = "sepolia";
        remoteNetworkName = "bscTestnet";
        console.log("📍 当前网络: Sepolia → 配置到 BSC Testnet");
    } else if (network.chainId === 97n) {
        currentConfig = config.bscTestnet;
        remoteConfig = config.sepolia;
        networkName = "bscTestnet";
        remoteNetworkName = "sepolia";
        console.log("📍 当前网络: BSC Testnet → 配置到 Sepolia");
    } else {
        throw new Error("❌ 请在 Sepolia 或 BSC Testnet 网络上运行此脚本");
    }

    console.log("\n📊 合约信息:");
    console.log("- 当前网络 Token:", currentConfig.contracts.token);
    console.log("- 当前网络 Bridge:", currentConfig.contracts.bridge);
    console.log("- 当前网络 AccessManager:", currentConfig.contracts.accessManager);
    console.log("- 远程网络 Bridge:", remoteConfig.contracts.bridge);
    console.log("- 部署者:", deployer.address);

    try {
        // 连接合约
        const token = await ethers.getContractAt("XDStablecoin", currentConfig.contracts.token);
        const bridge = await ethers.getContractAt("XDStablecoinCCIPBridge", currentConfig.contracts.bridge);
        const accessManager = await ethers.getContractAt("XDAccessManager", currentConfig.contracts.accessManager);

        // 获取链选择器
        const remoteChainSelector = networkName === "sepolia" ?
            CHAIN_SELECTORS.bscTestnet : CHAIN_SELECTORS.sepolia;

        console.log(`\n🔗 目标链选择器: ${remoteChainSelector}`);

        // 检查当前权限状态
        console.log("\n🔍 检查当前权限状态...");

        const ADMIN_ROLE = await accessManager.ADMIN_ROLE();
        const bridgeHasAdminRole = await accessManager.hasRole(ADMIN_ROLE, currentConfig.contracts.bridge);

        console.log("权限状态:");
        console.log(`- ADMIN_ROLE: ${ADMIN_ROLE}`);
        console.log(`- 桥合约有管理员权限: ${bridgeHasAdminRole}`);

        // 如果桥合约没有管理员权限，先授予权限
        if (!bridgeHasAdminRole) {
            console.log("\n🔐 授予桥合约管理员权限...");
            try {
                const grantTx = await accessManager.grantRole(ADMIN_ROLE, currentConfig.contracts.bridge, 0);
                await grantTx.wait();
                console.log("✅ 桥合约管理员权限授予完成");
            } catch (error) {
                console.log("❌ 桥合约权限授予失败:", error.message);
                throw error;
            }
        }

        // 检查和设置跨链函数权限
        console.log("\n🔧 检查跨链函数权限...");

        const crosschainMintSelector = ethers.id("crosschainMint(address,uint256)").slice(0, 10);
        const crosschainBurnSelector = ethers.id("crosschainBurn(address,uint256)").slice(0, 10);

        try {
            const mintRole = await accessManager.getTargetFunctionRole(currentConfig.contracts.token, crosschainMintSelector);
            const burnRole = await accessManager.getTargetFunctionRole(currentConfig.contracts.token, crosschainBurnSelector);

            console.log(`- crosschainMint 需要角色: ${mintRole}`);
            console.log(`- crosschainBurn 需要角色: ${burnRole}`);

            // 检查权限是否正确设置
            if (mintRole.toString() !== ADMIN_ROLE.toString()) {
                console.log("设置 crosschainMint 权限...");
                const mintTx = await accessManager.setTargetFunctionRole(
                    currentConfig.contracts.token,
                    [crosschainMintSelector],
                    ADMIN_ROLE
                );
                await mintTx.wait();
                console.log("✅ crosschainMint 权限设置完成");
            }

            if (burnRole.toString() !== ADMIN_ROLE.toString()) {
                console.log("设置 crosschainBurn 权限...");
                const burnTx = await accessManager.setTargetFunctionRole(
                    currentConfig.contracts.token,
                    [crosschainBurnSelector],
                    ADMIN_ROLE
                );
                await burnTx.wait();
                console.log("✅ crosschainBurn 权限设置完成");
            }

        } catch (error) {
            console.log("⚠️ 跨链函数权限未设置，正在配置...");

            // 设置 crosschainMint 权限
            try {
                const mintTx = await accessManager.setTargetFunctionRole(
                    currentConfig.contracts.token,
                    [crosschainMintSelector],
                    ADMIN_ROLE
                );
                await mintTx.wait();
                console.log("✅ crosschainMint 权限设置完成");
            } catch (mintError) {
                console.log("❌ crosschainMint 权限设置失败:", mintError.message);
            }

            // 设置 crosschainBurn 权限
            try {
                const burnTx = await accessManager.setTargetFunctionRole(
                    currentConfig.contracts.token,
                    [crosschainBurnSelector],
                    ADMIN_ROLE
                );
                await burnTx.wait();
                console.log("✅ crosschainBurn 权限设置完成");
            } catch (burnError) {
                console.log("❌ crosschainBurn 权限设置失败:", burnError.message);
            }
        }

        // 配置跨链设置
        console.log("\n🌉 配置跨链连接设置...");

        const feeData = await ethers.provider.getFeeData();
        const gasPrice = feeData.gasPrice * 120n / 100n;

        const configResults = {
            destinationChain: false,
            sourceChain: false,
            senderAllowlist: false
        };

        // 1. 配置目标链允许列表
        try {
            console.log("🎯 配置目标链允许列表...");
            const currentDestStatus = await bridge.allowlistedDestinationChains(remoteChainSelector);

            if (!currentDestStatus) {
                const allowDestTx = await bridge.allowlistDestinationChain(remoteChainSelector, true, {
                    gasPrice: gasPrice,
                    gasLimit: 200000
                });
                await allowDestTx.wait();
            }

            // 验证配置
            const newDestStatus = await bridge.allowlistedDestinationChains(remoteChainSelector);
            if (newDestStatus) {
                console.log("✅ 目标链允许列表配置完成");
                configResults.destinationChain = true;
            } else {
                console.log("❌ 目标链配置验证失败");
            }
        } catch (error) {
            console.log("❌ 目标链允许列表配置失败:", error.message);
        }

        // 2. 配置源链允许列表
        try {
            console.log("📥 配置源链允许列表...");
            const currentSourceStatus = await bridge.allowlistedSourceChains(remoteChainSelector);

            if (!currentSourceStatus) {
                const allowSourceTx = await bridge.allowlistSourceChain(remoteChainSelector, true, {
                    gasPrice: gasPrice,
                    gasLimit: 200000
                });
                await allowSourceTx.wait();
            }

            // 验证配置
            const newSourceStatus = await bridge.allowlistedSourceChains(remoteChainSelector);
            if (newSourceStatus) {
                console.log("✅ 源链允许列表配置完成");
                configResults.sourceChain = true;
            } else {
                console.log("❌ 源链配置验证失败");
            }
        } catch (error) {
            console.log("❌ 源链允许列表配置失败:", error.message);
        }

        // 3. 配置发送者允许列表
        try {
            console.log("👤 配置发送者允许列表...");
            const remoteBridgeAddress = remoteConfig.contracts.bridge;
            const currentSenderStatus = await bridge.allowlistedSenders(remoteBridgeAddress);

            if (!currentSenderStatus) {
                const allowSenderTx = await bridge.allowlistSender(remoteBridgeAddress, true, {
                    gasPrice: gasPrice,
                    gasLimit: 200000
                });
                await allowSenderTx.wait();
            }

            // 验证配置
            const newSenderStatus = await bridge.allowlistedSenders(remoteBridgeAddress);
            if (newSenderStatus) {
                console.log("✅ 发送者允许列表配置完成");
                configResults.senderAllowlist = true;
            } else {
                console.log("❌ 发送者配置验证失败");
            }
        } catch (error) {
            console.log("❌ 发送者允许列表配置失败:", error.message);
        }

        // 最终验证
        console.log("\n✅ 配置结果验证:");
        console.log(`- 目标链允许: ${configResults.destinationChain ? '✅' : '❌'}`);
        console.log(`- 源链允许: ${configResults.sourceChain ? '✅' : '❌'}`);
        console.log(`- 发送者允许: ${configResults.senderAllowlist ? '✅' : '❌'}`);

        const allConfigured = Object.values(configResults).every(result => result === true);

        // 更新配置文件
        config[networkName].crosschainConfigured = allConfigured;
        config[networkName].lastConfigured = new Date().toISOString();
        config[networkName].configResults = configResults;

        fs.writeFileSync(configFile, JSON.stringify(config, null, 2));

        if (allConfigured) {
            console.log(`\n🎉 ${networkName} 网络跨链配置完全成功！`);

            // 检查是否两个网络都配置完成
            const sepoliaConfigured = config.sepolia.crosschainConfigured || false;
            const bscConfigured = config.bscTestnet.crosschainConfigured || false;

            if (sepoliaConfigured && bscConfigured) {
                console.log("\n🌐 跨链配置状态: 完全配置完成！");
                console.log("📋 下一步:");
                console.log("1. 运行权限检查: npx hardhat run scripts/check-bridge-permissions.js --network sepolia");
                console.log("2. 运行权限检查: npx hardhat run scripts/check-bridge-permissions.js --network bscTestnet");
                console.log("3. 测试跨链功能: npx hardhat run scripts/test-complete-functionality.js --network sepolia");
                console.log("4. 监控跨链交易: npx hardhat run scripts/monitor-crosschain-transactions.js --network bscTestnet");
            } else {
                console.log("\n📋 下一步:");
                if (!sepoliaConfigured) {
                    console.log("- 在 Sepolia 配置: npx hardhat run scripts/configure-crosschain.js --network sepolia");
                }
                if (!bscConfigured) {
                    console.log("- 在 BSC Testnet 配置: npx hardhat run scripts/configure-crosschain.js --network bscTestnet");
                }
            }
        } else {
            console.log(`\n⚠️ ${networkName} 网络跨链配置部分失败`);
            console.log("请检查错误信息并重新运行此脚本");
        }

    } catch (error) {
        console.error("❌ 跨链配置失败:", error.message);

        console.log("\n🔧 故障排除建议:");
        console.log("1. 确保账户有足够的 ETH 支付 gas 费用");
        console.log("2. 检查网络连接是否稳定");
        console.log("3. 验证部署者账户有管理员权限");
        console.log("4. 确保两个网络的合约都已正确部署");

        throw error;
    }
}

// 快速状态检查功能
async function checkCrosschainStatus() {
    console.log("🔍 检查跨链配置状态...");

    const configFile = path.join(__dirname, '../deployments/crosschain-config.json');
    if (!fs.existsSync(configFile)) {
        console.log("❌ 配置文件不存在");
        return;
    }

    const config = JSON.parse(fs.readFileSync(configFile, 'utf8'));

    console.log("\n📊 跨链配置状态:");

    if (config.sepolia) {
        const sepoliaConfigured = config.sepolia.crosschainConfigured || false;
        console.log(`🔗 Sepolia: ${sepoliaConfigured ? '✅ 已配置' : '⚠️ 未配置'}`);
        if (config.sepolia.lastConfigured) {
            console.log(`   最后配置时间: ${config.sepolia.lastConfigured}`);
        }
        if (config.sepolia.configResults) {
            console.log(`   配置详情:`, config.sepolia.configResults);
        }
    } else {
        console.log("🔗 Sepolia: ❌ 未部署");
    }

    if (config.bscTestnet) {
        const bscConfigured = config.bscTestnet.crosschainConfigured || false;
        console.log(`🔗 BSC Testnet: ${bscConfigured ? '✅ 已配置' : '⚠️ 未配置'}`);
        if (config.bscTestnet.lastConfigured) {
            console.log(`   最后配置时间: ${config.bscTestnet.lastConfigured}`);
        }
        if (config.bscTestnet.configResults) {
            console.log(`   配置详情:`, config.bscTestnet.configResults);
        }
    } else {
        console.log("🔗 BSC Testnet: ❌ 未部署");
    }
}

// 主函数
async function main() {
    const args = process.argv.slice(2);

    if (args.includes('--status') || args.includes('-s')) {
        await checkCrosschainStatus();
    } else {
        await configureCrossChain();
    }
}

if (require.main === module) {
    main().catch((error) => {
        console.error(error);
        process.exitCode = 1;
    });
}

module.exports = { configureCrossChain, checkCrosschainStatus }; 