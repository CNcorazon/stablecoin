import React, { useState, useEffect } from 'react';
import { useAccount } from 'wagmi';
import { useWeb3Auth } from '@web3auth/modal/react';
import { ethers } from 'ethers';
import {
    getCurrentNetworkConfig,
    getTargetNetworkConfig,
    TOKEN_ABI,
    BRIDGE_ABI,
    queryAvailableBalance
} from '../config/xdCoin';

// 🆕 使用与AdminPanel相同的交易查询函数
const queryTransactionStatus = async (txHash: string, network: string) => {
    const baseUrl = process.env.NODE_ENV === 'production'
        ? "https://your-api-domain.com"
        : "http://localhost:3000";
    const url = `${baseUrl}/tx/${txHash}?network=${network}`;

    try {
        const response = await fetch(url, {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json',
            },
        });

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const data = await response.json();
        return data;
    } catch (error) {
        console.error('查询交易状态失败:', error);
        return null;
    }
};

// 🆕 使用与AdminPanel相同的TransactionModal组件
interface TransactionModalProps {
    isOpen: boolean;
    onClose: () => void;
    result: {
        success: boolean;
        action: string;
        txHash?: string;
        network?: string;
        blockNumber?: string;
        status?: string;
        error?: string;
        amount?: string;
        from?: string;
        to?: string;
        messageId?: string;
        estimatedFee?: string;
    } | null;
}

