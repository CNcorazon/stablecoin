const { ethers } = require("ethers");
require("dotenv").config();

const provider = new ethers.JsonRpcProvider(process.env.SEPOLIA_RPC);
const abi = require("../artifacts/contracts/StableCoin.sol/StableCoin.json").abi;
const contractAddress = process.env.CONTRACT_ADDRESS;
const wallet = new ethers.Wallet(process.env.PRIVATE_KEY, provider);

let pool = [];

async function initContractPool(poolSize = 3) {
    for (let i = 0; i < poolSize; i++) {
        const contract = new ethers.Contract(contractAddress, abi, wallet);
        pool.push(contract);
    }
    return pool;
}

function getContractFromPool() {
    return pool[Math.floor(Math.random() * pool.length)];
}

module.exports = {
    initContractPool,
    getContractFromPool,
};
