import { SyncDataOptions, Txs } from "@oraichain/cosmos-rpc-sync";
import { Packets } from "./@types/interfaces/cosmwasm";
import { envConfig } from "./config";
import {
  createCosmosBridgeWatcher,
  CosmwasmWatcherEvent,
} from "@src/services/cosmos.service";
import { DuckDb } from "./services/duckdb.service";
import { CosmosBlockOffset } from "./models/cosmwasm/block-offset";
import { RelayCosmwasmData, TonWorkerJob } from "./worker";
import { Queue } from "bullmq";
import {
  createUpdateClientData,
  getAckPacketProofs,
  getPacketProofs,
} from "@oraichain/ton-bridge-contracts";
import { Tendermint37Client } from "@cosmjs/tendermint-rpc";
import { QueryClient } from "@cosmjs/stargate";
import { ExistenceProof } from "cosmjs-types/cosmos/ics23/v1/proofs";

//@ts-ignore
BigInt.prototype.toJSON = function () {
  return this.toString();
};

export async function relay(tonQueue: Queue) {
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
    const { transferPackets, ackPackets } = data;
    const packets = [...transferPackets, ...ackPackets];
    // sort packets by orders
    packets.sort((a, b) => a.height - b.height);
    const lastPackets = packets[packets.length - 1];
    const provenHeight = lastPackets.height;
    const neededProvenHeight = provenHeight + 1;
    const updateLightClientData = await createUpdateClientData(
      envConfig.COSMOS_RPC_URL,
      neededProvenHeight
    );

    const promiseTransferProofs = transferPackets.map((packet) => {
      const packet_cs = packet.data.beginParse(); // skip opcode_packet
      packet_cs.loadUint(32);
      const seq = packet_cs.loadUint(64);
      return getPacketProofs(
        queryClient as any,
        envConfig.WASM_BRIDGE,
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
        envConfig.WASM_BRIDGE,
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
