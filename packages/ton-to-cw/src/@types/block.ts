import { Transaction } from "@ton/core";
import { BlockID } from "ton-lite-client";

export type StringHex = string;

export type TransactionWithBlockId = {
  tx: Transaction,
  blockId: BlockID
};
