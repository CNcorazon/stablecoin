import React, { useState, useEffect } from 'react';
import { useAccount } from 'wagmi';
import { getCurrentNetworkConfig, queryBalance } from '../config/xdCoin';

export function BalanceQuery() {
    const { address, chainId } = useAccount();
    const [balanceInfo, setBalanceInfo] = useState<any>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string>('');

    const currentNetwork = getCurrentNetworkConfig(chainId || 0);

    useEffect(() => {
        if (address && currentNetwork) {
            fetchBalanceInfo();
        }
    }, [address, currentNetwork]);

    const fetchBalanceInfo = async () => {
        if (!address || !currentNetwork) return;

        setLoading(true);
        setError('');

        try {
            // 使用 /balance/:address 接口，它返回完整的余额信息
            const balanceResult = await queryBalance(address, currentNetwork.name);

            if (balanceResult.success && balanceResult.data) {
                // 正确访问 data 对象中的字段
                setBalanceInfo({
                    success: true,
                    balance: balanceResult.data.totalBalance || balanceResult.data.balance || '0',
                    frozenBalance: balanceResult.data.frozenBalance || '0',
                    availableBalance: balanceResult.data.availableBalance || '0',
                    timestamp: balanceResult.timestamp
                });
            } else {
                throw new Error(balanceResult.message || '查询失败');
            }

        } catch (err: any) {
            console.error('查询余额失败:', err);
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    if (!currentNetwork) {
        return (
            <div className="card">
                <h3>💰 余额查询</h3>
                <div className="error-message">
                    ❌ 当前网络不支持
                </div>
            </div>
        );
    }

    return (
        <div className="card">
            <h3>💰 余额查询</h3>

            <div className="network-info">
                网络: {currentNetwork.name === 'sepolia' ? '🔷 Sepolia' : '🟡 BSC Testnet'}
            </div>

            {loading && <div className="loading">🔄 查询中...</div>}

            {error && <div className="error-message">❌ {error}</div>}

            {balanceInfo && balanceInfo.success && (
                <div className="balance-display">
                    <div className="balance-item">
                        <span className="label">总余额:</span>
                        <span className="value">{parseFloat(balanceInfo.balance || '0').toFixed(4)} XD</span>
                    </div>
                    <div className="balance-item">
                        <span className="label">冻结余额:</span>
                        <span className="value">{parseFloat(balanceInfo.frozenBalance || '0').toFixed(4)} XD</span>
                    </div>
                    <div className="balance-item">
                        <span className="label">可用余额:</span>
                        <span className="value highlight">{parseFloat(balanceInfo.availableBalance || '0').toFixed(4)} XD</span>
                    </div>
                    <div className="timestamp">
                        更新时间: {new Date(balanceInfo.timestamp).toLocaleString()}
                    </div>
                </div>
            )}

            <button
                onClick={fetchBalanceInfo}
                disabled={loading || !address}
                className="refresh-button"
            >
                🔄 刷新余额
            </button>
        </div>
    );
} 