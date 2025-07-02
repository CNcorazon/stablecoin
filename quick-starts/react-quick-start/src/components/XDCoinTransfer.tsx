import React, { useState, useEffect } from 'react';
import { useAccount } from 'wagmi';
import { useWeb3Auth } from '@web3auth/modal/react';
import { ethers } from 'ethers';
import { getCurrentNetworkConfig, TOKEN_ABI, apiCall, API_CONFIG, queryAvailableBalance } from '../config/xdCoin';
import { TransactionModal } from './TransactionModal';

export function XDCoinTransfer() {
    const { address, isConnected, chainId } = useAccount();
    const { provider } = useWeb3Auth();
    const [amount, setAmount] = useState<string>('');
    const [toAddress, setToAddress] = useState<string>('');
    const [loading, setLoading] = useState(false);
    const [availableBalance, setAvailableBalance] = useState<string>('0');
    const [frozenBalance, setFrozenBalance] = useState<string>('0');
    const [transferMode, setTransferMode] = useState<'direct' | 'proxy'>('proxy');

    // 🆕 弹窗状态
    const [modalOpen, setModalOpen] = useState(false);
    const [transactionResult, setTransactionResult] = useState<any>(null);

    const currentNetwork = getCurrentNetworkConfig(chainId || 0);

    // 获取用户可用余额和冻结余额
    useEffect(() => {
        const fetchBalances = async () => {
            if (!address || !currentNetwork) return;

            try {
                const [availableResult, frozenResult] = await Promise.all([
                    queryAvailableBalance(address, currentNetwork.name),
                    apiCall(`${API_CONFIG.endpoints.frozenBalance}/${address}?network=${currentNetwork.name}`, null, 'GET')
                ]);

                if (availableResult.success && availableResult.data) {
                    setAvailableBalance(availableResult.data.availableBalance || '0');
                }

                if (frozenResult.success && frozenResult.data) {
                    setFrozenBalance(frozenResult.data.frozenBalance || '0');
                }
            } catch (error) {
                console.error('获取余额失败:', error);
            }
        };

        fetchBalances();
    }, [address, currentNetwork, chainId]);

    // 🆕 显示交易结果弹窗
    const showTransactionResult = (success: boolean, action: string, result?: any, error?: string) => {
        setTransactionResult({
            success,
            action,
            txHash: result?.txHash || result?.data?.txHash,
            network: result?.network || result?.data?.network || currentNetwork?.name,
            blockNumber: result?.blockNumber || result?.data?.blockNumber,
            status: result?.status || result?.data?.status,
            amount: amount,
            from: address,
            to: toAddress,
            error
        });
        setModalOpen(true);
    };

    // 🔧 修复：一键式代理转账
    const handleProxyTransfer = async () => {
        if (!address || !amount || !toAddress || !currentNetwork) {
            showTransactionResult(false, '代理转账', null, '请填写完整信息');
            return;
        }

        const transferAmount = parseFloat(amount);
        const available = parseFloat(availableBalance);

        if (transferAmount > available) {
            showTransactionResult(false, '代理转账', null, '可用余额不足');
            return;
        }

        setLoading(true);

        try {
            // 第一步：检查授权额度
            if (provider && currentNetwork) {
                const ethersProvider = new ethers.BrowserProvider(provider);
                const signer = await ethersProvider.getSigner();

                const tokenContract = new ethers.Contract(
                    currentNetwork.contracts.token,
                    TOKEN_ABI,
                    signer
                );

                const currentAllowance = await tokenContract.allowance(address, currentNetwork.deployerAddress);
                const needAmount = ethers.parseEther(amount);

                // 第二步：如果授权不足，自动授权
                if (currentAllowance < needAmount) {
                    const approveTx = await tokenContract.approve(
                        currentNetwork.deployerAddress,
                        needAmount
                    );
                    await approveTx.wait();
                }
            }

            // 第三步：后台执行转账
            const transferData = {
                network: currentNetwork.name,
                from: address,
                to: toAddress,
                amount: amount
            };

            const result = await apiCall(API_CONFIG.endpoints.transfer, transferData, 'POST');

            if (result.success) {
                // 🆕 显示成功弹窗
                showTransactionResult(true, '代理转账', result);

                // 重置表单
                setAmount('');
                setToAddress('');

                // 刷新余额
                setTimeout(async () => {
                    if (address && currentNetwork) {
                        const availableResult = await queryAvailableBalance(address, currentNetwork.name);
                        if (availableResult.success && availableResult.data) {
                            setAvailableBalance(availableResult.data.availableBalance || '0');
                        }
                    }
                }, 3000);

            } else {
                throw new Error(result.message || result.error || '转账失败');
            }

        } catch (error: any) {
            console.error('代理转账失败:', error);
            // 🆕 显示失败弹窗
            showTransactionResult(false, '代理转账', null, error.message);
        } finally {
            setLoading(false);
        }
    };

    // 直接转账（用户支付 Gas）
    const handleDirectTransfer = async () => {
        if (!provider || !address || !amount || !toAddress || !currentNetwork) {
            showTransactionResult(false, '直接转账', null, '请填写完整信息');
            return;
        }

        setLoading(true);

        try {
            const ethersProvider = new ethers.BrowserProvider(provider);
            const signer = await ethersProvider.getSigner();
            const tokenContract = new ethers.Contract(
                currentNetwork.contracts.token,
                TOKEN_ABI,
                signer
            );

            const transferAmount = ethers.parseEther(amount);

            const transferTx = await tokenContract.transfer(toAddress, transferAmount);
            const receipt = await transferTx.wait();

            // 🆕 显示成功弹窗
            showTransactionResult(true, '直接转账', {
                txHash: transferTx.hash,
                network: currentNetwork.name,
                blockNumber: receipt.blockNumber,
                status: 'confirmed'
            });

            // 重置表单
            setAmount('');
            setToAddress('');

        } catch (error: any) {
            console.error('直接转账失败:', error);
            // 🆕 显示失败弹窗
            showTransactionResult(false, '直接转账', null, error.message);
        } finally {
            setLoading(false);
        }
    };

    if (!currentNetwork) {
        return (
            <div className="card">
                <h3>💸 XD-Coin 转账</h3>
                <div className="error-message">
                    ❌ 当前网络不支持 XD-Coin 转账
                    <br />
                    请切换到 Sepolia 或 BSC Testnet
                </div>
            </div>
        );
    }

    return (
        <>
            <div className="card">
                <h3>💸 XD-Coin 转账</h3>
                <div className="network-info">
                    🌐 网络: {currentNetwork.name === 'sepolia' ? '🔷 Sepolia' : '🟡 BSC Testnet'}
                </div>

                <div className="balance-display">
                    <div className="balance-row">
                        <span className="label">💰 可用余额:</span>
                        <span className="balance available">{availableBalance} XD</span>
                    </div>
                    <div className="balance-row">
                        <span className="label">🧊 冻结余额:</span>
                        <span className="balance frozen">{frozenBalance} XD</span>
                    </div>
                </div>

                {/* 转账模式选择 */}
                <div className="mode-selector">
                    <label className="mode-option">
                        <input
                            type="radio"
                            value="proxy"
                            checked={transferMode === 'proxy'}
                            onChange={(e) => setTransferMode(e.target.value as 'proxy')}
                        />
                        🤖 代理转账 (推荐) - 无需支付Gas费
                    </label>
                    <label className="mode-option">
                        <input
                            type="radio"
                            value="direct"
                            checked={transferMode === 'direct'}
                            onChange={(e) => setTransferMode(e.target.value as 'direct')}
                        />
                        ⛽ 直接转账 - 需要支付Gas费
                    </label>
                </div>

                <div className="form-group">
                    <label>📍 接收地址:</label>
                    <input
                        type="text"
                        value={toAddress}
                        onChange={(e) => setToAddress(e.target.value)}
                        placeholder="请输入接收方地址"
                        disabled={loading}
                    />
                </div>

                <div className="form-group">
                    <label>💰 转账金额:</label>
                    <input
                        type="number"
                        value={amount}
                        onChange={(e) => setAmount(e.target.value)}
                        placeholder="请输入转账数量"
                        disabled={loading}
                        max={availableBalance}
                    />
                </div>

                {/* 🆕 调整按钮样式，不占满宽度 */}
                <button
                    onClick={transferMode === 'proxy' ? handleProxyTransfer : handleDirectTransfer}
                    disabled={loading || !amount || !toAddress}
                    className="admin-btn"
                >
                    {loading ? '🔄 处理中...' :
                        transferMode === 'proxy' ? '🤖 代理转账' : '⛽ 直接转账'}
                </button>

                {/* 🆕 全局加载状态 */}
                {loading && (
                    <div className="loading-overlay">
                        <div className="loading-spinner">
                            <div className="spinner"></div>
                            <span>🔄 执行中，请稍候...</span>
                        </div>
                    </div>
                )}
            </div>

            {/* 🆕 交易结果弹窗 */}
            <TransactionModal
                isOpen={modalOpen}
                onClose={() => setModalOpen(false)}
                result={transactionResult}
            />

            <style>{`
                .card {
                    position: relative;
                }

                .network-info {
                    background: #f8f9fa;
                    padding: 8px 12px;
                    border-radius: 6px;
                    margin-bottom: 16px;
                    font-size: 14px;
                }

                .balance-display {
                    background: #e7f3ff;
                    padding: 12px;
                    border-radius: 6px;
                    margin-bottom: 16px;
                }

                .balance-row {
                    display: flex;
                    justify-content: space-between;
                    margin-bottom: 6px;
                }

                .balance-row:last-child {
                    margin-bottom: 0;
                }

                .balance-row .label {
                    font-weight: 500;
                    color: #666;
                }

                .balance {
                    font-weight: 600;
                    font-family: monospace;
                }

                .balance.available {
                    color: #28a745;
                }

                .balance.frozen {
                    color: #6f42c1;
                }

                .mode-selector {
                    margin-bottom: 16px;
                    padding: 12px;
                    background: #f8f9fa;
                    border-radius: 6px;
                }

                .mode-option {
                    display: block;
                    margin-bottom: 8px;
                    cursor: pointer;
                    font-size: 14px;
                }

                .mode-option:last-child {
                    margin-bottom: 0;
                }

                .mode-option input {
                    margin-right: 8px;
                }

                .form-group {
                    margin-bottom: 16px;
                }

                .form-group label {
                    display: block;
                    margin-bottom: 6px;
                    font-weight: 500;
                }

                .form-group input {
                    width: 100%;
                    padding: 10px;
                    border: 1px solid #ddd;
                    border-radius: 6px;
                    font-size: 14px;
                }

                .form-group input:focus {
                    outline: none;
                    border-color: #007bff;
                }

                /* 🆕 使用与AdminPanel相同的按钮样式，但调整宽度 */
                .admin-btn {
                    display: inline-block;
                    padding: 12px 24px;
                    background: #007bff;
                    color: white;
                    border: none;
                    border-radius: 6px;
                    font-size: 16px;
                    font-weight: 500;
                    cursor: pointer;
                    transition: all 0.2s ease;
                    box-shadow: 0 2px 4px rgba(0, 123, 255, 0.2);
                    /* 🆕 移除了 width: 100%; 让按钮根据内容自适应宽度 */
                }

                .admin-btn:hover:not(:disabled) {
                    background: #0056b3;
                    transform: translateY(-1px);
                    box-shadow: 0 4px 8px rgba(0, 123, 255, 0.3);
                }

                .admin-btn:disabled {
                    background: #6c757d;
                    cursor: not-allowed;
                    transform: none;
                    box-shadow: none;
                }

                .admin-btn:active {
                    transform: translateY(0);
                }

                .loading-overlay {
                    position: absolute;
                    top: 0;
                    left: 0;
                    right: 0;
                    bottom: 0;
                    background: rgba(255, 255, 255, 0.9);
                    display: flex;
                    justify-content: center;
                    align-items: center;
                    z-index: 100;
                    border-radius: inherit;
                }

                .loading-spinner {
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                    gap: 12px;
                }

                .spinner {
                    width: 40px;
                    height: 40px;
                    border: 4px solid #f3f3f3;
                    border-top: 4px solid #007bff;
                    border-radius: 50%;
                    animation: spin 1s linear infinite;
                }

                @keyframes spin {
                    0% { transform: rotate(0deg); }
                    100% { transform: rotate(360deg); }
                }

                .error-message {
                    text-align: center;
                    color: #dc3545;
                    padding: 20px;
                }
            `}</style>
        </>
    );
}