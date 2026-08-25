# Technical Documentation - Attestcoin Credit Passport

**BUIDL CTC 2026 Fall · AI Track**

This document explains how Attestcoin Credit Passport integrates the Attestcoin Protocol, why it's architected the way it is, and walks through a real, verified end-to-end run on testnet.

---

## 1. Problem

Onchain credit is siloed per chain. A wallet with years of spotless repayment history on one chain is a stranger on every other chain - forced back to 150%+ overcollateralization every time, regardless of actual trustworthiness. Cross-chain reputation portability is a real, unsolved gap.

## 2. What this project does

An off-chain worker watches a source chain for repayment activity, waits for that activity to be cryptographically attested by Creditcoin's decentralized attestor network, proves it, and submits the proof to a contract on Creditcoin. That contract verifies the proof **synchronously, onchain, in a single block**, using Creditcoin's native Block Prover Precompile so no oracle, no centralized relayer, no trusted third party attesting to the data's validity. Once verified, a credit score is recomputed and, if the borrower's tier changed, a connected lending pool's collateral requirement is updated automatically.

This directly matches the AI track's requirement: *"process cryptographically verified cross-chain data to autonomously inform decisions and trigger onchain transactions without centralized oracle operators."*

## 3. Attestcoin Protocol integration - how, specifically

### 3.1 The verification primitive

Creditcoin exposes a **native precompile at address `0x0FD2`** (the Block Prover Precompile) that verifies a Merkle inclusion proof plus a continuity proof for a transaction on a supported source chain, returning the raw encoded transaction bytes if valid. This happens as a normal contract call, the verification completes within the same Creditcoin block that submits it (~15 seconds), with no separate oracle round-trip.

Our `CreditPassportASC.sol` contract is a thin, verification-only wrapper around this precompile (via `INativeQueryVerifier`), implementing the `IUSCProofVerifier` interface:

```solidity
function verifyProofs(
    bytes32 chainKey,
    uint64 blockHeight,
    BlockProverTypes.InclusionProof calldata inclusionProof,
    BlockProverTypes.ContinuityProof calldata continuityProof
) external returns (bytes memory encodedTransaction);
```

It holds **no business state** - verification and business logic are deliberately separated, per Creditcoin's own documented recommendation for non-trivial dApps.

### 3.2 Business logic and replay protection

`CreditScoreRegistry.sol` calls `CreditPassportASC` to verify a proof, then:

1. Computes a `queryId = keccak256(chainKey, blockHeight, txIndex)` and checks it
   against a `processedQueries` mapping, so the same attested event can never be double-counted.
2. Decodes the verified transaction's receipt (via `EvmV1Decoder`) to find a `RepaymentMade` event log, matched by its event signature hash (`keccak256("RepaymentMade(address,uint256,uint256)")`,computed programmatically via `ethers.id(...)`, not hand-derived) and validated against a trusted emitter address (`SourceRepaymentEmitter` on the source chain).
3. Updates the borrower's credit profile and recomputes their score.
4. **Autonomously calls `MockLendingPool.setCollateralRatio(...)`** if the borrower's tier changed, the literal "trigger onchain transactions" requirement, not just a read.

This `verify → decode → validate emitter → update state → trigger downstream contract` pattern is adapted directly from Creditcoin's own official reference implementation (`gluwa/CCNext-smart-contracts`, `UseCases/SourceDestinationLoanRecording`), not reconstructed from documentation alone - the verification-layer contracts in
`contracts/contracts/lib/` are vendored, unmodified, from that repository (MIT
licensed; see file headers).

### 3.3 Off-chain worker

The worker (`worker/`) is what "watches" the source chain - Attestcoin verification is onchain and synchronous, but *getting* a valid proof still requires: waiting for Creditcoin's attestor network to attest the block containing the event, then fetching a
proof from the Proof Builder service. In practice this end-to-end latency is **~15–30 minutes**, even though the final onchain verification call itself completes in one block. The worker:

1. Resolves the source chain's Attestcoin `chainKey` live, via
   `PrecompileChainInfoProvider.getSupportedChains()` - not hardcoded, since chainKey is a Creditcoin-internal identifier distinct from the source chain's EVM `chainId`.
2. Listens for `RepaymentMade` on `SourceRepaymentEmitter` (Ethereum Sepolia for this MVP).
3. Polls `ProofBuilder.waitUntilHeightAttested(...)` until the relevant block is attested.
4. Fetches the proof via `ProofBuilder.getProof(txHash)`.
5. Submits it to `CreditScoreRegistry.recordVerifiedRepayment(...)`.

## 4. Architecture

