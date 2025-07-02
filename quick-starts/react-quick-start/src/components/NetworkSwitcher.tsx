import React, { useState } from 'react';
import { useAccount, useSwitchChain } from 'wagmi';
import { useWeb3Auth } from '@web3auth/modal/react';
import { NETWORK_CONFIGS, getCurrentNetworkConfig } from '../config/xdCoin';

export function NetworkSwitcher() {
    const { chainId } = useAccount();
    const { switchChain } = useSwitchChain();
    const { provider } = useWeb3Auth();
    const [switching, setSwitching] = useState(false);

    const currentNetwork = getCurrentNetworkConfig(chainId || 0);
    const supportedNetworks = Object.values(NETWORK_CONFIGS);

    const handleNetworkSwitch = async (targetChainId: number) => {
        if (!provider || switching || chainId === targetChainId) return;

        setSwitching(true);
        try {
            await switchChain({ chainId: targetChainId });
        } catch (error: any) {
            console.error('网络切换失败:', error);
            if (!error.message.includes('User rejected')) {
                alert(`网络切换失败: ${error.message}`);
            }
        } finally {
            setSwitching(false);
        }
    };

    return (
        <div className="network-switcher">
            <div className="current-network">
                <span className="network-label">当前网络:</span>
                <span className={`network-name ${currentNetwork ? 'connected' : 'unknown'}`}>
                    {currentNetwork ? (
                        <>
                            <span className="network-dot"></span>
                            {currentNetwork.name === 'sepolia' ? 'Sepolia' : 'BSC Testnet'}
                        </>
                    ) : (
                        '未知网络'
                    )}
                </span>
            </div>

            <div className="network-options">
                {supportedNetworks.map((network) => (
                    <button
                        key={network.chainId}
                        onClick={() => handleNetworkSwitch(network.chainId)}
                        disabled={switching || chainId === network.chainId}
                        className={`network-button ${chainId === network.chainId ? 'active' : ''}`}
                    >
                        {switching && chainId !== network.chainId ? (
                            <>
                                <span className="spinner"></span>
                                切换中...
                            </>
                        ) : (
                            <>
                                <span className="network-icon">
                                    {network.name === 'sepolia' ? '🔷' : '🟡'}
                                </span>
                                {network.name === 'sepolia' ? 'Sepolia' : 'BSC Testnet'}
                            </>
                        )}
                    </button>
                ))}
            </div>

            <style>{`
                .network-switcher {
                    display: flex;
                    flex-direction: column;
                    gap: 12px;
                    padding: 16px;
                    background: #f8f9fa;
                    border-radius: 8px;
                    border: 1px solid #e9ecef;
                }

                .current-network {
                    display: flex;
                    align-items: center;
                    gap: 8px;
                    font-size: 14px;
                }

                .network-label {
                    color: #6c757d;
                }

                .network-name {
                    display: flex;
                    align-items: center;
                    gap: 6px;
                    font-weight: 500;
                }

                .network-name.connected {
                    color: #28a745;
                }

                .network-name.unknown {
                    color: #dc3545;
                }

                .network-dot {
                    width: 8px;
                    height: 8px;
                    border-radius: 50%;
                    background: #28a745;
                    animation: pulse 2s infinite;
                }

                .network-options {
                    display: flex;
                    gap: 8px;
                }

                .network-button {
                    flex: 1;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    gap: 6px;
                    padding: 8px 12px;
                    border: 1px solid #dee2e6;
                    border-radius: 6px;
                    background: white;
                    color: #495057;
                    font-size: 13px;
                    cursor: pointer;
                    transition: all 0.2s ease;
                }

                .network-button:hover:not(:disabled) {
                    background: #e9ecef;
                    border-color: #adb5bd;
                }

                .network-button.active {
                    background: #007bff;
                    color: white;
                    border-color: #007bff;
                }

                .network-button:disabled {
                    opacity: 0.6;
                    cursor: not-allowed;
                }

                .network-icon {
                    font-size: 16px;
                }

                .spinner {
                    width: 12px;
                    height: 12px;
                    border: 2px solid #f3f3f3;
                    border-top: 2px solid #007bff;
                    border-radius: 50%;
                    animation: spin 1s linear infinite;
                }

                @keyframes pulse {
                    0%, 100% { opacity: 1; }
                    50% { opacity: 0.5; }
                }

                @keyframes spin {
                    0% { transform: rotate(0deg); }
                    100% { transform: rotate(360deg); }
                }
            `}</style>
        </div>
    );
} 