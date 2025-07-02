// web3auth-pnp-examples/quick-starts/react-quick-start/src/config/api.ts
const getApiBaseUrl = () => {
    if (import.meta.env.MODE === 'production') {
        // 🔗 生产环境：通过nginx代理，使用相对路径
        return '/api';
    }
    return 'http://localhost:3000';
};

export const API_CONFIG = {
    BASE_URL: getApiBaseUrl(),
    TIMEOUT: 30000,

    // 🆕 合并端点配置
    endpoints: {
        // 代理转账
        transfer: "/api/transfer",
        transferHistory: "/api/transfers",

        // 查询接口
        balance: "/balance",
        frozenBalance: "/frozen-balance",
        availableBalance: "/available-balance",
        allowance: "/allowance",

        // 管理接口
        mint: "/mint",
        burn: "/burn",
        freeze: "/freeze",
        unfreeze: "/unfreeze",
        block: "/block",
        unblock: "/unblock",
        pause: "/pause",
        unpause: "/unpause",

        // 跨链和状态
        crosschain: "/crosschain",
        status: "/status",
        health: "/health",
        tx: "/tx",

        // 历史记录
        events: "/events/history",
        bridgeEvents: "/api/bridge/events",
        redemptions: "/redemptions/history",
        networks: "/networks"
    }
};

// 🆕 统一的API调用函数
export const apiCall = async (endpoint: string, data?: any, method: 'GET' | 'POST' = 'GET') => {
    const url = `${API_CONFIG.BASE_URL}${endpoint}`;

    try {
        const requestOptions: RequestInit = {
            method: data ? 'POST' : method,
            headers: {
                'Content-Type': 'application/json',
            },
            signal: AbortSignal.timeout(API_CONFIG.TIMEOUT)
        };

        // 只有在有数据时才添加body
        if (data) {
            requestOptions.body = JSON.stringify(data);
        }

        const response = await fetch(url, requestOptions);

        if (!response.ok) {
            // 尝试解析错误响应
            let errorMessage = `HTTP Error: ${response.status} ${response.statusText}`;
            try {
                const errorData = await response.json();
                errorMessage = errorData.message || errorData.error || errorMessage;
            } catch {
                // 如果解析失败，使用默认错误消息
            }
            throw new Error(errorMessage);
        }

        const result = await response.json();

        // 适配后端响应格式
        if (result.success === false) {
            throw new Error(result.message || result.error || '操作失败');
        }

        // 数据扁平化处理
        if (result.data && typeof result.data === 'object') {
            return {
                ...result,
                ...result.data
            };
        }

        return result;
    } catch (error) {
        console.error(`API调用失败 [${method} ${endpoint}]:`, error);
        throw error;
    }
};

// 🆕 便捷查询函数
export const queryBalance = async (address: string, network: string = 'sepolia') => {
    return apiCall(`${API_CONFIG.endpoints.balance}/${address}?network=${network}`, null, 'GET');
};

export const queryFrozenBalance = async (address: string, network: string = 'sepolia') => {
    return apiCall(`${API_CONFIG.endpoints.frozenBalance}/${address}?network=${network}`, null, 'GET');
};

export const queryTransactionStatus = async (txHash: string, network: string = 'sepolia') => {
    return apiCall(`${API_CONFIG.endpoints.tx}/${txHash}?network=${network}`, null, 'GET');
};


// ==================== 🔍 查询函数 ====================

/**
 * 查询可用余额
 * @param address 钱包地址
 * @param network 网络名称
 */
export const queryAvailableBalance = async (address: string, network: string = 'sepolia') => {
    const endpoint = `${API_CONFIG.endpoints.availableBalance}/${address}?network=${network}`;
    return apiCall(endpoint, null, 'GET');
};

/**
 * 查询授权额度
 * @param owner 授权者地址
 * @param spender 被授权者地址
 * @param network 网络名称
 */
export const queryAllowance = async (owner: string, spender: string, network: string = 'sepolia') => {
    const endpoint = `${API_CONFIG.endpoints.allowance}/${owner}/${spender}?network=${network}`;
    return apiCall(endpoint, null, 'GET');
};

/**
 * 查询合约状态
 * @param network 网络名称
 */
export const queryContractStatus = async (network: string = 'sepolia') => {
    const endpoint = `${API_CONFIG.endpoints.status}?network=${network}`;
    return apiCall(endpoint, null, 'GET');
};

// ==================== 💸 转账函数 ====================

/**
 * 代理转账
 * @param transferData 转账数据
 */
export const proxyTransfer = async (transferData: {
    from: string;
    to: string;
    amount: string;
    network?: string;
}) => {
    return apiCall(API_CONFIG.endpoints.transfer, transferData, 'POST');
};

/**
 * 跨链转账
 * @param crossChainData 跨链数据
 */
