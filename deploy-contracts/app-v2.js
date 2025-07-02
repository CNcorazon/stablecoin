const express = require("express");
const cors = require("cors");
const { ethers } = require("hardhat");
require("dotenv/config");
const axios = require("axios");
const path = require('path');
const fs = require('fs');

const app = express();

app.use(cors({
    origin: function (origin, callback) {
        // 允许来自前端容器的请求（无origin）和外部请求
        if (!origin || origin.includes('localhost') || process.env.NODE_ENV === 'production') {
            callback(null, true);
        } else {
            callback(null, false);
        }
    },
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: true
}));

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const PORT = process.env.PORT || 3000;

// 改进的多网络配置
const NETWORK_CONFIGS = {
    sepolia: {
        chainId: 11155111,
        name: "Sepolia",
        rpcUrls: [
            process.env.SEPOLIA_RPC || "https://sepolia.infura.io/v3/e4b04da787284b48b51382d10172accb",
            "https://rpc.sepolia.org",
            "https://eth-sepolia.public.blastapi.io",
            "https://sepolia.gateway.tenderly.co"
        ],
        contracts: {
            token: "0x23251cC261550B27FbB53c8cb3505341705fFaEa",
            bridge: "0x8a1BC16541191A28103b050d8b93055aF5c06F0b",
            accessManager: "0xf1c5d6dBC7229DcaEB2E828d7b7EE85C29074B52"
        }
    },
    bscTestnet: {
        chainId: 97,
        name: "BSC Testnet",
        rpcUrls: [
            // "https://bsc-testnet.publicnode.com",
            "https://bsc-testnet.infura.io/v3/e4b04da787284b48b51382d10172accb"
        ],
        contracts: {
            token: "0x8924BC61E85315e8442f2feBDe2bd94231f9DeE0",
            bridge: "0x9D0c783314229D277e7e90ebAAd85078F9F4A9B2",
            accessManager: "0x6a52bcA908FC39204EfcEF0e7204b2Bcb2a0e0be"
        }
    }
};

// 部署者私钥
const DEPLOYER_PRIVATE_KEY = process.env.PRIVATE_KEY || process.env.DEPLOYER_PRIVATE_KEY;

// 连接缓存
const providerCache = new Map();
const contractCache = new Map();

// 统一的日志函数
function logRequest(method, endpoint, params = {}) {
    const timestamp = new Date().toISOString();
    console.log(`[${timestamp}] 📨 ${method} ${endpoint}`);
    if (Object.keys(params).length > 0) {
        console.log(`    📋 参数:`, JSON.stringify(params, null, 2));
    }
}

function logSuccess(message, data = {}) {
    const timestamp = new Date().toISOString();
    console.log(`[${timestamp}] ✅ ${message}`);
    if (Object.keys(data).length > 0) {
        console.log(`    📊 结果:`, JSON.stringify(data, null, 2));
    }
}

function logError(message, error) {
    const timestamp = new Date().toISOString();
    console.log(`[${timestamp}] ❌ ${message}`);
    console.log(`    🐛 错误:`, error.message);
    if (error.stack) {
        console.log(`    📍 堆栈:`, error.stack.split('\n').slice(0, 3).join('\n'));
    }
}

// TOKEN_ABI
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
    "function totalSupply() view returns (uint256)"
];

// 桥合约 ABI
const BRIDGE_ABI = [
    "function sendMessage(uint64 destinationChainSelector, address receiver, uint256 amount) payable",
    "function getFee(uint64 destinationChainSelector, uint256 amount) view returns (uint256)"
];

// 创建带重试机制的 Provider
async function createRobustProvider(network) {
    const cacheKey = network;
    if (providerCache.has(cacheKey)) {
        return providerCache.get(cacheKey);
    }

    const config = NETWORK_CONFIGS[network];
    if (!config) {
        throw new Error(`不支持的网络: ${network}`);
    }

    let provider = null;
    let lastError = null;

    console.log(`🔄 尝试连接 ${config.name}...`);

    for (const rpcUrl of config.rpcUrls) {
        try {
            console.log(`    🔗 测试 RPC: ${rpcUrl}`);

            const tempProvider = new ethers.JsonRpcProvider(rpcUrl, {
                chainId: config.chainId,
                name: config.name
            });

            tempProvider.pollingInterval = 15000;

            const networkInfo = await Promise.race([
                tempProvider.getNetwork(),
                new Promise((_, reject) =>
                    setTimeout(() => reject(new Error('连接超时')), 10000)
                )
            ]);

            if (networkInfo.chainId === BigInt(config.chainId)) {
                console.log(`    ✅ ${config.name} 连接成功: Chain ID ${networkInfo.chainId}`);
                provider = tempProvider;
                break;
            }
        } catch (error) {
            lastError = error;
            console.log(`    ❌ RPC 失败: ${error.message}`);
            continue;
        }
    }

    if (!provider) {
        throw new Error(`${config.name} 所有 RPC 都无法连接。最后错误: ${lastError?.message}`);
    }

    providerCache.set(cacheKey, provider);
    return provider;
}

