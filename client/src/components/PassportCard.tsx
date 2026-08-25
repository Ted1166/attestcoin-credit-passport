import { useMemo } from "react";
import "./PassportCard.css";

interface Props {
    address: string | null;
    score: number | null;
    tierLabel: string;
    collateralRatioPct: number | null;
    loading: boolean;
}

function shortAddress(addr: string) {
    return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

/** Builds a passport-style Machine Readable Zone line encoding real profile data. */
function buildMrz(address: string | null, score: number | null, ratio: number | null) {
    const addrPart = address ? address.slice(2, 2 + 20).toUpperCase() : "UNVERIFIED".padEnd(20, "<");
    const scorePart = score !== null ? `SCORE${score}` : "SCOREPENDING";
    const ratioPart = ratio !== null ? `RATIO${ratio}` : "RATIOPENDING";
    return `P<CREDPASSPORT<${addrPart}<<${scorePart}<<${ratioPart}<<<<<<<<<<`.slice(0, 44);
}

export function PassportCard({ address, score, tierLabel, collateralRatioPct, loading }: Props) {
    const mrz = useMemo(
        () => buildMrz(address, score, collateralRatioPct),
        [address, score, collateralRatioPct]
    );

    return (
        <div className="passport-card" role="img" aria-label="Attestcoin Credit Passport card">
            <div className="passport-card__foil" aria-hidden="true" />
            <div className="passport-card__grain" aria-hidden="true" />

            <div className="passport-card__top">
                <div className="passport-card__chip" aria-hidden="true">
                    <div className="passport-card__chip-line" />
                    <div className="passport-card__chip-line" />
                    <div className="passport-card__chip-line" />
                </div>
                <span className="passport-card__eyebrow">Attestcoin Credit Passport</span>
            </div>

            <div className="passport-card__body">
                <span className="passport-card__label">Verified credit score</span>
                <span className={`passport-card__score ${loading ? "is-loading" : ""}`}>
                    {score !== null ? score : "— —"}
                </span>
                <span className="passport-card__tier">{tierLabel}</span>
            </div>

            <div className="passport-card__footer">
                <div className="passport-card__field">
                    <span className="passport-card__field-label">Holder</span>
                    <span className="passport-card__field-value">
                        {address ? shortAddress(address) : "Not connected"}
                    </span>
                </div>
                <div className="passport-card__field">
                    <span className="passport-card__field-label">Collateral ratio</span>
                    <span className="passport-card__field-value">
                        {collateralRatioPct !== null ? `${collateralRatioPct}%` : "—"}
                    </span>
                </div>
            </div>

            <div className="passport-card__mrz" aria-hidden="true">
                <div className="passport-card__mrz-line">{mrz}</div>
                <div className="passport-card__mrz-line">
                    {"CREDITCOIN<CC3<TESTNET<<<<<<<<<<<<<<<<<<<<<<<".slice(0, 44)}
                </div>
            </div>
        </div>
    );
}