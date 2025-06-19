const { ethers } = require("hardhat");

async function main() {
    const [deployer, user1, user2] = await ethers.getSigners();

    const contractAddress = "0x9b932332fc7a2107c3b03dEC2Cf73D83aE10801f"; // 修改为你实际部署的合约地址
    const StableCoin = await ethers.getContractFactory("StableCoin");
    const stableCoin = StableCoin.attach(contractAddress);

    // 1. 铸币给 deployer
    const mintTx = await stableCoin.mint(deployer.address, ethers.parseUnits("100", 18));
    await mintTx.wait();
    console.log("✅ Minted 100 tokens to:", deployer.address);

    // 2. 转账 20 tokens 给 user1
    const transferTx = await stableCoin.transfer(user1.address, ethers.parseUnits("20", 18));
    await transferTx.wait();
    console.log("✅ Transferred 20 tokens to:", user1.address);

    // 3. 查询 user1 余额
    const balance = await stableCoin.balanceOf(user1.address);
    console.log("📊 Balance of user1:", ethers.formatUnits(balance, 18));

    // 4. 销毁 deployer 的 10 tokens（用 transfer+burn 或直接 burn）
    const tx = await stableCoin.burn(ethers.parseUnits("10", 18));
    await tx.wait();
    console.log("Burned 10 tokens from:", deployer.address);

    // 5. 暂停合约
    const pauseTx = await stableCoin.pause();
    await pauseTx.wait();
    console.log("⏸️ Contract paused");

    // 6. 恢复合约
    const unpauseTx = await stableCoin.unpause();
    await unpauseTx.wait();
    console.log("▶️ Contract unpaused");

    // 7. 授权 user1 为 MINTER
    const MINTER_ROLE = ethers.keccak256(ethers.toUtf8Bytes("MINTER_ROLE"));
    const grantMinterTx = await stableCoin.grantRole(MINTER_ROLE, user1.address);
    await grantMinterTx.wait();
    console.log("🔑 Granted MINTER_ROLE to:", user1.address);

    // 8. 添加 user2 到黑名单
    const BLACKLIST_ROLE = ethers.keccak256(ethers.toUtf8Bytes("BLACKLIST_ROLE"));
    const grantBlacklistTx = await stableCoin.grantRole(BLACKLIST_ROLE, deployer.address);
    await grantBlacklistTx.wait();
    const addBlacklistTx = await stableCoin.addToBlacklist(user2.address);
    await addBlacklistTx.wait();
    console.log("🚫 Added user2 to blacklist");

    // 9. 移除黑名单
    const removeBlacklistTx = await stableCoin.removeFromBlacklist(user2.address);
    await removeBlacklistTx.wait();
    console.log("✅ Removed user2 from blacklist");
}

main().catch((error) => {
    console.error("❌ Error:", error);
    process.exit(1);
});
