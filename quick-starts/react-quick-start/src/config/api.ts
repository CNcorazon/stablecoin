// web3auth-pnp-examples/quick-starts/react-quick-start/src/config/api.ts
const getApiBaseUrl = () => {
    if (import.meta.env.MODE === 'production') {
        // 🔗 生产环境：通过nginx代理，使用相对路径
        return '/api';
    }
    // 开发环境：直接连后端
    return 'http://localhost:3001';
};

export const API_CONFIG = {
    BASE_URL: getApiBaseUrl(),
    TIMEOUT: 30000,
};

// 通用请求函数
export const apiRequest = async (endpoint: string, options: RequestInit = {}) => {
    const url = `${API_CONFIG.BASE_URL}${endpoint}`;

    const defaultOptions: RequestInit = {
        headers: {
            'Content-Type': 'application/json',
        },
    };

    const response = await fetch(url, { ...defaultOptions, ...options });

    if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
    }

    return response.json();
};