const { ethers } = require("hardhat");
const fs = require('fs');
const path = require('path');
require("dotenv/config");

// ============== 📋 配置和常量 ==============

// ✅ 修复：更正BSC合约地址配置
const NETWORK_CONFIGS = {
    sepolia: {
        chainId: 11155111,
        name: "Sepolia",
        rpcUrls: [
            // "https://rpc.sepolia.org",                                           // 官方
            // "https://ethereum-sepolia-rpc.publicnode.com",                       // PublicNode
            // "https://sepolia.drpc.org",                                          // dRPC
            // "https://rpc2.sepolia.org",                                          // 备用官方
            // "https://ethereum-sepolia.blockpi.network/v1/rpc/public",           // BlockPI
            process.env.SEPOLIA_RPC || "https://sepolia.infura.io/v3/e4b04da787284b48b51382d10172accb" // Infura放最后
        ],
        contracts: {
            token: "0x23251cC261550B27FbB53c8cb3505341705fFaEa",
            bridge: "0x8a1BC16541191A28103b050d8b93055aF5c06F0b"
        }
    },
    bscTestnet: {
        chainId: 97,
        name: "BSC Testnet",
        rpcUrls: [
            // "https://data-seed-prebsc-1-s1.binance.org:8545",                   // 官方
            // "https://bsc-testnet.public.blastapi.io",                           // Blast
            // "https://bsc-testnet-rpc.publicnode.com",                           // PublicNode
            // "https://endpoints.omniatech.io/v1/bsc/testnet/public",             // Omnia
            // "https://bsc-testnet.blockpi.network/v1/rpc/public",                // BlockPI
            process.env.BSC_TESTNET_RPC || "https://bsc-testnet.infura.io/v3/e4b04da787284b48b51382d10172accb" // Infura备用
        ],
        contracts: {
            token: "0x8924BC61E85315e8442f2feBDe2bd94231f9DeE0",
            bridge: "0x9D0c783314229D277e7e90ebAAd85078F9F4A9B2"
        }
    }
};

// 代币合约 ABI
const TOKEN_ABI = [
    "function transferFrom(address from, address to, uint256 amount) returns (bool)",
    "function allowance(address owner, address spender) view returns (uint256)",
    "function balanceOf(address account) view returns (uint256)",
    "function transfer(address to, uint256 amount) returns (bool)",
    "function mint(address to, uint256 amount)",
    "function burn(uint256 amount)",
    "function pause()",
    "function unpause()",
    "function paused() view returns (bool)",
    "function blockUser(address user)",
    "function unblockUser(address user)",
    "function blocked(address user) view returns (bool)",
    "function freeze(address user, uint256 amount)",
    "function frozen(address user) view returns (uint256)",
    "function availableBalance(address account) view returns (uint256)",

    // 事件定义
    "event Transfer(address indexed from, address indexed to, uint256 value)",
    "event Approval(address indexed owner, address indexed spender, uint256 value)",
    "event Paused(address account)",
    "event Unpaused(address account)",
    "event UserBlocked(address indexed user)",
    "event UserUnblocked(address indexed user)",
    "event TokensFrozen(address indexed user, uint256 amount)",
    "event TokensUnfrozen(address indexed user, uint256 amount)",

    // 新增：可能的其他事件
    "event RoleGranted(bytes32 indexed role, address indexed account, address indexed sender)",
    "event RoleRevoked(bytes32 indexed role, address indexed account, address indexed sender)",
    "event OwnershipTransferred(address indexed previousOwner, address indexed newOwner)"
];

// 桥合约 ABI
const BRIDGE_ABI = [
    "function sendMessage(uint64 destinationChainSelector, address receiver, uint256 amount) payable",
    "function getFee(uint64 destinationChainSelector, uint256 amount) view returns (uint256)",

    // 桥合约事件定义（与监控脚本保持一致）
    "event MessageSent(bytes32 indexed messageId, uint64 indexed destinationChainSelector, address receiver, address user, uint256 amount, uint256 fees)",
    "event MessageReceived(bytes32 indexed messageId, uint64 indexed sourceChainSelector, address sender, address user, uint256 amount)"
];

// 部署者私钥和地址
const DEPLOYER_PRIVATE_KEY = process.env.PRIVATE_KEY;
const DEPLOYER_ADDRESS = "0xe196efB0166Fa2351a736047C0935Ac9C456421B";

// 链选择器映射
const CHAIN_SELECTORS = {
    "16015286601757825753": "sepolia",
    "13264668187771770619": "bscTestnet"
};

// ✅ 网络特定配置 - 更保守的设置
const NETWORK_SPECIFIC_CONFIG = {
    sepolia: {
        blockTime: 12000,
        pollInterval: 45000,        // ✅ 增加到45秒
        maxBlocksPerQuery: 20       // ✅ 减少到20个区块
    },
    bscTestnet: {
        blockTime: 3000,
        pollInterval: 30000,        // ✅ 增加到30秒
        maxBlocksPerQuery: 30       // ✅ 减少到30个区块
    }
};

// ============== 🛠️ 工具函数 ==============

function logError(message, error) {
    const timestamp = new Date().toISOString();
    console.log(`[${timestamp}] ❌ ${message}`);
    console.log(`    🐛 错误: ${error.message}`);
    if (error.stack) {
        console.log(`    📍 堆栈: ${error.stack}`);
    }
}

function getChainName(chainSelector) {
    return CHAIN_SELECTORS[chainSelector.toString()] || "未知";
}

