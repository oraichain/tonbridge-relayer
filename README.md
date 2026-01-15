# Oraichain TON Bridge Relayer

A bidirectional cross-chain bridge relayer that enables asset transfers between the **TON Network** and **Oraichain (CosmWasm)**. This relayer monitors both chains and submits proofs to facilitate secure cross-chain transactions.

## Table of Contents

- [Overview](#overview)
- [Architecture](#architecture)
- [Project Structure](#project-structure)
- [Prerequisites](#prerequisites)
- [Quick Start](#quick-start)
- [Configuration](#configuration)
- [Scripts](#scripts)
- [Docker Deployment](#docker-deployment)
- [Testing](#testing)
- [Contributing](#contributing)
- [License](#license)

---

## Overview

The TON Bridge Relayer is a critical infrastructure component that:

- **Watches Oraichain** for bridge transfer events and relays them to TON
- **Watches TON blockchain** for transfer events and relays them to Oraichain
- **Maintains light clients** on both chains for trustless verification
- **Processes and submits cryptographic proofs** for cross-chain message validation

---

## Architecture

```
┌─────────────────┐                          ┌─────────────────┐
│   TON Network   │                          │   Oraichain     │
│                 │                          │   (CosmWasm)    │
│  ┌───────────┐  │                          │  ┌───────────┐  │
│  │  Jetton   │  │                          │  │   WASM    │  │
│  │  Bridge   │  │◄─────────────────────────│  │  Bridge   │  │
│  └───────────┘  │     ton-to-cw Relayer    │  └───────────┘  │
│                 │                          │                 │
│  ┌───────────┐  │                          │  ┌───────────┐  │
│  │   Light   │  │                          │  │   Light   │  │
│  │  Client   │  │─────────────────────────►│  │  Client   │  │
│  │  Master   │  │     cw-to-ton Relayer    │  │ Validator │  │
│  └───────────┘  │                          │  └───────────┘  │
└─────────────────┘                          └─────────────────┘
                          │
                          │
                 ┌────────▼────────┐
                 │   Orchestrator  │
                 │   (Express API) │
                 │   Health Check  │
                 └─────────────────┘
```

### Key Components

| Component | Description |
|-----------|-------------|
| **Orchestrator** | Main entry point that coordinates both relayers and provides a health check endpoint |
| **cw-to-ton** | Watches Oraichain bridge contract events and relays transfer packets to TON |
| **ton-to-cw** | Monitors TON blockchain, verifies key blocks, and submits bridge transactions to Oraichain |

---

## Project Structure

```
tonbridge-relayer/
├── packages/
│   ├── orchestrator/         # Main entry point - combines both relayers
│   │   ├── src/
│   │   │   ├── index.ts      # Express server & relayer initialization
│   │   │   └── config/       # Configuration & logging setup
│   │   └── package.json
│   │
│   ├── cw-to-ton/            # CosmWasm → TON relayer
│   │   ├── src/
│   │   │   ├── relayer.ts    # Main relayer logic
│   │   │   ├── packet-processor.ts
│   │   │   ├── services/     # DuckDB, CosmosProofHandler, TonHandler
│   │   │   ├── models/       # Data models
│   │   │   └── scripts/      # Utility scripts
│   │   └── package.json
│   │
│   └── ton-to-cw/            # TON → CosmWasm relayer
│       ├── src/
│       │   ├── index.ts      # TonToCwRelayer class
│       │   ├── block-processor.ts
│       │   ├── tx-processor.ts
│       │   └── config/       # Configuration
│       └── package.json
│
├── patches/                  # Patches for dependencies
├── Dockerfile                # Docker build configuration
├── package.json              # Root package configuration
├── lerna.json                # Monorepo management
└── tsconfig.json             # TypeScript configuration
```

---

## Prerequisites

- **Node.js** >= 18.18.0
- **Yarn** 1.22.x (Classic)
- **TON wallet** with funds for transaction fees
- **Oraichain wallet** with ORAI for gas fees
- **Redis** (optional, for queue management)
- **DuckDB** (embedded, used for state persistence)

---

## Quick Start

### 1. Clone the Repository

```bash
git clone https://github.com/oraichain/tonbridge-relayer.git
cd tonbridge-relayer
```

### 2. Install Dependencies

```bash
yarn install
```

> **Note:** The `postinstall` script automatically applies patches via `patch-package`.

### 3. Build All Packages

```bash
yarn build
```

### 4. Configure Environment Variables

Copy the example environment file and fill in the required values:

```bash
cp packages/orchestrator/.env.example packages/orchestrator/.env
```

Edit `.env` with your configuration (see [Configuration](#configuration) section below).

### 5. Run the Relayer

```bash
cd packages/orchestrator
node dist/index.js
```

---

## Configuration

### Environment Variables

Create a `.env` file in `packages/orchestrator/` with the following variables:

| Variable | Description | Required | Default |
|----------|-------------|----------|---------|
| `NODE_ENV` | Network environment (`mainnet` / `testnet`) | Yes | `mainnet` |
| `TON_MNEMONIC` | TON wallet mnemonic (24 words) | Yes | - |
| `COSMOS_MNEMONIC` | Oraichain wallet mnemonic | Yes | - |
| `COSMOS_RPC_URL` | Oraichain RPC endpoint | Yes | `https://rpc.orai.io/` |
| `TON_CENTER` | TON Center API endpoint | Yes | `https://toncenter.orai.io/jsonRPC` |
| `TON_API_KEY` | TON Center API key | No | - |
| `TON_LITE_CLIENT_LIST` | TON lite client config URL | No | `https://ton.org/global.config.json` |
| `WASM_BRIDGE` | Oraichain bridge contract address | Yes | - |
| `WASM_VALIDATORS` | Oraichain validators contract address | Yes | - |
| `TON_BRIDGE` | TON Jetton bridge contract address | Yes | - |
| `COSMOS_LIGHT_CLIENT_MASTER` | TON light client master address | Yes | - |
| `SYNC_BLOCK_OFFSET` | Starting block for Cosmos sync | No | `20000000` |
| `SYNC_LIMIT` | Max blocks per sync batch | No | `100` |
| `SYNC_THREADS` | Number of sync threads | No | `4` |
| `SYNC_INTERVAL` | Sync interval in milliseconds | No | `5000` |
| `CONNECTION_STRING` | DuckDB database path | No | `relayer.duckdb` |
| `LOG_LEVEL` | Winston log level | No | `info` |
| `HEALTH_CHECK_PORT` | Health check server port | No | `3001` |
| `WEBHOOK_URL` | Discord webhook for notifications | No | - |

### Example Configuration (Mainnet)

```env
NODE_ENV=mainnet
TON_MNEMONIC=word1 word2 word3 ... word24
COSMOS_MNEMONIC=word1 word2 word3 ... word24
COSMOS_RPC_URL=https://rpc.orai.io/
TON_CENTER=https://toncenter.orai.io/jsonRPC
TON_API_KEY=your-api-key
WASM_BRIDGE=orai159l8l9c5ckhqpuwdfgs9p4v599nqt3cjlfahalmtrhfuncnec2ms5mz60e
WASM_VALIDATORS=orai16crw7g2rcvuga7vlnyxgwtdxtan46k8qqjjwhjqdjvjgk96n95es35q8vm
TON_BRIDGE=EQC-aFP0rJXwTgKZQJPbPfTSpBFc8wxOgKHWD9cPvOl_DnaY
COSMOS_LIGHT_CLIENT_MASTER=EQDzy_POlimFDyzrHd3OQsb9sZCngyG3O7Za4GRFzM-rrO93
SYNC_BLOCK_OFFSET=31548100
HEALTH_CHECK_PORT=3001
LOG_LEVEL=info
```

---

## Scripts

### Root Package Scripts

| Script | Command | Description |
|--------|---------|-------------|
| **Install** | `yarn install` | Install all dependencies |
| **Build** | `yarn build` | Build all packages (production) |
| **Test** | `yarn test` | Run Jest tests |
| **Clean** | `yarn clean` | Remove build artifacts and node_modules |
| **Deploy** | `yarn deploy` | Publish packages to npm registry |
| **Deploy Minor** | `yarn deploy minor` | Publish with minor version bump |
| **Deploy Patch** | `yarn deploy patch` | Publish with patch version bump |
| **Patch Package** | `yarn patch-package` | Apply dependency patches |

### Building Individual Packages

```bash
# Build orchestrator only
cd packages/orchestrator && yarn build

# Build cw-to-ton only
cd packages/cw-to-ton && yarn build

# Build ton-to-cw only
cd packages/ton-to-cw && yarn build
```

---

## Docker Deployment

### Build Docker Image

```bash
docker build -t tonbridge-relayer .
```

### Run with Docker

```bash
docker run -d \
  --name tonbridge-relayer \
  --env-file packages/orchestrator/.env \
  -p 3001:3001 \
  tonbridge-relayer
```

### Docker Compose (Example)

```yaml
version: "3.8"
services:
  relayer:
    image: tonbridge-relayer:latest
    container_name: tonbridge-relayer
    restart: unless-stopped
    ports:
      - "3001:3001"
    environment:
      - NODE_ENV=mainnet
      - TON_MNEMONIC=${TON_MNEMONIC}
      - COSMOS_MNEMONIC=${COSMOS_MNEMONIC}
      - COSMOS_RPC_URL=${COSMOS_RPC_URL}
      - TON_CENTER=${TON_CENTER}
      - TON_API_KEY=${TON_API_KEY}
      - WASM_BRIDGE=${WASM_BRIDGE}
      - WASM_VALIDATORS=${WASM_VALIDATORS}
      - TON_BRIDGE=${TON_BRIDGE}
      - COSMOS_LIGHT_CLIENT_MASTER=${COSMOS_LIGHT_CLIENT_MASTER}
      - HEALTH_CHECK_PORT=3001
    volumes:
      - ./data:/app/data
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:3001/"]
      interval: 30s
      timeout: 10s
      retries: 3
```

---

## Testing

### Run All Tests

```bash
yarn test
```

### Run Tests with Verbose Output

```bash
yarn test --verbose
```

### Run Tests for Specific Package

```bash
cd packages/cw-to-ton
yarn test
```

---

## Health Check

The relayer exposes a health check endpoint:

```bash
curl http://localhost:3001/
# Response: "Pong from ton-to-cw relayer"
```

---

## Monitoring & Logging

- **Log Levels**: Configure via `LOG_LEVEL` environment variable (`debug`, `info`, `warn`, `error`)
- **Discord Notifications**: Set `WEBHOOK_URL` to receive alerts via Discord webhook
- **Winston Transport**: Logs are managed via Winston with Discord integration for production alerts

---

## CI/CD

The project uses GitHub Actions for automated deployment:

- **Trigger**: Push tags matching `v[0-9]+.[0-9]+.[0-9]+`
- **Build**: Creates Docker image and pushes to DockerHub
- **Deploy**: Dispatches deployment event to `oraichain/infra-deployments`
- **Notify**: Sends Discord notifications on success/failure

---

## Development

### Adding a New Package

1. Create directory under `packages/`
2. Add `package.json` with appropriate name under `@oraichain/` scope
3. Configure `tsconfig.json` for the package
4. Update root workspace if needed

### Applying Dependency Patches

If you need to patch a dependency:

```bash
# Make changes to node_modules/package-name
yarn patch-package package-name
```

Patches are stored in `patches/` directory.

---

## Troubleshooting

### Common Issues

| Issue | Solution |
|-------|----------|
| `WASM_BRIDGE is required` | Ensure all required environment variables are set |
| TON connection timeout | Check `TON_CENTER` endpoint and API key |
| Cosmos sync stuck | Verify `COSMOS_RPC_URL` and `SYNC_BLOCK_OFFSET` |
| DuckDB lock error | Ensure only one relayer instance is running |

### Debug Mode

Enable debug logging:

```bash
LOG_LEVEL=debug node dist/index.js
```

---

## Contributing

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/my-feature`
3. Commit changes: `git commit -am 'Add new feature'`
4. Push to branch: `git push origin feature/my-feature`
5. Submit a Pull Request

---

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

---

## Related Repositories

- [tonbridge-tvm-contracts](https://github.com/oraichain/tonbridge-tvm-contracts) - Oraichain CosmWasm bridge contracts
- [ton-bridge-contracts](https://github.com/oraichain/ton-bridge-contracts) - TON bridge contracts
- [tonbridge-contracts-sdk](https://github.com/oraichain/tonbridge-contracts-sdk) - TypeScript SDK for bridge contracts

---

## Support

For questions or issues, please open an issue on GitHub or contact the Oraichain team.