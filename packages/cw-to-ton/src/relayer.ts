import { Logger } from "winston";
import { Packets } from "./@types";
import { PacketProcessor } from "./packet-processor";
import {
  CosmosProofHandler,
  CosmwasmWatcher,
  CosmwasmWatcherEvent,
  createCosmosBridgeWatcher,
  DuckDb,
  TonHandler,
} from "./services";
import { Config } from "./config";
import { CosmosBlockOffset } from "./models";
import { Address } from "@ton/core";
import {
  BridgeAdapter,
  LightClientMaster,
} from "@oraichain/ton-bridge-contracts";
import { createTonWallet, retry } from "./utils";
import { Network } from "@orbs-network/ton-access";

export class RelayerToTonBuilder {
  config: Config;
  logger: Logger;

  constructor() {}

  withConfig(config: Config) {
    this.config = config;
    return this;
  }

  withLogger(logger: Logger) {
    this.logger = logger;
    return this;
  }

  async build(): Promise<RelayerToTon> {
    if (!this.config) {
      throw new Error("Config is required");
    }
    if (!this.logger) {
      throw new Error("Logger is required");
    }
    if (this.config.wasmBridge === "") {
      throw new Error("WASM_BRIDGE is required");
    }
    const logger = this.logger;
    logger.info("Building RelayerToTon...");
    const duckDb = await DuckDb.getInstance(this.config.connectionString);
    const cosmosBlockOffset = new CosmosBlockOffset(duckDb);
    await cosmosBlockOffset.createTable();
    const {
      walletContract,
      client: tonClient,
      key,
    } = await createTonWallet(
      this.config.tonMnemonic,
      process.env.NODE_ENV as Network,
      this.config.tonCenter,
      this.config.tonApiKey
    );
    const lightClientMaster = tonClient.open(
      LightClientMaster.createFromAddress(
        Address.parse(this.config.cosmosLightClientMaster)
      )
    );
    const bridgeAdapter = tonClient.open(
      BridgeAdapter.createFromAddress(Address.parse(this.config.tonBridge))
    );
    const cosmosProofHandler = await CosmosProofHandler.create(
      this.config.cosmosRpcUrl,
      this.config.wasmBridge
    );
    const tonHandler = new TonHandler(
      walletContract,
      tonClient,
      walletContract.sender(key.secretKey),
      lightClientMaster,
      bridgeAdapter,
      logger,
      this.config.syncInterval
    );
    const packetProcessor = new PacketProcessor({
      cosmosBlockOffset,
      cosmosProofHandler,
      tonHandler,
      pollingInterval: this.config.syncInterval,
      logger,
    });
    const watcher = await createCosmosBridgeWatcher(this.config);
    return new RelayerToTon(watcher, packetProcessor, this.logger);
  }
}

export class RelayerToTon {
  cosmosWatcher: CosmwasmWatcher<Packets>;
  packetProcessor: PacketProcessor;
  logger: Logger;

  constructor(
    cosmosWatcher: CosmwasmWatcher<Packets>,
    packetProcessor: PacketProcessor,
    logger: Logger
  ) {
    this.cosmosWatcher = cosmosWatcher;
    this.packetProcessor = packetProcessor;
    this.logger = logger;
  }

  run() {
    this.logger.info("RelayerToTon:Start running");
    this.cosmosWatcher.on(
      CosmwasmWatcherEvent.DATA,
      async (data: Packets & { offset: number }) => {
        const { transferPackets, ackPackets, offset } = data;
        this.logger.info(`CosmosWatcher synced at block: ${offset}`);
        await retry(async () => {
          if (this.packetProcessor.lock) {
            throw new Error("PacketProcessor is locked");
          }
          return;
        });
        if (transferPackets && transferPackets.length > 0) {
          this.logger.info(`Found ${transferPackets.length} TransferPackets`);
          this.packetProcessor.addPendingTransferPackets(transferPackets);
        }
        if (ackPackets && ackPackets.length > 0) {
          this.logger.info(`Found ${ackPackets.length} AckPackets`);
          this.packetProcessor.addPendingAckPackets(ackPackets);
        }
      }
    );
    this.cosmosWatcher.start();
    this.packetProcessor.run();
  }
}
