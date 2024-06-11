import { config } from "dotenv";
config();

export const envConfig = {
  REDIS_HOST: process.env.REDIS_HOST || "http://localhost",
  REDIS_PORT: Number(process.env.REDIS_PORT || 6379),
  MNEMONIC: process.env.MNEMONIC || "",
  COSMOS_RPC_URL: process.env.COSMOS_RPC_URL || "https://rpc.orai.io/",
  SYNC_BLOCK_OFFSET: Number(process.env.SYNC_BLOCK_OFFSET || 20000000),
  SYNC_LIMIT: Number(process.env.SYNC_LIMIT || 50),
  SYNC_THREADS: Number(process.env.SYNC_THREADS || 4),
  SYNC_INTERVAL: Number(process.env.SYNC_INTERVAL || 5000),
  TON_CENTER: process.env.TON_CENTER || "https://toncenter.com/api/v2/jsonRPC",
  TON_LITE_CLIENT_LIST:
    process.env.TON_LITE_CLIENT_LIST || "https://ton.org/global.config.json",
  CONNECTION_STRING: process.env.CONNECTION_STRING || "relayer.duckdb",
  BRIDGE_WASM_ADDRESS: process.env.BRIDGE_WASM_ADDRESS || "",
  BRIDGE_TON_ADDRESS: process.env.BRIDGE_TON_ADDRESS || "",
};