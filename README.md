# Meme Coin Launchpad (BSC)

This project gives you a website where users can:

1. Connect wallet.
2. Fill token details.
3. Pay your launch fee in BNB.
4. Deploy their own meme token.

The launch fee is collected by the `MemeLaunchpad` contract and sent to your `feeWallet`.

## Project Structure

- `contracts/MemeToken.sol`: Minimal BEP-20 style token with constructor inputs and transfer tax.
- `contracts/MemeLaunchpad.sol`: Factory/launchpad contract that deploys tokens and collects fee.
- `scripts/deploy-launchpad.js`: Deploy script for BSC.
- `frontend/`: Static website (wallet connect + token launch form).

## 1) Install

```bash
npm install
```

## 2) Configure Environment

```bash
copy .env.example .env
```

Set:

- `PRIVATE_KEY`: Deployer wallet private key.
- `BSC_TESTNET_RPC_URL`: BSC testnet RPC.
- `BSC_MAINNET_RPC_URL`: BSC mainnet RPC.
- `FEE_WALLET`: Your wallet that receives launch fees.
- `TAX_WALLET`: Fixed tax wallet for all launched tokens (users cannot change this).
- `LAUNCH_FEE_BNB`: Fee users pay per token (example `0.01`).

## 3) Deploy Launchpad Contract

Testnet:

```bash
npm run deploy:testnet
```

Mainnet:

```bash
npm run deploy:mainnet
```

After deployment, copy the printed launchpad address.

## 4) Configure Frontend

Edit `frontend/config.js` (or replace it with `frontend/config.example.js`) and update:

- `chainId` / `chainName`
- `blockExplorerBaseUrl`
- `factoryAddress` (deployed launchpad address)

## 5) Run Frontend

You can serve static files with any server. Example:

```bash
npx serve frontend
```

Open the served URL, connect wallet, and launch tokens.

## Contract Flow

- User calls `launchToken(...)` on `MemeLaunchpad` and sends exact `launchFeeWei`.
- Launchpad deploys new `MemeToken`.
- New token supply is minted to the user wallet.
- Transfer tax for every launched token always goes to fixed `TAX_WALLET`.
- Fee is forwarded to your `feeWallet`.

## Important Notes

- This is a starter implementation, not a production-audited protocol.
- For public launch, add full audits, legal/compliance checks, abuse controls, and monitoring.
- Test thoroughly on BSC testnet before mainnet.
