import React, { useState, useEffect } from 'react';
import { useAccount } from 'wagmi';
import { useWeb3Auth } from '@web3auth/modal/react';
import { ethers } from 'ethers';
import { getCurrentNetworkConfig, TOKEN_ABI, queryBalance } from '../config/xdCoin';

export function XDCoinBalance() {
    const { address, isConnected, chainId } = useAccount();
    const { provider } = useWeb3Auth();
    const [balanceInfo, setBalanceInfo] = useState<any>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string>('');

    const currentNetwork = getCurrentNetworkConfig(chainId || 0);

    const fetchBalance = async () => {
        if (!address || !currentNetwork) return;

        setLoading(true);
        setError('');

        try {
            // 方式1：使用 API 查询（添加超时控制）
            const apiPromise = queryBalance(address, currentNetwork.name);
            const timeoutPromise = new Promise((_, reject) =>
                setTimeout(() => reject(new Error('API 请求超时')), 5000)
            );

            try {
                const apiResult = await Promise.race([apiPromise, timeoutPromise]);
                if (apiResult.success && apiResult.data) {
                    setBalanceInfo({
                        success: true,
                        address,
                        network: currentNetwork.name,
                        balance: apiResult.data.totalBalance || apiResult.data.balance || '0',
                        frozenBalance: apiResult.data.frozenBalance || '0',
                        availableBalance: apiResult.data.availableBalance || '0',
                        timestamp: apiResult.timestamp || new Date().toISOString()
                    });
                    setLoading(false);
                    return;
                }
            } catch (apiError) {
                console.warn('API 查询失败，尝试直接合约调用:', apiError);
            }

            // 方式2：直接合约调用（备用方案）
            if (!provider) {
                throw new Error('无法连接到钱包');
            }

            const ethersProvider = new ethers.BrowserProvider(provider);
            const contract = new ethers.Contract(
                currentNetwork.contracts.token,
                TOKEN_ABI,
                ethersProvider
            );

            const [balance, frozen] = await Promise.all([
                contract.balanceOf(address),
                contract.frozen(address).catch(() => 0n)
            ]);

            const availableBalance = balance - frozen;

            setBalanceInfo({
                success: true,
                address,
                network: currentNetwork.name,
                balance: ethers.formatEther(balance),
                frozenBalance: ethers.formatEther(frozen),
                availableBalance: ethers.formatEther(availableBalance),
                timestamp: new Date().toISOString()
            });

        } catch (contractError) {
            console.error('余额查询失败:', contractError);
            setError(contractError instanceof Error ? contractError.message : '余额查询失败');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        if (address && currentNetwork && isConnected) {
            fetchBalance();
        }
    }, [address, currentNetwork, chainId, isConnected]);

    if (!isConnected) {
        return (
            <div className="card">
                <h3>💰 余额信息</h3>
                <div className="error">
                    ❌ 请先连接钱包
                </div>
            </div>
        );
    }

    if (!currentNetwork) {
        return (
            <div className="card">
                <h3>💰 余额信息</h3>
                <div className="error">
                    ❌ 当前网络不支持 XD-Coin
                    <br />
                    请切换到 Sepolia 或 BSC Testnet
                </div>
            </div>
        );
    }

    return (
        <div className="card">
            <h3>💰 余额信息</h3>

            <div className="network-info">
                🌐 网络: {currentNetwork.name === 'sepolia' ? '🔷 Sepolia' : '🟡 BSC Testnet'}
            </div>

            {loading && <div className="loading">🔄 查询中...</div>}
            {error && <div className="error">❌ {error}</div>}

            {balanceInfo && balanceInfo.success && !loading && (
                <div className="balance-info">
                    <div className="balance-item">
                        <span className="balance-label">💰 总余额:</span>
                        <span className="balance-value">{parseFloat(balanceInfo.balance).toFixed(4)} XD</span>
                    </div>
                    <div className="balance-item">
                        <span className="balance-label">🧊 冻结余额:</span>
                        <span className="balance-value">{parseFloat(balanceInfo.frozenBalance).toFixed(4)} XD</span>
                    </div>
                    <div className="balance-item">
                        <span className="balance-label">💳 可用余额:</span>
                        <span className="balance-value highlight">{parseFloat(balanceInfo.availableBalance).toFixed(4)} XD</span>
                    </div>
                    <div className="timestamp">
                        ⏰ 更新: {new Date(balanceInfo.timestamp).toLocaleString()}
                    </div>
                </div>
            )}

            <button onClick={fetchBalance} disabled={loading} className="refresh-btn">
                🔄 刷新余额
            </button>
        </div>
    );
} 