# Monarch Lens

> Independent Monad Testnet developer observability, transaction inspection, and smart contract benchmarking workspace for EVM developers.

- **Live Application**: [https://roxy4798.github.io/MONARCH-LENS/](https://roxy4798.github.io/MONARCH-LENS/)
- **GitHub Repository**: [https://github.com/roxy4798/MONARCH-LENS](https://github.com/roxy4798/MONARCH-LENS)
- **Target Network**: Monad Testnet (Chain ID: `10143` / `0x279f`)
- **Cost Target**: IDR 0 / $0 (zero paid backend, zero paid RPC subscriptions)

Monarch Lens is a community-built, zero-cost developer tool that reads public Monad Testnet RPC data directly in the browser and connects with standard EIP-1193 Web3 wallets (MetaMask, Rabby, Phantom) for user-approved testnet operations. It is not an official Monad product.

---

## Architecture & Branches

- **`main`**: Contains the complete source code, TypeScript packages, Solidity smart contracts, tests, and configuration.
- **`gh-pages`**: Contains the compiled static production bundle served publicly through GitHub Pages.
- **Browser-Only RPC Operations**: The frontend connects directly to official Monad Testnet RPC nodes (`https://testnet-rpc.monad.xyz`) via HTTPS JSON-RPC from the client browser. No backend server, centralized database, or paid third-party API key is required for primary operation.

---

## Key Features

- **RPC Observability & Health Monitoring**: Live block height, query latency, fee metrics, and network status validation for Monad Testnet.
- **Transaction Lookup**: Execution receipts, raw transaction inputs, gas used vs. gas limit distinction, and 18-decimal fee calculation directly from official RPC queries.
- **Contract Lab**: Inspect onchain contract bytecode, execute user-signed raw calls, or deploy the source-controlled `ReportRegistry` contract to Monad Testnet.
- **Contract Benchmarks**: Interactive scenario runner executing receipt-backed test calls with real gas usage measurement.
- **Report Registry & Integrity Verification**: Generate deterministic canonical JSON reports, compute SHA-256 digests, and commit commitments onchain to preserve audit provenance.

---

## Monad Testnet Configuration

Verified against the official [Monad Developer Documentation](https://docs.monad.xyz/developer-essentials/testnet):

| Parameter | Value |
| :--- | :--- |
| **Network Name** | Monad Testnet |
| **Chain ID** | `10143` (`0x279f`) |
| **RPC Endpoint** | `https://testnet-rpc.monad.xyz` |
| **Currency Symbol** | `MON` |
| **Block Explorers** | [MonadVision](https://testnet.monadvision.com) · [Monadscan](https://testnet.monadscan.com) |
| **Official Faucet** | [faucet.monad.xyz](https://faucet.monad.xyz/) |

> [!NOTE]
> All metrics reflect official Monad Testnet RPC receipts and browser-local state. Only testnet faucet funds are used; never use real funds or mainnet private keys.

---

## Smart Contract: ReportRegistry

The repository includes `contracts/src/ReportRegistry.sol`, an EVM smart contract that records a SHA-256 report digest, submitter address, and registration timestamp on Monad Testnet.

### Onchain Deployment Status
- **Source Code**: Source-controlled in [`contracts/src/ReportRegistry.sol`](file:///c:/MONARCH%20LENS/artifacts/monarch-lens/contracts/src/ReportRegistry.sol) (`pragma solidity 0.8.28;`).
- **Compiler Output**: Creation bytecode is pre-compiled (solc 0.8.28, optimizer 200 runs, Cancun EVM) and embedded directly into the frontend constant `REPORT_REGISTRY_CREATION_BYTECODE`.
- **Deployment Status**: The contract is **not deployed as a global shared singleton** by the repository maintainer. Instead, each developer or team deploys their own registry instance to Monad Testnet on demand. Deployed addresses are saved locally in the browser's `localStorage` (`monarch-lens-registry-address`).
- **Cryptographic Provenance**: Committing a report hash onchain proves that the report content matches the registered digest at the recorded block timestamp. It does not by itself prove that external benchmark claims or input data are truthful.

### Deployment Options

1. **Via Browser UI (Recommended)**:
   Navigate to the [Contract Lab](https://roxy4798.github.io/MONARCH-LENS/#/contract-lab), connect your wallet, verify the Monad Testnet network (Chain 10143), and click **Review & deploy registry**. The wallet will prompt for signature and transaction broadcast with zero private key entry in the browser.

2. **Via Foundry Terminal Script**:
   If Foundry is installed locally, use a **dedicated testnet-only private key** funded via the official faucet:
   ```bash
   cd artifacts/monarch-lens
   export MONAD_TESTNET_PRIVATE_KEY=<your-testnet-only-private-key>
   forge script contracts/script/DeployReportRegistry.s.sol:DeployReportRegistry \
     --rpc-url monad_testnet --broadcast
   ```
   > [!CAUTION]
   > Never use a mainnet private key. Never commit private keys to Git, include them in source code, or paste them into chat.

---

## Getting Started

### Prerequisites

- **Node.js**: >= 20.x (Node.js 24 recommended)
- **pnpm**: Corepack pnpm 11.x or 12.x (`corepack pnpm` or `npx pnpm`)
- **Foundry** *(Optional)*: Required only if compiling or testing Solidity contracts locally via `forge`

### Installation

```bash
# Clone the repository
git clone https://github.com/roxy4798/MONARCH-LENS.git
cd MONARCH-LENS

# Install dependencies across all workspace packages
corepack pnpm install --frozen-lockfile
```

### Running Locally

```bash
# Start the Monarch Lens development server (defaults to port 5173 on localhost)
corepack pnpm dev
```

Open [http://localhost:5173](http://localhost:5173) in your browser.

### Quality Assurance & Testing

```bash
# Run unit tests (ABI helpers, fee calculations, deterministic serialization)
corepack pnpm test

# Run TypeScript typechecks across all monorepo packages
corepack pnpm run typecheck

# Build the production application (configured with /MONARCH-LENS/ base path)
corepack pnpm run build

# Preview the production build locally
corepack pnpm serve
```

### Foundry Contract Testing *(Optional)*

If Foundry is installed:

```bash
cd artifacts/monarch-lens
forge test -vv
```

*Note: Offline unit tests in `ReportRegistry.t.sol` run directly with `forge test -vv` without requiring an active RPC fork.*

---

## Deployment & Synchronization

The production build is deployed to GitHub Pages via the `gh-pages` branch. To synchronize and publish changes verifiably:

```bash
# Test the deployment process without pushing (generates build and deploy-manifest.json)
node ./scripts/deploy-pages.mjs --dry-run

# Build from clean main commit, generate manifest, and push to origin gh-pages
corepack pnpm run deploy:pages
```

The script automatically generates a `deploy-manifest.json` in the static root recording:
- Repository owner and name (`roxy4798/MONARCH-LENS`)
- Source branch (`main`)
- Source commit SHA
- Build timestamp in UTC
- Target deployment branch (`gh-pages`)
- Base path (`/MONARCH-LENS/`)

---

## Project Structure

```text
MONARCH-LENS/
├── artifacts/
│   ├── monarch-lens/       # Main React 19 + Vite 7 + Tailwind CSS frontend & Solidity contracts
│   │   ├── contracts/      # ReportRegistry.sol, unit tests, and Foundry deployment scripts
│   │   ├── src/            # React application source, pages, and components
│   │   └── src/lib/        # ReportRegistry ABI, fee calculations, and deterministic JSON hashing
│   ├── mockup-sandbox/     # Component prototyping canvas
│   └── api-server/         # Optional supplementary Express API server
├── lib/
│   ├── api-client-react/   # Generated React API query hooks
│   ├── api-spec/           # OpenAPI 3.1 specification
│   ├── api-zod/            # Shared Zod validation schemas
│   └── db/                 # Drizzle ORM schema definitions
├── scripts/
│   └── deploy-pages.mjs    # Cross-platform GitHub Pages deployment automation script
├── .env.example            # Environment variable template
├── pnpm-workspace.yaml     # Monorepo workspace configuration & security overrides
└── package.json            # Root workspace scripts and tooling
```

---

## License

This project is open-source under the [MIT License](LICENSE).
