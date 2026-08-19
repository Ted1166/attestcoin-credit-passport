// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";

/// @title MockLendingPool
/// @notice Minimal demo lending pool. Its only job is to hold a per-borrower
/// collateral ratio and let `CreditScoreRegistry` update it autonomously when
/// a verified cross-chain repayment event changes that borrower's credit score.
contract MockLendingPool is AccessControl {
    bytes32 public constant REGISTRY_ROLE = keccak256("REGISTRY_ROLE");

    uint256 public constant DEFAULT_COLLATERAL_RATIO_BPS = 15000;

    mapping(address => uint256) public collateralRatioBps;

    event CollateralRatioSet(
        address indexed borrower,
        uint256 oldRatioBps,
        uint256 newRatioBps
    );

    error ZeroAddress();
    error RatioTooLow(uint256 provided);

    constructor(address admin_, address registry_) {
        if (admin_ == address(0) || registry_ == address(0))
            revert ZeroAddress();
        _grantRole(DEFAULT_ADMIN_ROLE, admin_);
        _grantRole(REGISTRY_ROLE, registry_);
    }

    /// @notice Called by `CreditScoreRegistry` after a verified score update crosses a tier.
    function setCollateralRatio(
        address borrower,
        uint256 newRatioBps
    ) external onlyRole(REGISTRY_ROLE) {
        if (borrower == address(0)) revert ZeroAddress();
        if (newRatioBps < 10000) revert RatioTooLow(newRatioBps);

        uint256 old = collateralRatioBps[borrower] == 0
            ? DEFAULT_COLLATERAL_RATIO_BPS
            : collateralRatioBps[borrower];
        collateralRatioBps[borrower] = newRatioBps;
        emit CollateralRatioSet(borrower, old, newRatioBps);
    }

    /// @notice What a borrower's collateral ratio currently is.
    function getEffectiveRatio(
        address borrower
    ) external view returns (uint256) {
        uint256 ratio = collateralRatioBps[borrower];
        return ratio == 0 ? DEFAULT_COLLATERAL_RATIO_BPS : ratio;
    }

    /// @notice Allow admin to rotate which registry contract is trusted.
    function setRegistry(
        address newRegistry,
        address oldRegistry
    ) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (newRegistry == address(0)) revert ZeroAddress();
        if (oldRegistry != address(0)) _revokeRole(REGISTRY_ROLE, oldRegistry);
        _grantRole(REGISTRY_ROLE, newRegistry);
    }
}
