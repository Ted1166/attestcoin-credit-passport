import "./PipelineStatus.css";

export type PipelineStage = "idle" | "submitted" | "awaiting-attestation" | "verified";

interface Props {
    stage: PipelineStage;
    sourceTxHash: string | null;
    verifyTxHash: string | null;
}

const STEPS: { key: PipelineStage; label: string; detail: string }[] = [
    { key: "submitted", label: "Repayment recorded", detail: "Event emitted on Sepolia" },
    { key: "awaiting-attestation", label: "Awaiting attestation", detail: "Creditcoin attestors confirming the block (~15–30 min)" },
    { key: "verified", label: "Proof verified", detail: "CreditPassportASC verified it onchain, terms updated" },
];

const ORDER: PipelineStage[] = ["idle", "submitted", "awaiting-attestation", "verified"];

function statusFor(step: PipelineStage, current: PipelineStage): "done" | "active" | "pending" {
    const stepIndex = ORDER.indexOf(step);
    const currentIndex = ORDER.indexOf(current);
    if (currentIndex > stepIndex) return "done";
    if (currentIndex === stepIndex) return "active";
    return "pending";
}

export function PipelineStatus({ stage, sourceTxHash, verifyTxHash }: Props) {
    if (stage === "idle") {
        return (
            <div className="pipeline pipeline--idle">
                <span className="pipeline__idle-text">
                    Trigger a repayment to watch a verified cross-chain event travel through the pipeline, live.
                </span>
            </div>
        );
    }

    return (
        <ol className="pipeline">
            {STEPS.map((step) => {
                const status = statusFor(step.key, stage);
                return (
                    <li key={step.key} className={`pipeline__step pipeline__step--${status}`}>
                        <span className="pipeline__stamp" aria-hidden="true">
                            {status === "done" ? "✓" : status === "active" ? "" : ""}
                        </span>
                        <div className="pipeline__text">
                            <span className="pipeline__label">{step.label}</span>
                            <span className="pipeline__detail">{step.detail}</span>
                            {step.key === "submitted" && sourceTxHash && (
                                <a
                                    className="pipeline__link"
                                    href={`https://sepolia.etherscan.io/tx/${sourceTxHash}`}
                                    target="_blank"
                                    rel="noreferrer"
                                >
                                    View on Sepolia ↗
                                </a>
                            )}
                            {step.key === "verified" && verifyTxHash && (
                                <a
                                    className="pipeline__link"
                                    href={`https://creditcoin-testnet.blockscout.com/tx/${verifyTxHash}`}
                                    target="_blank"
                                    rel="noreferrer"
                                >
                                    View on Creditcoin ↗
                                </a>
                            )}
                        </div>
                    </li>
                );
            })}
        </ol>
    );
}