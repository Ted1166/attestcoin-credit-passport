// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

/// @title SourceRepaymentEmitter
/// @notice Deployed on the source chain (Ethereum Sepolia for this MVP). A minimal,
/// owner-controlled contract that records a repayment signal and emits an event our
/// off-chain worker watches, proves via the Attestcoin Protocol, and relays to
/// `CreditScoreRegistry` on Creditcoin.
///
/// This intentionally does NOT move real funds — for the hackathon MVP we need a
/// controllable, repeatable signal to demo the "trigger event -> score updates ->
/// lending terms change live" flow, not a production repayment engine. Mirrors the
/// same demo-contract approach Creditcoin's own tutorials use (e.g. `TestERC20`,
/// `SourceLoanHelper`) rather than depending on real-world Sepolia DeFi activity.
contract SourceRepaymentEmitter is Ownable {
    /// @dev Event signature this hashes to is what `CreditScoreReadabilityManager`
    /// on Creditcoin checks for when decoding a proven transaction's logs.
    event RepaymentMade(
        address indexed borrower,
        uint256 amount,
        uint256 timestamp
    );

    mapping(address => uint256) public repaymentCount;
    mapping(address => uint256) public totalRepaid;

    constructor(address admin_) Ownable(admin_) {}

    /// @notice Record a repayment signal for `borrower`. Callable by anyone acting as
    /// the borrower themselves, or by the owner for demo/testing purposes.
    function recordRepayment(address borrower, uint256 amount) external {
        require(borrower != address(0), "zero address");
        require(amount > 0, "amount must be > 0");
        require(
            msg.sender == borrower || msg.sender == owner(),
            "not borrower or owner"
        );

        repaymentCount[borrower] += 1;
        totalRepaid[borrower] += amount;

        emit RepaymentMade(borrower, amount, block.timestamp);
    }
}
