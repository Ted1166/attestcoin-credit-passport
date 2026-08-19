import { AbiCoder, JsonRpcProvider, Wallet, Contract, zeroPadValue, toBeHex } from "ethers";
import { chainInfo, proofProvider } from "@gluwa/usc-sdk";
import { config } from "./config.js";
import { CREDIT_SCORE_REGISTRY_ABI } from "./abi.js";

const BINARY_MERKLE_KIND = 0;

function asSdkProvider(provider: JsonRpcProvider): any {
    return provider;
}

export async function resolveSourceChainKey(creditcoinProvider: JsonRpcProvider): Promise<number> {
    const chainInfoProvider = new chainInfo.PrecompileChainInfoProvider(asSdkProvider(creditcoinProvider));
    const supportedChains = await chainInfoProvider.getSupportedChains();
    const match = supportedChains.find((c) => c.chainId === config.sourceEvmChainId);
    if (!match) {
        throw new Error(
            `Source chain (EVM chainId ${config.sourceEvmChainId}) is not in Creditcoin's currently supported chains: ` +
            JSON.stringify(supportedChains)
        );
    }
    return match.chainKey;
}

export async function proveAndSubmitRepayment(params: {
    sourceTxHash: string;
    sourceChainKey: number;
    sourceProvider: JsonRpcProvider;
    creditcoinProvider: JsonRpcProvider;
}): Promise<void> {
    const { sourceTxHash, sourceChainKey, sourceProvider, creditcoinProvider } = params;

    const receipt = await sourceProvider.getTransactionReceipt(sourceTxHash);
    if (!receipt) throw new Error(`Transaction ${sourceTxHash} not found on source chain`);
    const txBlockHeight = receipt.blockNumber;

    console.log(`[prove] Waiting for Creditcoin attestation of block ${txBlockHeight}...`);
    const proofBuilder = new proofProvider.service.ProofBuilder(sourceChainKey, config.proverServiceUrl);
    // Defaults: poll every 15s, timeout after 15 minutes. Real end-to-end attestation +
    // proving typically takes ~15-30 minutes per Creditcoin's own tutorials.
    await proofBuilder.waitUntilHeightAttested(sourceChainKey, txBlockHeight, 15_000, 30 * 60_000);

    console.log(`[prove] Attested. Fetching proof for ${sourceTxHash}...`);
    const proofResult = await proofBuilder.getProof(sourceTxHash);
    if (!proofResult.success || !proofResult.data) {
        throw new Error(`Proof generation failed: ${proofResult.error ?? "unknown error"}`);
    }
    const proof = proofResult.data;

    // Encode (txBytes, siblings[]) into BlockProverTypes.InclusionProof.data, matching
    // QueryProofVerificationLib.decodeBinaryMerklePayload's expected abi.decode shape.
    const abiCoder = AbiCoder.defaultAbiCoder();
    const siblingsForEncoding = proof.merkleProof.siblings.map((s) => [s.hash, s.isLeft]);
    const inclusionProofData = abiCoder.encode(
        ["bytes", "tuple(bytes32,bool)[]"],
        [proof.txBytes, siblingsForEncoding]
    );

    const inclusionProof = {
        kind: BINARY_MERKLE_KIND,
        root: proof.merkleProof.root,
        data: inclusionProofData,
    };
    const continuityProof = {
        lowerEndpointDigest: proof.continuityProof.lowerEndpointDigest,
        roots: proof.continuityProof.roots,
    };

    const chainKeyBytes32 = zeroPadValue(toBeHex(sourceChainKey), 32);

    console.log(`[prove] Submitting proof to CreditScoreRegistry on Creditcoin...`);
    const workerWallet = new Wallet(config.workerPrivateKey, creditcoinProvider);
    const registry = new Contract(config.creditScoreRegistryAddress, CREDIT_SCORE_REGISTRY_ABI, workerWallet);

    const tx = await registry.recordVerifiedRepayment(
        chainKeyBytes32,
        proof.headerNumber,
        inclusionProof,
        continuityProof
    );
    const txReceipt = await tx.wait();
    console.log(`[prove] Verified and recorded on-chain. tx: ${txReceipt?.hash}`);
}