// 获取合约实例
async function getContractForNetwork(network, contractType = 'token') {
    const cacheKey = `${network}-${contractType}`;
    if (contractCache.has(cacheKey)) {
        return contractCache.get(cacheKey);
    }

    const config = NETWORK_CONFIGS[network];
    if (!config) {
        throw new Error(`不支持的网络: ${network}`);
    }

    const provider = await createRobustProvider(network);
    const deployerWallet = new ethers.Wallet(DEPLOYER_PRIVATE_KEY, provider);

    const contract = new ethers.Contract(
        config.contracts[contractType],
        TOKEN_ABI,
        deployerWallet
    );

    contractCache.set(cacheKey, contract);
    return contract;
}

// 获取桥合约实例
async function getBridgeContractForNetwork(network) {
    const cacheKey = `${network}-bridge`;
    if (contractCache.has(cacheKey)) {
        return contractCache.get(cacheKey);
    }

    const config = NETWORK_CONFIGS[network];
    if (!config) {
        throw new Error(`不支持的网络: ${network}`);
    }

    const provider = await createRobustProvider(network);
    const deployerWallet = new ethers.Wallet(DEPLOYER_PRIVATE_KEY, provider);

    const contract = new ethers.Contract(
        config.contracts.bridge,
        BRIDGE_ABI,
        deployerWallet
    );

    contractCache.set(cacheKey, contract);
    return contract;
}

// 统一的网络验证函数
function validateNetwork(network) {
    if (!NETWORK_CONFIGS[network]) {
        return {
            valid: false,
            error: `不支持的网络: ${network}`,
            supportedNetworks: Object.keys(NETWORK_CONFIGS)
        };
    }
    return { valid: true };
}

// 统一的错误响应格式
function createErrorResponse(message, details = {}) {
    return {
        success: false,
        message,
        details,
        timestamp: new Date().toISOString()
    };
}

// 统一的成功响应格式
function createSuccessResponse(data, message = 'Success') {
    return {
        success: true,
        message,
        data,
        timestamp: new Date().toISOString()
    };
}

// 获取部署者钱包
async function getDeployerWallet(network) {
    const provider = await createRobustProvider(network);
    return new ethers.Wallet(DEPLOYER_PRIVATE_KEY, provider);
}

// ============== API 路由定义 ==============

// 铸币
app.post('/mint', async (req, res) => {
    const { network = 'sepolia', to, amount } = req.body;

    logRequest('POST', '/mint', { network, to, amount });

    try {
        const validation = validateNetwork(network);
        if (!validation.valid) {
            return res.status(400).json(createErrorResponse(validation.error, { supportedNetworks: validation.supportedNetworks }));
        }

        if (!to || !amount) {
            return res.status(400).json(createErrorResponse('Missing required parameters: to, amount'));
        }

        if (!ethers.isAddress(to)) {
            return res.status(400).json(createErrorResponse('Invalid address format'));
        }

        const contract = await getContractForNetwork(network);
        const amountWei = ethers.parseEther(amount.toString());

        const tx = await contract.mint(to, amountWei, {
            gasLimit: 200000
        });

        const response = createSuccessResponse({
            txHash: tx.hash,
            network,
            to,
            amount: amount.toString(),
            status: 'pending'
        }, 'Mint transaction submitted');

        logSuccess('铸币交易已提交', { txHash: tx.hash, network, to, amount });
        res.json(response);

    } catch (error) {
        const errorResponse = createErrorResponse(error.message);
        logError('铸币操作失败', error);
        res.status(500).json(errorResponse);
    }
});

// 销毁
app.post('/burn', async (req, res) => {
    const { network = 'sepolia', amount } = req.body;

    logRequest('POST', '/burn', { network, amount });

    try {
        const validation = validateNetwork(network);
        if (!validation.valid) {
            return res.status(400).json(createErrorResponse(validation.error, { supportedNetworks: validation.supportedNetworks }));
        }

        if (!amount) {
            return res.status(400).json(createErrorResponse('Missing required parameter: amount'));
        }

        const contract = await getContractForNetwork(network);
        const amountWei = ethers.parseEther(amount.toString());

        const tx = await contract.burn(amountWei, {
            gasLimit: 150000
        });

        const response = createSuccessResponse({
            txHash: tx.hash,
            network,
            amount: amount.toString(),
            status: 'pending'
        }, 'Burn transaction submitted');

        logSuccess('销毁交易已提交', { txHash: tx.hash, network, amount });
        res.json(response);

    } catch (error) {
        const errorResponse = createErrorResponse(error.message);
        logError('销毁操作失败', error);
        res.status(500).json(errorResponse);
    }
});

