# Attestcoin Credit Passport

A portable, cross-chain credit score that follows the *user*, not the chain, computed by an AI-driven scoring engine from cryptographically attested onchain behavior and used to autonomously adjust that user's real lending terms as new attested data arrives. Not a static score on a dashboard but a live, self-triggering pipeline.

## Status: working end-to-end on testnet ✅

This isn't a mockup. A real repayment signal emitted on Ethereum Sepolia has been cryptographically proven onto Creditcoin CC3 Testnet via the Attestcoin Protocol, with zero manual intervention, autonomously updating a live lending contract's collateral
terms. Confirmed independently on Creditcoin's block explorer:

- **Source event (Sepolia):** [`0xc9cb45d3...50b0cf`](https://sepolia.etherscan.io/tx/0xc9cb45d33bea08de93078a7779e087e842d4186ea21a0a23bf98b15e4150b0cf)
- **Verified + recorded (Creditcoin CC3 Testnet):** [`0x286fb9de...3924d1a5`](https://creditcoin-testnet.blockscout.com/tx/0x286fb9deee81e265a4d0dded078b211fcd26d749b5a637be51b275483924d1a5) - `Success`, confirmed in ≤15 seconds
- **Result:** credit score `662`, collateral requirement autonomously dropped from the
  150% default to **130%**

See [`docs/TECHNICAL.md`](docs/TECHNICAL.md) for the full worked example and Attestcoin
Protocol integration details.

## How it works

1. A user's repayment activity on a source chain (Ethereum Sepolia for this MVP) emits
   an event.
2. An off-chain worker watches for it, waits for Creditcoin's attestor network to
   attest the block, and fetches a cryptographic proof via the Attestcoin Protocol SDK.
3. The proof is submitted to `CreditPassportASC` on Creditcoin, which verifies it
   **synchronously, onchain, in a single block** via the native Block Prover Precompile (`0x0FD2`) - no oracle, no trusted third party.
4. `CreditScoreRegistry` decodes the verified event, recomputes the user's composite
   score, and if their tier changed it autonomously calls `MockLendingPool` to adjust their required collateral ratio.
5. A live dashboard shows the whole pipeline happening in real time.

## Architecture

```
contracts/     Hardhat 3 project - deployed to Creditcoin CC3 Testnet + Sepolia
  ├─ CreditPassportASC.sol       verification-only ASC, calls the Block Prover Precompile
  ├─ CreditScoreRegistry.sol     replay protection, scoring, triggers the lending pool
  ├─ MockLendingPool.sol         demo pool whose collateral terms the registry updates
  ├─ source/SourceRepaymentEmitter.sol   deployed on Sepolia, emits the watched event
  └─ lib/                        vendored verification infra (Creditcoin's own reference
                                  contracts - BlockProverTypes, EvmV1Decoder, etc.)

worker/        Off-chain worker (TypeScript, @gluwa/usc-sdk)
  └─ watches Sepolia → waits for attestation → fetches proof → submits to the registry

client/        Vite + React dashboard
  └─ wallet connect, live score/ratio display, one-click repayment trigger,
     real-time pipeline status, verified-event ledger

docs/          Technical documentation (required hackathon submission field)
```

## Deployed contracts

| Contract | Network | Address |
|---|---|---|
| `CreditPassportASC` | Creditcoin CC3 Testnet | `0x53643A47055c11C51B3094603D9a9ABa1D227f97` |
| `CreditScoreRegistry` | Creditcoin CC3 Testnet | `0x2BEebC3341C31084D2bCacbddF7dA999A1D8D237` |
| `MockLendingPool` | Creditcoin CC3 Testnet | `0xa7F769Fa8C51e712e77A49641351080066D25ca0` |
| `SourceRepaymentEmitter` | Ethereum Sepolia | `0x53643A47055c11C51B3094603D9a9ABa1D227f97` |

Creditcoin CC3 Testnet: chain ID `102031` · RPC `https://rpc.cc3-testnet.creditcoin.network` · [explorer](https://creditcoin-testnet.blockscout.com/)

## Running it yourself

Three components run simultaneously: the worker (background prover), the client
(dashboard), and your wallet (MetaMask or similar, funded on both testnets).

### 1. Contracts (already deployed - only needed if you redeploy)

```bash
cd contracts
npm install
npx hardhat keystore set PRIVATE_KEY
npx hardhat keystore set CREDITCOIN_RPC_URL   # https://rpc.cc3-testnet.creditcoin.network
npx hardhat keystore set SEPOLIA_RPC_URL      # your own Sepolia RPC endpoint
npx hardhat compile
npx hardhat ignition deploy ignition/modules/CreditPassportModule.ts --network creditcoinTestnet
npx hardhat ignition deploy ignition/modules/SourceRepaymentEmitterModule.ts --network sepolia
npx hardhat run scripts/configure.ts --network creditcoinTestnet
```

### 2. Worker (terminal 1 - must stay running)

```bash
cd worker
cp .env.example .env   # fill in RPC URLs, contract addresses, worker private key
npm install
npm run dev
```

### 3. Client (terminal 2)

```bash
cd client
npm install
npm run dev
```

Open the printed local URL, connect a wallet and use **Trigger repayment on Sepolia** and the dashboard will show the full verification pipeline live (budget ~15–30 minutes for real attestor consensus + proof generation).

## Key references

- Attestcoin Protocol docs: https://docs.creditcoin.org/creditcoin-usc
- Attestcoin SDK: https://docs.creditcoin.org/attestcoin-protocol/dapp-builder-infrastructure/attestcoin-sdk-usc-sdk
- Reference contracts this project's verification layer is adapted from: https://github.com/gluwa/CCNext-smart-contracts (MIT)

## License

MIT. Portions of `contracts/contracts/lib/` are vendored,unmodified, from Creditcoin's own official reference implementation (see file headers for attribution).