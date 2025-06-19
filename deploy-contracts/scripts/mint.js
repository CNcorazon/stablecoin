const { ethers } = require("hardhat");  // 必须先导入 ethers

async function main() {
    const [deployer] = await ethers.getSigners();

    const contractAddress = "0x9b932332fc7a2107c3b03dEC2Cf73D83aE10801f";
    const StableCoin = await ethers.getContractFactory("StableCoin");
    const stableCoin = StableCoin.attach(contractAddress);

    const tx = await stableCoin.mint(deployer.address, ethers.parseUnits("100", 18));
    await tx.wait();

    console.log("Minted 100 tokens to:", deployer.address);

    const balance = await stableCoin.balanceOf(deployer.address);
    console.log("Balance:", ethers.formatUnits(balance, 18));
}

main().catch((error) => {
    console.error(error);
    process.exit(1);
});