// ✅ 优化：创建更稳健的Provider连接
async function createRobustProvider(network) {
    const config = NETWORK_CONFIGS[network];
    if (!config) {
        throw new Error(`不支持的网络: ${network}`);
    }

    let lastError;
    for (let i = 0; i < config.rpcUrls.length; i++) {
        const rpcUrl = config.rpcUrls[i];
        try {
            console.log(`🔄 尝试连接 ${config.name} RPC [${i + 1}/${config.rpcUrls.length}]: ${rpcUrl.substring(0, 50)}...`);

            const provider = new ethers.JsonRpcProvider(rpcUrl);

            // ✅ 优化：设置更快的轮询间隔
            provider.pollingInterval = 8000; // 8秒 (原来15秒)

            // ✅ 优化：缩短连接超时时间
            const blockNumber = await Promise.race([
                provider.getBlockNumber(),
                new Promise((_, reject) =>
                    setTimeout(() => reject(new Error('连接超时')), 5000) // 5秒超时 (原来10秒)
                )
            ]);

            console.log(`   ✅ ${config.name} 连接成功，当前区块: ${blockNumber}`);
            return provider;

        } catch (error) {
            lastError = error;
            console.log(`   ❌ ${config.name} RPC 失败: ${error.message}`);
            continue;
        }
    }

    throw new Error(`${config.name} 所有RPC节点都不可用. 最后错误: ${lastError?.message}`);
}

// ============== 📁 日志函数 ==============

function saveTransferLog(logEntry) {
    try {
        const logDir = './logs';
        if (!fs.existsSync(logDir)) {
            fs.mkdirSync(logDir, { recursive: true });
        }

        const logFile = path.join(logDir, 'transfer.log');
        const logLine = JSON.stringify(logEntry) + '\n';

        fs.appendFileSync(logFile, logLine);
        console.log(`    📝 转账日志已保存: ${logEntry.txHash}`);
    } catch (error) {
        console.error('❌ 保存转账日志失败:', error);
    }
}

function saveEventLog(logEntry) {
    try {
        const logDir = './logs';
        if (!fs.existsSync(logDir)) {
            fs.mkdirSync(logDir, { recursive: true });
        }

        const logFile = path.join(logDir, 'events.log');
        const logLine = JSON.stringify(logEntry) + '\n';

        fs.appendFileSync(logFile, logLine);
    } catch (error) {
        console.error('❌ 保存事件日志失败:', error);
    }
}

function saveRedemptionLog(logEntry) {
    try {
        const logDir = './logs';
        if (!fs.existsSync(logDir)) {
            fs.mkdirSync(logDir, { recursive: true });
        }

        const logFile = path.join(logDir, 'redemptions.log');
        const logLine = JSON.stringify(logEntry) + '\n';

        fs.appendFileSync(logFile, logLine);
    } catch (error) {
        console.error('❌ 保存赎回日志失败:', error);
    }
}

function saveBridgeLog(logEntry) {
    try {
        const logDir = './logs';
        if (!fs.existsSync(logDir)) {
            fs.mkdirSync(logDir, { recursive: true });
        }

        const logFile = path.join(logDir, 'bridge.log');
        const logLine = JSON.stringify(logEntry) + '\n';

        fs.appendFileSync(logFile, logLine);
        console.log(`    📝 桥合约日志已保存`);
    } catch (error) {
        console.error('❌ 保存桥合约日志失败:', error);
    }
}

function saveAuthLog(logEntry) {
    try {
        const logDir = './logs';
        if (!fs.existsSync(logDir)) {
            fs.mkdirSync(logDir, { recursive: true });
        }

        const logFile = path.join(logDir, 'auth.log');
        const logLine = JSON.stringify(logEntry) + '\n';

        fs.appendFileSync(logFile, logLine);
        console.log(`    🔐 管理员操作日志已保存: ${logEntry.action} by ${logEntry.admin}`);
    } catch (error) {
        console.error('❌ 保存管理员日志失败:', error);
    }
}

// ============== 🎧 事件监听器类 ==============

class EventMonitor {
    constructor() {
        this.networks = {};
        this.isRunning = false;
        this.retryDelay = 15000; // ✅ 优化：减少重试延迟到15秒
        this.pollInterval = 8000; // ✅ 优化：减少轮询间隔到8秒
        this.maxBlocksPerQuery = 100; // ✅ 优化：增加每次查询区块数到100
        this.performanceStats = {}; // ✅ 新增：性能统计
        this.debugMode = process.env.DEBUG_EVENTS === 'true'; // ✅ 新增：调试模式
        this.apiStats = new Map(); // 新增：API统计
        this.rateLimitBackoff = new Map(); // ✅ 新增：速率限制退避跟踪
        this.lastRequestTime = new Map(); // ✅ 新增：请求时间跟踪

        // ✅ 新增：不同网络的特殊配置
        this.networkSpecificConfig = {
            bscTestnet: {
                pollInterval: 5000,      // BSC出块快，5秒轮询
                maxBlocksPerQuery: 150,  // BSC可以处理更多区块
                minRateLimit: 800        // BSC频率控制800ms
            },
            sepolia: {
                pollInterval: 12000,     // Sepolia出块慢，12秒轮询
                maxBlocksPerQuery: 50,   // Sepolia保持50个区块
                minRateLimit: 1500       // Sepolia频率控制1.5秒
            }
        };
    }

    // ✅ 新增：性能监控
    updatePerformanceStats(networkName, blocksProcessed, timeElapsed) {
        if (!this.performanceStats[networkName]) {
            this.performanceStats[networkName] = {
                totalBlocks: 0,
                totalTime: 0,
                avgBlocksPerSecond: 0
            };
        }

        const stats = this.performanceStats[networkName];
        stats.totalBlocks += blocksProcessed;
        stats.totalTime += timeElapsed;
        stats.avgBlocksPerSecond = stats.totalBlocks / (stats.totalTime / 1000);

        // 如果处理速度太慢，调整参数
        if (stats.avgBlocksPerSecond < 1 && blocksProcessed > 0) {
            console.log(`⚠️ ${networkName} 处理速度较慢 (${stats.avgBlocksPerSecond.toFixed(2)} blocks/s)，调整参数`);
            this.maxBlocksPerQuery = Math.max(10, this.maxBlocksPerQuery - 10);
            this.pollInterval = Math.min(60000, this.pollInterval + 5000);
        }
    }

