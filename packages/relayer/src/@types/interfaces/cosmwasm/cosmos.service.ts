import { Txs } from "@oraichain/cosmos-rpc-sync";
import { BasicTxInfo } from "@src/@types/common";
import { Cell } from "@ton/core";

export interface ICosmwasmParser<T> {
  processChunk(chunk: Txs): T;
}

export type Packet = {
  data: Cell;
} & BasicTxInfo;

export type Packets = {
  packets: Packet[];
};
