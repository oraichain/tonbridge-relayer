import tonWeb from "tonweb";
import dotenv from "dotenv";
import CustomInMemoryBlockStorage from "./block-storage";
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
  const maxCachedBlockSize = 50;
  const pruneInterval = 30000; // 30s
  const processInterval = 5000; // 5s
  const {
    validator,
    bridge,
    liteClient,
    jettonBridgeAddress,
    tonweb,
    tonCenterV3Api,
    oldestProcessedTxHash,
  } = data;
  const blockStorage = new CustomInMemoryBlockStorage(
    logFunction,
    maxCachedBlockSize
  );
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
  
  // block sub for updating keyblocks
  const blockSub = new tonWeb.BlockSubscription(
    tonweb.provider,
    blockStorage,
    (blockHeader: BlockHeaderTonWeb, blockShards?: BlockShardsTonWeb) =>
      onBlock(blockProcessor, blockHeader, blockShards),
    { mcInterval: 3000 }
  );
  let pruneIntervalTimeout: NodeJS.Timeout;
  try {
    blockSub.start();
    pruneIntervalTimeout = setInterval(
      () => blockStorage.pruneStoredBlocks(),
      pruneInterval
    );
    while (true) {
      try {
        console.log("before processing key block and txs");
        await blockProcessor.processKeyBlock();
        await txProcessor.processTransactions();
      } catch (error) {
        console.error("error processing block and tx: ", error);
      }
      await setTimeout(processInterval);
    }
  } catch (error) {
    console.error("Error in subcribing blocks: ", error);
    blockSub.stop();
    clearInterval(pruneIntervalTimeout);
  }
}

const logFunction = (message: string) => {
  // console.log("message: ", message);
};

const onBlock = async (
  blockProcessor: TonBlockProcessor,
  blockHeader: BlockHeaderTonWeb,
  blockShards?: BlockShardsTonWeb
): Promise<void> => {
  // console.log("block header: ", blockHeader);
  // console.log("block shard: ", blockShards);
  await processBlockHeader(blockProcessor, {
    workchain: blockHeader.id.workchain,
    seqno: blockHeader.id.seqno,
    isKeyBlock: blockHeader.is_key_block,
  });
};

const processBlockHeader = async (
  blockProcessor: TonBlockProcessor,
  blockId: { workchain: number; seqno: number; isKeyBlock: boolean }
) => {
  switch (blockId.workchain) {
    case -1:
      return processMasterchainHeader(
        blockProcessor,
        blockId.seqno,
        blockId.isKeyBlock
      );
    case 0:
      // no need to care about shard blocks unless we have new transactions that are from our bridge jetton
      break;
    default:
      throw new Error(`Workchain ${blockId.workchain} not supported`);
  }
};

const processMasterchainHeader = async (
  blockProcessor: TonBlockProcessor,
  seqno: number,
  isKeyBlock: boolean
) => {
  if (isKeyBlock) {
    // always verify new keyblocks
    blockProcessor.keyBlockQueue.push(() =>
      blockProcessor.verifyMasterchainKeyBlock(seqno)
    );
  } else {
    console.log("Ignore normal masterchain blocks");
  }
};
