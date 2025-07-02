import React, { useState, useEffect, useCallback } from 'react';
import { useAccount } from 'wagmi';
import { getCurrentNetworkConfig, apiCall, API_CONFIG, queryBalance } from '../config/xdCoin';

// 🆕 交易状态查询函数
const queryTransactionStatus = async (txHash: string, network: string) => {
    const url = `${API_CONFIG.baseUrl}/tx/${txHash}?network=${network}`;

    try {
        const response = await fetch(url, {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json',
            },
        });

        if (!response.ok) {
            throw new Error(`HTTP Error: ${response.status}`);
        }

        const result = await response.json();
        return result;
    } catch (error) {
        console.error('交易状态查询失败:', error);
        throw error;
    }
};

// 🆕 改进的交易结果弹窗组件
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
    } | null;
}

const TransactionModal: React.FC<TransactionModalProps> = ({ isOpen, onClose, result }) => {
    const [currentStatus, setCurrentStatus] = useState<{
        status: string;
        blockNumber?: number;
        confirmations?: number;
        timestamp?: number;
        txSuccess?: boolean;
    } | null>(null);
    const [isPolling, setIsPolling] = useState(false);
    const [pollCount, setPollCount] = useState(0);

    // 🆕 改进的交易状态查询函数
    const pollTransactionStatus = useCallback(async (txHash: string, network: string) => {
        try {
            console.log(`🔍 查询交易状态: ${txHash} (第${pollCount + 1}次)`);

            const statusResult = await queryTransactionStatus(txHash, network);
            console.log('📊 交易状态结果:', statusResult);

            if (statusResult.success) {
                const newStatus = {
                    status: statusResult.data?.status || statusResult.status,
                    blockNumber: statusResult.data?.blockNumber || statusResult.blockNumber,
                    confirmations: statusResult.data?.confirmations || statusResult.confirmations,
                    timestamp: statusResult.data?.timestamp || statusResult.timestamp,
                    txSuccess: statusResult.data?.success
                };

                setCurrentStatus(newStatus);
                setPollCount(prev => prev + 1);

                console.log('📈 状态更新:', newStatus);

                // 如果交易已确认且有足够确认数，停止轮询
                if (newStatus.status === 'confirmed' && (newStatus.confirmations || 0) >= 1) {
                    console.log('✅ 交易已确认，停止轮询');
                    setIsPolling(false);
                    return true; // 返回true表示轮询完成
                }
            } else {
                console.log('⚠️ 查询状态响应失败:', statusResult.message);
            }
        } catch (error) {
            console.error('❌ 查询交易状态失败:', error);
            // 查询失败也增加计数，避免无限重试
            setPollCount(prev => prev + 1);
        }
        return false; // 返回false表示需要继续轮询
    }, [pollCount]);

    // 🆕 轮询效果
    useEffect(() => {
        let intervalId: NodeJS.Timeout | null = null;

        if (isOpen && result?.success && result?.txHash && result?.network && isPolling) {
            console.log('🚀 开始轮询交易状态:', result.txHash);

            // 立即执行一次查询
            pollTransactionStatus(result.txHash, result.network);

            // 设置轮询，每3秒查询一次，最多查询20次（1分钟）
            intervalId = setInterval(async () => {
                if (pollCount >= 20) {
                    console.log('⏰ 轮询次数达到上限，停止轮询');
                    setIsPolling(false);
                    return;
                }

                const shouldStop = await pollTransactionStatus(result.txHash!, result.network!);
                if (shouldStop) {
                    setIsPolling(false);
                }
            }, 3000); // 改为3秒轮询一次
        }

        return () => {
            if (intervalId) {
                clearInterval(intervalId);
                console.log('🛑 清理轮询定时器');
            }
        };
    }, [isOpen, result?.txHash, result?.network, isPolling, pollTransactionStatus]);

    // 🆕 初始化轮询状态
    useEffect(() => {
        if (isOpen && result?.success && result?.txHash && !result?.blockNumber) {
            console.log('🎯 初始化轮询 - 交易待确认');
            setIsPolling(true);
            setPollCount(0);
            setCurrentStatus({
                status: 'pending',
                blockNumber: undefined,
                confirmations: 0
            });
        } else if (isOpen && result?.success && result?.blockNumber) {
            console.log('🎯 初始化 - 交易已确认');
            setCurrentStatus({
                status: 'confirmed',
                blockNumber: parseInt(result.blockNumber),
                confirmations: 1
            });
            setIsPolling(false);
            setPollCount(0);
        } else {
            setIsPolling(false);
            setCurrentStatus(null);
            setPollCount(0);
        }
    }, [isOpen, result]);

    // 🆕 关闭弹窗时清理状态
    const handleClose = () => {
        console.log('🚪 关闭弹窗，清理状态');
        setIsPolling(false);
        setCurrentStatus(null);
        setPollCount(0);
        onClose();
    };

    if (!isOpen || !result) return null;

    // 🆕 获取当前显示的状态信息
    const getStatusDisplay = () => {
        if (result.success && currentStatus) {
            if (currentStatus.status === 'confirmed') {
                return {
                    text: `已确认 (区块号: ${currentStatus.blockNumber})`,
                    icon: '✅',
                    color: '#28a745',
                    extraInfo: currentStatus.confirmations ? `确认数: ${currentStatus.confirmations}` : ''
                };
            } else {
                return {
                    text: '待确认',
                    icon: '🔄',
                    color: '#ffc107',
                    extraInfo: isPolling ? `正在监控交易状态... (${pollCount}/20)` : ''
                };
            }
        } else if (result.blockNumber) {
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
                            {/* 🆕 额外状态信息 */}
                            {statusDisplay.extraInfo && (
                                <div className="result-item">
                                    <span className="label"></span>
                                    <span className="value status-extra">
                                        {statusDisplay.extraInfo}
                                    </span>
                                </div>
                            )}
                            {/* 🆕 确认时间显示 */}
                            {currentStatus?.timestamp && (
                                <div className="result-item">
                                    <span className="label">确认时间:</span>
                                    <span className="value">
                                        {new Date(currentStatus.timestamp * 1000).toLocaleString()}
                                    </span>
                                </div>
                            )}
                            <div className="transaction-tip">
                                {currentStatus?.status === 'confirmed'
                                    ? '🎉 交易已成功确认并上链！'
                                    : '💡 交易已提交到区块链，正在等待网络确认...'}
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
                    {/* 🆕 手动刷新按钮 */}
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
                /* 原有样式保持不变 */
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
                    font-weight: 500;
                    color: #666;
                    min-width: 80px;
                    margin-right: 16px;
                }

                .result-item .value {
                    font-family: monospace;
                    flex: 1;
                    text-align: right;
                    word-break: break-all;
                }

                .tx-hash {
                    font-size: 12px;
                    background: #f8f9fa;
                    padding: 4px 8px;
                    border-radius: 4px;
                    cursor: pointer;
                }

                .status {
                    font-weight: 600;
                    display: flex;
                    align-items: center;
                    justify-content: flex-end;
                    gap: 4px;
                }

                .status-extra {
                    font-size: 12px;
                    color: #666;
                    font-style: italic;
                }

                .transaction-tip {
                    margin-top: 16px;
                    padding: 12px;
                    border-radius: 6px;
                    font-size: 14px;
                    background: ${currentStatus?.status === 'confirmed' ? '#d4edda' : '#e7f3ff'};
                    color: ${currentStatus?.status === 'confirmed' ? '#155724' : '#0066cc'};
                }

                .transaction-error {
                    text-align: center;
                }

                .error-message {
                    color: #dc3545;
                    font-size: 16px;
                    padding: 20px;
                    background: #f8d7da;
                    border-radius: 6px;
                }

                .modal-footer {
                    display: flex;
                    justify-content: flex-end;
                    gap: 12px;
                    padding: 20px;
                    border-top: 1px solid #e0e0e0;
                }

                .btn-primary {
                    background: #007bff;
                    color: white;
                    border: none;
                    padding: 10px 20px;
                    border-radius: 6px;
                    cursor: pointer;
                    font-weight: 500;
                    transition: all 0.2s;
                }

                .btn-primary:hover {
                    background: #0056b3;
                }

                .btn-secondary {
                    background: #6c757d;
                    color: white;
                    border: none;
                    padding: 10px 20px;
                    border-radius: 6px;
                    cursor: pointer;
                    font-weight: 500;
                    transition: all 0.2s;
                }

                .btn-secondary:hover {
                    background: #545b62;
                }

                /* 🆕 新增刷新按钮样式 */
                .btn-refresh {
                    background: #17a2b8;
                    color: white;
                    border: none;
                    padding: 10px 20px;
                    border-radius: 6px;
                    cursor: pointer;
                    font-weight: 500;
                    transition: all 0.2s;
                }

                .btn-refresh:hover:not(:disabled) {
                    background: #138496;
                }

                .btn-refresh:disabled {
                    opacity: 0.6;
                    cursor: not-allowed;
                }
            `}</style>
        </div>
    );
};

export function AdminPanel() {
    const { address, chainId } = useAccount();
    const [isAdmin, setIsAdmin] = useState(false);
    const [loading, setLoading] = useState(false);
    const [activeTab, setActiveTab] = useState<'contract' | 'user' | 'funds'>('contract');

    // 用户管理表单状态
    const [userAddress, setUserAddress] = useState('');
    const [freezeAmount, setFreezeAmount] = useState('');
    const [unfreezeAmount, setUnfreezeAmount] = useState('');

    // 用户余额查询状态
    const [balanceLoading, setBalanceLoading] = useState(false);
    const [balanceData, setBalanceData] = useState<{
        totalBalance: string;
        frozenBalance: string;
        availableBalance: string;
    } | null>(null);
    const [balanceError, setBalanceError] = useState('');

    // 🆕 弹窗状态
    const [modalOpen, setModalOpen] = useState(false);
    const [transactionResult, setTransactionResult] = useState<{
        success: boolean;
        action: string;
        txHash?: string;
        network?: string;
        blockNumber?: string;
        status?: string;
        error?: string;
    } | null>(null);

    const currentNetwork = getCurrentNetworkConfig(chainId || 0);

    useEffect(() => {
        // 检查是否为管理员（deployer地址）
        if (address && currentNetwork) {
            setIsAdmin(address.toLowerCase() === currentNetwork.deployerAddress.toLowerCase());
        }
    }, [address, currentNetwork]);

    // 查询用户余额函数
    const handleQueryBalance = async () => {
        if (!userAddress.trim()) {
            setBalanceError('请输入用户地址');
            return;
        }

        if (!currentNetwork) {
            setBalanceError('当前网络不支持');
            return;
        }

        setBalanceLoading(true);
        setBalanceError('');
        setBalanceData(null);

        try {
            const result = await queryBalance(userAddress.trim(), currentNetwork.name);

            if (result.success) {
                setBalanceData({
                    totalBalance: result.totalBalance || result.balance || '0',
                    frozenBalance: result.frozenBalance || '0',
                    availableBalance: result.availableBalance || '0'
                });
            } else {
                throw new Error(result.message || '查询失败');
            }
        } catch (error: any) {
            console.error('余额查询失败:', error);
            setBalanceError(`查询失败: ${error.message}`);
        } finally {
            setBalanceLoading(false);
        }
    };

    // 当用户地址改变时清空余额数据
    const handleUserAddressChange = (value: string) => {
        setUserAddress(value);
        setBalanceData(null);
        setBalanceError('');
    };

    // 🆕 显示交易结果弹窗
    const showTransactionResult = (success: boolean, action: string, result?: any, error?: string) => {
        setTransactionResult({
            success,
            action: getActionDisplayName(action),
            txHash: result?.txHash,
            network: result?.network,
            blockNumber: result?.blockNumber,
            status: result?.status,
            error
        });
        setModalOpen(true);
    };

    const executeAdminAction = async (action: string, params: any = {}) => {
        if (!currentNetwork) return;

        setLoading(true);

        try {
            const actionData = {
                ...params,
                network: currentNetwork.name
            };

            const result = await apiCall(API_CONFIG.endpoints[action as keyof typeof API_CONFIG.endpoints], actionData, 'POST');

            if (result.success) {
                // 🆕 显示成功弹窗
                showTransactionResult(true, action, result);

                // 清空表单
                if (action.includes('block') || action.includes('freeze')) {
                    setUserAddress('');
                    setFreezeAmount('');
                    setUnfreezeAmount('');
                    setBalanceData(null);
                    setBalanceError('');
                }

                // 如果是冻结/解冻操作，自动刷新余额
                if ((action === 'freeze' || action === 'unfreeze') && userAddress.trim()) {
                    setTimeout(() => {
                        handleQueryBalance();
                    }, 3000);
                }
            } else {
                throw new Error(result.error || '操作失败');
            }

        } catch (error: any) {
            console.error(`${action} 操作失败:`, error);
            // 🆕 显示失败弹窗
            showTransactionResult(false, action, null, error.message);
        } finally {
            setLoading(false);
        }
    };

    const getActionDisplayName = (action: string): string => {
        const actionNames: Record<string, string> = {
            'pause': '暂停合约',
            'unpause': '恢复合约',
            'block': '拉黑用户',
            'unblock': '解除拉黑',
            'freeze': '冻结资金',
            'unfreeze': '解冻资金'
        };
        return actionNames[action] || action;
    };

    // 合约管理操作
    const handlePause = () => executeAdminAction('pause');
    const handleUnpause = () => executeAdminAction('unpause');

    // 用户管理操作
    const handleBlockUser = () => {
        if (!userAddress.trim()) {
            showTransactionResult(false, 'block', null, '请输入用户地址');
            return;
        }
        executeAdminAction('block', { user: userAddress.trim() });
    };

    const handleUnblockUser = () => {
        if (!userAddress.trim()) {
            showTransactionResult(false, 'unblock', null, '请输入用户地址');
            return;
        }
        executeAdminAction('unblock', { user: userAddress.trim() });
    };

    // 资金管理操作
    const handleFreezeTokens = () => {
        if (!userAddress.trim() || !freezeAmount.trim()) {
            showTransactionResult(false, 'freeze', null, '请输入用户地址和冻结金额');
            return;
        }
        executeAdminAction('freeze', {
            user: userAddress.trim(),
            amount: freezeAmount.trim()
        });
    };

    const handleUnfreezeTokens = () => {
        if (!userAddress.trim() || !unfreezeAmount.trim()) {
            showTransactionResult(false, 'unfreeze', null, '请输入用户地址和解冻金额');
            return;
        }
        executeAdminAction('unfreeze', {
            user: userAddress.trim(),
            amount: unfreezeAmount.trim()
        });
    };

    if (!currentNetwork) {
        return (
            <div className="card">
                <h3>⚙️ 管理面板</h3>
                <div className="error">❌ 当前网络不支持</div>
            </div>
        );
    }

    if (!isAdmin) {
        return (
            <div className="card">
                <h3>⚙️ 管理面板</h3>
                <div className="warning">
                    ⚠️ 只有管理员可以访问此面板
                    <br />
                    管理员地址: {currentNetwork.deployerAddress}
                    <br />
                    当前地址: {address}
                </div>
            </div>
        );
    }

    return (
        <>
            <div className="card">
                <h3>⚙️ 管理面板</h3>
                <div className="admin-info">
                    ✅ 管理员权限已确认
                    <br />
                    🌐 网络: {currentNetwork.name === 'sepolia' ? '🔷 Sepolia' : '🟡 BSC Testnet'}
                </div>

                {/* 标签页导航 */}
                <div className="admin-tabs">
                    <button
                        onClick={() => setActiveTab('contract')}
                        className={`tab-btn ${activeTab === 'contract' ? 'active' : ''}`}
                    >
                        🔧 合约管理
                    </button>
                    <button
                        onClick={() => setActiveTab('user')}
                        className={`tab-btn ${activeTab === 'user' ? 'active' : ''}`}
                    >
                        👤 用户管理
                    </button>
                    <button
                        onClick={() => setActiveTab('funds')}
                        className={`tab-btn ${activeTab === 'funds' ? 'active' : ''}`}
                    >
                        💰 资金管理
                    </button>
                </div>

                {/* 合约管理标签页 */}
                {activeTab === 'contract' && (
                    <div className="admin-section">
                        <h4>🔧 合约管理</h4>
                        <div className="admin-actions">
                            <button
                                onClick={handlePause}
                                disabled={loading}
                                className="admin-btn pause-btn"
                            >
                                ⏸️ 暂停合约
                            </button>

                            <button
                                onClick={handleUnpause}
                                disabled={loading}
                                className="admin-btn unpause-btn"
                            >
                                ▶️ 恢复合约
                            </button>
                        </div>
                    </div>
                )}

                {/* 用户管理标签页 */}
                {activeTab === 'user' && (
                    <div className="admin-section">
                        <h4>👤 用户管理</h4>
                        <div className="form-group">
                            <label>用户地址:</label>
                            <input
                                type="text"
                                value={userAddress}
                                onChange={(e) => handleUserAddressChange(e.target.value)}
                                placeholder="输入用户地址 (0x...)"
                                className="admin-input"
                            />
                        </div>
                        <div className="admin-actions">
                            <button
                                onClick={handleBlockUser}
                                disabled={loading}
                                className="admin-btn block-btn"
                            >
                                🚫 拉黑用户
                            </button>

                            <button
                                onClick={handleUnblockUser}
                                disabled={loading}
                                className="admin-btn unblock-btn"
                            >
                                ✅ 解除拉黑
                            </button>
                        </div>
                    </div>
                )}

                {/* 资金管理标签页 */}
                {activeTab === 'funds' && (
                    <div className="admin-section">
                        <h4>💰 资金管理</h4>

                        {/* 用户地址和余额查询区域 */}
                        <div className="user-info-section">
                            <div className="form-group">
                                <label>用户地址:</label>
                                <div className="address-input-group">
                                    <input
                                        type="text"
                                        value={userAddress}
                                        onChange={(e) => handleUserAddressChange(e.target.value)}
                                        placeholder="输入用户地址 (0x...)"
                                        className="admin-input address-input"
                                    />
                                    <button
                                        onClick={handleQueryBalance}
                                        disabled={balanceLoading || !userAddress.trim()}
                                        className="admin-btn query-btn"
                                    >
                                        {balanceLoading ? '🔄 查询中...' : '🔍 查询余额'}
                                    </button>
                                </div>
                            </div>

                            {/* 余额显示区域 */}
                            {balanceData && (
                                <div className="balance-display">
                                    <div className="balance-item">
                                        <span className="balance-label">💰 总余额:</span>
                                        <span className="balance-value">{balanceData.totalBalance} XD</span>
                                    </div>
                                    <div className="balance-item">
                                        <span className="balance-label">🧊 冻结余额:</span>
                                        <span className="balance-value frozen">{balanceData.frozenBalance} XD</span>
                                    </div>
                                    <div className="balance-item">
                                        <span className="balance-label">✅ 可用余额:</span>
                                        <span className="balance-value available">{balanceData.availableBalance} XD</span>
                                    </div>
                                </div>
                            )}

                            {/* 余额查询错误显示 */}
                            {balanceError && (
                                <div className="balance-error">
                                    ❌ {balanceError}
                                </div>
                            )}
                        </div>

                        <div className="funds-section">
                            <div className="freeze-section">
                                <div className="form-group">
                                    <label>冻结金额 (XD):</label>
                                    <input
                                        type="number"
                                        value={freezeAmount}
                                        onChange={(e) => setFreezeAmount(e.target.value)}
                                        placeholder="输入冻结金额"
                                        className="admin-input"
                                        min="0"
                                        step="0.000001"
                                    />
                                </div>
                                <button
                                    onClick={handleFreezeTokens}
                                    disabled={loading}
                                    className="admin-btn freeze-btn"
                                >
                                    🧊 冻结资金
                                </button>
                            </div>

                            <div className="unfreeze-section">
                                <div className="form-group">
                                    <label>解冻金额 (XD):</label>
                                    <input
                                        type="number"
                                        value={unfreezeAmount}
                                        onChange={(e) => setUnfreezeAmount(e.target.value)}
                                        placeholder="输入解冻金额"
                                        className="admin-input"
                                        min="0"
                                        step="0.000001"
                                    />
                                </div>
                                <button
                                    onClick={handleUnfreezeTokens}
                                    disabled={loading}
                                    className="admin-btn unfreeze-btn"
                                >
                                    🔥 解冻资金
                                </button>
                            </div>
                        </div>
                    </div>
                )}

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
                .admin-tabs {
                    display: flex;
                    gap: 8px;
                    margin: 16px 0;
                    border-bottom: 1px solid #e0e0e0;
                }

                .tab-btn {
                    background: none;
                    border: none;
                    padding: 8px 16px;
                    cursor: pointer;
                    border-bottom: 2px solid transparent;
                    transition: all 0.2s;
                }

                .tab-btn:hover {
                    background: #f5f5f5;
                }

                .tab-btn.active {
                    border-bottom-color: #007bff;
                    color: #007bff;
                }

                .admin-section {
                    margin-top: 16px;
                }

                .form-group {
                    margin-bottom: 12px;
                }

                .form-group label {
                    display: block;
                    margin-bottom: 4px;
                    font-weight: 500;
                }

                .admin-input {
                    width: 100%;
                    padding: 8px 12px;
                    border: 1px solid #ddd;
                    border-radius: 4px;
                    font-size: 14px;
                }

                .admin-input:focus {
                    outline: none;
                    border-color: #007bff;
                }

                .user-info-section {
                    background: #f8f9fa;
                    padding: 16px;
                    border-radius: 8px;
                    margin-bottom: 20px;
                }

                .address-input-group {
                    display: flex;
                    gap: 8px;
                    align-items: stretch;
                }

                .address-input {
                    flex: 1;
                }

                .query-btn {
                    background: #17a2b8;
                    color: white;
                    white-space: nowrap;
                    min-width: 120px;
                }

                .query-btn:hover:not(:disabled) {
                    background: #138496;
                }

                .balance-display {
                    margin-top: 12px;
                    padding: 12px;
                    background: white;
                    border-radius: 6px;
                    border: 1px solid #e0e0e0;
                }

                .balance-item {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    padding: 6px 0;
                    border-bottom: 1px solid #f0f0f0;
                }

                .balance-item:last-child {
                    border-bottom: none;
                }

                .balance-label {
                    font-weight: 500;
                    color: #666;
                }

                .balance-value {
                    font-weight: 600;
                    font-family: monospace;
                }

                .balance-value.frozen {
                    color: #6f42c1;
                }

                .balance-value.available {
                    color: #28a745;
                }

                .balance-error {
                    margin-top: 8px;
                    padding: 8px;
                    background: #f8d7da;
                    color: #721c24;
                    border-radius: 4px;
                    font-size: 14px;
                }

                .funds-section {
                    display: grid;
                    grid-template-columns: 1fr 1fr;
                    gap: 16px;
                    margin-top: 16px;
                }

                .freeze-section,
                .unfreeze-section {
                    padding: 12px;
                    border: 1px solid #e0e0e0;
                    border-radius: 6px;
                }

                .admin-actions {
                    display: flex;
                    gap: 12px;
                    flex-wrap: wrap;
                    margin-top: 16px;
                }

                .admin-btn {
                    padding: 10px 16px;
                    border: none;
                    border-radius: 6px;
                    cursor: pointer;
                    font-weight: 500;
                    transition: all 0.2s;
                    min-width: 120px;
                }

                .admin-btn:disabled {
                    opacity: 0.6;
                    cursor: not-allowed;
                }

                .pause-btn {
                    background: #ffc107;
                    color: #000;
                }

                .pause-btn:hover:not(:disabled) {
                    background: #e0a800;
                }

                .unpause-btn {
                    background: #28a745;
                    color: white;
                }

                .unpause-btn:hover:not(:disabled) {
                    background: #218838;
                }

                .block-btn {
                    background: #dc3545;
                    color: white;
                }

                .block-btn:hover:not(:disabled) {
                    background: #c82333;
                }

                .unblock-btn {
                    background: #17a2b8;
                    color: white;
                }

                .unblock-btn:hover:not(:disabled) {
                    background: #138496;
                }

                .freeze-btn {
                    background: #6f42c1;
                    color: white;
                    width: 100%;
                    margin-top: 8px;
                }

                .freeze-btn:hover:not(:disabled) {
                    background: #5a32a3;
                }

                .unfreeze-btn {
                    background: #fd7e14;
                    color: white;
                    width: 100%;
                    margin-top: 8px;
                }

                .unfreeze-btn:hover:not(:disabled) {
                    background: #e8690b;
                }

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
                    min-width: 400px;
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
                    font-weight: 500;
                    color: #666;
                    min-width: 80px;
                    margin-right: 16px;
                }

                .result-item .value {
                    font-family: monospace;
                    flex: 1;
                    text-align: right;
                    word-break: break-all;
                }

                .tx-hash {
                    font-size: 12px;
                    background: #f8f9fa;
                    padding: 4px 8px;
                    border-radius: 4px;
                    cursor: pointer;
                }

                .status {
                    color: #28a745;
                    font-weight: 600;
                }

                .transaction-tip {
                    margin-top: 16px;
                    padding: 12px;
                    background: #e7f3ff;
                    border-radius: 6px;
                    font-size: 14px;
                    color: #0066cc;
                }

                .transaction-error {
                    text-align: center;
                }

                .error-message {
                    color: #dc3545;
                    font-size: 16px;
                    padding: 20px;
                    background: #f8d7da;
                    border-radius: 6px;
                }

                .modal-footer {
                    display: flex;
                    justify-content: flex-end;
                    gap: 12px;
                    padding: 20px;
                    border-top: 1px solid #e0e0e0;
                }

                .btn-primary {
                    background: #007bff;
                    color: white;
                    border: none;
                    padding: 10px 20px;
                    border-radius: 6px;
                    cursor: pointer;
                    font-weight: 500;
                    transition: all 0.2s;
                }

                .btn-primary:hover {
                    background: #0056b3;
                }

                .btn-secondary {
                    background: #6c757d;
                    color: white;
                    border: none;
                    padding: 10px 20px;
                    border-radius: 6px;
                    cursor: pointer;
                    font-weight: 500;
                    transition: all 0.2s;
                }

                .btn-secondary:hover {
                    background: #545b62;
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

                .card {
                    position: relative;
                }
            `}</style>
        </>
    );
} 