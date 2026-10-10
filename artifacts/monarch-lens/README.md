# Monarch Lens

Monarch Lens is an independent community-built developer observability and smart-contract benchmarking tool for Monad. It reads public Monad Testnet RPC data in the browser and uses an injected wallet for user-approved testnet transactions. It is not an official Monad product.

## Network configuration

Verified against the [Monad Testnet docs](https://docs.monad.xyz/developer-essentials/testnet):

- Network: Monad Testnet
- Chain ID: `10143`
- RPC: `https://testnet-rpc.monad.xyz`
- Explorers: [MonadVision](https://testnet.monadvision.com) · [Monadscan](https://testnet.monadscan.com)
- Faucet: [faucet.monad.xyz](https://faucet.monad.xyz/)

The app checks the actual RPC chain ID before showing the connection as healthy. RPC-provided block and receipt fields are presented as measurements; unavailable fields are not estimated.

## Smart contract

`contracts/src/ReportRegistry.sol` stores a SHA-256 report digest, its submitter, and its registration timestamp. The registry rejects zero hashes and duplicate registrations. A hash proves only that report content matches a commitment; it does not independently establish that report claims or inputs are truthful.

The Contract Lab includes the source-compiled registry creation bytecode for an explicit user-signed wallet deployment. If the Solidity source or compiler settings change, rebuild the contract and refresh `src/lib/report-registry.ts` before deploying from the UI. Contract calls are guarded to Monad Testnet (chain ID `10143`); the generic raw-call form remains ABI-agnostic.

The report flow creates deterministic JSON and SHA-256, exports the report, compares a supplied report to an expected hash, registers the digest through the typed registry ABI, and reads/decodes registry records. The benchmark runner offers up to three manually confirmed registry writes per run; each gets a distinct hash. Other contract calls are available as a manual scenario. All measurements come from RPC receipts/blocks and browser-local history.

### Test

Install [Foundry 1.8 or later](https://docs.monad.xyz/tooling-and-infra/toolkits/foundry) for Monad-aware execution, then run:

```sh
cd artifacts/monarch-lens
forge test --network monad -vv
```

### Testnet deployment from a local terminal

For terminal deployment, use a dedicated testnet-only deployer with official faucet funds. Never use a mainnet key. Keep the key in a local environment variable or secret manager; never put it in source control or paste it into chat.

```sh
cd artifacts/monarch-lens
export MONAD_TESTNET_PRIVATE_KEY=<your-testnet-only-key>
forge script contracts/script/DeployReportRegistry.s.sol:DeployReportRegistry \
  --rpc-url monad_testnet --broadcast
```

The deployment script aborts unless the connected chain ID is `10143`. Verify the resulting address and transaction in MonadVision or Monadscan before adding them to the app. The browser UI also supports deploying through a connected wallet so no private key needs to enter the app. A deployment has not been made by this source setup.

## Local app

From the workspace root:

```sh
pnpm install
pnpm --filter @workspace/monarch-lens run dev
pnpm --filter @workspace/monarch-lens run typecheck
pnpm --filter @workspace/monarch-lens run build
```

The app accesses the official public RPC directly from the browser; no server, database, or paid RPC service is required.

## Cost and deployment status

Only use testnet tokens from the official faucet. Testnet tokens have no real-world value. No contract deployment, GitHub push, or public hosting deployment is reported here until independently verified. Deployments can be served using any static host (e.g. GitHub Pages, Vercel, Cloudflare Pages, Netlify) or locally with zero out-of-pocket costs to maintain an IDR 0 spend.
