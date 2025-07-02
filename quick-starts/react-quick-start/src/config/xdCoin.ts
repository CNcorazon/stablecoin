// src/config/xdCoin.ts - 区块链配置和合约相关
// ==================== 📡 网络配置 ====================

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
    blockExplorer: string;
    nativeCurrency: {
        name: string;
        symbol: string;
        decimals: number;
    };
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
        ccipChainSelector: "16015286601757825753",
        blockExplorer: "https://sepolia.etherscan.io",
        nativeCurrency: {
            name: "Ethereum",
            symbol: "ETH",
            decimals: 18
        }
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
        ccipChainSelector: "13264668187771770619",
        blockExplorer: "https://testnet.bscscan.com",
        nativeCurrency: {
            name: "Binance Smart Chain",
            symbol: "BNB",
            decimals: 18
        }
    }
};

// ==================== 📜 合约 ABI ====================

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

    // XD Stablecoin 扩展功能
    "function mint(address to, uint256 amount)",
    "function burn(uint256 amount)",
    "function burnFrom(address account, uint256 amount)",

    // 暂停功能
    "function pause()",
    "function unpause()",
    "function paused() view returns (bool)",

    // 黑名单功能
    "function blockUser(address user)",
    "function unblockUser(address user)",
    "function blocked(address user) view returns (bool)",

    // 资金冻结功能
    "function freeze(address user, uint256 amount)",
    "function unfreeze(address user, uint256 amount)",
    "function frozen(address user) view returns (uint256)",
    "function availableBalance(address user) view returns (uint256)",

    // 托管功能
    "function custodianTransfer(address from, address to, uint256 amount)",
    "function custodianApprove(address owner, address spender, uint256 amount)",

    // 访问控制
    "function authority() view returns (address)",
    "function setAuthority(address newAuthority)",

    // 事件
    "event Transfer(address indexed from, address indexed to, uint256 value)",
    "event Approval(address indexed owner, address indexed spender, uint256 value)",
    "event Paused(address account)",
    "event Unpaused(address account)",
    "event UserBlocked(address indexed user)",
    "event UserUnblocked(address indexed user)",
    "event FundsFreezed(address indexed user, uint256 amount)",
    "event FundsUnfreezed(address indexed user, uint256 amount)"
];

export const BRIDGE_ABI = [
    // 跨链转账核心功能
    "function transferCrossChain(uint64 destinationChainSelector, address receiver, address user, uint256 amount) payable returns (bytes32)",
    "function estimateCrossChainFee(uint64 destinationChainSelector, address receiver, address user, uint256 amount) view returns (uint256)",

    // 合约信息查询
    "function i_token() view returns (address)",
    "function i_router() view returns (address)",
    "function i_link() view returns (address)",

    // 支持的目标链
    "function allowlistedDestinationChains(uint64) view returns (bool)",
    "function allowlistedSourceChains(uint64) view returns (bool)",

    // 余额管理
    "function withdraw(address beneficiary)",
    "function withdrawToken(address beneficiary, address token)",

    // 访问控制
    "function authority() view returns (address)",
    "function setAuthority(address newAuthority)",

    // 事件
    "event MessageSent(bytes32 indexed messageId, uint64 indexed destinationChainSelector, address indexed receiver, address user, uint256 amount, uint256 fee)",
    "event MessageReceived(bytes32 indexed messageId, uint64 indexed sourceChainSelector, address indexed sender, address user, uint256 amount)",
    "event DestinationChainSelectorUpdated(uint64 indexed destinationChainSelector, bool allowed)",
    "event SourceChainSelectorUpdated(uint64 indexed sourceChainSelector, bool allowed)"
];

export const ACCESS_MANAGER_ABI = [
    // 角色管理
    "function grantRole(uint64 roleId, address account, uint32 executionDelay)",
    "function revokeRole(uint64 roleId, address account)",
    "function renounceRole(uint64 roleId, address account)",
    "function hasRole(uint64 roleId, address account) view returns (bool, uint32)",

    // 函数访问控制
    "function setTargetFunctionRole(address target, bytes4[] selectors, uint64 roleId)",
    "function getTargetFunctionRole(address target, bytes4 selector) view returns (uint64)",

    // 延迟执行
    "function schedule(address target, bytes data, uint48 when) returns (bytes32)",
    "function execute(address target, bytes data) payable returns (bytes32)",
    "function cancel(address caller, address target, bytes data) returns (bytes32)",

    // 事件
    "event RoleGranted(uint64 indexed roleId, address indexed account, uint32 delay, uint48 since, address indexed newMember)",
    "event RoleRevoked(uint64 indexed roleId, address indexed account)",
    "event TargetFunctionRoleUpdated(address indexed target, bytes4 selector, uint64 indexed roleId)"
];

// ==================== 🛠️ 网络工具函数 ====================

/**
 * 根据链ID获取网络配置
 * @param chainId 链ID
 * @returns 网络配置或null
 */
export const getCurrentNetworkConfig = (chainId: number): NetworkConfig | null => {
    return Object.values(NETWORK_CONFIGS).find(config => config.chainId === chainId) || null;
};

/**
 * 根据网络名称获取配置
 * @param networkName 网络名称
 * @returns 网络配置或null
 */
export const getNetworkConfigByName = (networkName: string): NetworkConfig | null => {
    return NETWORK_CONFIGS[networkName] || null;
};