// 直接转账
app.post('/transfer', async (req, res) => {
    const { network = 'sepolia', to, amount } = req.body;

    logRequest('POST', '/transfer', { network, to, amount });

    try {
        const validation = validateNetwork(network);
        if (!validation.valid) {
            return res.status(400).json(createErrorResponse(validation.error, { supportedNetworks: validation.supportedNetworks }));
        }

        if (!to || !amount) {
            return res.status(400).json(createErrorResponse('Missing required parameters: to, amount'));
        }

        if (!ethers.isAddress(to)) {
            return res.status(400).json(createErrorResponse('Invalid address format'));
        }

        const contract = await getContractForNetwork(network);
        const amountWei = ethers.parseEther(amount.toString());

        const tx = await contract.transfer(to, amountWei, {
            gasLimit: 150000
        });

        const response = createSuccessResponse({
            txHash: tx.hash,
            network,
            to,
            amount: amount.toString(),
            status: 'pending'
        }, 'Transfer transaction submitted');

        logSuccess('直接转账交易已提交', { txHash: tx.hash, network, to, amount });
        res.json(response);

    } catch (error) {
        const errorResponse = createErrorResponse(error.message);
        logError('直接转账操作失败', error);
        res.status(500).json(errorResponse);
    }
});

// 代理转账
app.post('/api/transfer', async (req, res) => {
    const { network = 'sepolia', from, to, amount } = req.body;

    logRequest('POST', '/api/transfer', { network, from, to, amount });

    try {
        const validation = validateNetwork(network);
        if (!validation.valid) {
            return res.status(400).json(createErrorResponse(validation.error, { supportedNetworks: validation.supportedNetworks }));
        }

        if (!from || !to || !amount) {
            return res.status(400).json(createErrorResponse('Missing required parameters: from, to, amount'));
        }

        if (!ethers.isAddress(from) || !ethers.isAddress(to)) {
            return res.status(400).json(createErrorResponse('Invalid address format'));
        }

        const contract = await getContractForNetwork(network);
        const amountWei = ethers.parseEther(amount.toString());

        // 检查授权额度
        const deployerWallet = await getDeployerWallet(network);
        const allowance = await contract.allowance(from, deployerWallet.address);

        if (allowance < amountWei) {
            return res.status(400).json(createErrorResponse(`Insufficient allowance. Current: ${ethers.formatEther(allowance)} XD, Required: ${amount} XD`));
        }

        const tx = await contract.transferFrom(from, to, amountWei, {
            gasLimit: 200000
        });

        const response = createSuccessResponse({
            txHash: tx.hash,
            network,
            from,
            to,
            amount: amount.toString(),
            status: 'pending'
        }, 'Proxy transfer transaction submitted');

        logSuccess('代理转账交易已提交', { txHash: tx.hash, network, from, to, amount });
        res.json(response);

    } catch (error) {
        const errorResponse = createErrorResponse(error.message);
        logError('代理转账操作失败', error);
        res.status(500).json(errorResponse);
    }
});

// 跨链转账
app.post('/crosschain', async (req, res) => {
    const { sourceNetwork = 'sepolia', targetNetwork, to, amount } = req.body;

    logRequest('POST', '/crosschain', { sourceNetwork, targetNetwork, to, amount });

    try {
        const sourceValidation = validateNetwork(sourceNetwork);
        const targetValidation = validateNetwork(targetNetwork);

        if (!sourceValidation.valid) {
            return res.status(400).json(createErrorResponse(`Invalid source network: ${sourceNetwork}`, { supportedNetworks: sourceValidation.supportedNetworks }));
        }

        if (!targetValidation.valid) {
            return res.status(400).json(createErrorResponse(`Invalid target network: ${targetNetwork}`, { supportedNetworks: targetValidation.supportedNetworks }));
        }

        if (!to || !amount) {
            return res.status(400).json(createErrorResponse('Missing required parameters: to, amount'));
        }

        if (!ethers.isAddress(to)) {
            return res.status(400).json(createErrorResponse('Invalid address format'));
        }

        if (sourceNetwork === targetNetwork) {
            return res.status(400).json(createErrorResponse('Source and target networks cannot be the same'));
        }

        // 获取桥合约
        const bridgeContract = await getBridgeContractForNetwork(sourceNetwork);
        const amountWei = ethers.parseEther(amount.toString());

        // 获取链选择器
        const chainSelectors = {
            sepolia: "16015286601757825753",
            bscTestnet: "13264668187771770619"
        };

        const destinationChainSelector = chainSelectors[targetNetwork];
        if (!destinationChainSelector) {
            return res.status(400).json(createErrorResponse(`Unsupported target network: ${targetNetwork}`));
        }

        // 获取跨链费用
        const fee = await bridgeContract.getFee(destinationChainSelector, amountWei);

        // 发送跨链消息
        const tx = await bridgeContract.sendMessage(
            destinationChainSelector,
            to,
            amountWei,
            {
                value: fee,
                gasLimit: 500000
            }
        );

        const response = createSuccessResponse({
            txHash: tx.hash,
            sourceNetwork,
            targetNetwork,
            to,
            amount: amount.toString(),
            fee: ethers.formatEther(fee),
            status: 'pending'
        }, 'Cross-chain transfer transaction submitted');

        logSuccess('跨链转账交易已提交', { txHash: tx.hash, sourceNetwork, targetNetwork, to, amount, fee: ethers.formatEther(fee) });
        res.json(response);

    } catch (error) {
        const errorResponse = createErrorResponse(error.message);
        logError('跨链转账操作失败', error);
        res.status(500).json(errorResponse);
    }
});

