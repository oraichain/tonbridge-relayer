import dotenv from "dotenv";
import {
  BlockHeaderTonWeb,
  BlockShardsTonWeb,
  StringBase64,
} from "./@types/block";
import TonBlockProcessor from "./block-processor";
import {
  TonbridgeValidatorInterface,
  TonbridgeBridgeInterface,
} from "@oraichain/tonbridge-contracts-sdk";
import { LiteClient } from "ton-lite-client";
import TonWeb from "tonweb";
import TonTxProcessor from "./tx-processor";
import { setTimeout } from "timers/promises";
dotenv.config();

export async function relay(data: {
  readonly validator: TonbridgeValidatorInterface;
  readonly bridge: TonbridgeBridgeInterface;
  readonly liteClient: LiteClient;
  readonly jettonBridgeAddress: string;
  readonly tonweb: TonWeb;
  readonly tonCenterV3Api?: string;
  readonly oldestProcessedTxHash?: StringBase64;
}) {
  const processInterval = 3000; // 3s
  const {
    validator,
    bridge,
    liteClient,
    jettonBridgeAddress,
    tonweb,
    tonCenterV3Api,
    oldestProcessedTxHash,
  } = data;
  const blockProcessor = new TonBlockProcessor(validator, liteClient, tonweb);
  const txProcessor = new TonTxProcessor(
    validator,
    bridge,
    liteClient,
    jettonBridgeAddress,
    blockProcessor,
    tonCenterV3Api,
    oldestProcessedTxHash
  );

  try {
    while (true) {
      try {
        console.log("before processing key block and txs");
        const latestMasterchainBlock = await liteClient.getMasterchainInfo();
        const { rawBlockData } = await TonBlockProcessor.queryKeyBlock(
          latestMasterchainBlock.last.seqno,
          liteClient
        );
        await blockProcessor.verifyMasterchainKeyBlock(rawBlockData.id.seqno);
        await txProcessor.processTransactions();
      } catch (error) {
        console.error("error processing block and tx: ", error);
      }
      await setTimeout(processInterval);
    }
  } catch (error) {
    console.error("Error in subcribing blocks: ", error);
  }
}