/**
 * 获取跨链目标网络配置
 * @param currentChainId 当前链ID
 * @returns 目标网络配置或null
 */
export const getTargetNetworkConfig = (currentChainId: number): NetworkConfig | null => {
    if (currentChainId === 11155111) {
        return NETWORK_CONFIGS.bscTestnet;
    } else if (currentChainId === 97) {
        return NETWORK_CONFIGS.sepolia;
    }
    return null;
};

/**
 * 检查是否为支持的网络
 * @param chainId 链ID
 * @returns 是否支持
 */
export const isSupportedNetwork = (chainId: number): boolean => {
    return getCurrentNetworkConfig(chainId) !== null;
};

/**
 * 获取所有支持的网络列表
 * @returns 网络配置数组
 */
export const getSupportedNetworks = (): NetworkConfig[] => {
    return Object.values(NETWORK_CONFIGS);
};

/**
 * 根据链ID获取网络名称
 * @param chainId 链ID
 * @returns 网络名称或unknown
 */
export const getNetworkName = (chainId: number): string => {
    const config = getCurrentNetworkConfig(chainId);
    return config?.name || 'unknown';
};

/**
 * 根据链ID获取区块浏览器URL
 * @param chainId 链ID
 * @param txHash 交易哈希（可选）
 * @returns 区块浏览器URL
 */
export const getBlockExplorerUrl = (chainId: number, txHash?: string): string => {
    const config = getCurrentNetworkConfig(chainId);
    if (!config) return '';

    if (txHash) {
        return `${config.blockExplorer}/tx/${txHash}`;
    }
    return config.blockExplorer;
};

/**
 * 根据链ID获取地址浏览器URL
 * @param chainId 链ID
 * @param address 地址
 * @returns 地址浏览器URL
 */
export const getAddressExplorerUrl = (chainId: number, address: string): string => {
    const config = getCurrentNetworkConfig(chainId);
    if (!config) return '';
    return `${config.blockExplorer}/address/${address}`;
};

// ==================== 🔧 合约工具函数 ====================

/**
 * 获取指定网络的代币合约地址
 * @param networkName 网络名称
 * @returns 合约地址或null
 */
export const getTokenContractAddress = (networkName: string): string | null => {
    const config = getNetworkConfigByName(networkName);
    return config?.contracts.token || null;
};

/**
 * 获取指定网络的桥合约地址
 * @param networkName 网络名称
 * @returns 合约地址或null
 */
export const getBridgeContractAddress = (networkName: string): string | null => {
    const config = getNetworkConfigByName(networkName);
    return config?.contracts.bridge || null;
};

/**
 * 获取指定网络的访问管理器地址
 * @param networkName 网络名称
 * @returns 合约地址或null
 */
export const getAccessManagerAddress = (networkName: string): string | null => {
    const config = getNetworkConfigByName(networkName);
    return config?.contracts.accessManager || null;
};

/**
 * 获取部署者地址
 * @param networkName 网络名称
 * @returns 部署者地址或null
 */
export const getDeployerAddress = (networkName: string): string | null => {
    const config = getNetworkConfigByName(networkName);
    return config?.deployerAddress || null;
};

// ==================== 💰 代币工具函数 ====================

/**
 * 格式化代币数量（从wei转换为可读格式）
 * @param amount wei数量
 * @param decimals 小数位数，默认18
 * @returns 格式化后的数量字符串
 */
export const formatTokenAmount = (amount: string | number, decimals: number = 18): string => {
    const divisor = Math.pow(10, decimals);
    const numAmount = typeof amount === 'string' ? parseFloat(amount) : amount;
    return (numAmount / divisor).toFixed(6);
};

/**
 * 将可读数量转换为wei
 * @param amount 可读数量
 * @param decimals 小数位数，默认18
 * @returns wei数量字符串
 */
export const parseTokenAmount = (amount: string | number, decimals: number = 18): string => {
    const multiplier = Math.pow(10, decimals);
    const numAmount = typeof amount === 'string' ? parseFloat(amount) : amount;
    return Math.floor(numAmount * multiplier).toString();
};

/**
 * 检查地址格式是否正确
 * @param address 地址字符串
 * @returns 是否为有效地址
 */
export const isValidAddress = (address: string): boolean => {
    return /^0x[a-fA-F0-9]{40}$/.test(address);
};

/**
 * 检查交易哈希格式是否正确
 * @param txHash 交易哈希
 * @returns 是否为有效交易哈希
 */
export const isValidTxHash = (txHash: string): boolean => {
    return /^0x[a-fA-F0-9]{64}$/.test(txHash);
};

// ==================== 📤 重新导出API函数 ====================
// 为了向后兼容，重新导出常用的API函数
export {
    // 基础API调用
    apiCall,

    // 查询函数
    queryBalance,
    queryFrozenBalance,
    queryAvailableBalance,
    queryAllowance,
    queryContractStatus,
    queryTransactionStatus,

    // 转账函数
    proxyTransfer,
    crossChainTransfer,

    // 管理函数
    mintTokens,
    burnTokens,
    freezeUserFunds,
    unfreezeUserFunds,
    blockUser,
    unblockUser,
    pauseContract,
    unpauseContract,

    // 历史记录函数
    getTransferHistory,
    getBridgeHistory,
    getEventHistory,
    getRedemptionHistory,

    // 健康检查
    checkHealth,
    getSupportedNetworks as getApiSupportedNetworks,

    // API配置
    API_CONFIG
} from './api';