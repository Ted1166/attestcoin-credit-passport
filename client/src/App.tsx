import { useCallback, useEffect, useRef, useState } from "react";
import { Contract, JsonRpcProvider, formatEther, parseEther } from "ethers";
import {
  CREDITCOIN_TESTNET,
  CONTRACTS,
  CREDIT_SCORE_REGISTRY_ABI,
  MOCK_LENDING_POOL_ABI,
  SOURCE_REPAYMENT_EMITTER_ABI,
} from "./lib/contracts";
import { connectWallet, getBrowserProvider, hasInjectedWallet, switchToSepolia } from "./lib/wallet";
import { TopNav } from "./components/TopNav";
import { PassportCard } from "./components/PassportCard";
import { PipelineStatus, type PipelineStage } from "./components/PipelineStatus";
import { LedgerPanel, type LedgerEntry } from "./components/LedgerPanel";
import "./App.css";

interface Profile {
  repaymentCount: number;
  totalRepaid: string;
  score: number;
  collateralRatioBps: number;
}

function tierLabel(ratioBps: number | null): string {
  if (ratioBps === null) return "No verified history yet";
  if (ratioBps <= 11000) return "Excellent tier · 110% collateral";
  if (ratioBps <= 11500) return "Strong tier · 115% collateral";
  if (ratioBps <= 12000) return "Good tier · 120% collateral";
  if (ratioBps <= 13000) return "Building tier · 130% collateral";
  return "Unscored · 150% default";
}

// Read-only connection to Creditcoin testnet, independent of whatever network the
// wallet is currently on — lets the dashboard stay live without forcing a network
// switch just to view data.
const creditcoinReader = new JsonRpcProvider(CREDITCOIN_TESTNET.rpcUrl);

