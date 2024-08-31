import { Network } from "@orbs-network/ton-access";
import { Config, TonDefaultConfig } from "./config";
import { createTonWallet } from "./utils";
import {
  BridgeAdapter,
  LightClientMaster,
} from "@oraichain/ton-bridge-contracts";
import { Address } from "@ton/core";
import { PacketProcessor } from "./PacketProcessor";
import {
  CosmosProofHandler,
  CosmwasmWatcherEvent,
  createCosmosBridgeWatcher,
  DuckDb,
  TonHandler,
} from "./services";
import { Packets } from "./@types";
import { CosmosBlockOffset } from "./models";
import { Logger } from "winston";

export async function createCwToTonRelayerWithConfig(
  config: Config,
  injectLogger: Logger
) {
  const logger = injectLogger;
  const duckDb = await DuckDb.getInstance(config.connectionString);
  const cosmosBlockOffset = new CosmosBlockOffset(duckDb);
  await cosmosBlockOffset.createTable();
  const startOffset = await cosmosBlockOffset.mayLoadBlockOffset(
    config.syncBlockOffSet
  );
  logger.info(`CW_TO_TON start at: ${startOffset}`);
  if (config.wasmBridge === "") {
    throw new Error("WASM_BRIDGE is required");
  }
  const {
    walletContract,
    client: tonClient,
    key,
  } = await createTonWallet(
    config.tonMnemonic,
    process.env.NODE_ENV as Network,
    config.tonCenter,
    config.tonApiKey
  );
  const lightClientMaster = tonClient.open(
    LightClientMaster.createFromAddress(
      Address.parse(TonDefaultConfig.cosmosLightClientMaster)
    )
  );
  const bridgeAdapter = tonClient.open(
    BridgeAdapter.createFromAddress(Address.parse(TonDefaultConfig.tonBridge))
  );
  const cosmosProofHandler = await CosmosProofHandler.create(
    config.cosmosRpcUrl,
    config.wasmBridge
  );
  const tonHandler = new TonHandler(
    walletContract,
    tonClient,
    walletContract.sender(key.secretKey),
    lightClientMaster,
    bridgeAdapter,
    config.syncInterval
  );
  const packetProcessor = new PacketProcessor({
    cosmosBlockOffset,
    cosmosProofHandler,
    tonHandler,
    pollingInterval: config.syncInterval,
    logger,
  });
  const watcher = await createCosmosBridgeWatcher(config);
  packetProcessor.run();

  watcher.on(
    CosmwasmWatcherEvent.DATA,
    async (data: Packets & { offset: number }) => {
      const { transferPackets, ackPackets, offset } = data;
      logger.info(`CosmosWatcher synced at block: ${offset}`);
      if (transferPackets && transferPackets.length > 0) {
        logger.info(`Found ${transferPackets.length} TransferPackets`);
        packetProcessor.addPendingTransferPackets(transferPackets);
      }
      if (ackPackets && ackPackets.length > 0) {
        logger.info(`Found ${ackPackets.length} AckPackets`);
        packetProcessor.addPendingAckPackets(ackPackets);
      }
    }
  );
  return watcher;
}

export * from "./@types";
export type { Config } from "./config";
export * from "./utils";
export * from "./models/block-offset";
export * from "./worker";
