import React, { useState, useEffect, useCallback } from 'react';
import { queryTransactionStatus } from '../config/api';



// 🆕 交易结果接口
interface TransactionResult {
    success: boolean;
    action: string;
    txHash?: string;
    network?: string;
    blockNumber?: string;
    status?: string;
    error?: string;
    // 额外字段
    amount?: string;
    from?: string;
    to?: string;
    fee?: string;
    messageId?: string;
    targetNetwork?: string;
    sourceNetwork?: string;
}

interface TransactionModalProps {
    isOpen: boolean;
    onClose: () => void;
    result: TransactionResult | null;
}

export const TransactionModal: React.FC<TransactionModalProps> = ({ isOpen, onClose, result }) => {
    const [currentStatus, setCurrentStatus] = useState<{
        status: string;
        blockNumber?: number;
        confirmations?: number;
        timestamp?: number;
        txSuccess?: boolean;
    } | null>(null);
    const [isPolling, setIsPolling] = useState(false);
    const [pollCount, setPollCount] = useState(0);

    // 交易状态查询
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
                    return true;
                }
            } else {
                console.log('⚠️ 查询状态响应失败:', statusResult.message);
            }
        } catch (error) {
            console.error('❌ 查询交易状态失败:', error);
            setPollCount(prev => prev + 1);
        }
        return false;
    }, [pollCount]);

    // 轮询效果
    useEffect(() => {
        let intervalId: NodeJS.Timeout | null = null;

        if (isOpen && result?.success && result?.txHash && result?.network && isPolling) {
            console.log('🚀 开始轮询交易状态:', result.txHash);

            pollTransactionStatus(result.txHash, result.network);

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
            }, 3000);
        }

        return () => {
            if (intervalId) {
                clearInterval(intervalId);
                console.log('🛑 清理轮询定时器');
            }
        };
    }, [isOpen, result?.txHash, result?.network, isPolling, pollTransactionStatus]);

    // 初始化轮询状态
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

    // 关闭弹窗时清理状态
    const handleClose = () => {
        console.log('🚪 关闭弹窗，清理状态');
        setIsPolling(false);
        setCurrentStatus(null);
        setPollCount(0);
        onClose();
    };

    if (!isOpen || !result) return null;

    // 获取当前显示的状态信息
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

                            {/* 交易哈希 */}
                            {result.txHash && (
                                <div className="result-item">
                                    <span className="label">交易哈希:</span>
                                    <span className="value tx-hash" title={result.txHash}>
                                        {result.txHash.slice(0, 20)}...{result.txHash.slice(-20)}
                                    </span>
                                </div>
                            )}

                            {/* 网络信息 */}
                            {result.network && (
                                <div className="result-item">
                                    <span className="label">网络:</span>
                                    <span className="value">{result.network}</span>
                                </div>
                            )}

                            {/* 金额信息 */}
                            {result.amount && (
                                <div className="result-item">
                                    <span className="label">金额:</span>
                                    <span className="value">{result.amount} XD</span>
                                </div>
                            )}

                            {/* 转账方向 */}
                            {result.from && result.to && (
                                <div className="result-item">
                                    <span className="label">转账:</span>
                                    <span className="value transfer-info">
                                        {result.from.slice(0, 8)}...{result.from.slice(-6)}
                                        <span className="arrow"> → </span>
                                        {result.to.slice(0, 8)}...{result.to.slice(-6)}
                                    </span>
                                </div>
                            )}

                            {/* 跨链信息 */}
                            {result.sourceNetwork && result.targetNetwork && (
                                <div className="result-item">
                                    <span className="label">跨链:</span>
                                    <span className="value">
                                        {result.sourceNetwork} → {result.targetNetwork}
                                    </span>
                                </div>
                            )}

                            {/* 消息ID（跨链专用） */}
                            {result.messageId && (
                                <div className="result-item">
                                    <span className="label">消息ID:</span>
                                    <span className="value tx-hash" title={result.messageId}>
                                        {result.messageId.slice(0, 20)}...{result.messageId.slice(-20)}
                                    </span>
                                </div>
                            )}

                            {/* 费用信息 */}
                            {result.fee && (
                                <div className="result-item">
                                    <span className="label">费用:</span>
                                    <span className="value">{result.fee} ETH</span>
                                </div>
                            )}

                            {/* 交易状态 */}
                            <div className="result-item">
                                <span className="label">状态:</span>
                                <span className="value status" style={{ color: statusDisplay.color }}>
                                    {statusDisplay.icon} {statusDisplay.text}
                                </span>
                            </div>

                            {/* 额外状态信息 */}
                            {statusDisplay.extraInfo && (
                                <div className="result-item">
                                    <span className="label"></span>
                                    <span className="value status-extra">
                                        {statusDisplay.extraInfo}
                                    </span>
                                </div>
                            )}

                            {/* 确认时间显示 */}
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

                    {/* 手动刷新按钮 */}
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

                .transfer-info {
                    font-size: 12px;
                }

                .arrow {
                    color: #007bff;
                    font-weight: bold;
                    margin: 0 4px;
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

export default TransactionModal; 