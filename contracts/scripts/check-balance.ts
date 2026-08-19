import { network } from "hardhat";

async function main() {
    const { ethers } = await network.connect();

    const [signer] = await ethers.getSigners();
    const balance = await ethers.provider.getBalance(signer.address);
    const net = await ethers.provider.getNetwork();

    console.log("Connected network name:", net.name);
    console.log("Connected chain ID:    ", net.chainId.toString());
    console.log("Address:", signer.address);
    console.log("Balance:", ethers.formatEther(balance));
}

main().catch((err) => {
    console.error(err);
    process.exitCode = 1;
});