const TransactionModal: React.FC<TransactionModalProps> = ({ isOpen, onClose, result }) => {
    const [currentStatus, setCurrentStatus] = useState<any>(null);
    const [isPolling, setIsPolling] = useState(false);
    const [pollCount, setPollCount] = useState(0);

    const pollTransactionStatus = async (txHash: string, network: string) => {
        if (isPolling || pollCount >= 20) return;

        setIsPolling(true);
        setPollCount(prev => prev + 1);

        try {
            const statusData = await queryTransactionStatus(txHash, network);
            if (statusData && statusData.success) {
                setCurrentStatus(statusData.transaction);
            }
        } catch (error) {
            console.error('轮询交易状态失败:', error);
        } finally {
            setIsPolling(false);
        }
    };

    React.useEffect(() => {
        if (isOpen && result?.txHash && result?.network && result?.success) {
            setCurrentStatus(null);
            setPollCount(0);

            const interval = setInterval(() => {
                if (pollCount < 20 && !currentStatus?.status?.includes('confirmed')) {
                    pollTransactionStatus(result.txHash!, result.network!);
                } else {
                    clearInterval(interval);
                }
            }, 3000);

            return () => clearInterval(interval);
        }
    }, [isOpen, result?.txHash, result?.network, pollCount]);

    const handleClose = () => {
        setCurrentStatus(null);
        setPollCount(0);
        setIsPolling(false);
        onClose();
    };

    const getStatusDisplay = () => {
        if (currentStatus?.status === 'confirmed') {
            return {
                text: `已确认 (区块号: ${currentStatus.blockNumber})`,
                icon: '✅',
                color: '#28a745'
            };
        } else if (currentStatus?.status === 'failed') {
            return {
                text: '交易失败',
                icon: '❌',
                color: '#dc3545',
                extraInfo: isPolling ? `正在监控交易状态... (${pollCount}/20)` : ''
            };
        } else if (result?.blockNumber) {
            return {
                text: `已确认 (区块号: ${result.blockNumber})`,
                icon: '✅',
                color: '#28a745'
            };
        } else {
            return {
                text: '待确认',
                icon: '🔄',
                color: '#ffc107',
                extraInfo: isPolling ? `正在监控交易状态... (${pollCount}/20)` : '点击"查看交易"手动检查状态'
            };
        }
    };

    const statusDisplay = getStatusDisplay();

    if (!isOpen || !result) return null;

    return (
        <div className="modal-overlay" onClick={handleClose}>
            <div className="modal-content" onClick={(e) => e.stopPropagation()}>
                <div className="modal-header">
                    <h3>{result.success ? '✅ 交易提交成功' : '❌ 交易失败'}</h3>
                    <button className="modal-close" onClick={handleClose}>×</button>
                </div>

                <div className="modal-body">
                    {result.success ? (
                        <div className="transaction-success">
                            <div className="result-item">
                                <span className="label">操作类型:</span>
                                <span className="value">{result.action}</span>
                            </div>
                            {result.txHash && (
                                <div className="result-item">
                                    <span className="label">交易哈希:</span>
                                    <span className="value tx-hash" title={result.txHash}>
                                        {result.txHash.slice(0, 20)}...{result.txHash.slice(-20)}
                                    </span>
                                </div>
                            )}
                            {result.messageId && (
                                <div className="result-item">
                                    <span className="label">消息ID:</span>
                                    <span className="value tx-hash" title={result.messageId}>
                                        {result.messageId.slice(0, 20)}...{result.messageId.slice(-20)}
                                    </span>
                                </div>
                            )}
                            {result.amount && (
                                <div className="result-item">
                                    <span className="label">转账金额:</span>
                                    <span className="value">{result.amount} XD</span>
                                </div>
                            )}
                            {result.estimatedFee && (
                                <div className="result-item">
                                    <span className="label">跨链费用:</span>
                                    <span className="value">{result.estimatedFee} ETH</span>
                                </div>
                            )}
                            {result.to && (
                                <div className="result-item">
                                    <span className="label">接收地址:</span>
                                    <span className="value tx-hash" title={result.to}>
                                        {result.to.slice(0, 10)}...{result.to.slice(-8)}
                                    </span>
                                </div>
                            )}
                            {result.network && (
                                <div className="result-item">
                                    <span className="label">网络:</span>
                                    <span className="value">{result.network}</span>
                                </div>
                            )}
                            <div className="result-item">
                                <span className="label">状态:</span>
                                <span className="value status" style={{ color: statusDisplay.color }}>
                                    {statusDisplay.icon} {statusDisplay.text}
                                </span>
                            </div>
                            {statusDisplay.extraInfo && (
                                <div className="result-item">
                                    <span className="label"></span>
                                    <span className="value status-extra">
                                        {statusDisplay.extraInfo}
                                    </span>
                                </div>
                            )}
                            <div className="transaction-tip">
                                {currentStatus?.status === 'confirmed'
                                    ? '🎉 跨链转账已成功提交到源链！请耐心等待目标链到账'
                                    : '💡 跨链转账已提交，预计 5-15 分钟在目标链到账'}
                            </div>
                        </div>
                    ) : (
                        <div className="transaction-error">
                            <div className="error-message">
                                {result.error || '操作失败，请重试'}
                            </div>
                        </div>
                    )}
                </div>

                <div className="modal-footer">
                    {result.success && result.txHash && (
                        <button
                            className="btn-secondary"
                            onClick={() => {
                                const explorerUrl = result.network === 'sepolia'
                                    ? `https://sepolia.etherscan.io/tx/${result.txHash}`
                                    : `https://testnet.bscscan.com/tx/${result.txHash}`;
                                window.open(explorerUrl, '_blank');
                            }}
                        >
                            🔗 查看交易
                        </button>
                    )}
                    {result.success && result.txHash && currentStatus?.status === 'pending' && (
                        <button
                            className="btn-refresh"
                            onClick={() => {
                                if (result.txHash && result.network) {
                                    pollTransactionStatus(result.txHash, result.network);
                                }
                            }}
                            disabled={isPolling}
                        >
                            🔄 刷新状态
                        </button>
                    )}
                    <button className="btn-primary" onClick={handleClose}>
                        确定
                    </button>
                </div>
            </div>

            <style>{`
                /* TransactionModal样式与AdminPanel保持一致 */
                .modal-overlay {
                    position: fixed;
                    top: 0;
                    left: 0;
                    right: 0;
                    bottom: 0;
                    background: rgba(0, 0, 0, 0.5);
                    display: flex;
                    justify-content: center;
                    align-items: center;
                    z-index: 1000;
                }

                .modal-content {
                    background: white;
                    border-radius: 12px;
                    min-width: 450px;
                    max-width: 600px;
                    max-height: 90vh;
                    overflow-y: auto;
                    box-shadow: 0 20px 40px rgba(0, 0, 0, 0.1);
                }

                .modal-header {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    padding: 20px;
                    border-bottom: 1px solid #e0e0e0;
                }

                .modal-header h3 {
                    margin: 0;
                    font-size: 18px;
                }

                .modal-close {
                    background: none;
                    border: none;
                    font-size: 24px;
                    cursor: pointer;
                    color: #666;
                    padding: 0;
                    width: 30px;
                    height: 30px;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    border-radius: 50%;
                    transition: all 0.2s;
                }

                .modal-close:hover {
                    background: #f5f5f5;
                    color: #333;
                }

                .modal-body {
                    padding: 20px;
                }

                .transaction-success {
                    color: #333;
                }

                .result-item {
                    display: flex;
                    justify-content: space-between;
                    align-items: flex-start;
                    padding: 12px 0;
                    border-bottom: 1px solid #f0f0f0;
                }

                .result-item:last-child {
                    border-bottom: none;
                }

                .result-item .label {
                    font-weight: 600;
                    color: #555;
                    min-width: 90px;
                }

                .result-item .value {
                    flex: 1;
                    text-align: right;
                    word-break: break-all;
                }

                .tx-hash {
                    font-family: 'Courier New', monospace;
                    font-size: 14px;
                    background: #f8f9fa;
                    padding: 4px 8px;
                    border-radius: 4px;
                    cursor: pointer;
                }

                .status {
                    font-weight: 600;
                }

                .status-extra {
                    font-size: 12px;
                    color: #6c757d;
                    font-style: italic;
                }

                .transaction-tip {
                    margin-top: 16px;
                    padding: 12px;
                    background: #e8f5e8;
                    border-radius: 6px;
                    font-size: 14px;
                    color: #2d5a2d;
                }

                .transaction-error {
                    text-align: center;
                }

                .error-message {
                    color: #dc3545;
                    font-weight: 500;
                    background: #f8d7da;
                    padding: 15px;
                    border-radius: 6px;
                    border: 1px solid #f5c6cb;
                }

                .modal-footer {
                    display: flex;
                    gap: 10px;
                    justify-content: flex-end;
                    padding: 20px;
                    border-top: 1px solid #e0e0e0;
                }

                .btn-primary, .btn-secondary, .btn-refresh {
                    padding: 8px 16px;
                    border: none;
                    border-radius: 6px;
                    cursor: pointer;
                    font-size: 14px;
                    transition: all 0.2s;
                }

                .btn-primary {
                    background: #007bff;
                    color: white;
                }

                .btn-primary:hover {
                    background: #0056b3;
                }

                .btn-secondary {
                    background: #6c757d;
                    color: white;
                }

                .btn-secondary:hover {
                    background: #545b62;
                }

                .btn-refresh {
                    background: #17a2b8;
                    color: white;
                }

                .btn-refresh:hover {
                    background: #138496;
                }

                .btn-refresh:disabled {
                    background: #6c757d;
                    cursor: not-allowed;
                }
            `}</style>
        </div>
    );
};

