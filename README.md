# Monarch Lens

> Independent Monad Testnet developer observability, transaction inspection, and smart contract benchmarking workspace for EVM developers.

Monarch Lens is a community-built, zero-cost developer tool that reads public Monad Testnet RPC data directly in the browser and connects with standard Web3 wallets for user-approved testnet operations. It is not an official Monad product.

---

## Key Features

- **RPC Observability & Health Monitoring**: Live block height, latency, gas parameters, and network status validation for Monad Testnet.
- **Transaction Inspection**: Detailed transaction and execution receipt inspection directly from official RPC queries.
- **Contract Lab & Benchmarking**: Interactive benchmark runner offering deterministic report generation, repeatable testnet scenarios, and gas analysis.
- **Onchain Report Registry**: Verify and commit SHA-256 report digests against an EVM smart contract (`ReportRegistry.sol`) on Monad Testnet.
- **Zero-Cost Architecture**: Operates directly in the browser via official public RPCs; requires no paid database, no server hosting, and no third-party API keys (target spend: IDR 0 / $0).

---

## Monad Testnet Configuration

Verified against the official [Monad Developer Documentation](https://docs.monad.xyz/developer-essentials/testnet):

| Parameter | Value |
| :--- | :--- |
| **Network Name** | Monad Testnet |
| **Chain ID** | `10143` |
| **RPC URL** | `https://testnet-rpc.monad.xyz` |
| **Currency Symbol** | `MON` |
| **Explorers** | [MonadVision](https://testnet.monadvision.com) · [Monadscan](https://testnet.monadscan.com) |
| **Faucet** | [faucet.monad.xyz](https://faucet.monad.xyz/) |

> [!NOTE]
> All measurements reflect official RPC receipts and browser-local state. Only testnet faucet funds are used; never use real funds or mainnet private keys.

---

## Getting Started

### Prerequisites

- **Node.js**: >= 20.x (Node.js 24 recommended)
- **pnpm**: >= 9.x / 10.x / 12.x (or invoke via `npx pnpm`)
- **Foundry** *(Optional)*: Required only for compiling and testing Solidity contracts locally via `forge`

### Installation

```bash
# Clone the repository
git clone <repository-url>
cd monarch-lens

# Install dependencies across all workspace packages
pnpm install
```

### Running Locally

```bash
# Start the Monarch Lens development server (defaults to port 5173)
pnpm dev

# Or run specifically within the package
pnpm --filter @workspace/monarch-lens run dev
```

Open [http://localhost:5173](http://localhost:5173) in your browser.

### Quality Assurance & Testing

```bash
# Run unit tests
pnpm test

# Run TypeScript typechecks across the workspace
pnpm run typecheck

# Build the production bundle
pnpm run build

# Preview the production build locally
pnpm serve
```

---

## Smart Contract: ReportRegistry

The repository includes `contracts/src/ReportRegistry.sol`, a lightweight registry that stores a SHA-256 report digest, submitter address, and registration timestamp on Monad Testnet.

### Local Foundry Testing

If Foundry is installed on your machine:

```bash
cd artifacts/monarch-lens
forge test -vv
```

### Deployment

1. **Via Browser UI**: Monarch Lens includes pre-compiled bytecode in the Contract Lab. Connect a Monad Testnet wallet (Chain ID 10143) and deploy directly with one click.
2. **Via Foundry Script**:
   ```bash
   cd artifacts/monarch-lens
   export MONAD_TESTNET_PRIVATE_KEY=<your-testnet-faucet-key>
   forge script contracts/script/DeployReportRegistry.s.sol:DeployReportRegistry \
     --rpc-url monad_testnet --broadcast
   ```
   The script enforces `chainid == 10143` and aborts if connected to any other network.

---

## Project Structure

```text
├── artifacts/
│   ├── monarch-lens/       # Main React + Vite + Tailwind CSS web application & smart contracts
│   ├── mockup-sandbox/     # Component prototyping canvas
│   └── api-server/         # Optional Express API server
├── lib/
│   ├── api-client-react/   # Generated React API query hooks
│   ├── api-spec/           # OpenAPI 3.1 specification & Orval codegen config
│   ├── api-zod/            # Shared Zod validation schemas
│   └── db/                 # Drizzle ORM schema (PostgreSQL)
├── scripts/                # Development and automation scripts
├── pnpm-workspace.yaml     # Monorepo workspace configuration
└── package.json            # Root configuration and workspace scripts
```

---

## License

This project is open-source under the [MIT License](LICENSE).
