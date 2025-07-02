import { useState, useEffect } from 'react';

// 法币余额管理 Hook
export function useFiatBalance() {
    const [fiatBalance, setFiatBalance] = useState<number>(0);

    useEffect(() => {
        // 模拟法币余额
        // 在实际应用中，这里应该调用银行API或支付服务商API
        const mockBalance = Math.random() * 10000 + 5000; // 5000-15000之间的随机数
        setFiatBalance(mockBalance);
    }, []);

    // 保存到 localStorage
    const updateFiatBalance = (newBalance: number) => {
        setFiatBalance(newBalance);
        localStorage.setItem('fiatBalance', newBalance.toString());
    };

    // 减少法币余额（申请铸币时）
    const decreaseFiat = (amount: number): boolean => {
        if (fiatBalance >= amount) {
            updateFiatBalance(fiatBalance - amount);
            return true;
        }
        return false;
    };

    // 增加法币余额（赎回时）
    const increaseFiat = (amount: number) => {
        updateFiatBalance(fiatBalance + amount);
    };

    return {
        fiatBalance,
        decreaseFiat,
        increaseFiat,
        updateFiatBalance
    };
} 