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

export async function createCwToTonRelayerWithConfig(config: Config) {
  const duckDb = await DuckDb.getInstance(config.connectionString);
  const cosmosBlockOffset = new CosmosBlockOffset(duckDb);
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
  });

  const watcher = await createCosmosBridgeWatcher(config);
  packetProcessor.run();
  watcher.on(
    CosmwasmWatcherEvent.DATA,
    async (data: Packets & { offset: number }) => {
      const { transferPackets, ackPackets } = data;
      packetProcessor.addPendingTransferPackets(transferPackets);
      packetProcessor.addPendingAckPackets(ackPackets);
    }
  );

  return watcher;
}

export * from "./@types";
export type { Config } from "./config";
export * from "./utils";
export * from "./models/block-offset";
export * from "./worker";
