import {
  AckPacketWithBasicInfo,
  TransferPacketWithBasicInfo,
} from "./@types/interfaces/cosmwasm";
import { CosmosProofHandler } from "@src/services/cosmos.service";
import { CosmosBlockOffset } from "./models/block-offset";
import { sleep } from "./utils";
import { ACK } from "./dtos/packets/AckPacket";
import { TonHandler } from "./services";
import { TransferPacket } from "./dtos/packets/TransferPacket";
import { Logger } from "winston";
import { ExistenceProof } from "cosmjs-types/cosmos/ics23/v1/proofs";

//@ts-ignore
BigInt.prototype.toJSON = function () {
  return this.toString();
};

export class PacketProcessorArgs {
  cosmosBlockOffset: CosmosBlockOffset;
  cosmosProofHandler: CosmosProofHandler;
  tonHandler: TonHandler;
  pollingInterval: number;
  logger: Logger;
}

export class PacketProcessor {
  cosmosBlockOffset: CosmosBlockOffset;
  cosmosProofHandler: CosmosProofHandler;
  tonHandler: TonHandler;
  pollingInterval: number;
  logger: Logger;
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
    this.logger = args.logger;
  }

  addPendingTransferPackets(transferPackets: TransferPacketWithBasicInfo[]) {
    if (transferPackets.length === 0) {
      return;
    }
    this.pendingRelayPackets.push(...transferPackets);
    this.logger.info(
      `PacketProcessor:Added ${transferPackets.length} TransferPackets`
    );
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
    this.logger.info(`PacketProcessor:Added ${ackPackets.length} AckPackets`);
  }

  async run() {
    this.logger.info("PacketProcessor:Start running");
    while (true) {
      try {
        this.lock = true;
        this.logger.debug(
          `PacketProcessor:Before pop all pending packets, ${JSON.stringify(this.getPendingRelayPackets())}`
        );
        this.logger.debug(
          `PacketProcessor:Before pop all pending packets, ${JSON.stringify(this.getPendingAckSuccessPackets())}`
        );
        const pendingPackets = this._popAllPendingRelayPackets();
        const pendingAckSuccessPacket = this._popAllPendingAckSuccessPackets();
        this.logger.debug(
          `PacketProcessor:After pop all pending packets, ${JSON.stringify(this.getPendingRelayPackets())}`
        );
        this.logger.debug(
          `PacketProcessor:After pop all pending packets, ${JSON.stringify(this.getPendingAckSuccessPackets())}`
        );

        this.lock = false;
        this.processingPackets = [
          ...pendingPackets,
          ...pendingAckSuccessPacket,
        ];
        if (pendingPackets.length === 0) {
          this.addPendingAckPackets(pendingAckSuccessPacket);
          this.logger.info("PacketProcessor:No pending packets");
          await sleep(this.pollingInterval);
          continue;
        }
        this.logger.info(
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
        this.logger.debug(
          `PacketProcessor:heightForQueryProof ${heightForQueryProof}`
        );
        this.logger.debug(
          `PacketProcessor:neededUpdateHeight ${neededUpdateHeight}`
        );
        this.logger.debug(
          `PacketProcessor:latestLightClientHeight ${latestLightClientHeight}`
        );

        if (
          finalUpdateHeight === neededUpdateHeight &&
          finalUpdateHeight !== latestLightClientHeight
        ) {
          this.logger.info(
            `PacketProcessor:Update light client to ${finalUpdateHeight}`
          );
          const clientData =
            await this.cosmosProofHandler.createUpdateClientData(
              finalUpdateHeight
            );
          await this.tonHandler.updateLightClient(clientData);
        } else if (finalUpdateHeight == latestLightClientHeight) {
          heightForQueryProof = latestLightClientHeight - 1;
          this.logger.info(
            `PacketProcessor:Light client height is larger than neededUpdateHeight. Update heightForQueryProof ${heightForQueryProof}`
          );
        }
        // FIXME: This may reach rate limit if the number of packets is too large
        this.logger.info(
          `PacketProcessor:Get proofs at ${heightForQueryProof}`
        );
        this.logger.debug(
          "PacketProcessor:packet.data" + JSON.stringify(this.processingPackets)
        );
        const serializedProofs = await Promise.allSettled(
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

        const packetProofs = serializedProofs.map((proofs) => {
          if (proofs.status === "rejected") {
            return [];
          }
          return proofs.value.map((proof) => {
            if (proof) return ExistenceProof.fromJSON(proof);
          });
        });

        if (packetProofs.length !== this.processingPackets.length) {
          throw new Error(
            "PacketProcessor:Packet proof length not match with processing packets length"
          );
        }

        // Get proof from minProvenHeight
        while (this.processingPackets.length > 0) {
          const packet = this.processingPackets.shift();
          this.logger.debug(`PacketProcessor:packet.data ${packet.data}`);
          const proof = packetProofs.shift();
          const data = packet.data;
          // TODO: should change to highload_wallet contract
          if (proof.length === 0) {
            this.logger.error(
              `PacketProcessor:NotFound proof for ${data.getName()} at ${packet.hash}`
            );
            continue;
          }
          await this.tonHandler.sendPacket(finalUpdateHeight, data, proof);
          this.logger.info(
            `PacketProcessor:Send packet ${data.getName()} to TON successfully`
          );
        }
        await this.cosmosBlockOffset.updateBlockOffset(finalUpdateHeight);
        this.logger.info(
          `PacketProcessor:Update block offset to ${finalUpdateHeight}`
        );
      } catch (error) {
        this.logger.error(`PacketProcessor:Error when run`, error);
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
