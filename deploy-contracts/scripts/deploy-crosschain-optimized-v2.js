const { ethers } = require("hardhat");
const fs = require('fs');
const path = require('path');

// CCIP 路由器地址
const CCIP_ROUTERS = {
    sepolia: "0x0BF3dE8c5D3e8A2B34D2BEeB17ABfCeBaf363A59",
    bscTestnet: "0xE1053aE1857476f36A3C62580FF9b016E8EE8F6f"
};

// CCIP 链选择器
const CHAIN_SELECTORS = {
    sepolia: "16015286601757825753",
    bscTestnet: "13264668187771770619"
};

// 部署合约的辅助函数，带重试机制
async function deployContractWithRetry(contractName, args = [], retries = 3) {
    for (let i = 0; i < retries; i++) {
        try {
            console.log(`尝试部署 ${contractName}... (第 ${i + 1} 次)`);

            const ContractFactory = await ethers.getContractFactory(contractName);

            // 获取当前gas价格并增加20%
            const feeData = await ethers.provider.getFeeData();
            const gasPrice = feeData.gasPrice * 120n / 100n; // 增加20%

            console.log(`使用 Gas Price: ${ethers.formatUnits(gasPrice, "gwei")} gwei`);

            const contract = await ContractFactory.deploy(...args, {
                gasPrice: gasPrice,
                gasLimit: 3000000, // 设置较高的gas limit
            });

            console.log(`等待 ${contractName} 部署确认...`);
            console.log(`交易哈希: ${contract.deploymentTransaction()?.hash}`);

            // 等待确认，但设置超时
            const timeoutPromise = new Promise((_, reject) =>
                setTimeout(() => reject(new Error('部署超时')), 300000) // 5分钟超时
            );

            const deploymentPromise = contract.waitForDeployment();

            await Promise.race([deploymentPromise, timeoutPromise]);

            const address = await contract.getAddress();
            console.log(`✅ ${contractName} 部署成功: ${address}`);

            return { contract, address };

        } catch (error) {
            console.log(`❌ ${contractName} 部署失败 (第 ${i + 1} 次):`, error.message);

            if (i === retries - 1) {
                throw error;
            }

            console.log(`等待 30 秒后重试...`);
            await new Promise(resolve => setTimeout(resolve, 30000));
        }
    }
}

// 配置基础权限（不涉及跨链）
async function configureBasicPermissions(accessManager, tokenAddress, bridgeAddress, deployer) {
    console.log("\n🔐 配置基础权限...");

    const ADMIN_ROLE = await accessManager.ADMIN_ROLE();
    console.log(`ADMIN_ROLE: ${ADMIN_ROLE}`);

    // 基础权限（非跨链）
    const basicSelectors = {
        mint: ethers.id("mint(address,uint256)").slice(0, 10),
        pause: ethers.id("pause()").slice(0, 10),
        unpause: ethers.id("unpause()").slice(0, 10),
        blockUser: ethers.id("blockUser(address)").slice(0, 10),
        unblockUser: ethers.id("unblockUser(address)").slice(0, 10),
        freeze: ethers.id("freeze(address,uint256)").slice(0, 10)
    };

    // 跨链权限（单独处理）
    const crosschainSelectors = {
        crosschainMint: ethers.id("crosschainMint(address,uint256)").slice(0, 10),
        crosschainBurn: ethers.id("crosschainBurn(address,uint256)").slice(0, 10)
    };

    // 1. 设置基础权限
    console.log("设置基础功能权限...");
    for (const [funcName, selector] of Object.entries(basicSelectors)) {
        try {
            console.log(`设置 ${funcName} 权限...`);
            const tx = await accessManager.setTargetFunctionRole(
                tokenAddress,
                [selector],
                ADMIN_ROLE,
                { gasPrice: await ethers.provider.getFeeData().then(f => f.gasPrice * 120n / 100n) }
            );
            await tx.wait();
            console.log(`✅ ${funcName} 权限设置完成`);
        } catch (error) {
            console.log(`❌ ${funcName} 权限设置失败:`, error.message);
            throw error; // 基础权限必须成功
        }
    }

    // 2. 设置跨链权限
    console.log("设置跨链功能权限...");
    for (const [funcName, selector] of Object.entries(crosschainSelectors)) {
        try {
            console.log(`设置 ${funcName} 权限...`);
            const tx = await accessManager.setTargetFunctionRole(
                tokenAddress,
                [selector],
                ADMIN_ROLE,
                { gasPrice: await ethers.provider.getFeeData().then(f => f.gasPrice * 120n / 100n) }
            );
            await tx.wait();
            console.log(`✅ ${funcName} 权限设置完成`);
        } catch (error) {
            console.log(`❌ ${funcName} 权限设置失败:`, error.message);
            throw error; // 跨链权限也必须成功
        }
    }

    // 3. 给桥合约授予管理员权限
    try {
        console.log("授予桥合约管理员权限...");
        const grantTx = await accessManager.grantRole(ADMIN_ROLE, bridgeAddress, 0);
        await grantTx.wait();
        console.log("✅ 桥合约管理员权限授予完成");

        // 验证权限是否真的设置成功
        const hasRole = await accessManager.hasRole(ADMIN_ROLE, bridgeAddress);
        if (!hasRole) {
            throw new Error("桥合约权限验证失败");
        }
        console.log("✅ 桥合约权限验证成功");

    } catch (error) {
        console.log("❌ 桥合约权限授予失败:", error.message);
        throw error; // 桥合约权限必须成功
    }

    return { ADMIN_ROLE };
}

