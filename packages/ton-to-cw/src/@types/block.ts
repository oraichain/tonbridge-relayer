import { Transaction } from "@ton/core";
import { BlockID } from "ton-lite-client";

export type StringBase64 = string;

export type TransactionWithBlockId = {
  tx: Transaction,
  blockId: BlockID
};