export function CrossChain() {
    const { address, isConnected, chainId } = useAccount();
    const { provider } = useWeb3Auth();
    const [amount, setAmount] = useState<string>('');
    const [loading, setLoading] = useState(false);
    const [estimatedFee, setEstimatedFee] = useState<string>('');
    const [availableBalance, setAvailableBalance] = useState<string>('0');
    const [frozenBalance, setFrozenBalance] = useState<string>('0');

    // 🆕 使用与AdminPanel相同的状态管理
    const [modalOpen, setModalOpen] = useState(false);
    const [transactionResult, setTransactionResult] = useState<any>(null);

    const currentNetwork = getCurrentNetworkConfig(chainId || 0);
    const targetNetwork = getTargetNetworkConfig(chainId || 0);

    // 获取用户可用余额
    useEffect(() => {
        const fetchBalance = async () => {
            if (!address || !currentNetwork) return;

            try {
                const [availableResult, frozenResult] = await Promise.all([
                    queryAvailableBalance(address, currentNetwork.name),
                    fetch(`http://localhost:3000/frozen-balance/${address}?network=${currentNetwork.name}`)
                        .then(res => res.json())
                        .catch(() => ({ success: false }))
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

        fetchBalance();
    }, [address, currentNetwork, chainId]);

    // 估算跨链费用
    useEffect(() => {
        const estimateFee = async () => {
            if (!provider || !amount || !address || !currentNetwork || !targetNetwork) {
                setEstimatedFee('');
                return;
            }

            try {
                const ethersProvider = new ethers.BrowserProvider(provider);
                const bridgeContract = new ethers.Contract(
                    currentNetwork.contracts.bridge,
                    BRIDGE_ABI,
                    ethersProvider
                );

                const transferAmount = ethers.parseEther(amount);

                const fee = await bridgeContract.estimateCrossChainFee(
                    targetNetwork.ccipChainSelector,
                    targetNetwork.contracts.bridge,
                    address,
                    transferAmount
                );

                setEstimatedFee(ethers.formatEther(fee));
            } catch (error) {
                console.error('费用估算失败:', error);
                setEstimatedFee('估算失败');
            }
        };

        const debounceTimer = setTimeout(estimateFee, 500);
        return () => clearTimeout(debounceTimer);
    }, [amount, address, provider, currentNetwork, targetNetwork]);

    // 🆕 使用与AdminPanel相同的showTransactionResult函数
    const showTransactionResult = (success: boolean, action: string, result?: any, error?: string) => {
        setTransactionResult({
            success,
            action: '跨链转账',
            txHash: result?.txHash,
            network: result?.network || currentNetwork?.name,
            blockNumber: result?.blockNumber,
            status: result?.status,
            amount: amount,
            from: address,
            to: address,
            messageId: result?.messageId,
            estimatedFee: estimatedFee,
            error
        });
        setModalOpen(true);
    };

    // 🆕 使用与AdminPanel相同的executeAction模式
    const executeCrossChainAction = async () => {
        if (!provider || !address || !isConnected || !amount || !currentNetwork || !targetNetwork) {
            showTransactionResult(false, 'crosschain', null, '请填写跨链金额');
            return;
        }

        // 检查可用余额
        const transferAmount = parseFloat(amount);
        const available = parseFloat(availableBalance);

        if (transferAmount > available) {
            showTransactionResult(false, 'crosschain', null, '可用余额不足（已扣除冻结部分）');
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

            const bridgeContract = new ethers.Contract(
                currentNetwork.contracts.bridge,
                BRIDGE_ABI,
                signer
            );

            const transferAmountWei = ethers.parseEther(amount);

            // 1. 检查并设置授权
            const currentAllowance = await tokenContract.allowance(address, currentNetwork.contracts.bridge);
            if (currentAllowance < transferAmountWei) {
                const approveTx = await tokenContract.approve(currentNetwork.contracts.bridge, transferAmountWei);
                await approveTx.wait();
            }

            // 2. 估算费用
            const fee = await bridgeContract.estimateCrossChainFee(
                targetNetwork.ccipChainSelector,
                targetNetwork.contracts.bridge,
                address,
                transferAmountWei
            );

            // 3. 执行跨链转账
            const crossChainTx = await bridgeContract.transferCrossChain(
                targetNetwork.ccipChainSelector,
                targetNetwork.contracts.bridge,
                address,
                transferAmountWei,
                { value: fee }
            );

            const receipt = await crossChainTx.wait();

            // 4. 解析事件获取消息ID
            let messageId = '';
            for (const log of receipt.logs) {
                try {
                    const parsedLog = bridgeContract.interface.parseLog(log);
                    if (parsedLog?.name === 'MessageSent') {
                        messageId = parsedLog.args.messageId;
                        break;
                    }
                } catch (e) {
                    // 忽略解析失败的日志
                }
            }

            // 🆕 显示成功弹窗
            showTransactionResult(true, 'crosschain', {
                txHash: crossChainTx.hash,
                network: currentNetwork.name,
                blockNumber: receipt.blockNumber,
                status: 'confirmed',
                messageId: messageId
            });

            // 重置表单
            setAmount('');

            // 刷新余额
            setTimeout(async () => {
                if (address && currentNetwork) {
                    const availableResult = await queryAvailableBalance(address, currentNetwork.name);
                    if (availableResult.success && availableResult.data) {
                        setAvailableBalance(availableResult.data.availableBalance || '0');
                    }
                }
            }, 3000);

        } catch (error: any) {
            console.error('跨链转账失败:', error);
            // 🆕 显示失败弹窗
            showTransactionResult(false, 'crosschain', null, error.message);
        } finally {
            setLoading(false);
        }
    };

    if (!currentNetwork) {
        return (
            <div className="card">
                <h3>🌉 跨链转移</h3>
                <div className="error">
                    ❌ 当前网络不支持跨链功能
                    <br />
                    请切换到 Sepolia 或 BSC Testnet
                </div>
            </div>
        );
    }

    if (!targetNetwork) {
        return (
            <div className="card">
                <h3>🌉 跨链转移</h3>
                <div className="error">
                    ❌ 无法确定目标网络
                </div>
            </div>
        );
    }

    return (
        <>
            <div className="card">
                <h3>🌉 跨链转移</h3>

                <div className="network-info">
                    🚀 路由: {currentNetwork.name === 'sepolia' ? '🔷 Sepolia → 🟡 BSC Testnet' : '🟡 BSC Testnet → 🔷 Sepolia'}
                </div>

                <div className="balance-display">
                    <div className="balance-row">
                        <span className="label">💰 可用余额:</span>
                        <span className="balance available">{parseFloat(availableBalance).toFixed(4)} XD</span>
                    </div>
                    {parseFloat(frozenBalance) > 0 && (
                        <div className="balance-row">
                            <span className="label">🧊 冻结余额:</span>
                            <span className="balance frozen">{parseFloat(frozenBalance).toFixed(4)} XD</span>
                        </div>
                    )}
                </div>

                <div className="user-info">
                    <div className="address-display">
                        <span className="label">📍 接收地址:</span>
                        <span className="address">{address ? `${address.slice(0, 6)}...${address.slice(-4)}` : 'Not Connected'}</span>
                        <span className="note">(您的地址)</span>
                    </div>
                </div>

                <div className="form-group">
                    <label>💰 跨链金额:</label>
                    <div className="amount-input">
                        <input
                            type="number"
                            value={amount}
                            onChange={(e) => setAmount(e.target.value)}
                            placeholder="请输入跨链金额"
                            disabled={loading}
                            step="0.0001"
                        />
                        <button
                            className="max-button"
                            onClick={() => setAmount(availableBalance)}
                            disabled={loading}
                        >
                            MAX
                        </button>
                    </div>
                </div>

                {estimatedFee && (
                    <div className="fee-info">
                        💸 预估跨链费用: {parseFloat(estimatedFee).toFixed(6)} ETH
                    </div>
                )}

                {/* 🆕 调整按钮样式，不占满宽度 */}
                <button
                    onClick={executeCrossChainAction}
                    disabled={loading || !amount}
                    className="admin-btn"
                >
                    {loading ? '🔄 处理中...' : '🌉 开始跨链转账'}
                </button>

                {/* <div className="crosschain-note">
                    💡 使用 Chainlink CCIP 协议进行安全跨链转账
                    <br />
                    ⚡ 源链销毁代币，目标链自动铸造到您的地址
                </div> */}

                {/* 🆕 全屏加载遮罩 */}
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

                .user-info {
                    margin-bottom: 16px;
                }

                .address-display {
                    display: flex;
                    align-items: center;
                    gap: 8px;
                    padding: 10px;
                    background: #e7f3ff;
                    border-radius: 6px;
                    font-size: 14px;
                }

                .address-display .label {
                    font-weight: 500;
                    color: #666;
                }

                .address-display .address {
                    font-family: monospace;
                    font-weight: 600;
                    color: #007bff;
                }

                .address-display .note {
                    color: #666;
                    font-size: 12px;
                }

                .form-group {
                    margin-bottom: 16px;
                }

                .form-group label {
                    display: block;
                    margin-bottom: 6px;
                    font-weight: 500;
                }

                .amount-input {
                    display: flex;
                    gap: 8px;
                }

                .amount-input input {
                    flex: 1;
                    padding: 10px;
                    border: 1px solid #ddd;
                    border-radius: 6px;
                    font-size: 14px;
                }

                .amount-input input:focus {
                    outline: none;
                    border-color: #007bff;
                }

                .max-button {
                    padding: 10px 16px;
                    background: #6c757d;
                    color: white;
                    border: none;
                    border-radius: 6px;
                    font-size: 12px;
                    font-weight: 500;
                    cursor: pointer;
                    transition: all 0.2s;
                }

                .max-button:hover:not(:disabled) {
                    background: #545b62;
                }

                .max-button:disabled {
                    opacity: 0.6;
                    cursor: not-allowed;
                }

                .fee-info {
                    background: #fff3cd;
                    color: #856404;
                    padding: 10px;
                    border-radius: 6px;
                    margin-bottom: 16px;
                    font-size: 14px;
                    border: 1px solid #ffeaa7;
                }

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
                    margin-bottom: 16px;
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

                .crosschain-note {
                    font-size: 13px;
                    color: #666;
                    background: #f8f9fa;
                    padding: 12px;
                    border-radius: 6px;
                    border-left: 4px solid #007bff;
                    line-height: 1.4;
                }

                .error {
                    background: #f8d7da;
                    color: #721c24;
                    padding: 12px;
                    border-radius: 6px;
                    border: 1px solid #f5c6cb;
                }

                /* 🆕 全屏加载遮罩样式 */
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
            `}</style>
        </>
    );
} 