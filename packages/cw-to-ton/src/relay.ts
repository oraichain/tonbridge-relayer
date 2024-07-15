import { SyncDataOptions, Txs } from "@oraichain/cosmos-rpc-sync";
import { Packets } from "./@types/interfaces/cosmwasm";
import { Config } from "./config";
import {
  createCosmosBridgeWatcher,
  CosmwasmWatcherEvent,
} from "@src/services/cosmos.service";
import { DuckDb } from "./services/duckdb.service";
import { CosmosBlockOffset } from "./models/cosmwasm/block-offset";
import { RelayCosmwasmData, TonWorkerJob } from "./worker";
import { BulkJobOptions, Queue } from "bullmq";
import {
  createUpdateClientData,
  getAckPacketProofs,
  getPacketProofs,
} from "@oraichain/ton-bridge-contracts";
import { Tendermint37Client } from "@cosmjs/tendermint-rpc";
import { QueryClient } from "@cosmjs/stargate";
import { ExistenceProof } from "cosmjs-types/cosmos/ics23/v1/proofs";
import { getJobIdFromPacket } from "./utils";

//@ts-ignore
BigInt.prototype.toJSON = function () {
  return this.toString();
};

export async function relay(tonQueue: Queue, tonConfig: Config) {
  const duckDb = await DuckDb.getInstance(tonConfig.connectionString);
  const blockOffset = new CosmosBlockOffset(duckDb);
  await blockOffset.createTable();
  const offset = await blockOffset.mayLoadBlockOffset(
    tonConfig.syncBlockOffSet
  );
  const syncDataOpt: SyncDataOptions = {
    rpcUrl: tonConfig.cosmosRpcUrl,
    limit: tonConfig.syncLimit,
    maxThreadLevel: tonConfig.syncThreads,
    offset: offset,
    interval: tonConfig.syncInterval,
    queryTags: [],
  };
  if (offset < tonConfig.syncBlockOffSet) {
    syncDataOpt.offset = tonConfig.syncBlockOffSet;
  }
  if (tonConfig.wasmBridge === "") {
    throw new Error("WASM_BRIDGE is required");
  }
  const tendermint37 = await Tendermint37Client.connect(tonConfig.cosmosRpcUrl);
  const queryClient = new QueryClient(tendermint37 as any);

  const cosmosWatcher = createCosmosBridgeWatcher(
    tonConfig.wasmBridge,
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
    const { transferPackets, ackPackets } = data;
    const packets = [...transferPackets, ...ackPackets];
    // sort packets by orders
    packets.sort((a, b) => a.height - b.height);
    const lastPackets = packets[packets.length - 1];
    const provenHeight = lastPackets.height;
    const neededProvenHeight = provenHeight + 1;
    const updateLightClientData = await createUpdateClientData(
      tonConfig.cosmosRpcUrl,
      neededProvenHeight
    );

    const promiseTransferProofs = transferPackets.map((packet) => {
      const packet_cs = packet.data.beginParse(); // skip opcode_packet
      packet_cs.loadUint(32);
      const seq = packet_cs.loadUint(64);
      return getPacketProofs(
        queryClient as any,
        tonConfig.wasmBridge,
        provenHeight,
        BigInt(seq)
      ) as Promise<ExistenceProof[]>;
    });

    const promiseAckProofs = ackPackets.map((packet) => {
      const packet_cs = packet.data.beginParse(); // skip opcode_packet
      packet_cs.loadUint(32);
      const seq = packet_cs.loadUint(64);
      return getAckPacketProofs(
        queryClient as any,
        tonConfig.wasmBridge,
        provenHeight,
        BigInt(seq)
      ) as Promise<ExistenceProof[]>;
    });

    const [transferProofs, ackProofs] = await Promise.all([
      Promise.all(promiseTransferProofs),
      Promise.all(promiseAckProofs),
    ]);

    const allProofs = [...transferProofs, ...ackProofs];
    const allProofAndPacket = [...transferPackets, ...ackPackets].map(
      (packet, i) => {
        return {
          packetBoc: packet.data.toBoc().toString("hex"),
          proofs: allProofs[i],
        };
      }
    );

    const relayDataQueue: {
      name: string;
      data: any;
      opts?: BulkJobOptions;
    }[] = allProofAndPacket.map((proofAndPacket) => {
      return {
        name: TonWorkerJob.RelayPacket,
        data: {
          data: proofAndPacket,
          clientData: updateLightClientData,
          provenHeight: neededProvenHeight,
        } as RelayCosmwasmData,
        opts: {
          jobId: getJobIdFromPacket(proofAndPacket.packetBoc),
        },
      };
    });

    await tonQueue.addBulk(relayDataQueue);
  });

  return cosmosWatcher;
}