    // ✅ 新增：智能速率限制处理
    handleRateLimitError(networkName, error) {
        const network = this.networks[networkName];
        if (!network) return;

        // 获取当前退避时间，默认从2分钟开始
        let currentBackoff = this.rateLimitBackoff.get(networkName) || 120000; // 2分钟

        if (error.message.includes("Too Many Requests") || error.code === -32005) {
            // 指数退避：每次失败时间翻倍，最大30分钟
            currentBackoff = Math.min(currentBackoff * 2, 1800000); // 最大30分钟
            this.rateLimitBackoff.set(networkName, currentBackoff);

            console.log(`⚠️ ${networkName} 速率限制，退避 ${Math.round(currentBackoff / 60000)} 分钟`);
            console.log(`   提示：访问 https://infura.io/dashboard 检查API使用情况`);

            // 切换到下一个RPC节点
            this.switchToNextRpcNode(networkName);

            return currentBackoff;
        }

        return 0;
    }

    // ✅ 新增：成功请求后重置退避时间
    resetRateLimitBackoff(networkName) {
        if (this.rateLimitBackoff.has(networkName)) {
            console.log(`✅ ${networkName} 速率限制恢复，重置退避时间`);
            this.rateLimitBackoff.delete(networkName);
        }
    }

    // ✅ 新增：切换RPC节点
    async switchToNextRpcNode(networkName) {
        const network = this.networks[networkName];
        if (!network) return;

        try {
            console.log(`🔄 ${networkName} 尝试切换RPC节点...`);

            // 重新初始化网络连接
            const config = NETWORK_CONFIGS[networkName];
            const newProvider = await createRobustProvider(networkName);

            // 更新provider，保持其他配置不变
            network.provider = newProvider;

            // 重新创建合约实例
            const deployerWallet = new ethers.Wallet(DEPLOYER_PRIVATE_KEY, newProvider);
            network.contract = new ethers.Contract(
                config.contracts.token,
                TOKEN_ABI,
                deployerWallet
            );
            network.bridgeContract = new ethers.Contract(
                config.contracts.bridge,
                BRIDGE_ABI,
                deployerWallet
            );

            console.log(`✅ ${networkName} RPC节点切换成功`);

        } catch (error) {
            console.log(`❌ ${networkName} RPC节点切换失败: ${error.message}`);
        }
    }

    // ✅ 优化：并行处理事件检查
    async checkEvents(networkName, fromBlock, toBlock) {
        const startTime = Date.now();

        try {
            // 并行检查代币和桥合约事件
            await Promise.all([
                this.checkTokenEvents(networkName, fromBlock, toBlock),
                this.checkBridgeEvents(networkName, fromBlock, toBlock)
            ]);

            const timeElapsed = Date.now() - startTime;
            const blocksProcessed = toBlock - fromBlock + 1;
            this.updatePerformanceStats(networkName, blocksProcessed, timeElapsed);

        } catch (error) {
            console.error(`❌ ${networkName} 事件检查失败:`, error.message);
            throw error;
        }
    }

    async start() {
        console.log("\n🎧 启动事件监听器...");
        this.isRunning = true;

        for (const [networkName, config] of Object.entries(NETWORK_CONFIGS)) {
            try {
                await this.initNetwork(networkName, config);
            } catch (error) {
                console.error(`❌ ${networkName} 初始化失败:`, error.message);
                // 延迟重试
                setTimeout(() => {
                    if (this.isRunning) {
                        this.initNetwork(networkName, config);
                    }
                }, this.retryDelay);
            }
        }

        // ✅ 每20分钟打印一次统计报告
        setInterval(() => {
            if (this.isRunning) {
                this.printApiStats();
            }
        }, 1200000); // 20分钟
    }

    // ✅ 新增：验证合约地址的方法
    async verifyContractAddress(provider, address, contractName, networkName) {
        try {
            const code = await provider.getCode(address);
            if (code === '0x') {
                console.log(`❌ ${networkName} ${contractName} 地址 ${address} 没有合约代码!`);
                return false;
            }
            console.log(`✅ ${networkName} ${contractName} 地址验证成功: ${address}`);
            return true;
        } catch (error) {
            console.log(`❌ ${networkName} ${contractName} 地址验证失败:`, error.message);
            return false;
        }
    }

    // 在initNetwork中添加验证
    async initNetwork(networkName, config) {
        try {
            console.log(`📡 初始化 ${config.name}...`);

            const provider = await createRobustProvider(networkName);

            // ✅ 验证合约地址
            const tokenValid = await this.verifyContractAddress(provider, config.contracts.token, 'Token', networkName);
            const bridgeValid = await this.verifyContractAddress(provider, config.contracts.bridge, 'Bridge', networkName);

            if (!tokenValid || !bridgeValid) {
                throw new Error(`${networkName} 合约地址验证失败`);
            }

            const deployerWallet = new ethers.Wallet(DEPLOYER_PRIVATE_KEY, provider);

            const contract = new ethers.Contract(
                config.contracts.token,
                TOKEN_ABI,
                deployerWallet
            );

            const bridgeContract = new ethers.Contract(
                config.contracts.bridge,
                BRIDGE_ABI,
                deployerWallet
            );

            const lastBlock = await provider.getBlockNumber();

            // ✅ 网络特定配置
            const networkConfig = NETWORK_SPECIFIC_CONFIG[networkName] || {
                blockTime: 12000,
                pollInterval: 15000,
                maxBlocksPerQuery: 50
            };

            this.networks[networkName] = {
                provider,
                contract,
                bridgeContract,
                config,
                lastBlock,
                errorCount: 0,
                pollTimer: null,
                networkConfig // ✅ 保存网络特定配置
            };

            console.log(`✅ ${networkName} 初始化完成`);
            console.log(`   合约地址: ${config.contracts.token}`);
            console.log(`   桥地址: ${config.contracts.bridge}`);
            console.log(`   当前区块: ${lastBlock}`);
            console.log(`   轮询间隔: ${networkConfig.pollInterval}ms`);

            // 开始轮询
            this.startPolling(networkName);

        } catch (error) {
            console.error(`❌ ${networkName} 初始化失败:`, error.message);
            // 延迟重试
            setTimeout(() => {
                if (this.isRunning) {
                    this.initNetwork(networkName, config);
                }
            }, this.retryDelay);
        }
    }

