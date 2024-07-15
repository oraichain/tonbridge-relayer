import { envConfig } from "./config";
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
  host: envConfig.REDIS_HOST,
  port: envConfig.REDIS_PORT,
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
    envConfig.TON_MNEMONIC,
    process.env.NODE_ENV as Network,
    envConfig.TON_CENTER,
    envConfig.TON_API_KEY
  );
  const lightClientMaster = LightClientMaster.createFromAddress(
    Address.parse(envConfig.COSMOS_LIGHT_CLIENT_MASTER)
  );
  const bridgeAdapter = BridgeAdapter.createFromAddress(
    Address.parse(envConfig.TON_BRIDGE)
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
  await relay(tonQueue);
  tonWorker.on("completed", async (job) => {
    console.log("Job completed", job.id);
  });
})();
