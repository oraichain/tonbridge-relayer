import { TonDefaultConfig } from "./config";
import { Address } from "@ton/core";
import {
  BridgeAdapter,
  LightClientMaster,
} from "@oraichain/ton-bridge-contracts";
import { ConnectionOptions, Queue } from "bullmq";
import { createTonWorker } from "./worker";
import { createTonWallet } from "./utils";
import { Network } from "@orbs-network/ton-access";
import { relay } from "./relay";

const connection: ConnectionOptions = {
  host: TonDefaultConfig.redisHost,
  port: TonDefaultConfig.redisPort,
  retryStrategy: function (times: number) {
    return Math.max(Math.min(Math.exp(times), 20000), 1000);
  },
};

const tonQueue = new Queue("ton", {
  connection,
});

(async () => {
  // Setup All Client
  // TON
  const {
    walletContract,
    client: tonClient,
    key,
  } = await createTonWallet(
    TonDefaultConfig.tonMnemonic,
    process.env.NODE_ENV as Network,
    TonDefaultConfig.tonCenter,
    TonDefaultConfig.tonApiKey
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
  // Start watching
  await relay(tonQueue, TonDefaultConfig);
  tonWorker.on("completed", async (job) => {
    console.log("Job completed", job.id);
  });
})();