    startPolling(networkName) {
        const network = this.networks[networkName];
        if (!network) return;

        // ✅ 获取网络特定配置
        const networkConfig = this.networkSpecificConfig[networkName] || {
            pollInterval: this.pollInterval,
            maxBlocksPerQuery: this.maxBlocksPerQuery,
            minRateLimit: 2000
        };

        const poll = async () => {
            if (!this.isRunning) return;

            try {
                const currentBlock = await network.provider.getBlockNumber();

                if (currentBlock > network.lastBlock) {
                    const fromBlock = network.lastBlock + 1;
                    const backlog = currentBlock - network.lastBlock;

                    // ✅ 动态调整区块数量：积压多时处理更多区块
                    let maxBlocks = networkConfig.maxBlocksPerQuery;
                    if (backlog > 200) {
                        maxBlocks = Math.min(maxBlocks * 2, 300); // 积压很多时翻倍处理
                    } else if (backlog > 100) {
                        maxBlocks = Math.min(maxBlocks * 1.5, 200); // 积压较多时1.5倍处理
                    }

                    const toBlock = Math.min(currentBlock, fromBlock + maxBlocks - 1);

                    console.log(`🔍 ${networkName} 检查区块 ${fromBlock}-${toBlock} (积压: ${backlog})`);

                    // ✅ 分离检查，避免批量请求
                    await this.checkTokenEventsWithRetry(networkName, fromBlock, toBlock);

                    // ✅ 使用网络特定的短暂延迟
                    const interEventDelay = networkName === 'bscTestnet' ? 500 : 1000;
                    await new Promise(resolve => setTimeout(resolve, interEventDelay));

                    await this.checkBridgeEventsWithRetry(networkName, fromBlock, toBlock);

                    network.lastBlock = toBlock;
                    network.errorCount = 0;

                    // ✅ 成功后重置速率限制退避
                    this.resetRateLimitBackoff(networkName);
                }

            } catch (error) {
                console.error(`❌ ${networkName} 轮询失败:`, error.message);
                network.errorCount++;

                // ✅ 处理速率限制
                const backoffTime = this.handleRateLimitError(networkName, error);
                if (backoffTime > 0) {
                    setTimeout(() => poll(), backoffTime);
                    return;
                }

                // ✅ 处理其他错误
                if (network.errorCount >= 3) {
                    const delayTime = Math.min(network.errorCount * 15000, 180000); // ✅ 优化：最大3分钟
                    console.log(`⚠️ ${networkName} 连续错误 ${network.errorCount} 次，暂停 ${Math.round(delayTime / 60000)} 分钟`);
                    setTimeout(() => poll(), delayTime);
                    return;
                }
            }

            // ✅ 智能轮询间隔调整
            let pollInterval = networkConfig.pollInterval;

            // 根据积压情况动态调整轮询间隔
            try {
                const currentBlock = await network.provider.getBlockNumber();
                const backlog = currentBlock - network.lastBlock;

                if (backlog > 200) {
                    // 积压严重，立即再次轮询
                    pollInterval = 1000;
                } else if (backlog > 100) {
                    // 积压较多，缩短轮询间隔
                    pollInterval = Math.floor(networkConfig.pollInterval * 0.5);
                } else if (backlog > 50) {
                    // 有一定积压，保持正常间隔
                    pollInterval = networkConfig.pollInterval;
                } else if (backlog < 5) {
                    // 积压很少，可以放慢轮询
                    pollInterval = Math.floor(networkConfig.pollInterval * 1.5);
                }
            } catch (e) {
                // 忽略检查错误，使用默认间隔
            }

            network.pollTimer = setTimeout(() => poll(), pollInterval);
        };

        // 立即开始第一次检查
        poll();
    }

    // ✅ 新增：带重试的事件检查
    async checkTokenEventsWithRetry(networkName, fromBlock, toBlock, maxRetries = 3) {
        for (let attempt = 1; attempt <= maxRetries; attempt++) {
            try {
                await this.checkTokenEvents(networkName, fromBlock, toBlock);
                return; // 成功则退出
            } catch (error) {
                console.log(`⚠️ ${networkName} 代币事件检查失败 (尝试 ${attempt}/${maxRetries}): ${error.message}`);

                if (error.message.includes("Too Many Requests")) {
                    throw error; // 速率限制错误向上传播
                }

                if (attempt < maxRetries) {
                    // 指数退避重试
                    const delay = Math.pow(2, attempt) * 1000; // 2s, 4s, 8s
                    await new Promise(resolve => setTimeout(resolve, delay));
                } else {
                    throw error; // 最后一次尝试失败
                }
            }
        }
    }

    async checkBridgeEventsWithRetry(networkName, fromBlock, toBlock, maxRetries = 3) {
        for (let attempt = 1; attempt <= maxRetries; attempt++) {
            try {
                await this.checkBridgeEvents(networkName, fromBlock, toBlock);
                return;
            } catch (error) {
                console.log(`⚠️ ${networkName} 桥事件检查失败 (尝试 ${attempt}/${maxRetries}): ${error.message}`);

                if (error.message.includes("Too Many Requests")) {
                    throw error;
                }

                if (attempt < maxRetries) {
                    const delay = Math.pow(2, attempt) * 1000;
                    await new Promise(resolve => setTimeout(resolve, delay));
                } else {
                    throw error;
                }
            }
        }
    }

    // ✅ 新增：智能请求频率控制
    async enforceRateLimit(networkName, customInterval = null) {
        const networkConfig = this.networkSpecificConfig[networkName] || { minRateLimit: 2000 };
        const minInterval = customInterval || networkConfig.minRateLimit;
        const lastTime = this.lastRequestTime.get(networkName) || 0;
        const now = Date.now();
        const elapsed = now - lastTime;

        if (elapsed < minInterval) {
            const waitTime = minInterval - elapsed;
            console.log(`⏱️ ${networkName} 频率控制，等待 ${waitTime}ms`);
            await new Promise(resolve => setTimeout(resolve, waitTime));
        }

        this.lastRequestTime.set(networkName, Date.now());
    }

