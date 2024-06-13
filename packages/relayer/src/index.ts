import { SyncDataOptions, Txs } from "@oraichain/cosmos-rpc-sync";
import { envConfig } from "./config";
import { DuckDb } from "./duckdb.service";
import { CosmosBlockOffset } from "./models/cosmwasm/block-offset";
import {
  CosmwasmWatcherEvent,
  createCosmosBridgeWatcher,
  createUpdateClientData,
} from "./cosmos.service";
import { BridgeParsedData } from "./@types/interfaces/cosmwasm";
import { Queue } from "bullmq";
import { CosmosWorkerJob, TonWorkerJob } from "./worker";

//@ts-ignore
BigInt.prototype.toJSON = function () {
  return this.toString();
};

const connection = {
  host: envConfig.REDIS_HOST,
  port: envConfig.REDIS_PORT,
};

const tonQueue = new Queue("ton", {
  connection,
});

const cosmosQueue = new Queue("cosmos", { connection });

export async function relay() {
  console.log("[RELAY] Start relaying process");
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
  cosmosWatcher.on(CosmwasmWatcherEvent.SYNC_DATA, async (chunk: Txs) => {
    const { offset: newOffset } = chunk;
    await blockOffset.updateBlockOffset(newOffset);
    console.log("[SYNC_DATA] Update new offset at", newOffset);
  });
  // LISTEN ON THE PARSED_DATA FROM WATCHER
  cosmosWatcher.on(
    CosmwasmWatcherEvent.PARSED_DATA,
    async (data: BridgeParsedData) => {
      const { submitData, submittedTxs } = data;
      // Submitting serialized data to cosmwasm bridge
      const submitDataQueue = submitData.map((tx) => {
        return {
          name: CosmosWorkerJob.SubmitData,
          data: tx,
        };
      });
      await cosmosQueue.addBulk(submitDataQueue);
      // Relaying submitted transaction by relayer
      const updateClientDataPromise = submittedTxs.map((tx) =>
        createUpdateClientData(envConfig.COSMOS_RPC_URL, tx.height)
      );
      const updateClientData = await Promise.all(updateClientDataPromise);

      const relayDataQueue = updateClientData.map((clientData, i) => {
        return {
          name: TonWorkerJob.RelayCosmWasmData,
          data: {
            data: submittedTxs[i].data,
            clientData: clientData,
            txHash: submittedTxs[i].hash,
          },
        };
      });
      await tonQueue.addBulk(relayDataQueue);
    }
  );
  console.log("[RELAY] Start watching cosmos chain");
  await cosmosWatcher.start();
}
