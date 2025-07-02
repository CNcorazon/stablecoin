import React, { useState } from 'react';
import { useAccount } from 'wagmi';
import { useWeb3Auth } from '@web3auth/modal/react';
import { ethers } from 'ethers';
import { getCurrentNetworkConfig, TOKEN_ABI } from '../config/xdCoin';

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
        estimatedFiat?: string;
        to?: string;
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
                            {result.amount && (
                                <div className="result-item">
                                    <span className="label">兑换金额:</span>
                                    <span className="value">{result.amount} XD</span>
                                </div>
                            )}
                            {result.estimatedFiat && (
                                <div className="result-item">
                                    <span className="label">预计收到:</span>
                                    <span className="value">{result.estimatedFiat} CNY</span>
                                </div>
                            )}
                            {result.to && (
                                <div className="result-item">
                                    <span className="label">兑换至:</span>
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
                                    ? '🎉 兑换请求已成功提交！法币将在24小时内到账'
                                    : '💡 兑换请求已提交，法币预计24小时内到账'}
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

export function RedeemFiat() {
    const { address, chainId } = useAccount();
    const { provider } = useWeb3Auth();
    const [amount, setAmount] = useState('');
    const [loading, setLoading] = useState(false);

    // 🆕 使用与AdminPanel相同的状态管理
    const [modalOpen, setModalOpen] = useState(false);
    const [transactionResult, setTransactionResult] = useState<any>(null);

    const currentNetwork = getCurrentNetworkConfig(chainId || 0);

    // 🆕 使用与AdminPanel相同的showTransactionResult函数
    const showTransactionResult = (success: boolean, action: string, result?: any, error?: string) => {
        setTransactionResult({
            success,
            action: '法币兑换',
            txHash: result?.txHash,
            network: result?.network || currentNetwork?.name,
            blockNumber: result?.blockNumber,
            status: result?.status,
            amount: amount,
            estimatedFiat: amount ? (parseFloat(amount) * 6.8).toFixed(2) : '',
            to: currentNetwork?.deployerAddress,
            error
        });
        setModalOpen(true);
    };

    // 🆕 使用与AdminPanel相同的executeAction模式
    const executeRedeemAction = async () => {
        if (!provider || !address || !amount || !currentNetwork) {
            showTransactionResult(false, 'redeem', null, '请填写完整信息');
            return;
        }

        setLoading(true);

        try {
            const ethersProvider = new ethers.BrowserProvider(provider);
            const signer = await ethersProvider.getSigner();
            const contract = new ethers.Contract(
                currentNetwork.contracts.token,
                TOKEN_ABI,
                signer
            );

            const transferAmount = ethers.parseEther(amount);

            // 检查余额
            const balance = await contract.balanceOf(address);
            if (balance < transferAmount) {
                throw new Error('余额不足');
            }

            // 转账到 deployer 地址（模拟兑换）
            const tx = await contract.transfer(currentNetwork.deployerAddress, transferAmount);
            const receipt = await tx.wait();

            // 🆕 显示成功弹窗
            showTransactionResult(true, 'redeem', {
                txHash: tx.hash,
                network: currentNetwork.name,
                blockNumber: receipt.blockNumber,
                status: 'confirmed'
            });

            // 重置表单
            setAmount('');

        } catch (error: any) {
            console.error('兑换失败:', error);
            // 🆕 显示失败弹窗
            showTransactionResult(false, 'redeem', null, error.message);
        } finally {
            setLoading(false);
        }
    };

    if (!currentNetwork) {
        return (
            <div className="card">
                <h3>💱 法币兑换</h3>
                <div className="error">❌ 当前网络不支持兑换功能</div>
            </div>
        );
    }

    return (
        <>
            <div className="card">
                <h3>💱 法币兑换</h3>

                <div className="network-info">
                    🌐 网络: {currentNetwork.name === 'sepolia' ? '🔷 Sepolia' : '🟡 BSC Testnet'}
                </div>

                <div className="exchange-info">
                    💹 当前汇率: 1 XD = 6.8 CNY
                </div>

                <div className="form-group">
                    <label>💰 兑换金额:</label>
                    <input
                        type="number"
                        value={amount}
                        onChange={(e) => setAmount(e.target.value)}
                        placeholder="请输入 XD-Coin 数量"
                        disabled={loading}
                        step="0.0001"
                    />
                </div>

                {amount && (
                    <div className="preview">
                        💵 预计收到: {(parseFloat(amount) * 6.8).toFixed(2)} CNY
                    </div>
                )}

                {/* 🆕 调整按钮样式，不占满宽度 */}
                <button
                    onClick={executeRedeemAction}
                    disabled={loading || !amount}
                    className="admin-btn"
                >
                    {loading ? '🔄 处理中...' : '💱 提交兑换'}
                </button>

                {/* <div className="redeem-note">
                    📝 兑换说明：
                    <br />
                    • 法币将在24小时内到账
                    <br />
                    • 汇率实时更新，以提交时为准
                    <br />
                    • 单次最小兑换金额：1 XD
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

                .exchange-info {
                    background: #e7f3ff;
                    padding: 12px;
                    border-radius: 6px;
                    margin-bottom: 16px;
                    font-size: 16px;
                    font-weight: 500;
                    color: #0066cc;
                    text-align: center;
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

                .preview {
                    background: #fff3cd;
                    color: #856404;
                    padding: 12px;
                    border-radius: 6px;
                    margin-bottom: 16px;
                    font-size: 16px;
                    font-weight: 500;
                    text-align: center;
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

                .redeem-note {
                    font-size: 13px;
                    color: #666;
                    background: #f8f9fa;
                    padding: 12px;
                    border-radius: 6px;
                    border-left: 4px solid #28a745;
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