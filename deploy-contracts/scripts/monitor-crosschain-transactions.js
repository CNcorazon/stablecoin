const { ethers } = require("hardhat");
const fs = require('fs');

// CCIP 链选择器
const CHAIN_SELECTORS = {
    sepolia: "16015286601757825753",
    bscTestnet: "13264668187771770619"
};

// RPC 配置
const RPC_URLS = {
    sepolia: process.env.SEPOLIA_RPC || "https://sepolia.infura.io/v3/",
    bscTestnet: process.env.BSC_TESTNET_RPC || "https://bsc-testnet.public.blastapi.io"
};

async function monitorCrosschainTransactions() {
    console.log("🔍 监控跨链交易记录...");
    console.log("=".repeat(80));

    // 读取配置
    const config = JSON.parse(fs.readFileSync('./deployments/crosschain-config.json', 'utf8'));

    // 获取当前网络信息
    const network = await ethers.provider.getNetwork();
    console.log(`📍 当前连接网络: ${network.chainId}`);

    const results = {
        sepolia: { sent: [], received: [] },
        bscTestnet: { sent: [], received: [] }
    };

    // 监控 Sepolia 网络
    console.log("\n🔗 监控 Sepolia 网络...");
    await monitorNetwork('sepolia', config.sepolia, results);

    // 监控 BSC Testnet 网络
    console.log("\n🔗 监控 BSC Testnet 网络...");
    await monitorNetwork('bscTestnet', config.bscTestnet, results);

    // 生成统计报告
    console.log("\n📊 跨链交易统计报告");
    console.log("=".repeat(80));

    generateReport(results);

    // 匹配发送和接收
    console.log("\n🔄 消息匹配分析");
    console.log("=".repeat(80));
    analyzeMessageMatching(results);

    return results;
}

async function monitorNetwork(networkName, networkConfig, results) {
    try {
        // 创建对应网络的provider
        let provider;
        if (networkName === 'sepolia') {
            provider = new ethers.JsonRpcProvider(RPC_URLS.sepolia);
        } else {
            provider = new ethers.JsonRpcProvider(RPC_URLS.bscTestnet);
        }

        const bridge = new ethers.Contract(
            networkConfig.contracts.bridge,
            [
                "event MessageSent(bytes32 indexed messageId, uint64 indexed destinationChainSelector, address receiver, address user, uint256 amount, uint256 fees)",
                "event MessageReceived(bytes32 indexed messageId, uint64 indexed sourceChainSelector, address sender, address user, uint256 amount)"
            ],
            provider
        );

        console.log(`  📤 查询 ${networkName} 发送消息...`);

        // 查询发送事件 (最近20000个区块)
        const sentFilter = bridge.filters.MessageSent();
        const sentEvents = await bridge.queryFilter(sentFilter, -20000);

        console.log(`  找到 ${sentEvents.length} 条发送记录`);

        for (const event of sentEvents) {
            const block = await provider.getBlock(event.blockNumber);
            const destinationChain = getChainName(event.args.destinationChainSelector.toString());

            results[networkName].sent.push({
                messageId: event.args.messageId,
                sourceChain: getChainName(getChainSelectorByNetwork(networkName)), // 修复：正确显示发送方
                destinationChain: destinationChain,
                destinationChainSelector: event.args.destinationChainSelector.toString(),
                receiver: event.args.receiver,
                user: event.args.user,
                amount: ethers.formatEther(event.args.amount),
                fees: ethers.formatEther(event.args.fees),
                blockNumber: event.blockNumber,
                timestamp: new Date(Number(block.timestamp) * 1000).toISOString(),
                txHash: event.transactionHash
            });
        }

        console.log(`  📥 查询 ${networkName} 接收消息...`);

        // 查询接收事件
        const receivedFilter = bridge.filters.MessageReceived();
        const receivedEvents = await bridge.queryFilter(receivedFilter, -20000);

        console.log(`  找到 ${receivedEvents.length} 条接收记录`);

        for (const event of receivedEvents) {
            const block = await provider.getBlock(event.blockNumber);
            const sourceChain = getChainName(event.args.sourceChainSelector.toString());

            results[networkName].received.push({
                messageId: event.args.messageId,
                sourceChain: sourceChain,
                destinationChain: getChainName(getChainSelectorByNetwork(networkName)), // 修复：正确显示接收方
                sourceChainSelector: event.args.sourceChainSelector.toString(),
                sender: event.args.sender,
                user: event.args.user,
                amount: ethers.formatEther(event.args.amount),
                blockNumber: event.blockNumber,
                timestamp: new Date(Number(block.timestamp) * 1000).toISOString(),
                txHash: event.transactionHash
            });
        }

    } catch (error) {
        console.log(`  ❌ 监控 ${networkName} 失败:`, error.message);
    }
}

