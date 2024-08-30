import { SyncDataOptions } from "@oraichain/cosmos-rpc-sync";
import {
  AckPacketWithBasicInfo,
  TransferPacketWithBasicInfo,
} from "./@types/interfaces/cosmwasm";
import { Config } from "./config";
import {
  createCosmosBridgeWatcher,
  CosmosProofHandler,
} from "@src/services/cosmos.service";
import { DuckDb } from "./services/duckdb.service";
import { CosmosBlockOffset } from "./models/block-offset";
import { sleep } from "./utils";
import { ACK } from "./dtos/packets/AckPacket";
import { TonHandler } from "./services";
import { TransferPacket } from "./dtos/packets/TransferPacket";

//@ts-ignore
BigInt.prototype.toJSON = function () {
  return this.toString();
};

export class PacketProcessorArgs {
  cosmosBlockOffset: CosmosBlockOffset;
  cosmosProofHandler: CosmosProofHandler;
  tonHandler: TonHandler;
  pollingInterval: number;
}

export class PacketProcessor {
  cosmosBlockOffset: CosmosBlockOffset;
  cosmosProofHandler: CosmosProofHandler;
  tonHandler: TonHandler;

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
    this.tonHandler = args.tonHandler;
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
      try {
        this.lock = true;
        const pendingPackets = this._popAllPendingRelayPackets();
        const pendingAckSuccessPacket = this._popAllPendingAckSuccessPackets();
        this.lock = false;
        this.processingPackets = [
          ...pendingPackets,
          ...pendingAckSuccessPacket,
        ];
        if (pendingPackets.length === 0) {
          this.addPendingAckPackets(pendingAckSuccessPacket);
          await sleep(this.pollingInterval);
          continue;
        }
        logger.info(
          `PacketProcessor:Processing ${this.processingPackets.length} packets`
        );
        let heightForQueryProof = this.getHeightLatestPackets([
          ...pendingPackets,
          ...pendingAckSuccessPacket,
        ]);
        const neededUpdateHeight = heightForQueryProof + 1;
        const latestLightClientHeight =
          await this.tonHandler.getLatestLightClientHeight();
        const finalUpdateHeight = Math.max(
          latestLightClientHeight,
          neededUpdateHeight
        );

        if (finalUpdateHeight === neededUpdateHeight) {
          const clientData =
            await this.cosmosProofHandler.createUpdateClientData(
              finalUpdateHeight
            );
          await this.tonHandler.updateLightClient(clientData);
        } else if (finalUpdateHeight == latestLightClientHeight) {
          heightForQueryProof = latestLightClientHeight - 1;
        }
        // FIXME: This may reach rate limit if the number of packets is too large
        const packetProof = await Promise.all(
          this.processingPackets.map((packet) => {
            if (packet.data instanceof TransferPacket) {
              return this.cosmosProofHandler.getPacketProofs(
                heightForQueryProof,
                BigInt(packet.data.seq)
              );
            }
            return this.cosmosProofHandler.getAckPacketProofs(
              heightForQueryProof,
              BigInt(packet.data.seq)
            );
          })
        );

        if (packetProof.length !== this.processingPackets.length) {
          throw new Error(
            "Packet proof length not match with processing packets length"
          );
        }

        // Get proof from minProvenHeight
        while (this.processingPackets.length > 1) {
          const packet = this.processingPackets.shift();
          const proof = packetProof.shift();
          const data = packet.data;
          // TODO: should change to highload_wallet contract
          await this.tonHandler.sendPacket(finalUpdateHeight, data, proof);
          logger.info(
            `PacketProcessor:Send packet ${data.getName()} to TON successfully`
          );
        }
        await this.cosmosBlockOffset.updateBlockOffset(finalUpdateHeight);
      } catch (error) {
        logger.error(`PacketProcessor:Error when run:${error}`);
        throw new Error(`PacketProcessor:Error when run:${error}`);
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
