import { config as loadEnv } from "dotenv";
loadEnv({ quiet: true });

function required(name: string): string {
    const value = process.env[name];
    if (!value) throw new Error(`Missing required env var: ${name}`);
    return value;
}

export const config = {
    sourceChainRpcUrl: required("SOURCE_CHAIN_RPC_URL"),
    creditcoinRpcUrl: required("CREDITCOIN_RPC_URL"),
    proverServiceUrl: required("PROVER_SERVICE_URL"),
    sourceRepaymentEmitterAddress: required("SOURCE_REPAYMENT_EMITTER_ADDRESS"),
    creditScoreRegistryAddress: required("CREDIT_SCORE_REGISTRY_ADDRESS"),
    workerPrivateKey: required("WORKER_PRIVATE_KEY"),
    sourceEvmChainId: Number(process.env.SOURCE_EVM_CHAIN_ID ?? "11155111"),
};