    async checkTokenEvents(networkName, fromBlock, toBlock) {
        // ✅ 使用网络特定的频率控制
        await this.enforceRateLimit(networkName);

        const network = this.networks[networkName];
        const deployerAddress = DEPLOYER_ADDRESS.toLowerCase();
        const bridgeAddress = network.config.contracts.bridge.toLowerCase();

        try {
            const logs = await network.provider.getLogs({
                address: network.config.contracts.token,
                fromBlock,
                toBlock
            });

            for (const log of logs) {
                try {
                    const parsed = network.contract.interface.parseLog(log);

                    // ✅ 修复：检查 parsed 是否为 null
                    if (!parsed) {
                        console.log(`⚠️ ${networkName} 无法解析的代币事件 (可能是未知事件类型)`);
                        console.log(`   交易: ${log.transactionHash}`);
                        console.log(`   主题: ${log.topics[0]}`);
                        continue; // 跳过无法解析的事件
                    }

                    // ✅ 修复：添加更详细的事件类型检查
                    switch (parsed.name) {
                        case "Transfer":
                            await this.processTransferEvent(parsed.args[0], parsed.args[1], parsed.args[2], { log }, networkName);
                            break;
                        case "Approval":
                            await this.processApprovalEvent(parsed.args[0], parsed.args[1], parsed.args[2], { log }, networkName);
                            break;
                        case "Paused":
                            const pauseLog = {
                                type: "AdminAction",
                                action: "pause",
                                network: networkName,
                                admin: parsed.args[0],
                                txHash: log.transactionHash,
                                blockNumber: log.blockNumber,
                                timestamp: new Date().toISOString(),
                                description: `合约已暂停 by ${parsed.args[0]}`
                            };
                            console.log(`⏸️ ${networkName} 合约已暂停 by ${parsed.args[0]}`);
                            console.log(`   交易: ${log.transactionHash}`);
                            saveAuthLog(pauseLog);
                            break;
                        case "Unpaused":
                            const unpauseLog = {
                                type: "AdminAction",
                                action: "unpause",
                                network: networkName,
                                admin: parsed.args[0],
                                txHash: log.transactionHash,
                                blockNumber: log.blockNumber,
                                timestamp: new Date().toISOString(),
                                description: `合约已恢复 by ${parsed.args[0]}`
                            };
                            console.log(`▶️ ${networkName} 合约已恢复 by ${parsed.args[0]}`);
                            console.log(`   交易: ${log.transactionHash}`);
                            saveAuthLog(unpauseLog);
                            break;
                        case "UserBlocked":
                            const blockLog = {
                                type: "AdminAction",
                                action: "blockUser",
                                network: networkName,
                                admin: "system", // 需要从交易获取实际执行者
                                targetUser: parsed.args[0],
                                txHash: log.transactionHash,
                                blockNumber: log.blockNumber,
                                timestamp: new Date().toISOString(),
                                description: `用户被拉黑: ${parsed.args[0]}`
                            };
                            console.log(`🚫 ${networkName} 用户被拉黑: ${parsed.args[0]}`);
                            console.log(`   交易: ${log.transactionHash}`);
                            saveAuthLog(blockLog);
                            break;
                        case "UserUnblocked":
                            const unblockLog = {
                                type: "AdminAction",
                                action: "unblockUser",
                                network: networkName,
                                admin: "system", // 需要从交易获取实际执行者
                                targetUser: parsed.args[0],
                                txHash: log.transactionHash,
                                blockNumber: log.blockNumber,
                                timestamp: new Date().toISOString(),
                                description: `用户解除拉黑: ${parsed.args[0]}`
                            };
                            console.log(`✅ ${networkName} 用户解除拉黑: ${parsed.args[0]}`);
                            console.log(`   交易: ${log.transactionHash}`);
                            saveAuthLog(unblockLog);
                            break;
                        case "TokensFrozen":
                            const freezeLog = {
                                type: "AdminAction",
                                action: "freezeTokens",
                                network: networkName,
                                admin: "system", // 需要从交易获取实际执行者
                                targetUser: parsed.args[0],
                                amount: ethers.formatEther(parsed.args[1]),
                                txHash: log.transactionHash,
                                blockNumber: log.blockNumber,
                                timestamp: new Date().toISOString(),
                                description: `资金冻结: ${parsed.args[0]}, 金额: ${ethers.formatEther(parsed.args[1])} XD`
                            };
                            console.log(`🧊 ${networkName} 资金冻结: ${parsed.args[0]}, 金额: ${ethers.formatEther(parsed.args[1])} XD`);
                            console.log(`   交易: ${log.transactionHash}`);
                            saveAuthLog(freezeLog);
                            break;
                        case "TokensUnfrozen":
                            const unfreezeLog = {
                                type: "AdminAction",
                                action: "unfreezeTokens",
                                network: networkName,
                                admin: "system", // 需要从交易获取实际执行者
                                targetUser: parsed.args[0],
                                amount: ethers.formatEther(parsed.args[1]),
                                txHash: log.transactionHash,
                                blockNumber: log.blockNumber,
                                timestamp: new Date().toISOString(),
                                description: `资金解冻: ${parsed.args[0]}, 金额: ${ethers.formatEther(parsed.args[1])} XD`
                            };
                            console.log(`🔥 ${networkName} 资金解冻: ${parsed.args[0]}, 金额: ${ethers.formatEther(parsed.args[1])} XD`);
                            console.log(`   交易: ${log.transactionHash}`);
                            saveAuthLog(unfreezeLog);
                            break;
                        default:
                            console.log(`❓ ${networkName} 未处理的事件类型: ${parsed.name}`);
                            console.log(`   交易: ${log.transactionHash}`);
                            console.log(`   参数:`, parsed.args);
                            break;
                    }

                } catch (parseError) {
                    // ✅ 修复：更详细的错误信息
                    console.log(`⚠️ ${networkName} 代币事件解析失败: ${parseError.message}`);
                    console.log(`   交易: ${log.transactionHash}`);
                    console.log(`   区块: ${log.blockNumber}`);
                    console.log(`   日志索引: ${log.logIndex}`);
                    console.log(`   主题0: ${log.topics[0]}`);
                    // 不要让单个解析错误影响其他事件的处理
                }
            }

        } catch (error) {
            if (error.message.includes("Too Many Requests")) {
                throw error; // 向上传播速率限制错误
            }
            console.error(`❌ ${networkName} 代币事件查询失败:`, error.message);
        }
    }