// 余额查询（包含完整余额信息）
app.get('/balance/:address', async (req, res) => {
    const { address } = req.params;
    const { network = 'sepolia' } = req.query;

    logRequest('GET', '/balance', { network, address });

    try {
        const validation = validateNetwork(network);
        if (!validation.valid) {
            return res.status(400).json(createErrorResponse(validation.error, { supportedNetworks: validation.supportedNetworks }));
        }

        if (!ethers.isAddress(address)) {
            return res.status(400).json(createErrorResponse('Invalid address format'));
        }

        const contract = await getContractForNetwork(network);

        // 同时查询总余额和冻结余额
        const [totalBalance, frozenBalance] = await Promise.all([
            contract.balanceOf(address),
            contract.frozen(address)
        ]);

        const availableBalance = totalBalance - frozenBalance;

        const response = createSuccessResponse({
            network,
            address,
            balance: ethers.formatEther(totalBalance),
            totalBalance: ethers.formatEther(totalBalance),
            frozenBalance: ethers.formatEther(frozenBalance),
            availableBalance: ethers.formatEther(availableBalance),
            balanceWei: totalBalance.toString(),
            totalBalanceWei: totalBalance.toString(),
            frozenBalanceWei: frozenBalance.toString(),
            availableBalanceWei: availableBalance.toString()
        }, 'Complete balance query successful');

        logSuccess('完整余额查询成功', {
            network,
            address,
            total: ethers.formatEther(totalBalance),
            frozen: ethers.formatEther(frozenBalance),
            available: ethers.formatEther(availableBalance)
        });
        res.json(response);

    } catch (error) {
        const errorResponse = createErrorResponse(error.message);
        logError('余额查询失败', error);
        res.status(500).json(errorResponse);
    }
});

// 可用余额查询
app.get('/available-balance/:address', async (req, res) => {
    const { address } = req.params;
    const { network = 'sepolia' } = req.query;

    logRequest('GET', '/available-balance', { network, address });

    try {
        const validation = validateNetwork(network);
        if (!validation.valid) {
            return res.status(400).json(createErrorResponse(validation.error, { supportedNetworks: validation.supportedNetworks }));
        }

        if (!ethers.isAddress(address)) {
            return res.status(400).json(createErrorResponse('Invalid address format'));
        }

        const contract = await getContractForNetwork(network);
        const [totalBalance, frozenBalance] = await Promise.all([
            contract.balanceOf(address),
            contract.frozen(address)
        ]);

        const availableBalance = totalBalance - frozenBalance;

        const response = createSuccessResponse({
            network,
            address,
            totalBalance: ethers.formatEther(totalBalance),
            frozenBalance: ethers.formatEther(frozenBalance),
            availableBalance: ethers.formatEther(availableBalance),
            totalBalanceWei: totalBalance.toString(),
            frozenBalanceWei: frozenBalance.toString(),
            availableBalanceWei: availableBalance.toString()
        }, 'Available balance query successful');

        logSuccess('可用余额查询成功', { network, address, available: ethers.formatEther(availableBalance) });
        res.json(response);

    } catch (error) {
        const errorResponse = createErrorResponse(error.message);
        logError('可用余额查询失败', error);
        res.status(500).json(errorResponse);
    }
});

// 冻结余额查询
app.get('/frozen-balance/:address', async (req, res) => {
    const { address } = req.params;
    const { network = 'sepolia' } = req.query;

    logRequest('GET', '/frozen-balance', { network, address });

    try {
        const validation = validateNetwork(network);
        if (!validation.valid) {
            return res.status(400).json(createErrorResponse(validation.error, { supportedNetworks: validation.supportedNetworks }));
        }

        if (!ethers.isAddress(address)) {
            return res.status(400).json(createErrorResponse('Invalid address format'));
        }

        const contract = await getContractForNetwork(network);
        const frozenBalance = await contract.frozen(address);
        const formattedFrozenBalance = ethers.formatEther(frozenBalance);

        const response = createSuccessResponse({
            network,
            address,
            frozenBalance: formattedFrozenBalance,
            frozenBalanceWei: frozenBalance.toString()
        }, 'Frozen balance query successful');

        logSuccess('冻结余额查询成功', { network, address, frozenBalance: formattedFrozenBalance });
        res.json(response);

    } catch (error) {
        const errorResponse = createErrorResponse(error.message);
        logError('冻结余额查询失败', error);
        res.status(500).json(errorResponse);
    }
});