// 配置跨链设置（改进版）
async function configureCrossChainSettings(bridgeContract, networkName, config) {
    console.log("\n🌉 配置跨链设置...");

    try {
        // 获取对端网络信息
        let remoteNetworkName, remoteChainSelector, remoteBridgeAddress;

        if (networkName === "sepolia" && config.bscTestnet?.contracts?.bridge) {
            remoteNetworkName = "bscTestnet";
            remoteChainSelector = CHAIN_SELECTORS.bscTestnet;
            remoteBridgeAddress = config.bscTestnet.contracts.bridge;
        } else if (networkName === "bscTestnet" && config.sepolia?.contracts?.bridge) {
            remoteNetworkName = "sepolia";
            remoteChainSelector = CHAIN_SELECTORS.sepolia;
            remoteBridgeAddress = config.sepolia.contracts.bridge;
        } else {
            console.log("ℹ️ 跳过跨链配置：对端网络未完全部署");
            console.log("💡 请在对端网络部署完成后运行跨链配置脚本");
            return false;
        }

        console.log(`配置与 ${remoteNetworkName} 的连接...`);
        console.log(`链选择器: ${remoteChainSelector}`);
        console.log(`远程桥合约: ${remoteBridgeAddress}`);

        // 获取当前gas价格
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
            const allowDestTx = await bridgeContract.allowlistDestinationChain(remoteChainSelector, true, {
                gasPrice: gasPrice,
                gasLimit: 200000
            });
            await allowDestTx.wait();

            // 验证配置
            const isAllowed = await bridgeContract.allowlistedDestinationChains(remoteChainSelector);
            if (isAllowed) {
                console.log("✅ 目标链允许列表配置完成");
                configResults.destinationChain = true;
            } else {
                throw new Error("目标链配置验证失败");
            }
        } catch (error) {
            console.log("❌ 目标链允许列表配置失败:", error.message);
        }

        // 2. 配置源链允许列表
        try {
            console.log("📥 配置源链允许列表...");
            const allowSourceTx = await bridgeContract.allowlistSourceChain(remoteChainSelector, true, {
                gasPrice: gasPrice,
                gasLimit: 200000
            });
            await allowSourceTx.wait();

            // 验证配置
            const isAllowed = await bridgeContract.allowlistedSourceChains(remoteChainSelector);
            if (isAllowed) {
                console.log("✅ 源链允许列表配置完成");
                configResults.sourceChain = true;
            } else {
                throw new Error("源链配置验证失败");
            }
        } catch (error) {
            console.log("❌ 源链允许列表配置失败:", error.message);
        }

        // 3. 配置发送者允许列表
        try {
            console.log("👤 配置发送者允许列表...");
            const currentStatus = await bridgeContract.allowlistedSenders(remoteBridgeAddress);

            if (!currentStatus) {
                const allowSenderTx = await bridgeContract.allowlistSender(remoteBridgeAddress, true, {
                    gasPrice: gasPrice,
                    gasLimit: 200000
                });
                await allowSenderTx.wait();

                // 验证配置
                const newStatus = await bridgeContract.allowlistedSenders(remoteBridgeAddress);
                if (newStatus) {
                    console.log("✅ 发送者允许列表配置完成");
                    configResults.senderAllowlist = true;
                } else {
                    throw new Error("发送者配置验证失败");
                }
            } else {
                console.log("ℹ️ 发送者已在允许列表中");
                configResults.senderAllowlist = true;
            }
        } catch (error) {
            console.log("❌ 发送者允许列表配置失败:", error.message);
        }

        // 检查配置完整性
        const allConfigured = Object.values(configResults).every(result => result === true);

        if (allConfigured) {
            console.log(`🎉 与 ${remoteNetworkName} 的跨链配置完全成功！`);
            return true;
        } else {
            console.log(`⚠️ 跨链配置部分失败:`, configResults);
            return false;
        }

    } catch (error) {
        console.log("⚠️ 跨链配置失败:", error.message);
        return false;
    }
}

