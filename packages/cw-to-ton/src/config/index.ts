import * as dotenv from "dotenv";
dotenv.config();

export type Config = {
  tonMnemonic: string;
  cosmosRpcUrl: string;
  syncBlockOffSet: number;
  syncLimit: number;
  syncThreads: number;
  syncInterval: number;
  tonCenter: string;
  tonApiKey: string;
  tonLiteClientList: string;
  connectionString: string;
  wasmBridge: string;
  tonBridge: string;
  cosmosLightClientMaster: string;
};

export const loadConfig = (): Config => {
  return {
    tonMnemonic: process.env.TON_MNEMONIC || "",
    cosmosRpcUrl: process.env.COSMOS_RPC_URL || "https://rpc.orai.io/",
    syncBlockOffSet: Number(process.env.SYNC_BLOCK_OFFSET || 20000000),
    syncLimit: Number(process.env.SYNC_LIMIT || 50),
    syncThreads: Number(process.env.SYNC_THREADS || 4),
    syncInterval: Number(process.env.SYNC_INTERVAL || 5000),
    tonCenter: process.env.TON_CENTER || "https://toncenter.com/api/v2/jsonRPC",
    tonApiKey: process.env.TON_API_KEY || "",
    tonLiteClientList:
      process.env.TON_LITE_CLIENT_LIST || "https://ton.org/global.config.json",
    connectionString: process.env.CONNECTION_STRING || "relayer.duckdb",
    wasmBridge: process.env.WASM_BRIDGE || "",
    tonBridge: process.env.TON_BRIDGE || "",
    cosmosLightClientMaster: process.env.COSMOS_LIGHT_CLIENT_MASTER || "",
  };
};

export const TonDefaultConfig: Config = {
  tonMnemonic: process.env.TON_MNEMONIC || "",
  cosmosRpcUrl: process.env.COSMOS_RPC_URL || "https://rpc.orai.io/",
  syncBlockOffSet: Number(process.env.SYNC_BLOCK_OFFSET || 20000000),
  syncLimit: Number(process.env.SYNC_LIMIT || 50),
  syncThreads: Number(process.env.SYNC_THREADS || 4),
  syncInterval: Number(process.env.SYNC_INTERVAL || 5000),
  tonCenter: process.env.TON_CENTER || "https://toncenter.com/api/v2/jsonRPC",
  tonApiKey: process.env.TON_API_KEY || "",
  tonLiteClientList:
    process.env.TON_LITE_CLIENT_LIST || "https://ton.org/global.config.json",
  connectionString: process.env.CONNECTION_STRING || "relayer.duckdb",
  wasmBridge: process.env.WASM_BRIDGE || "",
  tonBridge: process.env.TON_BRIDGE || "",
  cosmosLightClientMaster: process.env.COSMOS_LIGHT_CLIENT_MASTER || "",
};
