import "./App.css";
import { useWeb3AuthConnect, useWeb3AuthDisconnect, useWeb3AuthUser } from "@web3auth/modal/react";
import { useAccount } from "wagmi";
import React, { useState } from 'react';

// 修正组件导入
import { XDCoinBalance } from "./components/XDCoinBalance";
import { MintRequest } from "./components/MintRequest";
import { XDCoinTransfer } from "./components/XDCoinTransfer";
import { RedeemFiat } from "./components/RedeemFiat";
import { CrossChain } from "./components/CrossChain";
import { AdminPanel } from "./components/AdminPanel";
import { SwitchChain } from "./components/switchNetwork";  // 修正导入
import { NetworkSwitcher } from './components/NetworkSwitcher';

function App() {
  const { connect, isConnected, connectorName, loading: connectLoading, error: connectError } = useWeb3AuthConnect();
  const { disconnect, loading: disconnectLoading, error: disconnectError } = useWeb3AuthDisconnect();
  const { userInfo } = useWeb3AuthUser();
  const { address } = useAccount();
  const [activeTab, setActiveTab] = useState<string>('balance');

  // 将 tabs 定义移到使用之前
  const tabs = [
    { id: 'balance', label: '余额查询', icon: '💰' },
    { id: 'transfer', label: '转账', icon: '💸' },
    { id: 'crosschain', label: '跨链', icon: '🌉' },
    { id: 'mint', label: '铸币申请', icon: '🏭' },
    { id: 'redeem', label: '法币兑换', icon: '💱' },
    { id: 'admin', label: '管理面板', icon: '⚙️' },
  ];

  function uiConsole(...args: any[]): void {
    const el = document.querySelector("#console>p");
    if (el) {
      el.innerHTML = JSON.stringify(args || {}, null, 2);
      console.log(...args);
    }
  }

  const renderTabContent = () => {
    try {
      switch (activeTab) {
        case 'balance':
          return <XDCoinBalance />;
        case 'transfer':
          return <XDCoinTransfer />;
        case 'crosschain':
          return <CrossChain />;
        case 'mint':
          return <MintRequest />;
        case 'redeem':
          return <RedeemFiat />;
        case 'admin':
          return <AdminPanel />;
        default:
          return <XDCoinBalance />;
      }
    } catch (error) {
      console.error('渲染组件错误:', error);
      return (
        <div className="error-container">
          <h3>❌ 组件加载失败</h3>
          <p>错误信息: {error instanceof Error ? error.message : '未知错误'}</p>
          <button onClick={() => window.location.reload()}>🔄 刷新页面</button>
        </div>
      );
    }
  };

  // 简化的登录视图，避免复杂组件导致的问题
  const loggedInView = (
    <div className="main-container">
      <div className="user-info">
        <h2>🔗 已连接</h2>
        <div className="address">📍 地址: {address}</div>
        <div className="connector">🔌 连接器: {connectorName}</div>
      </div>

      <div className="actions-header">
        <button onClick={() => uiConsole(userInfo)} className="info-btn">
          👤 用户信息
        </button>
        <button onClick={() => disconnect()} className="logout-btn">
          🚪 退出登录
        </button>
        {disconnectLoading && <div className="loading">退出中...</div>}
        {disconnectError && <div className="error">{disconnectError.message}</div>}
      </div>

      {/* 网络切换 */}
      <SwitchChain />

      {/* 功能标签页 */}
      <div className="tabs-container">
        <div className="tabs-header">
          {tabs.map(tab => (
            <button
              key={tab.id}
              className={`tab-button ${activeTab === tab.id ? 'active' : ''}`}
              onClick={() => setActiveTab(tab.id)}
            >
              {tab.icon} {tab.label}
            </button>
          ))}
        </div>

        <div className="tab-content">
          {renderTabContent()}
        </div>
      </div>
    </div>
  );

  const unloggedInView = (
    <div className="login-container">
      <div className="login-content">
        <h2>🔐 欢迎使用 XD-Coin 系统</h2>
        <p>请连接您的钱包以开始使用</p>
        <button onClick={() => connect()} className="login-btn">
          🚀 连接钱包
        </button>
        {connectLoading && <div className="loading">连接中...</div>}
        {connectError && <div className="error">错误: {connectError.message}</div>}
      </div>
    </div>
  );

  return (
    <div className="app-container">
      <header className="app-header">
        <h1 className="app-title">
          🪙 XD-Coin 稳定币系统
        </h1>
        <div className="app-subtitle">
          基于 Web3Auth 的去中心化稳定币管理平台
        </div>
      </header>

      <main className="app-main">
        {isConnected ? loggedInView : unloggedInView}
      </main>

      <div id="console" style={{ whiteSpace: "pre-line" }}>
        <p style={{ whiteSpace: "pre-line" }}></p>
      </div>

      <footer className="app-footer">
        <div className="footer-links">
          <span>🔗 XD-Coin v2.0</span>
          <span>📊 实时数据</span>
          <span>🔒 安全保障</span>
        </div>
      </footer>
    </div>
  );
}

export default App;
