export const CREDITCOIN_TESTNET = {
    chainIdHex: "0x18E2F", // 102031
    chainIdDecimal: 102031,
    chainName: "Creditcoin Testnet",
    rpcUrl: "https://rpc.cc3-testnet.creditcoin.network",
    blockExplorerUrl: "https://creditcoin-testnet.blockscout.com",
    nativeCurrency: { name: "Creditcoin", symbol: "CTC", decimals: 18 },
};

export const SEPOLIA = {
    chainIdHex: "0xAA36A7",
    chainIdDecimal: 11155111,
    chainName: "Sepolia",
    rpcUrl: "https://rpc.sepolia.org",
    blockExplorerUrl: "https://sepolia.etherscan.io",
    nativeCurrency: { name: "Sepolia Ether", symbol: "ETH", decimals: 18 },
};

export const CONTRACTS = {
    creditPassportASC: "0x53643A47055c11C51B3094603D9a9ABa1D227f97",
    creditScoreRegistry: "0x2BEebC3341C31084D2bCacbddF7dA999A1D8D237",
    mockLendingPool: "0xa7F769Fa8C51e712e77A49641351080066D25ca0",
    sourceRepaymentEmitter: "0x53643A47055c11C51B3094603D9a9ABa1D227f97",
};

export const CREDIT_SCORE_REGISTRY_ABI = [
    "function getCreditProfile(address borrower) external view returns (tuple(uint256 repaymentCount, uint256 totalRepaid, uint256 score, uint256 collateralRatioBps, uint256 lastUpdatedBlock))",
    "event RepaymentRecorded(address indexed borrower, uint256 amount, uint256 newScore)",
    "event CollateralRatioUpdated(address indexed borrower, uint256 oldRatioBps, uint256 newRatioBps)",
];

export const MOCK_LENDING_POOL_ABI = [
    "function getEffectiveRatio(address borrower) external view returns (uint256)",
];

export const SOURCE_REPAYMENT_EMITTER_ABI = [
    "function recordRepayment(address borrower, uint256 amount) external",
    "function repaymentCount(address) external view returns (uint256)",
    "event RepaymentMade(address indexed borrower, uint256 amount, uint256 timestamp)",
];