    async checkBridgeEvents(networkName, fromBlock, toBlock) {
        // ✅ 使用网络特定的频率控制
        await this.enforceRateLimit(networkName);

        const network = this.networks[networkName];

        try {
            const logs = await network.provider.getLogs({
                address: network.config.contracts.bridge,
                fromBlock,
                toBlock
            });

            for (const log of logs) {
                try {
                    const parsed = network.bridgeContract.interface.parseLog(log);

                    if (parsed.name === "MessageSent") {
                        await this.processBridgeMessageSent(
                            parsed.args[0], parsed.args[1], parsed.args[2],
                            parsed.args[3], parsed.args[4], parsed.args[5],
                            { log }, networkName
                        );
                    } else if (parsed.name === "MessageReceived") {
                        await this.processBridgeMessageReceived(
                            parsed.args[0], parsed.args[1], parsed.args[2],
                            parsed.args[3], parsed.args[4],
                            { log }, networkName
                        );
                    }

                } catch (parseError) {
                    console.log(`⚠️ ${networkName} 桥事件解析失败:`, parseError.message);
                }
            }

        } catch (error) {
            if (error.message.includes("Too Many Requests")) {
                throw error;
            }
            console.error(`❌ ${networkName} 桥事件查询失败:`, error.message);
        }
    }

    async processTransferEvent(from, to, value, event, networkName) {
        const amount = ethers.formatEther(value);
        const txHash = event.log.transactionHash;
        const blockNumber = event.log.blockNumber;
        const timestamp = new Date().toISOString();
        const deployerAddress = DEPLOYER_ADDRESS.toLowerCase();
        const bridgeAddress = this.networks[networkName].config.contracts.bridge.toLowerCase();

        console.log(`\n📤 [${networkName.toUpperCase()}] Transfer 事件:`);
        console.log(`   时间: ${timestamp}`);
        console.log(`   From: ${from}`);
        console.log(`   To: ${to}`);
        console.log(`   金额: ${amount} XD`);
        console.log(`   交易: ${txHash}`);

        try {
            // 获取交易详情来判断真实发起者
            const tx = await this.networks[networkName].provider.getTransaction(txHash);
            const actualSender = tx.from.toLowerCase();

            console.log(`   发起者: ${tx.from}`);

            let transferType = "普通转账";
            let isRedemption = false;

            // 判断转账类型
            if (to.toLowerCase() === "0x0000000000000000000000000000000000000000") {
                // burn事件
                if (actualSender === bridgeAddress) {
                    transferType = "跨链发送 (桥合约burn)";
                } else {
                    transferType = "销毁";
                }
            } else if (from.toLowerCase() === "0x0000000000000000000000000000000000000000") {
                // mint事件  
                if (actualSender === bridgeAddress) {
                    transferType = "跨链接收 (桥合约mint)";
                } else if (actualSender === deployerAddress) {
                    transferType = "铸币";
                }
            } else if (actualSender === deployerAddress && actualSender !== from.toLowerCase()) {
                transferType = "代理转账";
            } else if (to.toLowerCase() === deployerAddress) {
                transferType = "赎回申请";
                isRedemption = true;
            }

            console.log(`   类型: ${transferType}`);

            // 保存转账日志
            const transferLog = {
                type: transferType,
                network: networkName,
                from,
                to,
                amount,
                actualSender: tx.from,
                txHash,
                blockNumber,
                timestamp,
                gasPrice: tx.gasPrice?.toString(),
                gasUsed: "pending"
            };

            saveTransferLog(transferLog);

            // 保存事件日志
            const eventLog = {
                type: "Transfer",
                subType: transferType,
                network: networkName,
                from,
                to,
                amount,
                txHash,
                blockNumber,
                timestamp
            };

            saveEventLog(eventLog);

            // 如果是跨链相关，记录到bridge.log
            if (transferType.includes("跨链")) {
                saveBridgeLog({
                    type: transferType,
                    network: networkName,
                    from,
                    to,
                    amount,
                    actualSender: tx.from,
                    txHash,
                    blockNumber,
                    timestamp
                });
            }

            // 自动赎回处理
            if (isRedemption) {
                await this.processRedemption(from, value, amount, txHash, networkName);
            }

        } catch (error) {
            logError(`${networkName} Transfer事件处理失败`, error);
        }
    }

    async processApprovalEvent(owner, spender, value, event, networkName) {
        const amount = ethers.formatEther(value);
        const txHash = event.log.transactionHash;
        const timestamp = new Date().toISOString();

        console.log(`\n✅ [${networkName.toUpperCase()}] Approval 事件:`);
        console.log(`   时间: ${timestamp}`);
        console.log(`   Owner: ${owner}`);
        console.log(`   Spender: ${spender}`);
        console.log(`   金额: ${amount} XD`);
        console.log(`   交易: ${txHash}`);

        // 保存事件日志
        const eventLog = {
            type: "Approval",
            network: networkName,
            owner,
            spender,
            amount,
            txHash,
            blockNumber: event.log.blockNumber,
            timestamp
        };

        saveEventLog(eventLog);
    }

