import * as dotenv from "dotenv";
dotenv.config();

export const envConfig = {
  REDIS_HOST: process.env.REDIS_HOST || "http://localhost",
  REDIS_PORT: Number(process.env.REDIS_PORT || 6379),
  TON_MNEMONIC: process.env.TON_MNEMONIC || "",
  COSMOS_MNEMONIC: process.env.COSMOS_MNEMONIC || "",
  COSMOS_RPC_URL: process.env.COSMOS_RPC_URL || "https://rpc.orai.io/",
  SYNC_BLOCK_OFFSET: Number(process.env.SYNC_BLOCK_OFFSET || 20000000),
  SYNC_LIMIT: Number(process.env.SYNC_LIMIT || 50),
  SYNC_THREADS: Number(process.env.SYNC_THREADS || 4),
  SYNC_INTERVAL: Number(process.env.SYNC_INTERVAL || 5000),
  TON_CENTER: process.env.TON_CENTER || "https://toncenter.com/api/v2/jsonRPC",
  TON_LITE_CLIENT_LIST:
    process.env.TON_LITE_CLIENT_LIST || "https://ton.org/global.config.json",
  CONNECTION_STRING: process.env.CONNECTION_STRING || "relayer.duckdb",
  WASM_BRIDGE: process.env.WASM_BRIDGE || "",
  TON_BRIDGE: process.env.TON_BRIDGE || "",
  TON_LIGHT_CLIENT: process.env.TON_LIGHT_CLIENT || "",
};