```
Ethereum Sepolia                    Creditcoin CC3 Testnet
─────────────────                   ───────────────────────
SourceRepaymentEmitter                 CreditPassportASC  ──┐
  emits RepaymentMade                    (verify only,      │ calls precompile 0x0FD2
        │                                 no state)         │ (native, synchronous)
        │ watched by                          ▲             │
        ▼                                     │ verifyProofs│
  ┌──────────────┐                            │             │
  │ off-chain    │────────────────────────────┘             │
  │ worker       │  proof (via Attestcoin SDK / Proof        │
  │ (Node.js)    │  Builder, after attestation)               │
  └──────────────┘                                            │
        │                                                     │
        └──── recordVerifiedRepayment(...) ────────►  CreditScoreRegistry
                                                          (processedQueries,
                                                           scoring, dispatch)
                                                                │
                                                                │ autonomous call
                                                                ▼
                                                          MockLendingPool
                                                       (collateral ratio updated)
```

## 5. Scoring model

A deliberately simple, 2-factor weighted model as per this track's own MVP guidance, protocol integration depth is judged, not scoring sophistication:

```
score = 650 (base)
      + min(repaymentCount × 10, 100)      // frequency, capped
      + min(totalRepaid / 1e18 × 2, 100)   // volume, capped
      capped at 850
```

Score maps to a collateral tier:

| Score | Collateral ratio |
|---|---|
| ≥ 800 | 110% |
| 750–799 | 115% |
| 700–749 | 120% |
| 650–699 | 130% |
| < 650 / unscored | 150% (default) |

## 6. Real verified run (testnet)

This is not a simulated or mocked example since every value below is drawn from an actual transaction, independently confirmed on Creditcoin's block explorer.

1. **Source event** - `SourceRepaymentEmitter.recordRepayment(...)` called on Sepolia:
   [`0xc9cb45d33bea08de93078a7779e087e842d4186ea21a0a23bf98b15e4150b0cf`](https://sepolia.etherscan.io/tx/0xc9cb45d33bea08de93078a7779e087e842d4186ea21a0a23bf98b15e4150b0cf)
2. **Worker** picked up the `RepaymentMade` event, polled attestation status until the containing block was attested, and fetched a proof.
3. **Verification + autonomous update** - `CreditScoreRegistry.recordVerifiedRepayment(...)`
   on Creditcoin CC3 Testnet:
   [`0x286fb9deee81e265a4d0dded078b211fcd26d749b5a637be51b275483924d1a5`](https://creditcoin-testnet.blockscout.com/tx/0x286fb9deee81e265a4d0dded078b211fcd26d749b5a637be51b275483924d1a5) —
   status `Success`, confirmed in ≤15 seconds, calling `CreditScoreRegistry`
   (`0x2BEebC3341C31084D2bCacbddF7dA999A1D8D237`) from the worker's own wallet, with no
   human in the loop.
4. **Resulting state**: `repaymentCount = 1`, `score = 662`, and
   `MockLendingPool`'s collateral requirement for that borrower autonomously dropped
   from the 150% default to **130%** - read back directly from both contracts after
   the transaction, not asserted.

## 7. Deployed contracts

| Contract | Network | Address |
|---|---|---|
| `CreditPassportASC` | Creditcoin CC3 Testnet (chain ID `102031`) | `0x53643A47055c11C51B3094603D9a9ABa1D227f97` |
| `CreditScoreRegistry` | Creditcoin CC3 Testnet | `0x2BEebC3341C31084D2bCacbddF7dA999A1D8D237` |
| `MockLendingPool` | Creditcoin CC3 Testnet | `0xa7F769Fa8C51e712e77A49641351080066D25ca0` |
| `SourceRepaymentEmitter` | Ethereum Sepolia | `0x53643A47055c11C51B3094603D9a9ABa1D227f97` |

## 8. MVP scope and known simplifications

Being transparent about what's scoped down for the hackathon window, and why:

- **One source chain** (Ethereum Sepolia) - the protocol supports multiple; adding a
  second is a matter of another `SourceRepaymentEmitter`-equivalent deployment and
  registry configuration, not an architectural change.
- **`SourceRepaymentEmitter` is a controllable demo signal**, not a production lending
  contract — it lets the demo trigger a real, provable event on demand rather than
  depending on finding organic repayment activity on a testnet. The verification and
  scoring logic downstream is fully real; only the source-side event generator is
  simplified, matching the same pattern Creditcoin's own tutorials use (e.g.
  `TestERC20`).
- **2-factor scoring model** rather than a tuned ML model - intentional, per this track's own stated judging priorities.
- **Single connected lending pool** (`MockLendingPool`) rather than a production AMM -
  it genuinely enforces a per-borrower collateral ratio and is genuinely updated by an
  autonomous onchain call; it just doesn't process real deposits/borrows in this MVP.

## 9. Repository layout

See [`README.md`](../README.md) for setup instructions and full directory layout.