    async processBridgeMessageSent(messageId, destinationChainSelector, receiver, user, amount, fees, event, networkName) {
        const formattedAmount = ethers.formatEther(amount);
        const formattedFees = ethers.formatEther(fees);
        const destChain = getChainName(destinationChainSelector);
        const txHash = event.log.transactionHash;
        const timestamp = new Date().toISOString();

        console.log(`\n🌉 [${networkName.toUpperCase()}] 跨链发送 MessageSent:`);
        console.log(`   时间: ${timestamp}`);
        console.log(`   MessageID: ${messageId}`);
        console.log(`   用户: ${user}`);
        console.log(`   目标: ${receiver}`);
        console.log(`   金额: ${formattedAmount} XD`);
        console.log(`   目标链: ${destChain}`);
        console.log(`   手续费: ${formattedFees} ETH`);
        console.log(`   交易: ${txHash}`);

        // 保存桥合约日志
        const bridgeLog = {
            type: "MessageSent",
            network: networkName,
            messageId,
            destinationChainSelector: destinationChainSelector.toString(),
            destinationChain: destChain,
            user,
            receiver,
            amount: formattedAmount,
            fees: formattedFees,
            txHash,
            blockNumber: event.log.blockNumber,
            timestamp
        };

        saveBridgeLog(bridgeLog);

        // 保存事件日志
        const eventLog = {
            type: "BridgeMessageSent",
            network: networkName,
            messageId,
            destinationChain: destChain,
            user,
            amount: formattedAmount,
            txHash,
            blockNumber: event.log.blockNumber,
            timestamp
        };

        saveEventLog(eventLog);
    }

    async processBridgeMessageReceived(messageId, sourceChainSelector, sender, user, amount, event, networkName) {
        const formattedAmount = ethers.formatEther(amount);
        const sourceChain = getChainName(sourceChainSelector);
        const txHash = event.log.transactionHash;
        const timestamp = new Date().toISOString();

        console.log(`\n🌉 [${networkName.toUpperCase()}] 跨链接收 MessageReceived:`);
        console.log(`   时间: ${timestamp}`);
        console.log(`   MessageID: ${messageId}`);
        console.log(`   用户: ${user}`);
        console.log(`   发送方: ${sender}`);
        console.log(`   金额: ${formattedAmount} XD`);
        console.log(`   来源链: ${sourceChain}`);
        console.log(`   交易: ${txHash}`);

        // 保存桥合约日志
        const bridgeLog = {
            type: "MessageReceived",
            network: networkName,
            messageId,
            sourceChainSelector: sourceChainSelector.toString(),
            sourceChain,
            sender,
            user,
            amount: formattedAmount,
            txHash,
            blockNumber: event.log.blockNumber,
            timestamp
        };

        saveBridgeLog(bridgeLog);

        // 保存事件日志
        const eventLog = {
            type: "BridgeMessageReceived",
            network: networkName,
            sourceChain,
            user,
            amount: formattedAmount,
            txHash,
            blockNumber: event.log.blockNumber,
            timestamp
        };

        saveEventLog(eventLog);
    }

    async processRedemption(userAddress, tokenAmount, formattedAmount, txHash, networkName) {
        console.log(`\n💰 [${networkName.toUpperCase()}] 检测到赎回申请:`);
        console.log(`   用户: ${userAddress}`);
        console.log(`   金额: ${formattedAmount} XD`);
        console.log(`   交易: ${txHash}`);

        try {
            // 获取网络配置
            const network = this.networks[networkName];
            const deployerWallet = new ethers.Wallet(DEPLOYER_PRIVATE_KEY, network.provider);

            // ✅ 添加余额检查
            const balance = await deployerWallet.provider.getBalance(deployerWallet.address);
            const balanceEth = ethers.formatEther(balance);
            console.log(`   💰 部署者余额: ${balanceEth} ${networkName === 'bscTestnet' ? 'BNB' : 'ETH'}`);

            if (balance === 0n) {
                throw new Error(`部署者地址余额不足，请充值 ${networkName === 'bscTestnet' ? 'tBNB' : 'SepoliaETH'}`);
            }

            const contract = new ethers.Contract(
                network.config.contracts.token,
                TOKEN_ABI,
                deployerWallet
            );

            console.log(`   🔥 正在销毁用户的 ${formattedAmount} XD 代币...`);

            // ✅ 优化Gas配置 - 针对不同网络设置不同参数
            let gasConfig;
            if (networkName === 'bscTestnet') {
                // BSC网络需要更高的gas limit和指定gas price
                const gasPrice = await deployerWallet.provider.getFeeData();
                gasConfig = {
                    gasLimit: 200000,  // ✅ 增加到20万
                    gasPrice: gasPrice.gasPrice || ethers.parseUnits('10', 'gwei') // ✅ 设置gasPrice
                };
            } else {
                // Sepolia网络
                gasConfig = {
                    gasLimit: 150000  // ✅ 适当增加
                };
            }

            console.log(`   ⚙️ Gas配置: gasLimit=${gasConfig.gasLimit}, gasPrice=${gasConfig.gasPrice ? ethers.formatUnits(gasConfig.gasPrice, 'gwei') + ' gwei' : 'auto'}`);

            // 销毁相应数量的代币
            const burnTx = await contract.burn(tokenAmount, gasConfig);

            console.log(`   ⏳ 销毁交易已提交: ${burnTx.hash}`);
            console.log(`   ⏳ 等待交易确认...`);

            const burnReceipt = await burnTx.wait();

            if (burnReceipt.status === 1) {
                console.log(`   ✅ 代币销毁成功!`);
                console.log(`   💸 模拟法币退款: ${formattedAmount} USD 到用户账户`);

                // 调用法币退款
                await this.creditFiatToUser(userAddress, formattedAmount, {
                    originalTxHash: txHash,
                    burnTxHash: burnTx.hash,
                    network: networkName,
                    timestamp: new Date().toISOString()
                });

                // 保存赎回日志
                const redemptionLog = {
                    userAddress,
                    amount: formattedAmount,
                    originalTxHash: txHash,
                    burnTxHash: burnTx.hash,
                    network: networkName,
                    status: "completed",
                    timestamp: new Date().toISOString(),
                    gasUsed: burnReceipt.gasUsed.toString()
                };

                saveRedemptionLog(redemptionLog);

            } else {
                throw new Error("销毁交易失败");
            }

        } catch (error) {
            logError(`${networkName} 自动赎回处理失败`, error);

            // 保存失败日志
            const redemptionLog = {
                userAddress,
                amount: formattedAmount,
                originalTxHash: txHash,
                burnTxHash: null,
                network: networkName,
                status: "failed",
                error: error.message,
                timestamp: new Date().toISOString()
            };

            saveRedemptionLog(redemptionLog);
        }
    }

