import "./LedgerPanel.css";

export interface LedgerEntry {
    txHash: string;
    amount: string;
    newScore: number;
    timestamp: number;
}

interface Props {
    entries: LedgerEntry[];
}

export function LedgerPanel({ entries }: Props) {
    return (
        <div className="ledger">
            <div className="ledger__header">
                <span className="ledger__title">Verified ledger</span>
                <span className="ledger__subtitle">Onchain, cryptographically proven — not self-reported</span>
            </div>

            {entries.length === 0 ? (
                <div className="ledger__empty">No verified events yet. Trigger a repayment above to begin.</div>
            ) : (
                <ul className="ledger__list">
                    {entries.map((entry) => (
                        <li key={entry.txHash} className="ledger__row">
                            <span className="ledger__stamp-icon" aria-hidden="true">
                                ✓
                            </span>
                            <div className="ledger__row-text">
                                <span className="ledger__row-primary">
                                    Repayment verified · score → {entry.newScore}
                                </span>
                                <a
                                    className="ledger__row-link"
                                    href={`https://creditcoin-testnet.blockscout.com/tx/${entry.txHash}`}
                                    target="_blank"
                                    rel="noreferrer"
                                >
                                    {entry.txHash.slice(0, 10)}…{entry.txHash.slice(-8)} ↗
                                </a>
                            </div>
                            <span className="ledger__row-time">
                                {new Date(entry.timestamp).toLocaleTimeString()}
                            </span>
                        </li>
                    ))}
                </ul>
            )}
        </div>
    );
}