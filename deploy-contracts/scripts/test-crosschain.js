const { ethers } = require("hardhat");
const fs = require('fs');
const path = require('path');

// CCIP 链选择器常量
const CHAIN_SELECTORS = {
    sepolia: "16015286601757825753",
    bscTestnet: "13264668187771770619"
};

async function main() {
    console.log("🧪 开始跨链功能测试...");

    // 读取跨链配置
    const configFile = path.join(__dirname, '../deployments/crosschain-config.json');
    if (!fs.existsSync(configFile)) {
        throw new Error("未找到跨链配置文件，请先运行部署脚本");
    }

    const config = JSON.parse(fs.readFileSync(configFile, 'utf8'));

    if (!config.sepolia || !config.bscTestnet) {
        throw new Error("跨链配置不完整，请确保在两个网络都已部署");
    }

    const [deployer, user1] = await ethers.getSigners();
    const network = await ethers.provider.getNetwork();

    // 确定当前网络和目标网络
    let currentConfig, targetConfig, targetChainSelector;
    if (network.chainId === 11155111n) { // Sepolia
        currentConfig = config.sepolia;
        targetConfig = config.bscTestnet;
        targetChainSelector = CHAIN_SELECTORS.bscTestnet;
        console.log("🔗 当前网络: Sepolia → 目标网络: BSC Testnet");
    } else if (network.chainId === 97n) { // BSC Testnet
        currentConfig = config.bscTestnet;
        targetConfig = config.sepolia;
        targetChainSelector = CHAIN_SELECTORS.sepolia;
        console.log("🔗 当前网络: BSC Testnet → 目标网络: Sepolia");
    } else {
        throw new Error("请在 Sepolia 或 BSC Testnet 上运行此测试");
    }

    console.log(`目标链选择器: ${targetChainSelector}`);

    // 连接合约
    const token = await ethers.getContractAt("XDStablecoin", currentConfig.contracts.token);
    const bridge = await ethers.getContractAt("XDStablecoinCCIPBridge", currentConfig.contracts.bridge);

    console.log("\n📊 合约信息:");
    console.log("- Token:", currentConfig.contracts.token);
    console.log("- Bridge:", currentConfig.contracts.bridge);
    console.log("- 目标 Bridge:", targetConfig.contracts.bridge);

    // 测试用户地址
    const testUser = user1 ? user1.address : deployer.address;
    console.log("- 测试用户:", testUser);

    try {
        // 1. 检查用户余额
        console.log("\n1️⃣ 检查用户余额...");
        let userBalance = await token.balanceOf(testUser);
        console.log(`用户余额: ${ethers.formatEther(userBalance)} XD`);

        // 如果余额为0，先铸造一些代币
        if (userBalance === 0n) {
            console.log("铸造测试代币...");
            const mintAmount = ethers.parseEther("1000");
            const mintTx = await token.connect(deployer).mint(testUser, mintAmount);
            await mintTx.wait();
            userBalance = await token.balanceOf(testUser);
            console.log(`✅ 铸造完成，用户余额: ${ethers.formatEther(userBalance)} XD`);
        }

        // 2. 估算跨链费用
        console.log("\n2️⃣ 估算跨链费用...");
        const transferAmount = ethers.parseEther("100");

        console.log("参数检查:");
        console.log("- targetChainSelector:", targetChainSelector, typeof targetChainSelector);
        console.log("- targetBridge:", targetConfig.contracts.bridge);
        console.log("- testUser:", testUser);
        console.log("- transferAmount:", transferAmount.toString());

        try {
            const estimatedFee = await bridge.estimateCrossChainFee(
                targetChainSelector,
                targetConfig.contracts.bridge,
                testUser,
                transferAmount
            );
            console.log(`估算费用: ${ethers.formatEther(estimatedFee)} ETH`);

            // 3. 检查发送者余额
            console.log("\n3️⃣ 检查发送者余额...");
            const senderBalance = await ethers.provider.getBalance(deployer.address);
            console.log(`发送者余额: ${ethers.formatEther(senderBalance)} ETH`);

            if (senderBalance < estimatedFee) {
                console.log("❌ 余额不足以支付跨链费用");
                console.log(`需要: ${ethers.formatEther(estimatedFee)} ETH`);
                console.log(`拥有: ${ethers.formatEther(senderBalance)} ETH`);
                return;
            }

            // 4. 授权桥合约
            console.log("\n4️⃣ 授权桥合约...");
            const currentAllowance = await token.allowance(testUser, currentConfig.contracts.bridge);
            if (currentAllowance < transferAmount) {
                const signer = user1 || deployer;
                const approveTx = await token.connect(signer).approve(currentConfig.contracts.bridge, transferAmount);
                await approveTx.wait();
                console.log("✅ 授权完成");
            } else {
                console.log("✅ 已有足够授权");
            }

            // 5. 执行跨链转账
            console.log("\n5️⃣ 执行跨链转账...");
            console.log(`转账数量: ${ethers.formatEther(transferAmount)} XD`);
            console.log(`支付费用: ${ethers.formatEther(estimatedFee)} ETH`);

            const transferTx = await bridge.connect(deployer).transferCrossChain(
                targetChainSelector,
                targetConfig.contracts.bridge,
                testUser,
                transferAmount,
                { value: estimatedFee }
            );

            console.log("⏳ 等待交易确认...");
            const receipt = await transferTx.wait();
            console.log("✅ 跨链转账交易已发送！");
            console.log("交易哈希:", receipt.hash);

            // 6. 检查转账后余额
            console.log("\n6️⃣ 检查转账后余额...");
            const newBalance = await token.balanceOf(testUser);
            console.log(`用户新余额: ${ethers.formatEther(newBalance)} XD`);
            console.log(`减少数量: ${ethers.formatEther(userBalance - newBalance)} XD`);

            // 7. 查找事件
            console.log("\n7️⃣ 查找跨链事件...");
            const events = receipt.logs;
            for (const event of events) {
                try {
                    const parsedEvent = bridge.interface.parseLog(event);
                    if (parsedEvent && parsedEvent.name === 'MessageSent') {
                        console.log("✅ 找到 MessageSent 事件:");
                        console.log("- 消息ID:", parsedEvent.args.messageId);
                        console.log("- 目标链:", parsedEvent.args.destinationChainSelector.toString());
                        console.log("- 接收者:", parsedEvent.args.receiver);
                        console.log("- 用户:", parsedEvent.args.user);
                        console.log("- 数量:", ethers.formatEther(parsedEvent.args.amount), "XD");
                        console.log("- 费用:", ethers.formatEther(parsedEvent.args.fees), "ETH");
                    }
                } catch (e) {
                    // 忽略无法解析的事件
                }
            }

            console.log("\n🎉 跨链转账测试完成！");
            console.log("\n⏳ 请等待几分钟，然后在目标网络检查用户余额");
            console.log(`目标网络合约地址: ${targetConfig.contracts.token}`);

            const targetNetworkName = network.chainId === 11155111n ? "bscTestnet" : "sepolia";
            console.log(`检查命令: npx hardhat run scripts/check-balance.js --network ${targetNetworkName}`);

        } catch (feeError) {
            console.log("❌ 费用估算失败:", feeError.message);

            // 检查是否是合约函数不存在的问题
            if (feeError.message.includes("estimateCrossChainFee")) {
                console.log("\n🔍 检查合约是否有 estimateCrossChainFee 函数...");

                // 尝试调用其他函数来验证合约是否正常
                try {
                    const routerAddress = await bridge.getRouter();
                    console.log("✅ 桥合约连接正常，路由器地址:", routerAddress);

                    // 直接尝试跨链转账（跳过费用估算）
                    console.log("\n⚠️ 跳过费用估算，直接尝试转账...");
                    const defaultFee = ethers.parseEther("0.01"); // 使用默认费用

                    console.log("\n4️⃣ 授权桥合约...");
                    const currentAllowance = await token.allowance(testUser, currentConfig.contracts.bridge);
                    if (currentAllowance < transferAmount) {
                        const signer = user1 || deployer;
                        const approveTx = await token.connect(signer).approve(currentConfig.contracts.bridge, transferAmount);
                        await approveTx.wait();
                        console.log("✅ 授权完成");
                    }

                    console.log("\n5️⃣ 执行跨链转账（使用默认费用）...");
                    const transferTx = await bridge.connect(deployer).transferCrossChain(
                        targetChainSelector,
                        targetConfig.contracts.bridge,
                        testUser,
                        transferAmount,
                        { value: defaultFee }
                    );

                    console.log("⏳ 等待交易确认...");
                    const receipt = await transferTx.wait();
                    console.log("✅ 跨链转账成功！交易哈希:", receipt.hash);

                } catch (contractError) {
                    console.log("❌ 合约调用失败:", contractError.message);
                }
            }

            console.log("\n💡 可能的问题:");
            console.log("1. 桥合约版本不匹配");
            console.log("2. CCIP路由器地址错误");
            console.log("3. 合约ABI不匹配");
        }

    } catch (error) {
        console.error("❌ 测试失败:", error);

        // 提供详细的错误诊断
        if (error.message.includes("Unauthorized") || error.message.includes("AccessManagedUnauthorized")) {
            console.log("\n💡 权限问题解决方案:");
            console.log("1. 确保桥合约已获得正确的权限");
            console.log("2. 检查 crosschainBurn 函数是否需要 ADMIN_ROLE");
            console.log("3. 运行权限配置脚本");
        } else if (error.message.includes("then")) {
            console.log("\n💡 参数类型问题解决方案:");
            console.log("1. 检查链选择器是否为正确的字符串格式");
            console.log("2. 确认所有地址参数格式正确");
            console.log("3. 验证合约ABI是否最新");
        }
    }
}

if (require.main === module) {
    main().catch((error) => {
        console.error(error);
        process.exitCode = 1;
    });
}

module.exports = { main }; 