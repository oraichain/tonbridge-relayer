import { Cell, address, loadTransaction } from "@ton/core";
import { TransactionWithBlockId } from "../@types/block";
import { LiteClient } from "ton-lite-client";
import { TonbridgeBridgeInterface } from "@oraichain/tonbridge-contracts-sdk";
import TonBlockProcessor from "../block-processor";

export default class PacketCleaner {
  private readonly limitPerTxQuery = 100;
  private readonly maxSearchedTxs = 1000;
  constructor(
    protected readonly bridge: TonbridgeBridgeInterface,
    public readonly liteClient: LiteClient,
    protected readonly blockProcessor: TonBlockProcessor,
    public readonly jettonBridgeAddress: string,
    private readonly sequences: number[]
  ) {}

  async clearPackets() {
    try {
      const timeoutTransactions = await this.queryTransactionsHavingSequences();
      for (const tx of timeoutTransactions) {
        try {
          await this.processTimeoutTransaction(tx);
        } catch (error) {
          console.error("error clearing a packet: ", error);
        }
      }
    } catch (error) {
      console.error("Error querying transactions having sequences: ", error);
    }
  }

  private async queryTransactionsHavingSequences() {
    if (this.sequences.length === 0) return [];
    let transactions: TransactionWithBlockId[] = [];
    let txCount = 0;
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
      txCount += txs.length;
      for (const tx of txs) {
        const messages = tx.tx.outMessages.values();
        const txHash = tx.tx.hash().toString("hex");
        for (const message of messages) {
          if (message.info.type !== "external-out") continue;
          const body = message.body;
          const slice = body.beginParse();
          const magicNumber = slice.loadUint(32);
          // TODO: move magic numbers into a common package for reusability
          // crc32("src::timeout_send_packet")
          if (magicNumber !== 0x540ce379) continue;
          const packetSequence = slice.loadUint(64);
          // found the matching packet sequences. Add it in the list to process further
          if (this.sequences.includes(packetSequence)) transactions.push(tx);
        }
      }
      if (txCount > this.maxSearchedTxs) break;
    }
    return transactions;
  }

  private async processTimeoutTransaction(tx: TransactionWithBlockId) {
    const txHash = tx.tx.hash().toString("hex");
    try {
      // it means this tx is in a shard block -> we verify shard blocks along with materchain block
      if (tx.blockId.workchain !== -1) {
        await this.blockProcessor.verifyShardBlocks(tx.blockId);
      } else {
        await this.blockProcessor.verifyMasterchainBlockByBlockId(tx.blockId);
      }
    } catch (error) {
      console.log(
        `Cannot verify blocks related to transaction ${txHash} because: ${error}`
      );
      return;
    }

    const jettonAddr = address(this.jettonBridgeAddress);
    const txWithProof = await this.liteClient.getAccountTransaction(
      jettonAddr,
      tx.tx.lt.toString(10),
      tx.blockId
    );
    const latestMasterchain = await this.liteClient.getMasterchainInfo();
    const masterchainHeader = await this.liteClient.getBlockHeader(
      latestMasterchain.last
    );

    await this.bridge.processTimeoutSendPacket({
      masterchainHeaderProof: masterchainHeader.headerProof.toString("hex"),
      txBoc: txWithProof.transaction.toString("hex"),
      txProofUnreceived: txWithProof.proof.toString("hex"),
    });
  }
}
