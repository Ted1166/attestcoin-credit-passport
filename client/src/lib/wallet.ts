import { BrowserProvider } from "ethers";
import { CREDITCOIN_TESTNET, SEPOLIA } from "./contracts";

declare global {
    interface Window {
        ethereum?: any;
    }
}

export function hasInjectedWallet(): boolean {
    return typeof window !== "undefined" && !!window.ethereum;
}

export async function connectWallet(): Promise<string> {
    if (!hasInjectedWallet()) {
        throw new Error("No wallet found. Install MetaMask or another injected wallet.");
    }
    const accounts: string[] = await window.ethereum.request({ method: "eth_requestAccounts" });
    if (!accounts?.length) throw new Error("No account authorized.");
    return accounts[0];
}

async function switchOrAddChain(network: typeof CREDITCOIN_TESTNET | typeof SEPOLIA) {
    if (!hasInjectedWallet()) throw new Error("No wallet found.");
    try {
        await window.ethereum.request({
            method: "wallet_switchEthereumChain",
            params: [{ chainId: network.chainIdHex }],
        });
    } catch (err: any) {
        // 4902 = chain not added to wallet yet
        if (err?.code === 4902) {
            await window.ethereum.request({
                method: "wallet_addEthereumChain",
                params: [
                    {
                        chainId: network.chainIdHex,
                        chainName: network.chainName,
                        rpcUrls: [network.rpcUrl],
                        blockExplorerUrls: [network.blockExplorerUrl],
                        nativeCurrency: network.nativeCurrency,
                    },
                ],
            });
        } else {
            throw err;
        }
    }
}

export async function switchToCreditcoin() {
    await switchOrAddChain(CREDITCOIN_TESTNET);
}

export async function switchToSepolia() {
    await switchOrAddChain(SEPOLIA);
}

export function getBrowserProvider(): BrowserProvider {
    if (!hasInjectedWallet()) throw new Error("No wallet found.");
    return new BrowserProvider(window.ethereum);
}