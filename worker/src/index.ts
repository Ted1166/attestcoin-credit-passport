import { JsonRpcProvider, Contract } from "ethers";
import { config } from "./config.js";
import { SOURCE_REPAYMENT_EMITTER_ABI } from "./abi.js";
import { resolveSourceChainKey, proveAndSubmitRepayment } from "./prove.js";

function createResilientProvider(url: string): JsonRpcProvider {
    return new JsonRpcProvider(url, undefined, { staticNetwork: false, batchMaxCount: 1 });
}

async function withRetries<T>(label: string, fn: () => Promise<T>, attempts = 5): Promise<T> {
    let lastErr: unknown;
    for (let i = 0; i < attempts; i++) {
        try {
            return await fn();
        } catch (err) {
            lastErr = err;
            const waitMs = Math.min(2000 * 2 ** i, 30_000);
            console.error(`[watch] ${label} failed (attempt ${i + 1}/${attempts}): ${(err as Error).message}. Retrying in ${waitMs}ms...`);
            await new Promise((r) => setTimeout(r, waitMs));
        }
    }
    throw lastErr;
}

async function main() {
    const sourceProvider = createResilientProvider(config.sourceChainRpcUrl);
    const creditcoinProvider = createResilientProvider(config.creditcoinRpcUrl);

    await withRetries("Sepolia network detection", () => sourceProvider.getNetwork());
    await withRetries("Creditcoin network detection", () => creditcoinProvider.getNetwork());

    const sourceChainKey = await withRetries("resolveSourceChainKey", () =>
        resolveSourceChainKey(creditcoinProvider)
    );
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
            console.error(`[watch] Failed to prove/submit ${sourceTxHash}:`, err);
        }
    });
}

async function mainWithRestart() {
    while (true) {
        try {
            await main();
            break;
        } catch (err) {
            console.error("[watch] Startup failed, restarting in 10s:", err);
            await new Promise((r) => setTimeout(r, 10_000));
        }
    }
}

mainWithRestart();