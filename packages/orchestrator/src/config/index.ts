import { Config as CwToTonConfig } from "@oraichain/tonbridge-relayer-to-ton";
import type { Config as TonToCwConfig } from "@oraichain/tonbridge-relayer-to-cw";
import * as dotenv from "dotenv";
dotenv.config();

export type Config = {
  cwToTon: CwToTonConfig;
  tonToCw: TonToCwConfig;
};

export function loadConfig(): Config {
  const cwToTon: CwToTonConfig = {
    redisHost: process.env.REDIS_HOST || "http://localhost",
    redisPort: Number(process.env.REDIS_PORT || 6379),
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

  const tonToCw: TonToCwConfig = {
    cwTonBridge: process.env.WASM_BRIDGE,
    cwTonValidators: process.env.WASM_VALIDATORS,
    jettonBridge: process.env.TON_BRIDGE,
    tonHttpApiURL: process.env.TON_CENTER || undefined,
    tonApiKey: process.env.TON_API_KEY,
    mnemonic: process.env.COSMOS_MNEMONIC,
  };

  return {
    cwToTon,
    tonToCw,
  };
}
