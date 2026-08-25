import "./TopNav.css";

interface Props {
    address: string | null;
    connecting: boolean;
    onConnect: () => void;
}

function shortAddress(addr: string) {
    return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

export function TopNav({ address, connecting, onConnect }: Props) {
    return (
        <header className="top-nav">
            <div className="top-nav__brand">
                <span className="top-nav__mark" aria-hidden="true">
                    ◆
                </span>
                <span className="top-nav__name">Attestcoin Credit Passport</span>
            </div>

            {address ? (
                <div className="top-nav__connected">
                    <span className="top-nav__dot" aria-hidden="true" />
                    {shortAddress(address)}
                </div>
            ) : (
                <button className="top-nav__connect" onClick={onConnect} disabled={connecting}>
                    {connecting ? "Connecting…" : "Connect wallet"}
                </button>
            )}
        </header>
    );
}