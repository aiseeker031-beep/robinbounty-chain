# RobinBounty

A complete EVM-compatible developer-bounty marketplace built for **Robinhood Chain** with onchain ETH/ERC-20 escrow, a Next.js dashboard, public read APIs, wallet-signed writes, and Solidity tests.

> **Deployment status:** Source code only. No contract deployment address or live website is claimed in this package. The app displays an explicit deployment-required state until a verified contract address is set. Contracts have NOT undergone an independent audit. Use testnet first; do not entrust meaningful assets to unaudited code.

## Architecture

- **Network:** Robinhood Chain testnet ID `46630` by default, mainnet ID `4663` with explicit configuration.
- **Escrow:** `contracts/RobinBounty.sol`, Solidity 0.8.24, OpenZeppelin ERC-20 SafeERC20 + ReentrancyGuard.
- **Backend:** Next.js App Router `/api/health`, `/api/bounties`, `/api/bounties/:id`. The blockchain is the system of record; no insecure offchain balance database.
- **Frontend:** wallet connect, network switching, funding ETH/ERC-20 bounties, proof submission, awarding, cancellation, expiry refunds, pagination, filters and contract links.
- **Contracts:** Hardhat v2 local tests and scripts to deploy to actual Robinhood testnet/mainnet when a gas-funded deployment wallet is available.

## Set up and test locally

Requires Node.js 20+ (22 recommended). Install dependencies from a normal internet-connected development machine:

```bash
npm install
cp .env.example .env.local
npm run contracts:compile
npm run contracts:test
npm run dev
```

Open http://localhost:3000. Until deployment, the UI intentionally shows no invented bounties.

## Deploy to Robinhood Chain TESTNET (recommended)

1. Generate or use an **isolated testnet-only** wallet in a secure local wallet or signing environment. Never paste seed phrases or private keys into ChatGPT, GitHub, Vercel, frontend code, or browser-accessible variables.
2. Add Robinhood Chain Testnet to that wallet: Chain ID `46630`, ETH gas token, RPC `https://rpc.testnet.chain.robinhood.com`, explorer `https://explorer.testnet.chain.robinhood.com`.
3. Fund the isolated testnet wallet with free testnet ETH from the official Robinhood Chain faucet: https://faucet.testnet.chain.robinhood.com . Testnet tokens have no cash value.
4. Set `DEPLOYER_PRIVATE_KEY` **in your own private local terminal or secrets manager only**. Never save it to `.env.local` if that directory could be shared.
5. Execute:

```bash
npm run deploy:testnet
```

6. Verify the printed transaction hash and contract address on the Robinhood Chain testnet explorer. The script writes `deployment.json` locally (ignored by Git).
7. Put the resulting address in `.env.local` as `NEXT_PUBLIC_CONTRACT_ADDRESS`, leave `NEXT_PUBLIC_NETWORK=testnet`, and restart the frontend. This is a **public contract address**, not a secret.
8. Start creating and completing real testnet bounties with wallet transactions.

## Deploy frontend / API to Vercel

Import this project to Vercel (Next.js framework) and set public environment variables:

```ini
NEXT_PUBLIC_NETWORK=testnet
NEXT_PUBLIC_CONTRACT_ADDRESS=0x<the_verified_contract_address>
```

Optionally configure `RH_TESTNET_RPC` for the server APIs with a rate-limited private provider endpoint. No wallet private key is needed or should be stored on Vercel: users sign their own transactions in their wallet.

## Switching to mainnet

1. Complete testing, security review, and ideally an independent audit.
2. Fund the isolated deployment wallet with mainnet ETH on Robinhood Chain.
3. Set `ALLOW_MAINNET_DEPLOY=yes` in the local terminal and execute `npm run deploy:mainnet`.
4. Point Vercel to `NEXT_PUBLIC_NETWORK=mainnet` and the **mainnet** contract address.
5. Validate the deployment on https://robinhoodchain.blockscout.com .

Mainnet contract deployment and bounty escrow transactions consume real ETH. **Never use a testnet contract address with a mainnet configuration.**

## Contract trust model

- A funder creates one funded bounty with a title, public details, prize token/address, amount, and 1-hour-to-90-day deadline.
- Any wallet except the creator can submit **at most one** publicly visible proof URL before the deadline.
- **Only the creator** selects a winner. When an award happens, the smart contract transfers the full bounty to the selected developer. There is no platform fee.
- If no work was submitted, the creator can cancel and retrieve all escrowed funds.
- If the creator does not pick a winner within seven days after the deadline, **anybody can call** `refundExpired`, which sends escrow **back to the creator**, even when submissions were made.
- Submitting work does **not** guarantee an award; it is possible to submit good work and receive nothing. Prospective builders should evaluate the creator's credibility.
- Unsupported fee-on-transfer tokens are rejected at funding time. Tokens with rebasing, malicious callbacks, unusual transfer semantics, or blacklist rules may still misbehave. Prefer established assets.
- Descriptions, wallet addresses, and proof links are publicly recorded onchain. Do not include personal information or confidential files.

## Backend endpoints

| Endpoint | Function |
|---|---|
| `GET /api/health` | Checks configured contract bytecode and live chain tip. Returns 503 until deployed / when RPC is unavailable. |
| `GET /api/bounties?offset=0` | Returns the newest 24 real onchain bounties, with cursor offsets. |
| `GET /api/bounties/0` | Fetches one onchain bounty with every proof submission. |

The API routes do not custody funds or impersonate wallets. All state-changing operations are signed client-side and executed by the contract.

## Limitations and production-readiness checklist

- This source was syntax-checked, but full `npm install`, contract compilation, contract unit tests, actual testnet transactions, Vercel build, and penetration testing **have not been completed in the original build environment**, which had no npm registry access. Re-run all commands above and inspect failures before accepting deposits.
- The official public RPC is rate-limited. Configure a reliable provider for production; rate-limit / cache read endpoints appropriately.
- The UI reads the latest 24 bounties per page. Index events and implement search infrastructure for high-volume deployments.
- Ethereum wallet connection requires an EIP-1193 injected wallet (MetaMask, Rabby, etc.). Mobile web browsers may need the wallet's in-app browser.
- Network switching in the frontend prevents accidental cross-chain writes, but always independently verify chain ID and contract address.
- There is no social login, third-party arbitration, KYC, or guaranteed fairness in a creator-judged bounty. That is deliberate, not implied.
- Review allowed tokens and local legal requirements before launching a real-money marketplace.

## Official sources

- https://docs.robinhood.com/chain/
- https://docs.robinhood.com/chain/connecting/
- https://docs.robinhood.com/chain/deploy-smart-contracts/
- https://docs.robinhood.com/chain/gas-and-fees/
- https://docs.robinhood.com/chain/terms-of-service/

Independent project; **not affiliated with Robinhood**.