// 授权额度查询
app.get('/allowance/:owner/:spender', async (req, res) => {
    const { owner, spender } = req.params;
    const { network = 'sepolia' } = req.query;

    logRequest('GET', '/allowance', { network, owner, spender });

    try {
        const validation = validateNetwork(network);
        if (!validation.valid) {
            return res.status(400).json(createErrorResponse(validation.error, { supportedNetworks: validation.supportedNetworks }));
        }

        if (!ethers.isAddress(owner) || !ethers.isAddress(spender)) {
            return res.status(400).json(createErrorResponse('Invalid address format'));
        }

        const contract = await getContractForNetwork(network);
        const allowance = await contract.allowance(owner, spender);
        const formattedAllowance = ethers.formatEther(allowance);

        const response = createSuccessResponse({
            network,
            owner,
            spender,
            allowance: formattedAllowance,
            allowanceWei: allowance.toString()
        }, 'Allowance query successful');

        logSuccess('授权额度查询成功', { network, owner, spender, allowance: formattedAllowance });
        res.json(response);

    } catch (error) {
        const errorResponse = createErrorResponse(error.message);
        logError('授权额度查询失败', error);
        res.status(500).json(errorResponse);
    }
});

// 暂停合约
app.post('/pause', async (req, res) => {
    const { network = 'sepolia' } = req.body;

    logRequest('POST', '/pause', { network });

    try {
        const validation = validateNetwork(network);
        if (!validation.valid) {
            return res.status(400).json(createErrorResponse(validation.error, { supportedNetworks: validation.supportedNetworks }));
        }

        const contract = await getContractForNetwork(network);
        const tx = await contract.pause({
            gasLimit: 100000
        });

        const response = createSuccessResponse({
            txHash: tx.hash,
            network,
            status: 'pending'
        }, 'Pause transaction submitted');

        logSuccess('暂停交易已提交', { txHash: tx.hash, network });
        res.json(response);

    } catch (error) {
        const errorResponse = createErrorResponse(error.message);
        logError('暂停合约操作失败', error);
        res.status(500).json(errorResponse);
    }
});

// 恢复合约
app.post('/unpause', async (req, res) => {
    const { network = 'sepolia' } = req.body;

    logRequest('POST', '/unpause', { network });

    try {
        const validation = validateNetwork(network);
        if (!validation.valid) {
            return res.status(400).json(createErrorResponse(validation.error, { supportedNetworks: validation.supportedNetworks }));
        }

        const contract = await getContractForNetwork(network);
        const tx = await contract.unpause({
            gasLimit: 100000
        });

        const response = createSuccessResponse({
            txHash: tx.hash,
            network,
            status: 'pending'
        }, 'Unpause transaction submitted');

        logSuccess('恢复交易已提交', { txHash: tx.hash, network });
        res.json(response);

    } catch (error) {
        const errorResponse = createErrorResponse(error.message);
        logError('恢复合约操作失败', error);
        res.status(500).json(errorResponse);
    }
});

// 冻结用户
app.post('/freeze', async (req, res) => {
    const { network = 'sepolia', user, amount } = req.body;

    logRequest('POST', '/freeze', { network, user, amount });

    try {
        const validation = validateNetwork(network);
        if (!validation.valid) {
            return res.status(400).json(createErrorResponse(validation.error, { supportedNetworks: validation.supportedNetworks }));
        }

        if (!user || !amount) {
            return res.status(400).json(createErrorResponse('Missing required parameters: user, amount'));
        }

        if (!ethers.isAddress(user)) {
            return res.status(400).json(createErrorResponse('Invalid address format'));
        }

        const contract = await getContractForNetwork(network);
        const amountWei = ethers.parseEther(amount.toString());

        const tx = await contract.freeze(user, amountWei, {
            gasLimit: 150000
        });

        const response = createSuccessResponse({
            txHash: tx.hash,
            network,
            user,
            amount: amount.toString(),
            status: 'pending'
        }, 'Freeze transaction submitted');

        logSuccess('冻结交易已提交', { txHash: tx.hash, network, user, amount });
        res.json(response);

    } catch (error) {
        const errorResponse = createErrorResponse(error.message);
        logError('冻结用户操作失败', error);
        res.status(500).json(errorResponse);
    }
});

// 黑名单用户
app.post('/block', async (req, res) => {
    const { network = 'sepolia', user } = req.body;

    logRequest('POST', '/block', { network, user });

    try {
        const validation = validateNetwork(network);
        if (!validation.valid) {
            return res.status(400).json(createErrorResponse(validation.error, { supportedNetworks: validation.supportedNetworks }));
        }

        if (!user) {
            return res.status(400).json(createErrorResponse('Missing required parameter: user'));
        }

        if (!ethers.isAddress(user)) {
            return res.status(400).json(createErrorResponse('Invalid address format'));
        }

        const contract = await getContractForNetwork(network);
        const tx = await contract.blockUser(user, {
            gasLimit: 100000
        });

        const response = createSuccessResponse({
            txHash: tx.hash,
            network,
            user,
            status: 'pending'
        }, 'Block user transaction submitted');

        logSuccess('黑名单交易已提交', { txHash: tx.hash, network, user });
        res.json(response);

    } catch (error) {
        const errorResponse = createErrorResponse(error.message);
        logError('黑名单用户操作失败', error);
        res.status(500).json(errorResponse);
    }
});

