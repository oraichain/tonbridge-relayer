import { SyncDataOptions, Txs } from "@oraichain/cosmos-rpc-sync";
import { Packet, Packets } from "./@types/interfaces/cosmwasm";
import { envConfig } from "./config";
import {
  createCosmosBridgeWatcher,
  CosmwasmWatcherEvent,
  createUpdateClientData as getLightClientDataAtBlock,
} from "@src/services/cosmos.service";
import { DuckDb } from "./services/duckdb.service";
import { CosmosBlockOffset } from "./models/cosmwasm/block-offset";
import { CosmosWorkerJob, RelayCosmwasmData, TonWorkerJob } from "./worker";
import { ConnectionOptions, Queue } from "bullmq";
import { getPacketProofs } from "@oraichain/ton-bridge-contracts";
import { Tendermint37Client } from "@cosmjs/tendermint-rpc";
import { QueryClient } from "@cosmjs/stargate";
import { ExistenceProof } from "cosmjs-types/cosmos/ics23/v1/proofs";

//@ts-ignore
BigInt.prototype.toJSON = function () {
  return this.toString();
};
const connection: ConnectionOptions = {
  host: envConfig.REDIS_HOST,
  port: envConfig.REDIS_PORT,
  retryStrategy: function (times: number) {
    return Math.max(Math.min(Math.exp(times), 20000), 1000);
  },
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
  if (envConfig.WASM_BRIDGE === "") {
    throw new Error("WASM_BRIDGE is required");
  }
  const tendermint37 = await Tendermint37Client.connect(
    envConfig.COSMOS_RPC_URL
  );
  const queryClient = new QueryClient(tendermint37 as any);

  const cosmosWatcher = createCosmosBridgeWatcher(
    envConfig.WASM_BRIDGE,
    syncDataOpt
  );
  // UPDATE BLOCK OFFSET TO DATABASE
  cosmosWatcher.on(CosmwasmWatcherEvent.SYNC_DATA, async (chunk: Txs) => {
    const { offset: newOffset } = chunk;
    await blockOffset.updateBlockOffset(newOffset);
    console.log("[SYNC_DATA] Update new offset at", newOffset);
  });
  // LISTEN ON THE PARSED_DATA FROM WATCHER
  cosmosWatcher.on(CosmwasmWatcherEvent.PARSED_DATA, async (data: Packets) => {
    const { packets } = data;
    const lastPackets = packets[packets.length - 1];
    const provenHeight = lastPackets.height;
    const neededProvenHeight = provenHeight + 1;

    const updateLightClientData = await getLightClientDataAtBlock(
      envConfig.COSMOS_RPC_URL,
      neededProvenHeight
    );

    const promiseProofs = packets.map((packet) => {
      const seq = packet.data.beginParse().preloadUint(64);
      return getPacketProofs(
        queryClient as any,
        envConfig.WASM_BRIDGE,
        provenHeight,
        BigInt(seq)
      ) as Promise<ExistenceProof[]>;
    });

    const proofs = await Promise.all(promiseProofs);

    const allProofAndPacket = packets.map((packet, i) => {
      return {
        packetBoc: packet.data.toBoc().toString("hex"),
        proofs: proofs[i],
      };
    });

    const relayDataQueue = allProofAndPacket.map((proofAndPacket) => {
      return {
        name: TonWorkerJob.RelayPacket,
        data: {
          data: proofAndPacket,
          clientData: updateLightClientData,
          provenHeight: neededProvenHeight,
        } as RelayCosmwasmData,
      };
    });

    await tonQueue.addBulk(relayDataQueue);
  });

  console.log("[RELAY] Start watching cosmos chain");
  await cosmosWatcher.start();
}
