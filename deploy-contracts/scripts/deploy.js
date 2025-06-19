const { ethers } = require("hardhat");

async function main() {
    const [deployer] = await ethers.getSigners();

    console.log("Deploying contracts with account:", deployer.address);

    const StableCoin = await ethers.getContractFactory("StableCoin");
    const token = await StableCoin.deploy("Gtja-Coin", "GTJA");

    await token.waitForDeployment();

    console.log("Contract deployed to:", await token.getAddress());
}

main().catch((error) => {
    console.error(error);
    process.exit(1);
});