// 解除黑名单用户
app.post('/unblock', async (req, res) => {
    const { network = 'sepolia', user } = req.body;

    logRequest('POST', '/unblock', { network, user });

    try {
        const validation = validateNetwork(network);
        if (!validation.valid) {
            return res.status(400).json(createErrorResponse(validation.error, { supportedNetworks: validation.supportedNetworks }));
        }

        if (!user) {
            return res.status(400).json(createErrorResponse('Missing required parameter: user'));
        }

        if (!ethers.isAddress(user)) {
            return res.status(400).json(createErrorResponse('Invalid address format'));
        }

        const contract = await getContractForNetwork(network);
        const tx = await contract.unblockUser(user, {
            gasLimit: 100000
        });

        const response = createSuccessResponse({
            txHash: tx.hash,
            network,
            user,
            status: 'pending'
        }, 'Unblock user transaction submitted');

        logSuccess('解除黑名单交易已提交', { txHash: tx.hash, network, user });
        res.json(response);

    } catch (error) {
        const errorResponse = createErrorResponse(error.message);
        logError('解除黑名单用户操作失败', error);
        res.status(500).json(errorResponse);
    }
});

// 解冻用户资金 - 通过重新设置冻结金额实现
app.post('/unfreeze', async (req, res) => {
    const { network = 'sepolia', user, amount } = req.body;

    logRequest('POST', '/unfreeze', { network, user, amount });

    try {
        const validation = validateNetwork(network);
        if (!validation.valid) {
            return res.status(400).json(createErrorResponse(validation.error, { supportedNetworks: validation.supportedNetworks }));
        }

        if (!user || !amount) {
            return res.status(400).json(createErrorResponse('Missing required parameters: user, amount'));
        }

        if (!ethers.isAddress(user)) {
            return res.status(400).json(createErrorResponse('Invalid address format'));
        }

        const contract = await getContractForNetwork(network);
        const unfreezeAmountWei = ethers.parseEther(amount.toString());

        // 获取当前冻结余额
        const currentFrozenBalance = await contract.frozen(user);

        if (currentFrozenBalance === 0n) {
            return res.status(400).json(createErrorResponse('User has no frozen balance to unfreeze'));
        }

        if (unfreezeAmountWei > currentFrozenBalance) {
            return res.status(400).json(createErrorResponse(`Cannot unfreeze more than current frozen balance. Current frozen: ${ethers.formatEther(currentFrozenBalance)} XD, Requested unfreeze: ${amount} XD`));
        }

        // 计算新的冻结金额 = 当前冻结金额 - 要解冻的金额
        const newFrozenAmount = currentFrozenBalance - unfreezeAmountWei;

        // 调用 freeze 函数设置新的冻结金额
        const tx = await contract.freeze(user, newFrozenAmount, {
            gasLimit: 150000
        });

        const response = createSuccessResponse({
            txHash: tx.hash,
            network,
            user,
            unfreezeAmount: amount.toString(),
            currentFrozenBalance: ethers.formatEther(currentFrozenBalance),
            newFrozenBalance: ethers.formatEther(newFrozenAmount),
            status: 'pending'
        }, 'Unfreeze transaction submitted');

        logSuccess('解冻交易已提交', {
            txHash: tx.hash,
            network,
            user,
            unfreezeAmount: amount,
            currentFrozen: ethers.formatEther(currentFrozenBalance),
            newFrozen: ethers.formatEther(newFrozenAmount)
        });
        res.json(response);

    } catch (error) {
        const errorResponse = createErrorResponse(error.message);
        logError('解冻用户操作失败', error);
        res.status(500).json(errorResponse);
    }
});

// 查询历史日志文件接口
app.get('/api/transfers', (req, res) => {
    const { network, type, limit = 50 } = req.query;

    logRequest('GET', '/api/transfers', { network, type, limit });

    try {
        const logFile = './logs/transfer.log';

        if (!fs.existsSync(logFile)) {
            const response = createSuccessResponse({
                data: [],
                total: 0,
                filters: { network: network || 'all', type: type || 'all' }
            }, '暂无转账记录');

            return res.json(response);
        }

        let logs = fs.readFileSync(logFile, 'utf8')
            .split('\n')
            .filter(line => line.trim())
            .map(line => {
                try {
                    return JSON.parse(line);
                } catch {
                    return null;
                }
            })
            .filter(log => log !== null);

        // 按条件过滤
        if (network) {
            logs = logs.filter(log => log.network === network);
        }
        if (type) {
            logs = logs.filter(log => log.type === type);
        }

        // 限制返回数量，最新的在前
        logs = logs.slice(-parseInt(limit)).reverse();

        const response = createSuccessResponse({
            data: logs,
            total: logs.length,
            filters: { network: network || 'all', type: type || 'all' }
        }, '获取转账历史成功');

        logSuccess('查询转账历史', { recordsCount: logs.length });
        res.json(response);

    } catch (error) {
        const errorResponse = createErrorResponse(error.message);
        logError('查询转账历史失败', error);
        res.status(500).json(errorResponse);
    }
});