    async creditFiatToUser(userAddress, amount, metadata) {
        console.log(`\n💳 法币退款处理:`);
        console.log(`   用户地址: ${userAddress}`);
        console.log(`   金额: ${amount} USD`);
        console.log(`   元数据:`, metadata);

        // 这里应该调用实际的法币系统API
        // 目前只是模拟
        console.log(`   ✅ 法币退款完成 (模拟)`);
    }

    stop() {
        console.log("⏹️ 停止事件监听器...");
        this.isRunning = false;

        // 清理所有定时器
        for (const [networkName, network] of Object.entries(this.networks)) {
            if (network.pollTimer) {
                clearTimeout(network.pollTimer);
                console.log(`📴 清理 ${networkName} 轮询定时器`);
            }
        }

        this.networks = {};
    }

    // ✅ 新增：动态调整轮询频率的方法
    adjustPollingFrequency(networkName, isHighActivity = false) {
        const network = this.networks[networkName];
        if (!network) return;

        if (isHighActivity) {
            // 高活动期间：5秒轮询，每次100个区块
            this.pollInterval = 5000;
            this.maxBlocksPerQuery = 100;
            console.log(`⚡ ${networkName} 切换到高频模式: 5秒轮询`);
        } else {
            // 正常期间：15秒轮询，每次50个区块  
            this.pollInterval = 15000;
            this.maxBlocksPerQuery = 50;
            console.log(`🔄 ${networkName} 切换到正常模式: 15秒轮询`);
        }
    }

    // ✅ 新增：检测高活动期间
    async detectHighActivity(networkName) {
        const network = this.networks[networkName];
        if (!network) return false;

        try {
            const currentBlock = await network.provider.getBlockNumber();
            const blocksToCheck = Math.min(10, currentBlock - network.lastBlock);

            if (blocksToCheck > 5) {
                // 如果积压了5个以上区块，认为是高活动期间
                return true;
            }
        } catch (error) {
            // 忽略检测错误
        }

        return false;
    }

    // ✅ 新增：调试未知事件的方法
    debugUnknownEvent(log, networkName) {
        if (!this.debugMode) return;

        console.log(`🔍 [DEBUG] ${networkName} 未知事件详情:`);
        console.log(`   合约地址: ${log.address}`);
        console.log(`   交易哈希: ${log.transactionHash}`);
        console.log(`   区块号: ${log.blockNumber}`);
        console.log(`   日志索引: ${log.logIndex}`);
        console.log(`   主题数量: ${log.topics.length}`);
        log.topics.forEach((topic, index) => {
            console.log(`   主题${index}: ${topic}`);
        });
        if (log.data && log.data !== '0x') {
            console.log(`   数据: ${log.data}`);
        }
    }

    // ✅ 新增：更新API统计
    updateApiStats(networkName, success = true) {
        if (!this.apiStats.has(networkName)) {
            this.apiStats.set(networkName, {
                totalRequests: 0,
                successCount: 0,
                errorCount: 0,
                rateLimitCount: 0,
                lastError: null,
                lastSuccess: null
            });
        }

        const stats = this.apiStats.get(networkName);
        stats.totalRequests++;

        if (success) {
            stats.successCount++;
            stats.lastSuccess = new Date().toISOString();
        } else {
            stats.errorCount++;
            stats.lastError = new Date().toISOString();
        }
    }

    // ✅ 新增：打印统计报告
    printApiStats() {
        console.log(`\n📊 API使用统计报告:`);
        for (const [networkName, stats] of this.apiStats.entries()) {
            const successRate = ((stats.successCount / stats.totalRequests) * 100).toFixed(1);
            console.log(`   ${networkName}:`);
            console.log(`      总请求: ${stats.totalRequests}`);
            console.log(`      成功率: ${successRate}%`);
            console.log(`      错误数: ${stats.errorCount}`);
            console.log(`      速率限制: ${stats.rateLimitCount}`);

            if (successRate < 80) {
                console.log(`      ⚠️ 成功率过低，建议检查RPC配置`);
            }
        }
    }
}

// ============== 🚀 启动事件监听器 ==============

let monitor = null;

function startEventMonitor() {
    if (monitor) {
        console.log("⚠️ 事件监听器已在运行中");
        return monitor;
    }

    monitor = new EventMonitor();
    monitor.start().catch(error => {
        console.error("❌ 事件监听器启动失败:", error);
        monitor = null;
    });

    return monitor;
}

function stopEventMonitor() {
    if (monitor) {
        monitor.stop();
        monitor = null;
        console.log("✅ 事件监听器已停止");
    } else {
        console.log("⚠️ 事件监听器未运行");
    }
}

function getEventMonitorStatus() {
    if (!monitor) {
        return { status: "stopped", networks: {} };
    }

    const networks = {};
    for (const [networkName, network] of Object.entries(monitor.networks)) {
        networks[networkName] = {
            lastBlock: network.lastBlock,
            errorCount: network.errorCount,
            isConnected: !!network.provider
        };
    }

    return {
        status: monitor.isRunning ? "running" : "stopped",
        networks
    };
}

// 优雅退出处理
process.on('SIGINT', () => {
    console.log('\n👋 收到退出信号，正在关闭事件监听器...');
    stopEventMonitor();
    process.exit(0);
});

process.on('SIGTERM', () => {
    console.log('\n👋 收到终止信号，正在关闭事件监听器...');
    stopEventMonitor();
    process.exit(0);
});

// 导出模块
module.exports = {
    startEventMonitor,
    stopEventMonitor,
    getEventMonitorStatus,
    EventMonitor
};

// 如果直接运行此文件，则启动监听器
if (require.main === module) {
    console.log("🎧 优化版事件监听器启动");
    console.log("   - 监听频率: 每15秒 (高活动时5秒)");
    console.log("   - 区块范围: 每次最多50个区块");
    console.log("   - 错误重试: 30秒延迟");
    console.log("   - 速率限制: 2分钟延迟");
    console.log("   - 连接超时: 5秒");
    console.log("   - 日志文件: ./logs/*.log");
    console.log("   - 性能监控: 已启用");

    startEventMonitor();
} 