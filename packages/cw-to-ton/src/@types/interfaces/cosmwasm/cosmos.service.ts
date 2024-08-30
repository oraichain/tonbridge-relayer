import { Txs } from "@oraichain/cosmos-rpc-sync";
import { BasicTxInfo } from "@src/@types/common";
import { AckPacket } from "@src/dtos/packets/AckPacket";
import { TransferPacket } from "@src/dtos/packets/TransferPacket";

export interface ICosmwasmParser<T> {
  processChunk(chunk: Txs): T;
}

export type TransferPacketWithBasicInfo = {
  data: TransferPacket;
} & BasicTxInfo;

export type AckPacketWithBasicInfo = {
  data: AckPacket;
} & BasicTxInfo;

export type Packets = {
  transferPackets: TransferPacketWithBasicInfo[];
  ackPackets: AckPacketWithBasicInfo[];
};