// 桥合约事件查询接口
app.get('/api/bridge/events', (req, res) => {
    const { network, type, limit = 50 } = req.query;

    logRequest('GET', '/api/bridge/events', { network, type, limit });

    try {
        const logFile = './logs/bridge.log';

        if (!fs.existsSync(logFile)) {
            const response = createSuccessResponse({
                data: [],
                total: 0,
                filters: { network: network || 'all', type: type || 'all' }
            }, '暂无桥合约事件记录');

            return res.json(response);
        }

        let logs = fs.readFileSync(logFile, 'utf8')
            .split('\n')
            .filter(line => line.trim())
            .map(line => {
                try {
                    return JSON.parse(line);
                } catch {
                    return null;
                }
            })
            .filter(log => log !== null);

        // 按条件过滤
        if (network) {
            logs = logs.filter(log => log.network === network);
        }
        if (type) {
            logs = logs.filter(log => log.type === type);
        }

        // 限制返回数量，最新的在前
        logs = logs.slice(-parseInt(limit)).reverse();

        const response = createSuccessResponse({
            data: logs,
            total: logs.length,
            filters: { network: network || 'all', type: type || 'all' }
        }, '获取桥合约事件成功');

        logSuccess('查询桥合约事件', { recordsCount: logs.length });
        res.json(response);

    } catch (error) {
        const errorResponse = createErrorResponse(error.message);
        logError('查询桥合约事件失败', error);
        res.status(500).json(errorResponse);
    }
});

// 事件历史查询
app.get('/events/history', (req, res) => {
    const { network, type, limit = 50 } = req.query;

    logRequest('GET', '/events/history', { network, type, limit });

    try {
        const logFile = './logs/events.log';

        if (!fs.existsSync(logFile)) {
            const response = createSuccessResponse({
                data: [],
                total: 0,
                filters: { network: network || 'all', type: type || 'all' }
            }, '暂无事件记录');

            return res.json(response);
        }

        let logs = fs.readFileSync(logFile, 'utf8')
            .split('\n')
            .filter(line => line.trim())
            .map(line => {
                try {
                    return JSON.parse(line);
                } catch {
                    return null;
                }
            })
            .filter(log => log !== null);

        // 按条件过滤
        if (network) {
            logs = logs.filter(log => log.network === network);
        }
        if (type) {
            logs = logs.filter(log => log.type === type);
        }

        // 限制返回数量，最新的在前
        logs = logs.slice(-parseInt(limit)).reverse();

        const response = createSuccessResponse({
            data: logs,
            total: logs.length,
            filters: { network: network || 'all', type: type || 'all' }
        }, '获取事件历史成功');

        logSuccess('查询事件历史', { recordsCount: logs.length });
        res.json(response);

    } catch (error) {
        const errorResponse = createErrorResponse(error.message);
        logError('查询事件历史失败', error);
        res.status(500).json(errorResponse);
    }
});

// 赎回历史查询
app.get('/redemptions/history', (req, res) => {
    const { network, status, limit = 50 } = req.query;

    logRequest('GET', '/redemptions/history', { network, status, limit });

    try {
        const logFile = './logs/redemptions.log';

        if (!fs.existsSync(logFile)) {
            const response = createSuccessResponse({
                data: [],
                total: 0,
                filters: { network: network || 'all', status: status || 'all' }
            }, '暂无赎回记录');

            return res.json(response);
        }

        let logs = fs.readFileSync(logFile, 'utf8')
            .split('\n')
            .filter(line => line.trim())
            .map(line => {
                try {
                    return JSON.parse(line);
                } catch {
                    return null;
                }
            })
            .filter(log => log !== null);

        // 按条件过滤
        if (network) {
            logs = logs.filter(log => log.network === network);
        }
        if (status) {
            logs = logs.filter(log => log.status === status);
        }

        // 限制返回数量，最新的在前
        logs = logs.slice(-parseInt(limit)).reverse();

        const response = createSuccessResponse({
            data: logs,
            total: logs.length,
            filters: { network: network || 'all', status: status || 'all' }
        }, '获取赎回历史成功');

        logSuccess('查询赎回历史', { recordsCount: logs.length });
        res.json(response);

    } catch (error) {
        const errorResponse = createErrorResponse(error.message);
        logError('查询赎回历史失败', error);
        res.status(500).json(errorResponse);
    }
});

// 健康检查
app.get('/health', (req, res) => {
    res.json({
        status: 'ok',
        timestamp: new Date().toISOString(),
        service: 'XD Stablecoin Backend'
    });
});

