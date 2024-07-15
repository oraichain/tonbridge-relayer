import { Network } from "@orbs-network/ton-access";
import { Config, TonDefaultConfig } from "./config";
import { createTonWallet } from "./utils";
import {
  BridgeAdapter,
  LightClientMaster,
} from "@oraichain/ton-bridge-contracts";
import { Address } from "@ton/core";
import { createTonWorker } from "./worker";
import { relay } from "./relay";
import { ConnectionOptions, Queue } from "bullmq";

export async function createCwToTonRelayerWithConfig(config: Config) {
  const connection: ConnectionOptions = {
    host: config.redisHost,
    port: config.redisPort,
    retryStrategy: function (times: number) {
      return Math.max(Math.min(Math.exp(times), 20000), 1000);
    },
  };
  const tonQueue = new Queue("ton", {
    connection,
  });
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
  const lightClientMaster = LightClientMaster.createFromAddress(
    Address.parse(TonDefaultConfig.cosmosLightClientMaster)
  );
  const bridgeAdapter = BridgeAdapter.createFromAddress(
    Address.parse(TonDefaultConfig.tonBridge)
  );
  const lightClientMasterContract = tonClient.open(lightClientMaster);
  const bridgeAdapterContract = tonClient.open(bridgeAdapter);
  // Run workers
  const tonWorker = createTonWorker(
    connection,
    walletContract,
    walletContract.sender(key.secretKey),
    tonClient,
    lightClientMasterContract,
    bridgeAdapterContract
  );
  tonWorker.run();
  tonWorker.on("completed", async (job) => {
    console.log("Job completed", job.id);
  });
  return await relay(tonQueue, config);
}

export * from "./@types";
export type { Config } from "./config";
export * from "./utils";
export * from "./models/cosmwasm/block-offset";
export * from "./worker";
