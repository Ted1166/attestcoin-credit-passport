import { network } from "hardhat";
import { chainInfo } from "@gluwa/usc-sdk";
import { config as loadEnv } from "dotenv";
import * as fs from "fs";
import * as path from "path";

loadEnv({ quiet: true });

const SEPOLIA_EVM_CHAIN_ID = 11155111;
const CREDITCOIN_CHAIN_ID = 102031;

function readIgnitionAddress(chainId: number, futureId: string): string | undefined {
    const file = path.join(
        process.cwd(),
        "ignition",
        "deployments",
        `chain-${chainId}`,
        "deployed_addresses.json"
    );
    if (!fs.existsSync(file)) return undefined;
    const data = JSON.parse(fs.readFileSync(file, "utf8"));
    return data[futureId];
}

function envOrUndefined(name: string): string | undefined {
    const value = process.env[name];
    return value && value.trim() !== "" ? value : undefined;
}

async function main() {
    const { ethers } = await network.connect();

    const registryAddress =
        envOrUndefined("CREDIT_SCORE_REGISTRY_ADDRESS") ??
        readIgnitionAddress(CREDITCOIN_CHAIN_ID, "CreditPassportModule#CreditScoreRegistry");
    const emitterAddress =
        envOrUndefined("SOURCE_REPAYMENT_EMITTER_ADDRESS") ??
        readIgnitionAddress(SEPOLIA_EVM_CHAIN_ID, "SourceRepaymentEmitterModule#SourceRepaymentEmitter");
    const workerAddress = envOrUndefined("WORKER_ADDRESS");

    if (!registryAddress) {
        throw new Error(
            "Could not resolve CreditScoreRegistry address. Deploy CreditPassportModule first, " +
            "or set CREDIT_SCORE_REGISTRY_ADDRESS in contracts/.env."
        );
    }
    if (!emitterAddress) {
        throw new Error(
            "Could not resolve SourceRepaymentEmitter address. Deploy SourceRepaymentEmitterModule " +
            "on Sepolia first, or set SOURCE_REPAYMENT_EMITTER_ADDRESS in contracts/.env."
        );
    }
    if (!workerAddress) {
        throw new Error("Set WORKER_ADDRESS (the worker's public address) in contracts/.env.");
    }

    console.log("Resolving Sepolia's Attestcoin chainKey (not the same as its EVM chainId)...");
    const chainInfoProvider = new chainInfo.PrecompileChainInfoProvider(ethers.provider as any);
    const supportedChains = await chainInfoProvider.getSupportedChains();
    const match = supportedChains.find((c) => c.chainId === SEPOLIA_EVM_CHAIN_ID);
    if (!match) {
        throw new Error(
            `Sepolia (EVM chainId ${SEPOLIA_EVM_CHAIN_ID}) not found in Creditcoin's currently supported chains: ` +
            JSON.stringify(supportedChains)
        );
    }
    console.log(`  Resolved chainKey: ${match.chainKey}`);
    const chainKeyBytes32 = ethers.zeroPadValue(ethers.toBeHex(match.chainKey), 32);

    const registry = await ethers.getContractAt("CreditScoreRegistry", registryAddress);

    console.log(`Configuring source chain on CreditScoreRegistry (${registryAddress})...`);
    let tx = await registry.configureSourceChain(chainKeyBytes32, SEPOLIA_EVM_CHAIN_ID, emitterAddress);
    await tx.wait();
    console.log(`  done: ${tx.hash}`);

    console.log(`Granting OPERATOR_ROLE to worker (${workerAddress})...`);
    tx = await registry.grantOperator(workerAddress);
    await tx.wait();
    console.log(`  done: ${tx.hash}`);

    console.log("\n✅ Configuration complete. The worker can now call recordVerifiedRepayment.");
}

main().catch((err) => {
    console.error(err);
    process.exitCode = 1;
});