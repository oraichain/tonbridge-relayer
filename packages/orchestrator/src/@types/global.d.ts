import { Logger } from "winston";

declare global {
  // eslint-disable-next-line no-var
  var logger: Logger;
  namespace NodeJS {
    interface ProcessEnv {
      NODE_ENV: string;
      TON_MNEMONIC: string;
      COSMOS_MNEMONIC: string;
      // SYNC_OPTS
      COSMOS_RPC_URL: string;
      SYNC_BLOCK_OFFSET: number;
      SYNC_LIMIT: number;
      SYNC_THREADS: number;
      SYNC_INTERVAL: number;
      // TON API
      TON_CENTER: string;
      TON_API_KEY: string;
      TON_LITE_CLIENT_LIST: string;
      // DB
      CONNECTION_STRING: string;
      // CONTRACT
      WASM_BRIDGE: string;
      WASM_VALIDATORS: string;
      TON_BRIDGE: string;
      COSMOS_LIGHT_CLIENT_MASTER: string;

      // APP CONFIG
      WEBHOOK_URL: string;
      HEALTH_CHECK_PORT: number;
    }
    interface BigInt {
      toJSON(): string;
    }
  }
}

// If this file has no import/export statements (i.e. is a script)
// convert it into a module by adding an empty export statement.
export {};
