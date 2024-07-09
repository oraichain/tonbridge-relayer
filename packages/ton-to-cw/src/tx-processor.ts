import {
  TonbridgeBridgeInterface,
  TonbridgeValidatorInterface,
} from "@oraichain/tonbridge-contracts-sdk";
import { Cell, address, loadTransaction } from "@ton/core";
import { StringHex, TransactionWithBlockId } from "src/@types/block";
import { LiteClient } from "ton-lite-client";
import TonBlockProcessor from "./block-processor";
import { setTimeout } from "timers/promises";

export default class TonTxProcessor {
  private limitPerTxQuery = 100; // limit per query
  private maxUnprocessTxs = 500; // this makes sure we dont process too many txs at once causing delays
  private initiallatestProcessedTxHash = "";

  constructor(
    protected readonly validator: TonbridgeValidatorInterface,
    protected readonly bridge: TonbridgeBridgeInterface,
    protected readonly liteClient: LiteClient,
    protected readonly blockProcessor: TonBlockProcessor,
    protected readonly jettonBridgeAddress: string,
    protected latestProcessedTxHash: StringHex = ""
  ) {
    this.initiallatestProcessedTxHash = latestProcessedTxHash;
  }

  private async queryUnprocessedTransactions() {
    const transactions: TransactionWithBlockId[] = [];
    const jettonAddr = address(this.jettonBridgeAddress);
    const masterchainInfo = await this.liteClient.getMasterchainInfo();
    const accState = await this.liteClient.getAccountState(
      jettonAddr,
      masterchainInfo.last
    );
    let offset = {
      hash: accState.lastTx.hash.toString(16),
      lt: accState.lastTx.lt.toString(10),
    };
    while (true) {
      // workaround. Bug of loadTransaction that causes the prev trans hash to be incomplete
      // workaround. Bug of loadTransaction that causes the prev trans hash to be incomplete
      if (offset.hash.length === 63) {
        offset.hash = "0" + offset.hash;
        console.log("new offset hash: ", offset.hash);
      }
      const rawTxs = await this.liteClient.getAccountTransactions(
        jettonAddr,
        offset.lt,
        Buffer.from(offset.hash, "hex"),
        this.limitPerTxQuery
      );
      const txs = Cell.fromBoc(rawTxs.transactions).map((cell, i) => ({
        tx: loadTransaction(cell.asSlice()),
        blockId: rawTxs.ids[i],
      }));

      if (!this.latestProcessedTxHash) {
        transactions.push(...txs);
        if (transactions.length > 0)
          this.latestProcessedTxHash = transactions[0].tx
            .hash()
            .toString("hex");
        break;
      }

      const indexOf = txs.findIndex(
        (tx) => tx.tx.hash().toString("hex") === this.latestProcessedTxHash
      );
      if (indexOf === -1) {
        transactions.push(...txs);
        // increase offset and continue querying txs until we find our oldest transaction that we can remember
        offset = {
          hash: txs[txs.length - 1].tx.prevTransactionHash.toString(16),
          lt: txs[txs.length - 1].tx.prevTransactionLt.toString(10),
        };
        console.log("offset: ", offset);
        // console.log("txhash bigint: ", txs[txs.length - 1].tx.prevTransactionHash)
        await setTimeout(2000);
        continue;
      } else {
        // only push more txs if the latest is not the first index to avoid redundancy
        if (indexOf > 0) transactions.push(...txs.slice(0, indexOf));
        if (transactions.length > 0)
          this.latestProcessedTxHash = transactions[0].tx
            .hash()
            .toString("hex");
        break;
      }
    }
    return transactions;
  }

  async processTransactions() {
    try {
      const transactions = await this.queryUnprocessedTransactions();
      console.log("unprocessed transactions: ", transactions.length);
      // since we query our transactions from latest to earliest -> process the latest txs first
      for (const tx of transactions) {
        try {
          await this.processTransaction(tx);
        } catch (error) {
          console.error("error processing transaction: ", error);
        }
      }
    } catch (error) {
      // reset latestProcessedTxHash so we can start over to prevent missed txs in case of having errors
      console.error("error querying unprocessed transactions: ", error);
      this.latestProcessedTxHash = this.initiallatestProcessedTxHash;
      return;
    }
  }

  async processTransaction(tx: TransactionWithBlockId) {
    const txHashHex = tx.tx.hash().toString("hex");
    const isTxProcessed = await this.bridge.isTxProcessed({
      txHash: txHashHex,
    });
    if (isTxProcessed) return;

    // it means this tx is in a shard block -> we verify shard blocks along with materchain block
    if (tx.blockId.workchain !== -1) {
      await this.blockProcessor.verifyShardBlocks(tx.blockId);
    } else {
      await this.blockProcessor.verifyMasterchainBlockByBlockId(tx.blockId);
    }

    const jettonAddr = address(this.jettonBridgeAddress);
    const txWithProof = await this.liteClient.getAccountTransaction(
      jettonAddr,
      tx.tx.lt.toString(10),
      tx.blockId
    );

    await this.bridge.readTransaction({
      txBoc: txWithProof.transaction.toString("hex"),
      txProof: txWithProof.proof.toString("hex"),
      validatorContractAddr: this.validator.contractAddress,
    });

    console.log(
      `Verified tx with hash ${txHashHex} in block ${tx.blockId.seqno} successfully`
    );
  }
}
