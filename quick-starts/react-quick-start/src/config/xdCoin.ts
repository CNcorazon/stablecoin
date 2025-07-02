// XD-Coin 多网络配置
export interface NetworkConfig {
    chainId: number;
    name: string;
    rpcUrl: string;
    contracts: {
        token: string;
        bridge: string;
        accessManager: string;
    };
    deployerAddress: string;
    ccipChainSelector: string;
}

export const NETWORK_CONFIGS: Record<string, NetworkConfig> = {
    sepolia: {
        chainId: 11155111,
        name: "sepolia",
        rpcUrl: "https://sepolia.infura.io/v3/e4b04da787284b48b51382d10172accb",
        contracts: {
            token: "0x23251cC261550B27FbB53c8cb3505341705fFaEa",
            bridge: "0x8a1BC16541191A28103b050d8b93055aF5c06F0b",
            accessManager: "0xf1c5d6dBC7229DcaEB2E828d7b7EE85C29074B52"
        },
        deployerAddress: "0xe196efB0166Fa2351a736047C0935Ac9C456421B",
        ccipChainSelector: "16015286601757825753"
    },
    bscTestnet: {
        chainId: 97,
        name: "bscTestnet",
        rpcUrl: "https://data-seed-prebsc-1-s1.binance.org:8545",
        contracts: {
            token: "0x8924BC61E85315e8442f2feBDe2bd94231f9DeE0",
            bridge: "0x9D0c783314229D277e7e90ebAAd85078F9F4A9B2",
            accessManager: "0x6a52bcA908FC39204EfcEF0e7204b2Bcb2a0e0be"
        },
        deployerAddress: "0xe196efB0166Fa2351a736047C0935Ac9C456421B",
        ccipChainSelector: "13264668187771770619"
    }
};

// 获取当前网络配置
export const getCurrentNetworkConfig = (chainId: number): NetworkConfig | null => {
    return Object.values(NETWORK_CONFIGS).find(config => config.chainId === chainId) || null;
};

// 获取目标网络配置
export const getTargetNetworkConfig = (currentChainId: number): NetworkConfig | null => {
    if (currentChainId === 11155111) {
        return NETWORK_CONFIGS.bscTestnet;
    } else if (currentChainId === 97) {
        return NETWORK_CONFIGS.sepolia;
    }
    return null;
};

// 完整的合约 ABI
export const TOKEN_ABI = [
    // ERC20 基础功能
    "function name() view returns (string)",
    "function symbol() view returns (string)",
    "function decimals() view returns (uint8)",
    "function totalSupply() view returns (uint256)",
    "function balanceOf(address) view returns (uint256)",
    "function transfer(address to, uint256 amount) returns (bool)",
    "function approve(address spender, uint256 amount) returns (bool)",
    "function allowance(address owner, address spender) view returns (uint256)",
    "function transferFrom(address from, address to, uint256 amount) returns (bool)",

    // 扩展功能
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
    "function availableBalance(address user) view returns (uint256)",

    // 事件
    "event Transfer(address indexed from, address indexed to, uint256 value)",
    "event Approval(address indexed owner, address indexed spender, uint256 value)",
    "event Paused(address account)",
    "event Unpaused(address account)"
];

export const BRIDGE_ABI = [
    "function transferCrossChain(uint64 destinationChainSelector, address receiver, address user, uint256 amount) payable returns (bytes32)",
    "function estimateCrossChainFee(uint64 destinationChainSelector, address receiver, address user, uint256 amount) view returns (uint256)",
    "function i_token() view returns (address)",
    "function i_router() view returns (address)",

    // 事件
    "event MessageSent(bytes32 indexed messageId, uint64 indexed destinationChainSelector, address indexed receiver, address user, uint256 amount, uint256 fee)",
    "event MessageReceived(bytes32 indexed messageId, uint64 indexed sourceChainSelector, address indexed sender, address user, uint256 amount)"
];

// API 配置 - 增加更多端点
export const API_CONFIG = {
    baseUrl: process.env.NODE_ENV === 'production'
        ? "api"
        : "http://localhost:3000",

    endpoints: {
        // 代理转账
        transfer: "/api/transfer",
        transferHistory: "/api/transfer/history",

        // 查询接口
        balance: "/balance",
        frozenBalance: "/frozen-balance",
        availableBalance: "/available-balance",
        status: "/status",
        networks: "/networks",

        // 管理接口
        mint: "/mint",
        burn: "/burn",
        freeze: "/freeze",
        unfreeze: "/unfreeze",
        block: "/block",
        unblock: "/unblock",
        pause: "/pause",
        unpause: "/unpause",

        // 其他
        health: "/health",
        tx: "/tx"
    }
};

// 更新 API 调用工具函数 - 适配新的响应格式并扁平化数据
export const apiCall = async (endpoint: string, data?: any, method: 'GET' | 'POST' = 'GET') => {
    const url = `${API_CONFIG.baseUrl}${endpoint}`;

    try {
        const response = await fetch(url, {
            method: data ? 'POST' : method,
            headers: {
                'Content-Type': 'application/json',
            },
            body: data ? JSON.stringify(data) : undefined,
        });

        if (!response.ok) {
            throw new Error(`HTTP Error: ${response.status}`);
        }

        const result = await response.json();

        // 适配新的响应格式
        if (result.success === false) {
            throw new Error(result.message || result.error || '操作失败');
        }

        // 🚀 数据扁平化处理 - 为了向后兼容
        // 将 data 对象中的字段提升到顶级，同时保留原始的 data 对象
        if (result.data && typeof result.data === 'object') {
            return {
                ...result,        // 保留原始字段 (success, message, timestamp, data 等)
                ...result.data    // 将 data 中的字段提升到顶级 (balance, availableBalance, frozenBalance 等)
            };
        }

        return result;
    } catch (error) {
        console.error('API 调用失败:', error);
        throw error;
    }
};

// 新增：专门的查询函数 - 使用 Query Parameters
export const queryBalance = async (address: string, network: string = 'sepolia') => {
    const endpoint = `${API_CONFIG.endpoints.balance}/${address}?network=${network}`;
    return apiCall(endpoint, null, 'GET');
};

export const queryFrozenBalance = async (address: string, network: string = 'sepolia') => {
    const endpoint = `${API_CONFIG.endpoints.frozenBalance}/${address}?network=${network}`;
    return apiCall(endpoint, null, 'GET');
};

export const queryAvailableBalance = async (address: string, network: string = 'sepolia') => {
    const endpoint = `${API_CONFIG.endpoints.availableBalance}/${address}?network=${network}`;
    return apiCall(endpoint, null, 'GET');
};

export const queryContractStatus = async (network: string = 'sepolia') => {
    const endpoint = `${API_CONFIG.endpoints.status}?network=${network}`;
    return apiCall(endpoint, null, 'GET');
};

// 🆕 新增交易状态查询函数
export const queryTransactionStatus = async (txHash: string, network: string = 'sepolia') => {
    const endpoint = `${API_CONFIG.endpoints.tx}/${txHash}?network=${network}`;
    return apiCall(endpoint, null, 'GET');
}; 