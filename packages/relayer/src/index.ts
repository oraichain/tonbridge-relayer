import { SyncDataOptions, Txs } from "@oraichain/cosmos-rpc-sync";
import { envConfig } from "./config";
import { DuckDb } from "./duckdb.service";
import { CosmosBlockOffset } from "./models/cosmwasm/block-offset";
import {
  CosmwasmWatcherEvent,
  createCosmosBridgeWatcher,
} from "./cosmos.service";
import { BridgeParsedData } from "./@types/interfaces/cosmwasm";

// TODO: may transform to an express app not only worker
async function main() {
  const duckDb = await DuckDb.getInstance(envConfig.CONNECTION_STRING);
  const blockOffset = new CosmosBlockOffset(duckDb);
  await blockOffset.createTable();
  const offset = await blockOffset.mayLoadBlockOffset(
    envConfig.SYNC_BLOCK_OFFSET
  );

  const syncDataOpt: SyncDataOptions = {
    rpcUrl: envConfig.COSMOS_RPC_URL,
    limit: envConfig.SYNC_LIMIT,
    maxThreadLevel: envConfig.SYNC_THREADS,
    offset: offset,
    interval: envConfig.SYNC_INTERVAL,
    queryTags: [],
  };

  if (offset < envConfig.SYNC_BLOCK_OFFSET) {
    syncDataOpt.offset = envConfig.SYNC_BLOCK_OFFSET;
  }

  if (envConfig.BRIDGE_WASM_ADDRESS === "") {
    throw new Error("BRIDGE_WASM_ADDRESS is required");
  }

  const cosmosWatcher = createCosmosBridgeWatcher(
    envConfig.BRIDGE_WASM_ADDRESS,
    syncDataOpt
  );

  // UPDATE BLOCK OFFSET TO DATABASE
  const database = await DuckDb.getInstance(envConfig.CONNECTION_STRING);
  const blockOffSet = new CosmosBlockOffset(database);
  cosmosWatcher.on(CosmwasmWatcherEvent.SYNC_DATA, async (chunk: Txs) => {
    const { offset: newOffset } = chunk;
    await blockOffSet.updateBlockOffset(newOffset);
    console.log("Update new offset at", newOffset);
  });

  // LISTEN ON THE PARSED_DATA FROM WATCHER
  cosmosWatcher.on(
    CosmwasmWatcherEvent.PARSED_DATA,
    async (data: BridgeParsedData) => {
      const { submitData, submittedTxs } = data;
    }
  );
}

main().catch((error) => {
  console.log(error);
  process.exit(1);
});