export const crossChainTransfer = async (crossChainData: {
    from: string;
    to: string;
    amount: string;
    sourceNetwork: string;
    targetNetwork: string;
}) => {
    return apiCall(API_CONFIG.endpoints.crosschain, crossChainData, 'POST');
};

// ==================== 🔧 管理函数 ====================

/**
 * 铸币
 * @param mintData 铸币数据
 */
export const mintTokens = async (mintData: {
    to: string;
    amount: string;
    network?: string;
}) => {
    return apiCall(API_CONFIG.endpoints.mint, mintData, 'POST');
};

/**
 * 销毁代币
 * @param burnData 销毁数据
 */
export const burnTokens = async (burnData: {
    amount: string;
    network?: string;
}) => {
    return apiCall(API_CONFIG.endpoints.burn, burnData, 'POST');
};

/**
 * 冻结用户资金
 * @param freezeData 冻结数据
 */
export const freezeUserFunds = async (freezeData: {
    user: string;
    amount: string;
    network?: string;
}) => {
    return apiCall(API_CONFIG.endpoints.freeze, freezeData, 'POST');
};

/**
 * 解冻用户资金
 * @param unfreezeData 解冻数据
 */
export const unfreezeUserFunds = async (unfreezeData: {
    user: string;
    amount: string;
    network?: string;
}) => {
    return apiCall(API_CONFIG.endpoints.unfreeze, unfreezeData, 'POST');
};

/**
 * 添加黑名单
 * @param blockData 封禁数据
 */
export const blockUser = async (blockData: {
    user: string;
    network?: string;
}) => {
    return apiCall(API_CONFIG.endpoints.block, blockData, 'POST');
};

/**
 * 移除黑名单
 * @param unblockData 解封数据
 */
export const unblockUser = async (unblockData: {
    user: string;
    network?: string;
}) => {
    return apiCall(API_CONFIG.endpoints.unblock, unblockData, 'POST');
};

/**
 * 暂停合约
 * @param network 网络名称
 */
export const pauseContract = async (network: string = 'sepolia') => {
    return apiCall(API_CONFIG.endpoints.pause, { network }, 'POST');
};

/**
 * 恢复合约
 * @param network 网络名称
 */
export const unpauseContract = async (network: string = 'sepolia') => {
    return apiCall(API_CONFIG.endpoints.unpause, { network }, 'POST');
};

// ==================== 📊 历史记录函数 ====================

/**
 * 获取转账历史
 * @param params 查询参数
 */
export const getTransferHistory = async (params: {
    network?: string;
    type?: string;
    limit?: number;
} = {}) => {
    const queryParams = new URLSearchParams();
    if (params.network) queryParams.set('network', params.network);
    if (params.type) queryParams.set('type', params.type);
    if (params.limit) queryParams.set('limit', params.limit.toString());

    const endpoint = `${API_CONFIG.endpoints.transferHistory}?${queryParams.toString()}`;
    return apiCall(endpoint, null, 'GET');
};

/**
 * 获取桥事件历史
 * @param params 查询参数
 */
export const getBridgeHistory = async (params: {
    network?: string;
    type?: string;
    limit?: number;
} = {}) => {
    const queryParams = new URLSearchParams();
    if (params.network) queryParams.set('network', params.network);
    if (params.type) queryParams.set('type', params.type);
    if (params.limit) queryParams.set('limit', params.limit.toString());

    const endpoint = `${API_CONFIG.endpoints.bridgeEvents}?${queryParams.toString()}`;
    return apiCall(endpoint, null, 'GET');
};

/**
 * 获取事件历史
 * @param params 查询参数
 */
export const getEventHistory = async (params: {
    network?: string;
    type?: string;
    limit?: number;
} = {}) => {
    const queryParams = new URLSearchParams();
    if (params.network) queryParams.set('network', params.network);
    if (params.type) queryParams.set('type', params.type);
    if (params.limit) queryParams.set('limit', params.limit.toString());

    const endpoint = `${API_CONFIG.endpoints.events}?${queryParams.toString()}`;
    return apiCall(endpoint, null, 'GET');
};

/**
 * 获取赎回历史
 * @param params 查询参数
 */
export const getRedemptionHistory = async (params: {
    network?: string;
    status?: string;
    limit?: number;
} = {}) => {
    const queryParams = new URLSearchParams();
    if (params.network) queryParams.set('network', params.network);
    if (params.status) queryParams.set('status', params.status);
    if (params.limit) queryParams.set('limit', params.limit.toString());

    const endpoint = `${API_CONFIG.endpoints.redemptions}?${queryParams.toString()}`;
    return apiCall(endpoint, null, 'GET');
};

// ==================== 🏥 健康检查 ====================

/**
 * 检查服务健康状态
 */
export const checkHealth = async () => {
    return apiCall(API_CONFIG.endpoints.health, null, 'GET');
};

/**
 * 获取支持的网络列表
 */
export const getSupportedNetworks = async () => {
    return apiCall(API_CONFIG.endpoints.networks, null, 'GET');
};