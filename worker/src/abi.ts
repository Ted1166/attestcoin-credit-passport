// Minimal ABI fragments — only what the worker needs to call/listen to.
// Struct shapes here must match BlockProverTypes.sol exactly (positional, not named).

export const SOURCE_REPAYMENT_EMITTER_ABI = [
    "event RepaymentMade(address indexed borrower, uint256 amount, uint256 timestamp)",
];

export const CREDIT_SCORE_REGISTRY_ABI = [
    // BlockProverTypes.InclusionProof = (uint8 kind, bytes32 root, bytes data)
    // BlockProverTypes.ContinuityProof = (bytes32 lowerEndpointDigest, bytes32[] roots)
    "function recordVerifiedRepayment(bytes32 chainKey, uint64 blockHeight, tuple(uint8 kind, bytes32 root, bytes data) inclusionProof, tuple(bytes32 lowerEndpointDigest, bytes32[] roots) continuityProof) external returns (bool)",
    "function getCreditProfile(address borrower) external view returns (tuple(uint256 repaymentCount, uint256 totalRepaid, uint256 score, uint256 collateralRatioBps, uint256 lastUpdatedBlock))",
    "event RepaymentRecorded(address indexed borrower, uint256 amount, uint256 newScore)",
    "event CollateralRatioUpdated(address indexed borrower, uint256 oldRatioBps, uint256 newRatioBps)",
];