// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {
    ReentrancyGuard
} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

import {IUSCProofVerifier} from "./lib/IUSCProofVerifier.sol";
import {BlockProverTypes} from "./lib/BlockProverTypes.sol";
import {EvmV1Decoder} from "./lib/EvmV1Decoder.sol";
import {MockLendingPool} from "./MockLendingPool.sol";

/// @title CreditScoreRegistry
/// @notice Verifies proofs of source-chain repayment events, maintains a
/// per-borrower credit profile, recomputes a composite score on each verified
/// event and autonomously triggers `MockLendingPool` collateral-ratio updates once
/// a score crosses a tier threshold.
contract CreditScoreRegistry is AccessControl, Pausable, ReentrancyGuard {
    bytes32 public constant OPERATOR_ROLE = keccak256("OPERATOR_ROLE");

    /// @dev keccak256("RepaymentMade(address,uint256,uint256)") is computed and verified
    /// via ethers.js `id(...)`, not hand-derived.
    bytes32 public constant REPAYMENT_MADE_EVENT =
        0x440deebbe22ad80b832c322e7ec09f0cb5abfb12d52a21bedeb05c467fb7e91b;

    struct CreditProfile {
        uint256 repaymentCount;
        uint256 totalRepaid;
        uint256 score;
        uint256 collateralRatioBps;
        uint256 lastUpdatedBlock;
    }

    IUSCProofVerifier public proofVerifier;
    MockLendingPool public lendingPool;

    /// @notice Creditcoin prover chain key for the single linked source chain.
    bytes32 public sourceChainKey;
    /// @notice EVM chainId of the linked source chain.
    uint256 public sourceEvmChainId;
    /// @notice Trusted `SourceRepaymentEmitter` address on the linked source chain.
    address public authorizedSourceContract;

    mapping(address => CreditProfile) public creditProfiles;
    mapping(bytes32 => bool) public processedQueries;

    uint256 public constant BASE_SCORE = 650;
    uint256 public constant MAX_SCORE = 850;

    event SourceChainConfigured(
        bytes32 indexed chainKey,
        uint256 sourceEvmChainId,
        address indexed sourceContract
    );
    event LendingPoolSet(address indexed previous, address indexed next);
    event QueryProcessed(
        bytes32 indexed queryId,
        bytes32 chainKey,
        uint64 blockHeight,
        uint64 txIndex
    );
    event RepaymentRecorded(
        address indexed borrower,
        uint256 amount,
        uint256 newScore
    );
    event CollateralRatioUpdated(
        address indexed borrower,
        uint256 oldRatioBps,
        uint256 newRatioBps
    );

    error ZeroAddress();
    error SourceChainNotConfigured();
    error InvalidSourceChainKey(bytes32 provided, bytes32 expected);
    error LendingPoolNotConfigured();
    error QueryAlreadyProcessed(bytes32 queryId);
    error UnsupportedTxType(uint8 txType);
    error TransactionReverted();
    error NoMatchingLogs(bytes32 eventSignature);
    error UnauthorizedSourceContract(address emitter, address expected);
    error InvalidLogTopicCount(uint256 actual, uint256 expected);
    error InvalidLogDataLength(uint256 actual, uint256 expected);

    constructor(address proofVerifier_, address admin_) {
        if (proofVerifier_ == address(0) || admin_ == address(0))
            revert ZeroAddress();
        proofVerifier = IUSCProofVerifier(proofVerifier_);
        _grantRole(DEFAULT_ADMIN_ROLE, admin_);
        _grantRole(OPERATOR_ROLE, admin_);
    }

    function setLendingPool(
        address newPool
    ) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (newPool == address(0)) revert ZeroAddress();
        address prev = address(lendingPool);
        lendingPool = MockLendingPool(newPool);
        emit LendingPoolSet(prev, newPool);
    }

    /// @notice Grant the off-chain worker's address permission to submit proofs.
    function grantOperator(
        address worker
    ) external onlyRole(DEFAULT_ADMIN_ROLE) {
        _grantRole(OPERATOR_ROLE, worker);
    }

    /// @notice Configure the single source chain this registry mirrors (1:1).
    function configureSourceChain(
        bytes32 chainKey_,
        uint256 sourceEvmChainId_,
        address sourceContract_
    ) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (
            chainKey_ == bytes32(0) ||
            sourceEvmChainId_ == 0 ||
            sourceContract_ == address(0)
        ) {
            revert ZeroAddress();
        }
        sourceChainKey = chainKey_;
        sourceEvmChainId = sourceEvmChainId_;
        authorizedSourceContract = sourceContract_;
        emit SourceChainConfigured(
            chainKey_,
            sourceEvmChainId_,
            sourceContract_
        );
    }

    function pause() external onlyRole(DEFAULT_ADMIN_ROLE) {
        _pause();
    }

    function unpause() external onlyRole(DEFAULT_ADMIN_ROLE) {
        _unpause();
    }

    /// @notice Verify a proof of a `RepaymentMade` event on the source chain and if
    /// valid and not already processed, update the borrower's credit profile and
    /// (if their tier changed) the connected `MockLendingPool`'s collateral ratio.
    function recordVerifiedRepayment(
        bytes32 chainKey,
        uint64 blockHeight,
        BlockProverTypes.InclusionProof calldata inclusionProof,
        BlockProverTypes.ContinuityProof calldata continuityProof
    )
        external
        onlyRole(OPERATOR_ROLE)
        whenNotPaused
        nonReentrant
        returns (bool)
    {
        _requireConfiguredSourceChain(chainKey);
        if (address(lendingPool) == address(0))
            revert LendingPoolNotConfigured();

        bytes32 queryId = _computeQueryId(
            chainKey,
            blockHeight,
            inclusionProof
        );
        if (processedQueries[queryId]) revert QueryAlreadyProcessed(queryId);

        bytes memory encodedTransaction = proofVerifier.verifyProofs(
            chainKey,
            blockHeight,
            inclusionProof,
            continuityProof
        );
        processedQueries[queryId] = true;

        uint64 txIndex = proofVerifier.calculateTxIndex(inclusionProof);
        emit QueryProcessed(queryId, chainKey, blockHeight, txIndex);

        _handleRepaymentMade(encodedTransaction);
        return true;
    }

    function getCreditProfile(
        address borrower
    ) external view returns (CreditProfile memory) {
        return creditProfiles[borrower];
    }

    function _handleRepaymentMade(bytes memory encodedTransaction) internal {
        uint8 txType = EvmV1Decoder.getTransactionType(encodedTransaction);
        if (!EvmV1Decoder.isValidTransactionType(txType))
            revert UnsupportedTxType(txType);

        EvmV1Decoder.ReceiptFields memory receipt = EvmV1Decoder
            .decodeReceiptFields(encodedTransaction);
        if (receipt.receiptStatus != 1) revert TransactionReverted();

        EvmV1Decoder.LogEntry[] memory logs = EvmV1Decoder
            .getLogsByEventSignature(receipt, REPAYMENT_MADE_EVENT);
        if (logs.length == 0) revert NoMatchingLogs(REPAYMENT_MADE_EVENT);

        EvmV1Decoder.LogEntry memory log = logs[0];
        _validateSourceContract(log.address_);

        // event RepaymentMade(address indexed borrower, uint256 amount, uint256 timestamp);
        if (log.topics.length != 2)
            revert InvalidLogTopicCount(log.topics.length, 2);
        if (log.data.length != 64)
            revert InvalidLogDataLength(log.data.length, 64);

        address borrower = address(uint160(uint256(log.topics[1])));
        (uint256 amount, ) = abi.decode(log.data, (uint256, uint256));

        _applyRepayment(borrower, amount);
    }

    function _applyRepayment(address borrower, uint256 amount) internal {
        CreditProfile storage profile = creditProfiles[borrower];
        profile.repaymentCount += 1;
        profile.totalRepaid += amount;
        profile.lastUpdatedBlock = block.number;

        uint256 newScore = _computeScore(
            profile.repaymentCount,
            profile.totalRepaid
        );
        profile.score = newScore;

        emit RepaymentRecorded(borrower, amount, newScore);

        uint256 newRatioBps = _collateralRatioForScore(newScore);
        if (profile.collateralRatioBps != newRatioBps) {
            uint256 oldRatioBps = profile.collateralRatioBps;
            profile.collateralRatioBps = newRatioBps;
            lendingPool.setCollateralRatio(borrower, newRatioBps);
            emit CollateralRatioUpdated(borrower, oldRatioBps, newRatioBps);
        }
    }

    function _computeScore(
        uint256 repaymentCount,
        uint256 totalRepaid
    ) internal pure returns (uint256) {
        uint256 frequencyPoints = repaymentCount * 10;
        if (frequencyPoints > 100) frequencyPoints = 100;

        uint256 volumePoints = (totalRepaid / 1 ether) * 2;
        if (volumePoints > 100) volumePoints = 100;

        uint256 score = BASE_SCORE + frequencyPoints + volumePoints;
        if (score > MAX_SCORE) score = MAX_SCORE;
        return score;
    }

    function _collateralRatioForScore(
        uint256 score
    ) internal pure returns (uint256 bps) {
        if (score >= 800) return 11000;
        if (score >= 750) return 11500;
        if (score >= 700) return 12000;
        if (score >= 650) return 13000;
        return 15000;
    }

    function _requireConfiguredSourceChain(bytes32 chainKey) internal view {
        bytes32 configured = sourceChainKey;
        if (configured == bytes32(0)) revert SourceChainNotConfigured();
        if (chainKey != configured)
            revert InvalidSourceChainKey(chainKey, configured);
    }

    function _validateSourceContract(address emitter) internal view {
        address expected = authorizedSourceContract;
        if (expected == address(0)) revert SourceChainNotConfigured();
        if (emitter != expected)
            revert UnauthorizedSourceContract(emitter, expected);
    }

    function _computeQueryId(
        bytes32 chainKey,
        uint64 blockHeight,
        BlockProverTypes.InclusionProof calldata inclusionProof
    ) internal view returns (bytes32 queryId) {
        uint64 txIndex = proofVerifier.calculateTxIndex(inclusionProof);
        return keccak256(abi.encodePacked(chainKey, blockHeight, txIndex));
    }
}
