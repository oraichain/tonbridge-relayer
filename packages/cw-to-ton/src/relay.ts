import { SyncDataOptions } from "@oraichain/cosmos-rpc-sync";
import {
  AckPacketWithBasicInfo,
  Packets,
  TransferPacketWithBasicInfo,
} from "./@types/interfaces/cosmwasm";
import { Config } from "./config";
import {
  createCosmosBridgeWatcher,
  CosmwasmWatcherEvent,
  CosmwasmProofHandler,
} from "@src/services/cosmos.service";
import { DuckDb } from "./services/duckdb.service";
import { CosmosBlockOffset } from "./models/block-offset";
import { RelayCosmwasmData, TonWorkerJob } from "./worker";
import { BulkJobOptions, Queue } from "bullmq";
import {
  BridgeAdapter,
  createUpdateClientData,
  getAckPacketProofs,
  getPacketProofs,
  LightClientMaster,
} from "@oraichain/ton-bridge-contracts";
import { Tendermint37Client } from "@cosmjs/tendermint-rpc";
import { QueryClient } from "@cosmjs/stargate";
import { ExistenceProof } from "cosmjs-types/cosmos/ics23/v1/proofs";
import { getJobIdFromPacket, retry, sleep } from "./utils";
import { ACK } from "./dtos/packets/AckPacket";
import { OpenedContract, Sender } from "@ton/core";
import { TonClient, WalletContractV4 } from "@ton/ton";

//@ts-ignore
BigInt.prototype.toJSON = function () {
  return this.toString();
};

export class PacketProcessorArgs {
  cosmosBlockOffset: CosmosBlockOffset;
  cosmosProofHandler: CosmwasmProofHandler;
  walletContract: OpenedContract<WalletContractV4>;
  sender: Sender;
  tonClient: TonClient;
  lightClientMaster: OpenedContract<LightClientMaster>;
  bridgeAdapter: OpenedContract<BridgeAdapter>;
  pollingInterval: number;
}

export class PacketProcessor {
  cosmosBlockOffset: CosmosBlockOffset;
  cosmosProofHandler: CosmwasmProofHandler;
  walletContract: OpenedContract<WalletContractV4>;
  sender: Sender;
  tonClient: TonClient;
  lightClientMaster: OpenedContract<LightClientMaster>;
  bridgeAdapter: OpenedContract<BridgeAdapter>;
  pollingInterval: number;
  // Memory packets
  lock: boolean = false;
  pendingRelayPackets: (
    | TransferPacketWithBasicInfo
    | AckPacketWithBasicInfo
  )[] = [];
  pendingAckSuccessPackets: AckPacketWithBasicInfo[] = [];
  processingPackets: (TransferPacketWithBasicInfo | AckPacketWithBasicInfo)[] =
    [];

  constructor(args: PacketProcessorArgs) {
    this.cosmosBlockOffset = args.cosmosBlockOffset;
    this.cosmosProofHandler = args.cosmosProofHandler;
    this.walletContract = args.walletContract;
    this.sender = args.sender;
    this.tonClient = args.tonClient;
    this.lightClientMaster = args.lightClientMaster;
    this.bridgeAdapter = args.bridgeAdapter;
    this.pollingInterval = args.pollingInterval || 5000;
  }

  addPendingTransferPackets(transferPackets: TransferPacketWithBasicInfo[]) {
    if (transferPackets.length === 0) {
      return;
    }
    this.pendingRelayPackets.push(...transferPackets);
  }

  addPendingAckPackets(ackPackets: AckPacketWithBasicInfo[]) {
    if (ackPackets.length === 0) return;

    ackPackets.forEach((packet) => {
      if (packet.data.ack === ACK.Ok) {
        this.pendingAckSuccessPackets.push(packet);
      } else {
        this.pendingRelayPackets.push(packet);
      }
    });
  }

  async run() {
    while (true) {
      this.lock = true;
      const pendingPackets = this._popAllPendingRelayPackets();
      const pendingAckSuccessPacket = this._popAllPendingAckSuccessPackets();
      this.lock = false;
      this.processingPackets = [...pendingPackets, ...pendingAckSuccessPacket];
      if (pendingPackets.length === 0) {
        await sleep(this.pollingInterval);
        continue;
      }
      let minProvenHeight = this.getHeightLatestPackets([
        ...pendingPackets,
        ...pendingAckSuccessPacket,
      ]);
      const neededUpdateHeight = minProvenHeight + 1;
      const latestLightClientHeight =
        await this.lightClientMaster.getTrustedHeight();
      const finalUpdateHeight = Math.max(
        latestLightClientHeight,
        neededUpdateHeight
      );

      if (finalUpdateHeight === neededUpdateHeight) {
        // TODO: update light client
      } else if (finalUpdateHeight == latestLightClientHeight) {
        minProvenHeight = latestLightClientHeight - 1;
      }

      // Get proof from minProvenHeight
      while (this.processingPackets.length > 1) {
        const packet = this.processingPackets.shift();
        const data = packet.data;
      }
    }
  }

  private getHeightLatestPackets(packetWithHeight: { height: number }[]) {
    const allHeight = packetWithHeight.map((packet) => Number(packet.height));
    return Math.max(...allHeight);
  }

  private _popAllPendingRelayPackets() {
    const packets = this.pendingRelayPackets;
    this.pendingRelayPackets = [];
    this.lock = false;
    return packets;
  }

  private _popAllPendingAckSuccessPackets() {
    const packets = this.pendingAckSuccessPackets;
    this.pendingAckSuccessPackets = [];
    return packets;
  }

  getPendingRelayPackets() {
    return this.pendingRelayPackets;
  }

  getPendingAckSuccessPackets() {
    return this.pendingAckSuccessPackets;
  }

  getProcessingPackets() {
    return this.processingPackets;
  }
}

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
  // LISTEN ON THE PARSED_DATA FROM WATCHER
  cosmosWatcher.on(
    CosmwasmWatcherEvent.DATA,
    async (data: Packets & { offset: number }) => {
      const { transferPackets, ackPackets, offset } = data;
      const packets = [...transferPackets, ...ackPackets];
      // sort packets by orders
      packets.sort((a, b) => a.height - b.height);
      const lastPackets = packets[packets.length - 1];
      const provenHeight = lastPackets.height;
      const neededProvenHeight = provenHeight + 1;
      // Sometimes needProvenBlock have not been end yet.
      const updateLightClientData = await retry(
        () => {
          return createUpdateClientData(
            tonConfig.cosmosRpcUrl,
            neededProvenHeight
          );
        },
        3,
        2000
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
    }
  );

  return cosmosWatcher;
}