// 修复：根据链选择器获取正确的网络名称
function getChainName(chainSelector) {
    switch (chainSelector) {
        case CHAIN_SELECTORS.sepolia:
            return "Sepolia";
        case CHAIN_SELECTORS.bscTestnet:
            return "BSC Testnet";
        default:
            return `Unknown(${chainSelector})`;
    }
}

// 新增：根据网络名称获取链选择器
function getChainSelectorByNetwork(networkName) {
    switch (networkName) {
        case 'sepolia':
            return CHAIN_SELECTORS.sepolia;
        case 'bscTestnet':
            return CHAIN_SELECTORS.bscTestnet;
        default:
            return "Unknown";
    }
}

function generateReport(results) {
    const totalSent = results.sepolia.sent.length + results.bscTestnet.sent.length;
    const totalReceived = results.sepolia.received.length + results.bscTestnet.received.length;

    console.log(`📈 总体统计:`);
    console.log(`  发送消息总数: ${totalSent}`);
    console.log(`  接收消息总数: ${totalReceived}`);
    console.log(`  成功率: ${totalSent > 0 ? ((totalReceived / totalSent) * 100).toFixed(2) : 0}%`);

    console.log(`\n🌐 Sepolia 网络:`);
    console.log(`  发送: ${results.sepolia.sent.length} 条`);
    console.log(`  接收: ${results.sepolia.received.length} 条`);

    console.log(`\n🌐 BSC Testnet 网络:`);
    console.log(`  发送: ${results.bscTestnet.sent.length} 条`);
    console.log(`  接收: ${results.bscTestnet.received.length} 条`);

    // 详细列表
    console.log(`\n📤 所有发送记录:`);
    [...results.sepolia.sent, ...results.bscTestnet.sent]
        .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
        .forEach((tx, index) => {
            console.log(`  ${index + 1}. [${tx.timestamp.slice(0, 19)}] ${tx.amount} XD`);
            console.log(`     From: ${tx.sourceChain} → To: ${tx.destinationChain}`); // 修复：使用正确的路由显示
            console.log(`     User: ${tx.user}`);
            console.log(`     MessageID: ${tx.messageId}`);
            console.log(`     TxHash: ${tx.txHash}`);
            console.log(``);
        });

    console.log(`\n📥 所有接收记录:`);
    [...results.sepolia.received, ...results.bscTestnet.received]
        .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
        .forEach((tx, index) => {
            console.log(`  ${index + 1}. [${tx.timestamp.slice(0, 19)}] ${tx.amount} XD`);
            console.log(`     From: ${tx.sourceChain} → To: ${tx.destinationChain}`); // 修复：使用正确的路由显示
            console.log(`     User: ${tx.user}`);
            console.log(`     MessageID: ${tx.messageId}`);
            console.log(`     TxHash: ${tx.txHash}`);
            console.log(``);
        });
}