// 验证部署结果
async function validateDeployment(contracts, accessManager, networkName) {
    console.log("\n🔍 验证部署结果...");

    try {
        const token = await ethers.getContractAt("XDStablecoin", contracts.token);
        const bridge = await ethers.getContractAt("XDStablecoinCCIPBridge", contracts.bridge);

        // 1. 验证合约连接
        const tokenAuthority = await token.authority();
        const bridgeRouter = await bridge.getRouter();
        const bridgeToken = await bridge.xdToken();

        console.log("合约连接验证:");
        console.log(`- Token 权限管理器: ${tokenAuthority === contracts.accessManager ? '✅' : '❌'}`);
        console.log(`- Bridge CCIP路由器: ${bridgeRouter !== ethers.ZeroAddress ? '✅' : '❌'}`);
        console.log(`- Bridge 代币合约: ${bridgeToken === contracts.token ? '✅' : '❌'}`);

        // 2. 验证权限设置
        const ADMIN_ROLE = await accessManager.ADMIN_ROLE();
        const bridgeHasRole = await accessManager.hasRole(ADMIN_ROLE, contracts.bridge);

        console.log("权限验证:");
        console.log(`- 桥合约管理员权限: ${bridgeHasRole ? '✅' : '❌'}`);

        // 3. 验证跨链函数权限
        const crosschainMintSelector = ethers.id("crosschainMint(address,uint256)").slice(0, 10);
        const crosschainBurnSelector = ethers.id("crosschainBurn(address,uint256)").slice(0, 10);

        try {
            const mintRole = await accessManager.getTargetFunctionRole(contracts.token, crosschainMintSelector);
            const burnRole = await accessManager.getTargetFunctionRole(contracts.token, crosschainBurnSelector);

            console.log(`- crosschainMint 权限: ${mintRole.toString() === ADMIN_ROLE.toString() ? '✅' : '❌'}`);
            console.log(`- crosschainBurn 权限: ${burnRole.toString() === ADMIN_ROLE.toString() ? '✅' : '❌'}`);
        } catch (error) {
            console.log("- 跨链函数权限: ❌ 未设置");
        }

        return true;

    } catch (error) {
        console.log("❌ 验证失败:", error.message);
        return false;
    }
}

