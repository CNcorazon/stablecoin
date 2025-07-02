const { ethers } = require("hardhat");
const fs = require('fs');
const path = require('path');

// CCIP 链选择器常量
const CHAIN_SELECTORS = {
    sepolia: "16015286601757825753",
    bscTestnet: "13264668187771770619"
};

// 可配置的测试用户地址（只作为接收方）
const TEST_USER_ADDRESS = process.env.TEST_USER_ADDRESS || "0x340ED8A73959215C74dc0BF53959d9A80d8D4a46";

// 测试结果记录
let testResults = {
    basicFunctionality: {},
    crosschainFunctionality: {},
    errors: []
};

// 工具函数：格式化以太坊地址
function formatAddress(address) {
    return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

// 工具函数：等待一段时间
function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// 安全的合约调用函数
async function safeContractCall(description, contractCall) {
    try {
        console.log(`  🔄 ${description}...`);
        const result = await contractCall();
        console.log(`  ✅ ${description} 成功`);
        return { success: true, result };
    } catch (error) {
        console.log(`  ❌ ${description} 失败: ${error.message}`);
        testResults.errors.push({ description, error: error.message });
        return { success: false, error: error.message };
    }
}

// 基础功能测试
async function testBasicFunctionality(token, accessManager, deployer, testUserAddress) {
    console.log("\n🧪 === 基础功能测试 ===");
    console.log(`测试参与者: deployer (${formatAddress(deployer.address)}) → testUser (${formatAddress(testUserAddress)})`);
    console.log("💡 deployer 拥有所有权限，testUser 只作为接收方");

    // 1. 代币信息测试
    console.log("\n1️⃣ 代币信息测试");
    const nameResult = await safeContractCall("获取代币名称", async () => {
        return await token.name();
    });

    const symbolResult = await safeContractCall("获取代币符号", async () => {
        return await token.symbol();
    });

    const decimalsResult = await safeContractCall("获取代币精度", async () => {
        return await token.decimals();
    });

    const totalSupplyResult = await safeContractCall("获取总供应量", async () => {
        return await token.totalSupply();
    });

    if (nameResult.success && symbolResult.success && decimalsResult.success && totalSupplyResult.success) {
        console.log(`    代币名称: ${nameResult.result}`);
        console.log(`    代币符号: ${symbolResult.result}`);
        console.log(`    代币精度: ${decimalsResult.result}`);
        console.log(`    总供应量: ${ethers.formatEther(totalSupplyResult.result)} XD`);

        testResults.basicFunctionality.tokenInfo = {
            success: true,
            name: nameResult.result,
            symbol: symbolResult.result,
            decimals: decimalsResult.result.toString(),
            totalSupply: ethers.formatEther(totalSupplyResult.result)
        };
    } else {
        testResults.basicFunctionality.tokenInfo = { success: false };
    }

    // 2. 铸币功能测试
    console.log("\n2️⃣ 铸币功能测试 (deployer → testUser)");
    const mintAmount = ethers.parseEther("1000");
    const mintResult = await safeContractCall("deployer 给 testUser 铸造代币", async () => {
        const tx = await token.connect(deployer).mint(testUserAddress, mintAmount);
        return await tx.wait();
    });

    if (mintResult.success) {
        const testUserBalanceResult = await safeContractCall("检查 testUser 余额", async () => {
            return await token.balanceOf(testUserAddress);
        });

        if (testUserBalanceResult.success) {
            console.log(`    testUser 余额: ${ethers.formatEther(testUserBalanceResult.result)} XD`);
            testResults.basicFunctionality.mint = {
                success: true,
                amount: ethers.formatEther(mintAmount),
                testUserBalance: ethers.formatEther(testUserBalanceResult.result)
            };
        } else {
            testResults.basicFunctionality.mint = { success: false };
        }
    } else {
        testResults.basicFunctionality.mint = { success: false };
    }

    // 3. 转账功能测试
    console.log("\n3️⃣ 转账功能测试 (deployer → testUser)");

    // 先给 deployer 铸造一些代币
    const deployerMintResult = await safeContractCall("deployer 给自己铸造代币", async () => {
        const mintAmount = ethers.parseEther("1000");
        const tx = await token.connect(deployer).mint(deployer.address, mintAmount);
        return await tx.wait();
    });

    if (deployerMintResult.success) {
        const transferAmount = ethers.parseEther("100");

        // 获取转账前余额
        const deployerBalanceBefore = await token.balanceOf(deployer.address);
        const testUserBalanceBefore = await token.balanceOf(testUserAddress);

        const transferResult = await safeContractCall("deployer 给 testUser 转账", async () => {
            const tx = await token.connect(deployer).transfer(testUserAddress, transferAmount);
            return await tx.wait();
        });

        if (transferResult.success) {
            const deployerBalanceResult = await safeContractCall("检查 deployer 余额", async () => {
                return await token.balanceOf(deployer.address);
            });

            const testUserBalanceResult = await safeContractCall("检查 testUser 余额", async () => {
                return await token.balanceOf(testUserAddress);
            });

            if (deployerBalanceResult.success && testUserBalanceResult.success) {
                console.log(`    转账前 - deployer: ${ethers.formatEther(deployerBalanceBefore)} XD, testUser: ${ethers.formatEther(testUserBalanceBefore)} XD`);
                console.log(`    转账后 - deployer: ${ethers.formatEther(deployerBalanceResult.result)} XD, testUser: ${ethers.formatEther(testUserBalanceResult.result)} XD`);
                testResults.basicFunctionality.transfer = {
                    success: true,
                    amount: ethers.formatEther(transferAmount),
                    deployerBalance: ethers.formatEther(deployerBalanceResult.result),
                    testUserBalance: ethers.formatEther(testUserBalanceResult.result)
                };
            }
        } else {
            testResults.basicFunctionality.transfer = { success: false };
        }
    } else {
        testResults.basicFunctionality.transfer = { success: false };
    }

    // 4. 授权功能测试 (deployer 授权给自己，然后代表自己转账给 testUser)
    console.log("\n4️⃣ 授权功能测试 (deployer 操作演示)");
    const approveAmount = ethers.parseEther("200");

    // deployer 授权给自己（演示授权机制）
    const approveResult = await safeContractCall("deployer 授权给自己", async () => {
        const tx = await token.connect(deployer).approve(deployer.address, approveAmount);
        return await tx.wait();
    });

    if (approveResult.success) {
        const allowanceResult = await safeContractCall("检查授权额度", async () => {
            return await token.allowance(deployer.address, deployer.address);
        });

        if (allowanceResult.success) {
            console.log(`    授权额度: ${ethers.formatEther(allowanceResult.result)} XD`);

            // 测试授权转账 (deployer 使用授权转给 testUser)
            const transferFromAmount = ethers.parseEther("50");
            const transferFromResult = await safeContractCall("deployer 使用授权转账给 testUser", async () => {
                const tx = await token.connect(deployer).transferFrom(deployer.address, testUserAddress, transferFromAmount);
                return await tx.wait();
            });

            if (transferFromResult.success) {
                const newAllowanceResult = await safeContractCall("检查剩余授权", async () => {
                    return await token.allowance(deployer.address, deployer.address);
                });
                if (newAllowanceResult.success) {
                    console.log(`    剩余授权: ${ethers.formatEther(newAllowanceResult.result)} XD`);
                }

                testResults.basicFunctionality.approve = {
                    success: true,
                    approveAmount: ethers.formatEther(approveAmount),
                    transferFromAmount: ethers.formatEther(transferFromAmount),
                    remainingAllowance: newAllowanceResult.success ? ethers.formatEther(newAllowanceResult.result) : null
                };
            } else {
                testResults.basicFunctionality.approve = { success: false };
            }
        } else {
            testResults.basicFunctionality.approve = { success: false };
        }
    } else {
        testResults.basicFunctionality.approve = { success: false };
    }

    // 5. 暂停功能测试
    console.log("\n5️⃣ 暂停功能测试");

    const pausedStatusResult = await safeContractCall("检查暂停状态", async () => {
        return await token.paused();
    });
    if (pausedStatusResult.success) {
        console.log(`    当前暂停状态: ${pausedStatusResult.result}`);
    }

    const pauseResult = await safeContractCall("deployer 暂停合约", async () => {
        const tx = await token.connect(deployer).pause();
        return await tx.wait();
    });

    if (pauseResult.success) {
        const pausedResult = await safeContractCall("验证暂停状态", async () => {
            return await token.paused();
        });
        if (pausedResult.success) {
            console.log(`    暂停后状态: ${pausedResult.result}`);
        }

        // 尝试在暂停状态下转账（应该失败）
        const failedTransferResult = await safeContractCall("暂停状态下转账（应该失败）", async () => {
            const tx = await token.connect(deployer).transfer(testUserAddress, ethers.parseEther("1"));
            return await tx.wait();
        });

        const unpauseResult = await safeContractCall("deployer 取消暂停", async () => {
            const tx = await token.connect(deployer).unpause();
            return await tx.wait();
        });

        if (unpauseResult.success) {
            const unpausedResult = await safeContractCall("验证取消暂停状态", async () => {
                return await token.paused();
            });
            if (unpausedResult.success) {
                console.log(`    取消暂停后状态: ${unpausedResult.result}`);
            }

            testResults.basicFunctionality.pause = {
                success: true,
                pauseSuccess: pauseResult.success,
                unpauseSuccess: unpauseResult.success,
                transferFailedWhenPaused: !failedTransferResult.success,
                finalPausedState: unpausedResult.success ? unpausedResult.result : null
            };
        } else {
            testResults.basicFunctionality.pause = { success: false };
        }
    } else {
        testResults.basicFunctionality.pause = { success: false };
    }

    // 6. 黑名单功能测试
    console.log("\n6️⃣ 黑名单功能测试");

    const blockedStatusResult = await safeContractCall("检查 testUser 黑名单状态", async () => {
        return await token.blocked(testUserAddress);
    });
    if (blockedStatusResult.success) {
        console.log(`    testUser 黑名单状态: ${blockedStatusResult.result}`);
    }

    const blockUserResult = await safeContractCall("deployer 将 testUser 加入黑名单", async () => {
        const tx = await token.connect(deployer).blockUser(testUserAddress);
        return await tx.wait();
    });

    if (blockUserResult.success) {
        const blockedResult = await safeContractCall("验证黑名单状态", async () => {
            return await token.blocked(testUserAddress);
        });
        if (blockedResult.success) {
            console.log(`    加入黑名单后状态: ${blockedResult.result}`);
        }

        // 尝试向黑名单用户转账（应该失败）
        const failedTransferToBlockedResult = await safeContractCall("向黑名单用户转账（应该失败）", async () => {
            const tx = await token.connect(deployer).transfer(testUserAddress, ethers.parseEther("1"));
            return await tx.wait();
        });

        const unblockUserResult = await safeContractCall("deployer 移除 testUser 黑名单", async () => {
            const tx = await token.connect(deployer).unblockUser(testUserAddress);
            return await tx.wait();
        });

        if (unblockUserResult.success) {
            const unblockedResult = await safeContractCall("验证移除黑名单状态", async () => {
                return await token.blocked(testUserAddress);
            });
            if (unblockedResult.success) {
                console.log(`    移除黑名单后状态: ${unblockedResult.result}`);
            }

            testResults.basicFunctionality.blocklist = {
                success: true,
                blockSuccess: blockUserResult.success,
                unblockSuccess: unblockUserResult.success,
                transferToBlockedFailed: !failedTransferToBlockedResult.success,
                finalBlockedState: unblockedResult.success ? unblockedResult.result : null
            };
        } else {
            testResults.basicFunctionality.blocklist = { success: false };
        }
    } else {
        testResults.basicFunctionality.blocklist = { success: false };
    }

    // 7. 冻结功能测试
    console.log("\n7️⃣ 冻结功能测试");

    const availableBalanceResult = await safeContractCall("检查 testUser 可用余额", async () => {
        return await token.availableBalance(testUserAddress);
    });
    if (availableBalanceResult.success) {
        console.log(`    testUser 可用余额: ${ethers.formatEther(availableBalanceResult.result)} XD`);
    }

    const freezeAmount = ethers.parseEther("300");
    const freezeResult = await safeContractCall("deployer 冻结 testUser 资金", async () => {
        const tx = await token.connect(deployer).freeze(testUserAddress, freezeAmount);
        return await tx.wait();
    });

    if (freezeResult.success) {
        const frozenResult = await safeContractCall("检查冻结金额", async () => {
            return await token.frozen(testUserAddress);
        });
        const newAvailableResult = await safeContractCall("检查冻结后可用余额", async () => {
            return await token.availableBalance(testUserAddress);
        });

        if (frozenResult.success && newAvailableResult.success) {
            console.log(`    冻结金额: ${ethers.formatEther(frozenResult.result)} XD`);
            console.log(`    冻结后可用余额: ${ethers.formatEther(newAvailableResult.result)} XD`);
        }

        const unfreezeResult = await safeContractCall("deployer 解冻 testUser 资金", async () => {
            const tx = await token.connect(deployer).freeze(testUserAddress, 0);
            return await tx.wait();
        });

        if (unfreezeResult.success) {
            const finalAvailableResult = await safeContractCall("检查解冻后可用余额", async () => {
                return await token.availableBalance(testUserAddress);
            });
            if (finalAvailableResult.success) {
                console.log(`    解冻后可用余额: ${ethers.formatEther(finalAvailableResult.result)} XD`);
            }

            testResults.basicFunctionality.freeze = {
                success: true,
                freezeSuccess: freezeResult.success,
                unfreezeSuccess: unfreezeResult.success,
                freezeAmount: ethers.formatEther(freezeAmount),
                finalAvailableBalance: finalAvailableResult.success ? ethers.formatEther(finalAvailableResult.result) : null
            };
        } else {
            testResults.basicFunctionality.freeze = { success: false };
        }
    } else {
        testResults.basicFunctionality.freeze = { success: false };
    }

    // 8. 销毁功能测试 (deployer 销毁自己的代币)
    console.log("\n8️⃣ 销毁功能测试 (deployer 销毁自己的代币)");

    const burnAmount = ethers.parseEther("50");
    const beforeBurnBalanceResult = await safeContractCall("销毁前 deployer 余额", async () => {
        return await token.balanceOf(deployer.address);
    });

    const burnResult = await safeContractCall("deployer 销毁自己的代币", async () => {
        const tx = await token.connect(deployer).burn(burnAmount);
        return await tx.wait();
    });

    if (burnResult.success && beforeBurnBalanceResult.success) {
        const afterBurnBalanceResult = await safeContractCall("销毁后 deployer 余额", async () => {
            return await token.balanceOf(deployer.address);
        });

        if (afterBurnBalanceResult.success) {
            console.log(`    销毁前余额: ${ethers.formatEther(beforeBurnBalanceResult.result)} XD`);
            console.log(`    销毁后余额: ${ethers.formatEther(afterBurnBalanceResult.result)} XD`);
            console.log(`    销毁数量: ${ethers.formatEther(burnAmount)} XD`);

            testResults.basicFunctionality.burn = {
                success: true,
                burnAmount: ethers.formatEther(burnAmount),
                beforeBalance: ethers.formatEther(beforeBurnBalanceResult.result),
                afterBalance: ethers.formatEther(afterBurnBalanceResult.result)
            };
        } else {
            testResults.basicFunctionality.burn = { success: false };
        }
    } else {
        testResults.basicFunctionality.burn = { success: false };
    }
}

// 跨链功能测试 - deployer 操作自己的账户进行跨链转账
async function testCrosschainFunctionality(config, deployer, testUserAddress) {
    console.log("\n🌉 === 跨链功能测试 ===");
    console.log(`💡 deployer 使用自己的账户进行跨链转账`);

    const network = await ethers.provider.getNetwork();

    let currentConfig, targetConfig, targetChainSelector, networkName;
    if (network.chainId === 11155111n) {
        currentConfig = config.sepolia;
        targetConfig = config.bscTestnet;
        targetChainSelector = CHAIN_SELECTORS.bscTestnet;
        networkName = "Sepolia";
        console.log("🔗 当前网络: Sepolia → 目标网络: BSC Testnet");
    } else if (network.chainId === 97n) {
        currentConfig = config.bscTestnet;
        targetConfig = config.sepolia;
        targetChainSelector = CHAIN_SELECTORS.sepolia;
        networkName = "BSC Testnet";
        console.log("🔗 当前网络: BSC Testnet → 目标网络: Sepolia");
    } else {
        console.log("❌ 不支持的网络，跳过跨链测试");
        testResults.crosschainFunctionality.error = "不支持的网络";
        return;
    }

    if (!targetConfig || !targetConfig.contracts.bridge) {
        console.log("❌ 目标网络尚未部署，跳过跨链测试");
        testResults.crosschainFunctionality.error = "目标网络尚未部署";
        return;
    }

    console.log(`目标链选择器: ${targetChainSelector}`);

    const token = await ethers.getContractAt("XDStablecoin", currentConfig.contracts.token);
    const bridge = await ethers.getContractAt("XDStablecoinCCIPBridge", currentConfig.contracts.bridge);

    console.log("\n📊 跨链合约信息:");
    console.log("- Token:", currentConfig.contracts.token);
    console.log("- Bridge:", currentConfig.contracts.bridge);
    console.log("- 目标 Bridge:", targetConfig.contracts.bridge);
    console.log("- 发送用户:", formatAddress(deployer.address));

    // 0. 检查桥合约权限 - 修复权限检查
    console.log("\n0️⃣ 检查桥合约权限");
    const bridgeRoleResult = await safeContractCall("检查桥合约管理员权限", async () => {
        const accessManager = await ethers.getContractAt("XDAccessManager", currentConfig.contracts.accessManager);
        const ADMIN_ROLE = await accessManager.ADMIN_ROLE();
        return await accessManager.hasRole(ADMIN_ROLE, currentConfig.contracts.bridge);
    });

    if (bridgeRoleResult.success) {
        console.log(`    桥合约管理员权限: ${bridgeRoleResult.result}`);
        if (!bridgeRoleResult.result) {
            console.log("    ❌ 桥合约缺少管理员权限，跨链转账将失败");
            testResults.crosschainFunctionality.error = "桥合约缺少管理员权限";
            return;
        }
    }

    // 1. 检查 deployer 余额，必要时铸造代币
    console.log("\n1️⃣ 检查 deployer 余额");
    const deployerBalanceResult = await safeContractCall("获取 deployer 余额", async () => {
        return await token.balanceOf(deployer.address);
    });

    if (deployerBalanceResult.success) {
        console.log(`    deployer 余额: ${ethers.formatEther(deployerBalanceResult.result)} XD`);

        if (deployerBalanceResult.result < ethers.parseEther("500")) {
            console.log("    余额不足，deployer 给自己铸造测试代币...");
            const mintResult = await safeContractCall("deployer 给自己铸造测试代币", async () => {
                const mintAmount = ethers.parseEther("1000");
                const tx = await token.connect(deployer).mint(deployer.address, mintAmount);
                return await tx.wait();
            });

            if (mintResult.success) {
                const newBalanceResult = await safeContractCall("获取新余额", async () => {
                    return await token.balanceOf(deployer.address);
                });
                if (newBalanceResult.success) {
                    console.log(`    铸造后余额: ${ethers.formatEther(newBalanceResult.result)} XD`);
                }
            }
        }
    }

    // 2. 估算跨链费用
    console.log("\n2️⃣ 估算跨链费用");
    const transferAmount = ethers.parseEther("100");

    const feeEstimationResult = await safeContractCall("估算跨链费用", async () => {
        return await bridge.estimateCrossChainFee(
            targetChainSelector,
            targetConfig.contracts.bridge,
            deployer.address, // 接收者也是 deployer
            transferAmount
        );
    });

    let estimatedFee = ethers.parseEther("0.01");
    if (feeEstimationResult.success) {
        estimatedFee = feeEstimationResult.result;
        console.log(`    估算费用: ${ethers.formatEther(estimatedFee)} ETH`);
    } else {
        console.log(`    使用默认费用: ${ethers.formatEther(estimatedFee)} ETH`);
    }

    // 3. 检查 deployer 的 ETH 余额
    console.log("\n3️⃣ 检查 deployer ETH余额");
    const ethBalanceResult = await safeContractCall("获取 deployer ETH余额", async () => {
        return await ethers.provider.getBalance(deployer.address);
    });

    if (ethBalanceResult.success) {
        console.log(`    deployer ETH余额: ${ethers.formatEther(ethBalanceResult.result)} ETH`);

        if (ethBalanceResult.result < estimatedFee) {
            console.log("    ❌ ETH余额不足以支付跨链费用");
            testResults.crosschainFunctionality.error = "ETH余额不足";
            return;
        }
    }

    // 4. deployer 授权桥合约使用自己的代币
    console.log("\n4️⃣ deployer 授权桥合约");
    const allowanceResult = await safeContractCall("检查当前授权", async () => {
        return await token.allowance(deployer.address, currentConfig.contracts.bridge);
    });

    if (allowanceResult.success && allowanceResult.result < transferAmount) {
        const approveResult = await safeContractCall("deployer 授权桥合约", async () => {
            const tx = await token.connect(deployer).approve(currentConfig.contracts.bridge, transferAmount);
            return await tx.wait();
        });

        if (approveResult.success) {
            console.log("    ✅ 桥合约授权完成");
        }
    } else if (allowanceResult.success) {
        console.log("    ✅ 已有足够授权");
    }

    // 5. deployer 执行跨链转账
    console.log("\n5️⃣ deployer 执行跨链转账");
    console.log(`    转账数量: ${ethers.formatEther(transferAmount)} XD`);
    console.log(`    支付费用: ${ethers.formatEther(estimatedFee)} ETH`);
    console.log(`    从 deployer 余额中扣除，发送到目标链的 deployer 地址`);

    const beforeTransferBalance = await token.balanceOf(deployer.address);

    const crosschainTransferResult = await safeContractCall("deployer 执行跨链转账", async () => {
        const tx = await bridge.connect(deployer).transferCrossChain(
            targetChainSelector,
            targetConfig.contracts.bridge,
            deployer.address, // 接收者是 deployer 自己
            transferAmount,
            { value: estimatedFee }
        );
        return await tx.wait();
    });

    if (crosschainTransferResult.success) {
        console.log("    ✅ 跨链转账交易已发送！");
        console.log(`    交易哈希: ${crosschainTransferResult.result.hash}`);

        const afterTransferBalanceResult = await safeContractCall("获取转账后余额", async () => {
            return await token.balanceOf(deployer.address);
        });

        if (afterTransferBalanceResult.success) {
            console.log(`    转账前余额: ${ethers.formatEther(beforeTransferBalance)} XD`);
            console.log(`    转账后余额: ${ethers.formatEther(afterTransferBalanceResult.result)} XD`);
            console.log(`    减少数量: ${ethers.formatEther(beforeTransferBalance - afterTransferBalanceResult.result)} XD`);
        }

        // 解析事件
        const receipt = crosschainTransferResult.result;
        let messageId = null;

        for (const log of receipt.logs) {
            try {
                const parsedEvent = bridge.interface.parseLog(log);
                if (parsedEvent && parsedEvent.name === 'MessageSent') {
                    messageId = parsedEvent.args.messageId;
                    console.log("    ✅ 找到 MessageSent 事件:");
                    console.log(`    - 消息ID: ${messageId}`);
                    console.log(`    - 目标链: ${parsedEvent.args.destinationChainSelector.toString()}`);
                    console.log(`    - 接收者: ${formatAddress(parsedEvent.args.receiver)}`);
                    console.log(`    - 用户: ${formatAddress(parsedEvent.args.user)}`);
                    console.log(`    - 数量: ${ethers.formatEther(parsedEvent.args.amount)} XD`);
                    console.log(`    - 费用: ${ethers.formatEther(parsedEvent.args.fees)} ETH`);
                    break;
                }
            } catch (e) {
                // 忽略无法解析的事件
            }
        }

        testResults.crosschainFunctionality.transfer = {
            success: true,
            messageId: messageId,
            transactionHash: receipt.hash,
            transferAmount: ethers.formatEther(transferAmount),
            feeAmount: ethers.formatEther(estimatedFee),
            beforeBalance: ethers.formatEther(beforeTransferBalance),
            afterBalance: afterTransferBalanceResult.success ? ethers.formatEther(afterTransferBalanceResult.result) : null,
            targetNetwork: network.chainId === 11155111n ? "BSC Testnet" : "Sepolia",
            sender: formatAddress(deployer.address),
            receiver: formatAddress(deployer.address)
        };

        console.log("\n    🎉 跨链转账测试完成！");
        console.log("    ⏳ 请等待几分钟，然后在目标网络检查 deployer 余额");

        const targetNetworkName = network.chainId === 11155111n ? "bscTestnet" : "sepolia";
        console.log(`    检查命令: npx hardhat run scripts/check-balance.js --network ${targetNetworkName}`);

    } else {
        testResults.crosschainFunctionality.transfer = {
            success: false,
            error: crosschainTransferResult.error
        };
    }
}

// 生成测试报告
function generateTestReport() {
    console.log("\n📋 === 测试报告 ===");

    const basic = testResults.basicFunctionality;
    console.log("\n🔸 基础功能测试结果:");

    if (basic.tokenInfo?.success) {
        console.log(`  ✅ 代币信息: ${basic.tokenInfo.name} (${basic.tokenInfo.symbol}), 精度: ${basic.tokenInfo.decimals}`);
    }

    if (basic.mint?.success) {
        console.log(`  ✅ 铸币功能: deployer 成功给 testUser 铸造 ${basic.mint.amount} XD`);
    }

    if (basic.transfer?.success) {
        console.log(`  ✅ 转账功能: deployer 成功给 testUser 转账 ${basic.transfer.amount} XD`);
    }

    if (basic.approve?.success) {
        console.log(`  ✅ 授权功能: deployer 授权转账功能正常`);
    }

    if (basic.pause?.success) {
        console.log(`  ✅ 暂停功能: deployer 暂停和取消暂停正常工作`);
    }

    if (basic.blocklist?.success) {
        console.log(`  ✅ 黑名单功能: deployer 加入和移除黑名单正常工作`);
    }

    if (basic.freeze?.success) {
        console.log(`  ✅ 冻结功能: deployer 冻结和解冻资金正常工作`);
    }

    if (basic.burn?.success) {
        console.log(`  ✅ 销毁功能: deployer 成功销毁 ${basic.burn.burnAmount} XD`);
    }

    const crosschain = testResults.crosschainFunctionality;
    console.log("\n🔸 跨链功能测试结果:");

    if (crosschain.transfer?.success) {
        console.log(`  ✅ 跨链转账: deployer 成功进行自己账户的跨链转账 ${crosschain.transfer.transferAmount} XD`);
        console.log(`    - 消息ID: ${crosschain.transfer.messageId}`);
        console.log(`    - 目标网络: ${crosschain.transfer.targetNetwork}`);
        console.log(`    - 发送者: ${crosschain.transfer.sender}`);
        console.log(`    - 接收者: ${crosschain.transfer.receiver}`);
    } else if (crosschain.transfer?.success === false) {
        console.log(`  ❌ 跨链转账失败: ${crosschain.transfer.error}`);
    } else if (crosschain.error) {
        console.log(`  ⚠️ 跨链测试跳过: ${crosschain.error}`);
    }

    // 过滤预期的错误（这些实际上表示功能正常）
    const expectedErrors = [
        "暂停状态下转账（应该失败）",
        "向黑名单用户转账（应该失败）"
    ];

    const actualErrors = testResults.errors.filter(error =>
        !expectedErrors.includes(error.description)
    );

    if (actualErrors.length > 0) {
        console.log("\n🔸 实际错误汇总:");
        actualErrors.forEach((error, index) => {
            console.log(`  ${index + 1}. ${error.description}: ${error.error}`);
        });
    }

    if (expectedErrors.some(desc => testResults.errors.find(err => err.description === desc))) {
        console.log("\n🔸 预期错误（表示功能正常）:");
        testResults.errors.filter(error => expectedErrors.includes(error.description))
            .forEach((error, index) => {
                console.log(`  ${index + 1}. ${error.description}: ✅ 正确阻止了操作`);
            });
    }

    // 计算成功率
    const basicTests = Object.values(basic);
    const basicSuccess = basicTests.filter(test => test && test.success).length;
    const basicTotal = basicTests.length;

    const crosschainSuccess = crosschain.transfer?.success ? 1 : 0;
    const crosschainTotal = crosschain.error ? 0 : 1;

    console.log("\n📊 测试统计:");
    console.log(`  基础功能: ${basicSuccess}/${basicTotal} 通过`);
    if (crosschainTotal > 0) {
        console.log(`  跨链功能: ${crosschainSuccess}/${crosschainTotal} 通过`);
    }
    console.log(`  实际错误数: ${actualErrors.length}`);

    console.log("\n🎉 所有测试完成！");

    // 保存测试报告
    const reportData = {
        timestamp: new Date().toISOString(),
        testUserAddress: TEST_USER_ADDRESS,
        network: null,
        results: testResults
    };

    ethers.provider.getNetwork().then(network => {
        reportData.network = {
            chainId: network.chainId.toString(),
            name: network.chainId === 11155111n ? "Sepolia" :
                network.chainId === 97n ? "BSC Testnet" : "Unknown"
        };

        const reportsDir = path.join(__dirname, '../test-reports');
        if (!fs.existsSync(reportsDir)) {
            fs.mkdirSync(reportsDir, { recursive: true });
        }

        const reportFile = path.join(reportsDir, `test-report-${Date.now()}.json`);
        fs.writeFileSync(reportFile, JSON.stringify(reportData, null, 2));

        console.log(`\n💾 测试报告已保存到: ${reportFile}`);
    }).catch(console.error);
}

// 主函数
async function main() {
    console.log("\n🧪 开始完整的合约功能测试...");
    console.log(`📝 测试用户地址: ${TEST_USER_ADDRESS}`);
    console.log("💡 deployer 拥有私钥主动操作，testUser 只作为接收方");
    console.log("💡 可通过环境变量 TEST_USER_ADDRESS 自定义测试地址");

    // 获取网络信息
    const network = await ethers.provider.getNetwork();
    console.log(`📍 当前网络: ${network.chainId === 11155111n ? "Sepolia" :
        network.chainId === 97n ? "BSC Testnet" :
            "Unknown"}`);

    // 读取配置文件
    const configPath = path.join(__dirname, '../deployments/crosschain-config.json');
    if (!fs.existsSync(configPath)) {
        console.error("❌ 配置文件不存在:", configPath);
        console.log("请先运行部署脚本: npx hardhat run scripts/deploy-crosschain-optimized.js --network <network>");
        process.exit(1);
    }

    const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));

    let currentConfig;
    if (network.chainId === 11155111n) {
        currentConfig = config.sepolia;
    } else if (network.chainId === 97n) {
        currentConfig = config.bscTestnet;
    } else {
        console.error("❌ 不支持的网络");
        process.exit(1);
    }

    if (!currentConfig || !currentConfig.contracts) {
        console.error("❌ 当前网络尚未部署合约");
        process.exit(1);
    }

    console.log("\n📊 合约地址:");
    console.log("- Token:", currentConfig.contracts.token);
    console.log("- Bridge:", currentConfig.contracts.bridge);
    console.log("- AccessManager:", currentConfig.contracts.accessManager);

    // 获取账户
    const [deployer] = await ethers.getSigners();
    const testUserAddress = TEST_USER_ADDRESS;

    console.log("\n👥 测试账户:");
    console.log("- 部署者 (主动操作):", formatAddress(deployer.address));
    console.log("- 测试用户 (接收方):", formatAddress(testUserAddress));

    // 获取合约实例
    const token = await ethers.getContractAt("XDStablecoin", currentConfig.contracts.token);
    const accessManager = await ethers.getContractAt("XDAccessManager", currentConfig.contracts.accessManager);

    try {
        // 运行基础功能测试
        await testBasicFunctionality(token, accessManager, deployer, testUserAddress);

        // 运行跨链功能测试
        await testCrosschainFunctionality(config, deployer, testUserAddress);

        // 生成测试报告
        generateTestReport();

    } catch (error) {
        console.error("\n❌ 测试过程中出现错误:", error);
        process.exit(1);
    }
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
}); 