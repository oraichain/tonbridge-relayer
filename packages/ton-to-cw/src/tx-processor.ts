import {
  TonbridgeBridgeInterface,
  TonbridgeValidatorInterface,
} from "@oraichain/tonbridge-contracts-sdk";
import { Address } from "@ton/core";
import { StringBase64 } from "src/@types/block";
import { LiteClient } from "ton-lite-client";
import TonBlockProcessor from "./block-processor";
import { setTimeout } from "timers/promises";

export default class TonTxProcessor {
  protected unprocessedTxs: any[] = [];

  constructor(
    protected readonly validator: TonbridgeValidatorInterface,
    protected readonly bridge: TonbridgeBridgeInterface,
    protected readonly liteClient: LiteClient,
    protected readonly jettonBridgeAddress: string,
    protected readonly blockProcessor: TonBlockProcessor,
    protected readonly tonCenterV3Api: string = "https://toncenter.com/api/v3",
    protected latestProcessedTxHash: StringBase64 = ""
  ) {}

  private async queryUnprocessedTransactions() {
    let offset = 0;
    let limit = 2;
    let transactions: any[] = [];
    let newTransactions: any[] = [];
    while (true) {
      const result = await fetch(
        `${this.tonCenterV3Api}/transactions?account=${this.jettonBridgeAddress}&limit=${limit}&offset=${offset}&sort=desc`
      ).then((data) => data.json());
      if (!result.transactions) {
        await setTimeout(2000);
        continue;
      }
      const tempTransactions: any[] = result.transactions;
      console.log(
        "result transactions: ",
        result.transactions.map((tx) => tx.hash)
      );
      console.log("lastest processed tx hash: ", this.latestProcessedTxHash);

      if (!this.latestProcessedTxHash) {
        transactions.push(...tempTransactions);
        if (transactions.length > 0)
          this.latestProcessedTxHash = transactions[0].hash;
        break;
      }

      const indexOf = tempTransactions.findIndex(
        (tx) => tx.hash === this.latestProcessedTxHash
      );
      if (indexOf === -1) {
        newTransactions.push(...tempTransactions);
        // increase offset and continue querying txs until we find our oldest transaction that we can remember
        offset += limit;
        await setTimeout(2000);
        continue;
      } else {
        // only push more txs if the latest is not the first index to avoid redundancy
        if (indexOf > 0)
          newTransactions.push(...tempTransactions.slice(0, indexOf));
        transactions.unshift(...newTransactions.reverse());
        if (transactions.length > 0)
          this.latestProcessedTxHash = transactions[0].hash;
        break;
      }
    }
    return transactions;
  }

  async processTransactions() {
    const transactions = await this.queryUnprocessedTransactions();
    console.log("unprocessed transactions: ", transactions.length);
    // since we query our transactions from latest to earliest -> process the last txs first
    for (let i = transactions.length - 1; i >= 0; i--) {
      const tx = transactions[i];
      try {
        await this.processTransaction(tx);
      } catch (error) {
        console.log("error processing transaction: ", error);
      }
    }
  }

  async processTransaction(tx: any) {
    const { block_ref, mc_block_seqno, hash, lt } = tx;
    console.log("tx data: ", block_ref, mc_block_seqno, hash, lt);
    const shardInfo = await this.liteClient.lookupBlockByID(block_ref);
    const transaction = await this.liteClient.getAccountTransaction(
      Address.parse(this.jettonBridgeAddress),
      lt,
      shardInfo.id
    );

    const isTxProcessed = await this.bridge.isTxProcessed({
      txHash: Buffer.from(hash, "base64").toString("hex"),
    });
    if (isTxProcessed) {
      this.latestProcessedTxHash = hash;
      return;
    }

    const isShardVerified = await this.validator.isVerifiedBlock({
      rootHash: shardInfo.id.rootHash.toString("hex"),
    });
    // try verifying required blocks first before processing the transaction
    if (!isShardVerified) {
      await this.blockProcessor.verifyMasterchainBlock(mc_block_seqno);
      await this.blockProcessor.verifyShardBlocks(
        block_ref.workchain,
        block_ref.seqno,
        block_ref.shard
      );
    }

    // FIXME: fix the opcode
    await this.bridge.readTransaction({
      txBoc: transaction.transaction.toString("hex"),
      txProof: transaction.proof.toString("hex"),
      validatorContractAddr: this.validator.contractAddress,
      opcode:
        "0000000000000000000000000000000000000000000000000000000000000001",
    });

    console.log(
      `Verified tx with hash ${hash} in block ${transaction.id.seqno} successfully`
    );
  }
}
