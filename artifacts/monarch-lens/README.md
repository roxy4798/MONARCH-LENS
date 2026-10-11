# Monarch Lens Application

Monarch Lens is an independent community-built developer observability and smart-contract benchmarking tool for Monad Testnet. It reads public Monad Testnet RPC data in the browser and connects with injected Web3 wallets for user-approved testnet operations. It is not an official Monad product.

- **Production URL**: [https://roxy4798.github.io/MONARCH-LENS/](https://roxy4798.github.io/MONARCH-LENS/)
- **Repository**: [https://github.com/roxy4798/MONARCH-LENS](https://github.com/roxy4798/MONARCH-LENS)
- **Deployment Status**: Web application is published and live via GitHub Pages (`gh-pages` branch). Smart contract (`ReportRegistry.sol`) is compiled and embedded in the frontend for on-demand user deployment.

---

## Network Configuration

Verified against the official [Monad Testnet Documentation](https://docs.monad.xyz/developer-essentials/testnet):

- **Network**: Monad Testnet
- **Chain ID**: `10143` (`0x279f`)
- **RPC Endpoint**: `https://testnet-rpc.monad.xyz`
- **Block Explorers**: [MonadVision](https://testnet.monadvision.com) · [Monadscan](https://testnet.monadscan.com)
- **Official Faucet**: [faucet.monad.xyz](https://faucet.monad.xyz/)

The application verifies the connected wallet's chain ID and RPC endpoint health before showing the network as healthy. All block, receipt, and gas parameters are presented directly as received from RPC queries without fabrication.

---

## Smart Contract: ReportRegistry

`contracts/src/ReportRegistry.sol` stores a SHA-256 report digest, its submitter address, and registration timestamp on Monad Testnet. The registry enforces one-time registration per report digest (`AlreadyRegistered` revert) and disallows zero hashes (`InvalidReportHash` revert). Committing a hash proves content integrity relative to the commitment; it does not independently verify external claims or input accuracy.

### Contract Deployment Status

1. **Source & Bytecode**: The Solidity contract is compiled using `solc 0.8.28` (optimizer enabled, 200 runs, Cancun EVM). Its creation bytecode is embedded in [`src/lib/report-registry.ts`](file:///c:/MONARCH%20LENS/artifacts/monarch-lens/src/lib/report-registry.ts) (`REPORT_REGISTRY_CREATION_BYTECODE`).
2. **Onchain Status**: The contract is **not deployed as a global singleton**. Each user or developer deploys their own instance to Monad Testnet. The deployed contract address is stored in browser `localStorage` (`monarch-lens-registry-address`).
3. **Deployment Methods**:
   - **Via Contract Lab (Browser UI)**: Navigate to `#/contract-lab`, connect your wallet, and click **Review & deploy registry**.
   - **Via Foundry Terminal Script**:
     ```sh
     cd artifacts/monarch-lens
     export MONAD_TESTNET_PRIVATE_KEY=<your-testnet-only-private-key>
     forge script contracts/script/DeployReportRegistry.s.sol:DeployReportRegistry \
       --rpc-url monad_testnet --broadcast
     ```

### Testing Contracts Locally

Unit tests in `contracts/test/ReportRegistry.t.sol` run offline with Foundry:

```sh
cd artifacts/monarch-lens
forge test -vv
```

*Note: The configured RPC alias in `foundry.toml` is `monad_testnet`. Offline unit tests run directly without specifying `--network` or connecting to an active RPC.*

---

## Local Development & Build

From the workspace root:

```sh
# Install dependencies
corepack pnpm install --frozen-lockfile

# Run development server (localhost:5173)
corepack pnpm --filter @workspace/monarch-lens run dev

# Run TypeScript typechecks
corepack pnpm --filter @workspace/monarch-lens run typecheck

# Run unit tests (ABI helpers, fee math, canonical JSON hashing)
corepack pnpm --filter @workspace/monarch-lens run test

# Build production bundle (configured for /MONARCH-LENS/ base path)
corepack pnpm --filter @workspace/monarch-lens run build

# Preview production build locally
corepack pnpm --filter @workspace/monarch-lens run serve
```

The frontend reads the official public RPC directly from the browser; no database, backend server, or paid RPC subscription is required.

---

## Production Deployment & Base Path

The production build requires the `/MONARCH-LENS/` base path for GitHub Pages hosting:

- **Build Output**: `artifacts/monarch-lens/dist/public`
- **Routing**: Hash-based routing (`#/`, `#/contract-lab`, `#/transactions`, `#/benchmarks`, `#/reports`) for reliable direct navigation and static CDN compatibility.
- **Verification Manifest**: Every deployment produces `deploy-manifest.json` recording the source commit SHA, repository, build timestamp, and deployment branch.
