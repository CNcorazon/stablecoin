import React, { useState } from 'react';
import { useAccount } from 'wagmi';
import { getCurrentNetworkConfig, apiCall, API_CONFIG } from '../config/xdCoin';
import { TransactionModal } from './TransactionModal';

export function MintRequest() {
    const { address, chainId } = useAccount();
    const [amount, setAmount] = useState('');
    const [loading, setLoading] = useState(false);

    // 🆕 弹窗状态
    const [modalOpen, setModalOpen] = useState(false);
    const [transactionResult, setTransactionResult] = useState<any>(null);

    const currentNetwork = getCurrentNetworkConfig(chainId || 0);

    // 🆕 使用与AdminPanel相同的showTransactionResult函数
    const showTransactionResult = (success: boolean, action: string, result?: any, error?: string) => {
        setTransactionResult({
            success,
            action: '铸币申请',
            txHash: result?.txHash,
            network: result?.network,
            blockNumber: result?.blockNumber,
            status: result?.status,
            error
        });
        setModalOpen(true);
    };

    // 🆕 使用与AdminPanel相同的executeAction模式
    const executeMintAction = async () => {
        if (!amount || !address || !currentNetwork) {
            showTransactionResult(false, 'mint', null, '请填写铸币金额');
            return;
        }

        setLoading(true);

        try {
            const mintData = {
                to: address,
                amount: amount,
                network: currentNetwork.name
            };

            const result = await apiCall(API_CONFIG.endpoints.mint, mintData, 'POST');

            if (result.success) {
                // 🆕 显示成功弹窗
                showTransactionResult(true, 'mint', result);

                // 清空表单
                setAmount('');
            } else {
                throw new Error(result.error || '铸币失败');
            }

        } catch (error: any) {
            console.error('铸币请求失败:', error);
            // 🆕 显示失败弹窗
            showTransactionResult(false, 'mint', null, error.message);
        } finally {
            setLoading(false);
        }
    };

    if (!currentNetwork) {
        return (
            <div className="card">
                <h3>🏭 铸币申请</h3>
                <div className="error">
                    ❌ 当前网络不支持铸币功能
                </div>
            </div>
        );
    }

    return (
        <>
            <div className="card">
                <h3>🏭 铸币申请</h3>
                <div className="network-info">
                    🌐 网络: {currentNetwork.name === 'sepolia' ? '🔷 Sepolia' : '🟡 BSC Testnet'}
                </div>

                <div className="user-info">
                    <div className="address-display">
                        <span className="label">📍 接收地址:</span>
                        <span className="address">{address ? `${address.slice(0, 6)}...${address.slice(-4)}` : 'Not Connected'}</span>
                        <span className="note">(您的地址)</span>
                    </div>
                </div>

                <div className="form-group">
                    <label>💰 铸币金额:</label>
                    <input
                        type="number"
                        value={amount}
                        onChange={(e) => setAmount(e.target.value)}
                        placeholder="请输入铸币数量"
                        disabled={loading}
                    />
                </div>

                <button
                    onClick={executeMintAction}
                    disabled={loading || !amount || !address}
                    className="admin-btn"
                >
                    {loading ? '🔄 处理中...' : '🏭 提交铸币申请'}
                </button>

                {/* 🆕 使用与转账、管理面板相同的加载遮罩 */}
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

                .error {
                    background: #f8d7da;
                    color: #721c24;
                    padding: 12px;
                    border-radius: 6px;
                    border: 1px solid #f5c6cb;
                }

                /* 🆕 与转账、管理面板完全相同的加载遮罩样式 */
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