export default function App() {
  const [address, setAddress] = useState<string | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [profile, setProfile] = useState<Profile | null>(null);
  const [profileLoading, setProfileLoading] = useState(false);

  const [stage, setStage] = useState<PipelineStage>("idle");
  const [triggering, setTriggering] = useState(false);
  const [sourceTxHash, setSourceTxHash] = useState<string | null>(null);
  const [verifyTxHash, setVerifyTxHash] = useState<string | null>(null);
  const [ledger, setLedger] = useState<LedgerEntry[]>([]);

  const watchStartBlockRef = useRef<number | null>(null);
  const pollHandleRef = useRef<number | null>(null);

  const refreshProfile = useCallback(async (addr: string) => {
    setProfileLoading(true);
    try {
      const registry = new Contract(CONTRACTS.creditScoreRegistry, CREDIT_SCORE_REGISTRY_ABI, creditcoinReader);
      const pool = new Contract(CONTRACTS.mockLendingPool, MOCK_LENDING_POOL_ABI, creditcoinReader);

      const [rawProfile, ratio] = await Promise.all([
        registry.getCreditProfile(addr),
        pool.getEffectiveRatio(addr),
      ]);

      setProfile({
        repaymentCount: Number(rawProfile.repaymentCount),
        totalRepaid: formatEther(rawProfile.totalRepaid),
        score: Number(rawProfile.score),
        collateralRatioBps: Number(ratio),
      });
    } catch (err) {
      console.error("Failed to refresh profile", err);
    } finally {
      setProfileLoading(false);
    }
  }, []);

  // Poll the dashboard state periodically once connected.
  useEffect(() => {
    if (!address) return;
    refreshProfile(address);
    const id = window.setInterval(() => refreshProfile(address), 20_000);
    return () => window.clearInterval(id);
  }, [address, refreshProfile]);

  const handleConnect = useCallback(async () => {
    setError(null);
    setConnecting(true);
    try {
      const addr = await connectWallet();
      setAddress(addr);
    } catch (err: any) {
      setError(err?.message ?? "Failed to connect wallet.");
    } finally {
      setConnecting(false);
    }
  }, []);

  const stopWatching = useCallback(() => {
    if (pollHandleRef.current !== null) {
      window.clearInterval(pollHandleRef.current);
      pollHandleRef.current = null;
    }
  }, []);

  const startWatchingForVerification = useCallback(
    (addr: string) => {
      stopWatching();
      const registry = new Contract(CONTRACTS.creditScoreRegistry, CREDIT_SCORE_REGISTRY_ABI, creditcoinReader);

      pollHandleRef.current = window.setInterval(async () => {
        try {
          const fromBlock = watchStartBlockRef.current ?? 0;
          const events = await registry.queryFilter(
            registry.filters.RepaymentRecorded(addr),
            fromBlock,
            "latest"
          );
          if (events.length > 0) {
            const latest = events[events.length - 1] as any;
            const newScore = Number(latest.args?.newScore ?? 0);

            setVerifyTxHash(latest.transactionHash);
            setStage("verified");
            setLedger((prev) => [
              { txHash: latest.transactionHash, amount: "1.0", newScore, timestamp: Date.now() },
              ...prev,
            ]);
            await refreshProfile(addr);
            stopWatching();
          }
        } catch (err) {
          console.error("Watch loop error", err);
        }
      }, 12_000);
    },
    [refreshProfile, stopWatching]
  );

  const handleTriggerRepayment = useCallback(async () => {
    if (!address) return;
    setError(null);
    setTriggering(true);
    setSourceTxHash(null);
    setVerifyTxHash(null);
    setStage("idle");

    try {
      await switchToSepolia();
      const browserProvider = getBrowserProvider();
      const signer = await browserProvider.getSigner();
      const emitter = new Contract(CONTRACTS.sourceRepaymentEmitter, SOURCE_REPAYMENT_EMITTER_ABI, signer);

      const tx = await emitter.recordRepayment(address, parseEther("1"));
      setStage("submitted");
      const receipt = await tx.wait();
      setSourceTxHash(receipt?.hash ?? tx.hash);

      // Record the Creditcoin block height at trigger time so the watch loop only
      // looks for events from here forward.
      watchStartBlockRef.current = await creditcoinReader.getBlockNumber();
      setStage("awaiting-attestation");
      startWatchingForVerification(address);
    } catch (err: any) {
      setError(err?.reason ?? err?.message ?? "Failed to trigger repayment.");
      setStage("idle");
    } finally {
      setTriggering(false);
    }
  }, [address, startWatchingForVerification]);

  useEffect(() => stopWatching, [stopWatching]);

  const ratioPct = profile ? profile.collateralRatioBps / 100 : null;

  return (
    <div className="app">
      <TopNav address={address} connecting={connecting} onConnect={handleConnect} />

      <main className="app__main">
        <section className="app__hero">
          <span className="app__eyebrow">Cross-chain credit, verified — not self-reported</span>
          <h1 className="app__headline">
            One credit history.
            <br />
            Every chain you use.
          </h1>
          <p className="app__subhead">
            Repayment behavior on Sepolia is cryptographically proven onto Creditcoin via the
            Attestcoin Protocol — no oracle, no manual review — and your lending terms update the
            moment it's verified.
          </p>
        </section>

        {!hasInjectedWallet() && (
          <div className="app__banner">No injected wallet detected — install MetaMask to continue.</div>
        )}
        {error && <div className="app__banner app__banner--error">{error}</div>}

        <section className="app__grid">
          <div className="app__col">
            <PassportCard
              address={address}
              score={profile?.score ?? null}
              tierLabel={tierLabel(profile?.collateralRatioBps ?? null)}
              collateralRatioPct={ratioPct}
              loading={profileLoading}
            />

            <button
              className="app__trigger"
              onClick={handleTriggerRepayment}
              disabled={!address || triggering || stage === "awaiting-attestation"}
            >
              {triggering
                ? "Submitting on Sepolia…"
                : stage === "awaiting-attestation"
                  ? "Awaiting attestation…"
                  : "Trigger repayment on Sepolia"}
            </button>
            <p className="app__trigger-hint">
              Records a 1.0 repayment signal for your own address, then watches it get verified end-to-end.
            </p>
          </div>

          <div className="app__col">
            <div className="app__panel">
              <span className="app__panel-title">Verification pipeline</span>
              <PipelineStatus stage={stage} sourceTxHash={sourceTxHash} verifyTxHash={verifyTxHash} />
            </div>
            <LedgerPanel entries={ledger} />
          </div>
        </section>
      </main>

      <footer className="app__footer">
        Built on Creditcoin · Attestcoin Protocol · BUIDL CTC 2026 Fall
      </footer>
    </div>
  );
}