import { JsonRpcProvider, Contract } from "ethers";
import { config } from "./config.js";
import { SOURCE_REPAYMENT_EMITTER_ABI } from "./abi.js";
import { resolveSourceChainKey, proveAndSubmitRepayment } from "./prove.js";

async function main() {
    const sourceProvider = new JsonRpcProvider(config.sourceChainRpcUrl);
    const creditcoinProvider = new JsonRpcProvider(config.creditcoinRpcUrl);

    const sourceChainKey = await resolveSourceChainKey(creditcoinProvider);
    console.log(
        `[watch] Resolved source chain key: ${sourceChainKey} (EVM chainId ${config.sourceEvmChainId})`
    );

    const emitter = new Contract(
        config.sourceRepaymentEmitterAddress,
        SOURCE_REPAYMENT_EMITTER_ABI,
        sourceProvider
    );

    console.log(`[watch] Listening for RepaymentMade on ${config.sourceRepaymentEmitterAddress}...`);
    emitter.on("RepaymentMade", async (borrower: string, amount: bigint, timestamp: bigint, event) => {
        const sourceTxHash = event.log.transactionHash;
        console.log(`[watch] RepaymentMade: borrower=${borrower} amount=${amount} tx=${sourceTxHash}`);

        try {
            await proveAndSubmitRepayment({
                sourceTxHash,
                sourceChainKey,
                sourceProvider,
                creditcoinProvider,
            });
        } catch (err) {
            // Log and keep the worker alive.
            console.error(`[watch] Failed to prove/submit ${sourceTxHash}:`, err);
        }
    });
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});