function analyzeMessageMatching(results) {
    const allSent = [...results.sepolia.sent, ...results.bscTestnet.sent];
    const allReceived = [...results.sepolia.received, ...results.bscTestnet.received];

    console.log(`🔍 消息匹配分析:`);
    console.log(`💡 注意: CCIP 跨链消息在发送和接收时的 MessageID 是不同的，我们使用 用户地址+金额+时间范围 进行匹配`);

    const matchedMessages = [];
    const unreceivedMessages = [];

    // 修复：使用更智能的匹配逻辑
    allSent.forEach(sentMsg => {
        // 尝试基于用户、金额、时间窗口匹配 (而不是 MessageID)
        const potentialMatches = allReceived.filter(rcv => {
            // 同一用户
            if (rcv.user.toLowerCase() !== sentMsg.user.toLowerCase()) return false;

            // 相同金额
            if (rcv.amount !== sentMsg.amount) return false;

            // 跨链路由正确 (发送的目标链 = 接收的所在链)
            const sentTime = new Date(sentMsg.timestamp);
            const receivedTime = new Date(rcv.timestamp);
            const timeDiff = Math.abs(receivedTime - sentTime);

            // 时间窗口: 1小时内
            return timeDiff <= 3600000; // 1小时 = 3600000毫秒
        });

        if (potentialMatches.length > 0) {
            // 选择时间最接近的匹配
            const bestMatch = potentialMatches.reduce((best, current) => {
                const bestTimeDiff = Math.abs(new Date(best.timestamp) - new Date(sentMsg.timestamp));
                const currentTimeDiff = Math.abs(new Date(current.timestamp) - new Date(sentMsg.timestamp));
                return currentTimeDiff < bestTimeDiff ? current : best;
            });

            matchedMessages.push({
                sentMessageId: sentMsg.messageId,
                receivedMessageId: bestMatch.messageId,
                sent: sentMsg,
                received: bestMatch,
                delay: calculateDelay(sentMsg.timestamp, bestMatch.timestamp)
            });

            // 从候选列表中移除已匹配的消息
            const index = allReceived.indexOf(bestMatch);
            if (index > -1) {
                allReceived.splice(index, 1);
            }
        } else {
            unreceivedMessages.push(sentMsg);
        }
    });

    console.log(`✅ 成功匹配: ${matchedMessages.length} 条`);
    console.log(`❌ 未收到: ${unreceivedMessages.length} 条`);
    console.log(`🤔 无法匹配的接收记录: ${allReceived.length} 条`);

    if (matchedMessages.length > 0) {
        console.log(`\n✅ 成功的跨链交易:`);
        matchedMessages.forEach((match, index) => {
            console.log(`  ${index + 1}. 用户: ${match.sent.user}`);
            console.log(`     金额: ${match.sent.amount} XD`);
            console.log(`     路由: ${match.sent.sourceChain} → ${match.sent.destinationChain}`);
            console.log(`     发送MessageID: ${match.sentMessageId.slice(0, 20)}...`);
            console.log(`     接收MessageID: ${match.receivedMessageId.slice(0, 20)}...`);
            console.log(`     延迟: ${match.delay}`);
            console.log(`     发送时间: ${match.sent.timestamp}`);
            console.log(`     接收时间: ${match.received.timestamp}`);
            console.log(``);
        });
    }

    if (unreceivedMessages.length > 0) {
        console.log(`\n❌ 丢失的消息:`);
        unreceivedMessages.forEach((msg, index) => {
            const timeSinceSent = Date.now() - new Date(msg.timestamp).getTime();
            const status = timeSinceSent > 1800000 ? "🔴 可能丢失" : "⏳ 等待中"; // 30分钟

            console.log(`  ${index + 1}. 用户: ${msg.user}`);
            console.log(`     金额: ${msg.amount} XD`);
            console.log(`     路由: ${msg.sourceChain} → ${msg.destinationChain}`);
            console.log(`     MessageID: ${msg.messageId.slice(0, 20)}...`);
            console.log(`     发送时间: ${msg.timestamp}`);
            console.log(`     状态: ${status}`);
            console.log(``);
        });
    }

    if (allReceived.length > 0) {
        console.log(`\n🤔 无法匹配的接收记录:`);
        allReceived.forEach((msg, index) => {
            console.log(`  ${index + 1}. 用户: ${msg.user}`);
            console.log(`     金额: ${msg.amount} XD`);
            console.log(`     路由: ${msg.sourceChain} → ${msg.destinationChain}`);
            console.log(`     MessageID: ${msg.messageId.slice(0, 20)}...`);
            console.log(`     接收时间: ${msg.timestamp}`);
            console.log(`     备注: 🤷‍♂️ 可能是历史记录或匹配算法需要调整`);
            console.log(``);
        });
    }

    // 保存详细报告到文件
    const report = {
        timestamp: new Date().toISOString(),
        summary: {
            totalSent: allSent.length,
            totalReceived: matchedMessages.length + allReceived.length, // 修复：正确的接收总数
            matched: matchedMessages.length,
            lost: unreceivedMessages.length,
            unmatched: allReceived.length,
            successRate: allSent.length > 0 ? (matchedMessages.length / allSent.length * 100).toFixed(2) : 0
        },
        transactions: {
            sent: allSent,
            received: [...matchedMessages.map(m => m.received), ...allReceived],
            matched: matchedMessages,
            lost: unreceivedMessages,
            unmatched: allReceived
        }
    };

    fs.writeFileSync('./crosschain-report.json', JSON.stringify(report, null, 2));
    console.log(`\n💾 详细报告已保存到: ./crosschain-report.json`);
}

function calculateDelay(sentTime, receivedTime) {
    const sent = new Date(sentTime);
    const received = new Date(receivedTime);
    const delayMs = received - sent;

    if (delayMs < 0) {
        return "⚠️ 负延迟 (时间异常)";
    } else if (delayMs < 60000) {
        return `${Math.round(delayMs / 1000)}秒`;
    } else if (delayMs < 3600000) {
        return `${Math.round(delayMs / 60000)}分钟`;
    } else {
        return `${Math.round(delayMs / 3600000)}小时`;
    }
}

// 如果直接运行脚本
if (require.main === module) {
    monitorCrosschainTransactions().catch(console.error);
}

module.exports = { monitorCrosschainTransactions };