// 首页
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// 在现有接口后添加交易状态查询接口
app.get('/tx/:txHash', async (req, res) => {
    const { txHash } = req.params;
    const { network = 'sepolia' } = req.query;

    logRequest('GET', `/tx/${txHash}`, { network });

    try {
        const validation = validateNetwork(network);
        if (!validation.valid) {
            return res.status(400).json(createErrorResponse(validation.error, { supportedNetworks: validation.supportedNetworks }));
        }

        if (!txHash || !/^0x[a-fA-F0-9]{64}$/.test(txHash)) {
            return res.status(400).json(createErrorResponse('Invalid transaction hash format'));
        }

        const provider = await createRobustProvider(network);

        // 获取交易信息
        let tx;
        try {
            tx = await provider.getTransaction(txHash);
        } catch (error) {
            console.log(`交易查询失败: ${error.message}`);
        }

        if (!tx) {
            return res.status(404).json(createErrorResponse('Transaction not found or still pending'));
        }

        // 获取交易收据（如果已确认）
        let receipt;
        try {
            receipt = await provider.getTransactionReceipt(txHash);
        } catch (error) {
            console.log(`收据查询失败: ${error.message}`);
        }

        let confirmations = 0;
        let timestamp = null;

        if (receipt) {
            try {
                const currentBlock = await provider.getBlockNumber();
                confirmations = Math.max(0, currentBlock - receipt.blockNumber + 1);

                // 获取区块时间戳
                const block = await provider.getBlock(receipt.blockNumber);
                timestamp = block ? block.timestamp : null;
            } catch (error) {
                console.log(`确认数查询失败: ${error.message}`);
            }
        }

        const response = createSuccessResponse({
            txHash: tx.hash,
            network,
            status: receipt ? 'confirmed' : 'pending',
            blockNumber: receipt?.blockNumber || null,
            gasUsed: receipt?.gasUsed?.toString() || null,
            confirmations,
            timestamp,
            success: receipt ? (receipt.status === 1) : null // 交易是否成功执行
        }, receipt ? 'Transaction confirmed' : 'Transaction pending');

        logSuccess('交易状态查询成功', {
            txHash,
            network,
            status: receipt ? 'confirmed' : 'pending',
            blockNumber: receipt?.blockNumber,
            confirmations
        });

        res.json(response);

    } catch (error) {
        const errorResponse = createErrorResponse(error.message);
        logError('查询交易状态失败', error);
        res.status(500).json(errorResponse);
    }
});

// 错误处理中间件
process.on('uncaughtException', (error) => {
    console.error('❌ 未捕获的异常:', error);
    process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('❌ 未处理的 Promise 拒绝:', reason);
    process.exit(1);
});

// 启动服务器（移除事件监听器初始化）
app.listen(PORT, '0.0.0.0', async () => {
    console.log(`🚀 XD Stablecoin API Server v2.0.0 running on port ${PORT}`);
    console.log(`🌐 Health check: http://localhost:${PORT}/health`);
    console.log(`📡 API Endpoints:`);
    console.log(`   === 基础功能 ===`);
    console.log(`   POST /mint               - 铸币`);
    console.log(`   POST /burn               - 销毁代币`);
    console.log(`   POST /transfer           - 直接转账`);
    console.log(`   POST /pause              - 暂停合约`);
    console.log(`   POST /unpause            - 恢复合约`);
    console.log(`   === 管理功能 ===`);
    console.log(`   POST /block              - 添加黑名单`);
    console.log(`   POST /unblock            - 移除黑名单`);
    console.log(`   POST /freeze             - 冻结资金`);
    console.log(`   POST /unfreeze           - 解冻资金`);
    console.log(`   === 代理转账功能 ===`);
    console.log(`   POST /api/transfer       - 代理转账`);
    console.log(`   POST /crosschain         - 跨链转账`);
    console.log(`   === 查询功能 ===`);
    console.log(`   GET  /balance/:address   - 完整余额查询 (总余额/冻结余额/可用余额) (Query: ?network=)`);
    console.log(`   GET  /available-balance/:address - 可用余额查询 (Query: ?network=)`);
    console.log(`   GET  /frozen-balance/:address    - 冻结余额查询 (Query: ?network=)`);
    console.log(`   GET  /allowance/:owner/:spender  - 授权查询 (Query: ?network=)`);
    console.log(`   GET  /tx/:txHash         - 交易状态查询 (Query: ?network=)`);
    console.log(`   === 历史记录功能 ===`);
    console.log(`   GET  /api/transfers      - 转账历史 (Query: ?network=&type=&limit=)`);
    console.log(`   GET  /api/bridge/events  - 桥事件历史 (Query: ?network=&type=&limit=)`);
    console.log(`   GET  /events/history     - 事件历史 (Query: ?network=&type=&limit=)`);
    console.log(`   GET  /redemptions/history - 赎回历史 (Query: ?network=&status=&limit=)`);
    console.log(`\n🔗 支持的网络: ${Object.keys(NETWORK_CONFIGS).join(', ')}`);
    console.log(`💡 所有接口都支持 network 参数切换网络 (默认: sepolia)`);
    console.log(`🔧 GET 示例: ?network=bscTestnet`);
    console.log(`🔧 POST 示例: {"network":"bscTestnet"}`);
    console.log(`📝 日志级别: 详细模式 - 包含请求/响应/错误日志`);

    console.log(`\n💡 提示: 事件监听器需要单独启动:`);
    console.log(`   node event-monitor.js\n`);
});

module.exports = app;