async function main() {
    console.log("🚀 开始改进的跨链部署...");

    const [deployer] = await ethers.getSigners();
    const network = await ethers.provider.getNetwork();

    console.log("部署信息:");
    console.log("- 部署者:", deployer.address);
    console.log("- 网络:", network.chainId.toString());

    // 检查余额
    const balance = await ethers.provider.getBalance(deployer.address);
    console.log("- 余额:", ethers.formatEther(balance), "ETH");

    if (balance < ethers.parseEther("0.1")) {
        console.log("⚠️ 警告：余额可能不足以完成部署");
    }

    // 确定CCIP路由器
    let ccipRouter;
    if (network.chainId === 11155111n) {
        ccipRouter = CCIP_ROUTERS.sepolia;
        console.log("- CCIP路由器 (Sepolia):", ccipRouter);
    } else if (network.chainId === 97n) {
        ccipRouter = CCIP_ROUTERS.bscTestnet;
        console.log("- CCIP路由器 (BSC Testnet):", ccipRouter);
    } else {
        throw new Error("不支持的网络");
    }

    const deploymentResults = {};

    try {
        // 1. 部署 AccessManager
        console.log("\n📋 第一步: 部署 AccessManager...");
        const accessManagerResult = await deployContractWithRetry("XDAccessManager", [deployer.address]);
        deploymentResults.accessManager = accessManagerResult.address;

        // 2. 部署 XDStablecoin
        console.log("\n🪙 第二步: 部署 XDStablecoin...");
        const tokenResult = await deployContractWithRetry("XDStablecoin", [accessManagerResult.address]);
        deploymentResults.token = tokenResult.address;

        // 3. 部署 CCIP Bridge
        console.log("\n🌉 第三步: 部署 CCIP Bridge...");

        // 先验证CCIP路由器地址是否有效
        console.log("验证CCIP路由器地址...");
        const routerCode = await ethers.provider.getCode(ccipRouter);
        if (routerCode === "0x") {
            throw new Error(`CCIP路由器地址 ${ccipRouter} 无效`);
        }
        console.log("✅ CCIP路由器地址有效");

        const bridgeResult = await deployContractWithRetry("XDStablecoinCCIPBridge", [ccipRouter, tokenResult.address]);
        deploymentResults.bridge = bridgeResult.address;

        // 4. 配置基础权限（必须成功）
        console.log("\n🔐 第四步: 配置权限...");
        const permissionResult = await configureBasicPermissions(
            accessManagerResult.contract,
            tokenResult.address,
            bridgeResult.address,
            deployer
        );

        // 5. 验证部署
        console.log("\n✅ 第五步: 验证部署...");
        const validationResult = await validateDeployment(
            deploymentResults,
            accessManagerResult.contract,
            network.chainId === 11155111n ? "sepolia" : "bscTestnet"
        );

        if (!validationResult) {
            throw new Error("部署验证失败");
        }

        // 6. 保存配置
        console.log("\n💾 第六步: 保存部署结果...");
        const networkName = network.chainId === 11155111n ? "sepolia" : "bscTestnet";

        const deploymentInfo = {
            network: {
                name: networkName,
                chainId: network.chainId.toString()
            },
            contracts: deploymentResults,
            deployer: deployer.address,
            deployedAt: new Date().toISOString(),
            permissionsConfigured: true,
            validated: validationResult
        };

        // 保存到文件
        const deploymentsDir = path.join(__dirname, '../deployments');
        if (!fs.existsSync(deploymentsDir)) {
            fs.mkdirSync(deploymentsDir, { recursive: true });
        }

        const configFile = path.join(deploymentsDir, 'crosschain-config.json');
        let config = {};
        if (fs.existsSync(configFile)) {
            config = JSON.parse(fs.readFileSync(configFile, 'utf8'));
        }

        config[networkName] = deploymentInfo;
        fs.writeFileSync(configFile, JSON.stringify(config, null, 2));

        // 7. 尝试配置跨链设置
        console.log("\n🌉 第七步: 配置跨链设置...");
        const crosschainConfigured = await configureCrossChainSettings(bridgeResult.contract, networkName, config);

        // 更新配置文件
        config[networkName].crosschainConfigured = crosschainConfigured;
        fs.writeFileSync(configFile, JSON.stringify(config, null, 2));

        console.log("\n🎉 部署完成！");
        console.log("\n📝 部署地址:");
        Object.entries(deploymentResults).forEach(([name, address]) => {
            console.log(`- ${name}: ${address}`);
        });

        // 提供后续操作建议
        if (config.sepolia && config.bscTestnet) {
            const sepoliaConfigured = config.sepolia.crosschainConfigured || false;
            const bscConfigured = config.bscTestnet.crosschainConfigured || false;

            console.log("\n🌐 跨链配置状态:");
            console.log("✅ 两个网络的合约都已部署");
            console.log(`${sepoliaConfigured ? '✅' : '⚠️'} Sepolia 跨链配置: ${sepoliaConfigured ? '完成' : '需要配置'}`);
            console.log(`${bscConfigured ? '✅' : '⚠️'} BSC Testnet 跨链配置: ${bscConfigured ? '完成' : '需要配置'}`);

            if (sepoliaConfigured && bscConfigured) {
                console.log("\n📋 后续步骤:");
                console.log("1. 运行 check-bridge-permissions.js 验证跨链配置");
                console.log("2. 运行 test-complete-functionality.js 测试所有功能");
            } else {
                console.log("\n📋 下一步:");
                console.log("运行跨链配置脚本完成剩余配置:");
                if (!sepoliaConfigured) {
                    console.log("- npx hardhat run scripts/configure-crosschain.js --network sepolia");
                }
                if (!bscConfigured) {
                    console.log("- npx hardhat run scripts/configure-crosschain.js --network bscTestnet");
                }
            }
        } else {
            console.log("\n📋 下一步:");
            console.log("在另一个网络上运行此脚本以完成跨链部署");
        }

    } catch (error) {
        console.error("❌ 部署失败:", error.message);

        console.log("\n🔧 故障排除建议:");
        console.log("1. 检查账户余额是否充足");
        console.log("2. 尝试增加Gas价格");
        console.log("3. 检查网络连接状态");
        console.log("4. 验证权限配置是否正确");

        throw error;
    }
}

if (require.main === module) {
    main().catch((error) => {
        console.error(error);
        process.exitCode = 1;
    });
}

module.exports = { main, configureBasicPermissions, configureCrossChainSettings, validateDeployment }; 