import { SyncDataOptions, Txs } from "@oraichain/cosmos-rpc-sync";
import { envConfig } from "./config";
import { DuckDb } from "./duckdb.service";
import { CosmosBlockOffset } from "./models/cosmwasm/block-offset";
import {
  CosmwasmWatcherEvent,
  createCosmosBridgeWatcher,
  createUpdateClientData,
} from "./cosmos.service";
import { BridgeParsedData } from "./@types/interfaces/cosmwasm";
import { Queue } from "bullmq";
import { CosmosWorkerJob, TonWorkerJob } from "./worker";
import { Address, beginCell, Cell, toNano } from "@ton/core";
import { LightClient } from "./contracts/ton/LightClient";
import { BridgeAdapter, Src } from "./contracts/ton/BridgeAdapter";
import { ConnectionOptions } from "bullmq";
import { createCosmosWorker, createTonWorker } from "./worker";
import { JettonMinter } from "./contracts/ton/JettonMinter";
import { DirectSecp256k1HdWallet } from "@cosmjs/proto-signing";
import { SigningCosmWasmClient } from "@cosmjs/cosmwasm-stargate";
import { ReadWriteStateClient } from "./contracts/cosmwasm/mock";
import { GasPrice } from "@cosmjs/stargate";
import { JettonWallet } from "./contracts/ton/JettonWallet";
import { TonClient } from "@ton/ton";
import { createTonWallet } from "./utils";
import { Network } from "@orbs-network/ton-access";

//@ts-ignore
BigInt.prototype.toJSON = function () {
  return this.toString();
};

const connection = {
  host: envConfig.REDIS_HOST,
  port: envConfig.REDIS_PORT,
};

const tonQueue = new Queue("ton", {
  connection,
});

const cosmosQueue = new Queue("cosmos", { connection });

export async function relay() {
  console.log("[RELAY] Start relaying process");
  const duckDb = await DuckDb.getInstance(envConfig.CONNECTION_STRING);
  const blockOffset = new CosmosBlockOffset(duckDb);
  await blockOffset.createTable();
  const offset = await blockOffset.mayLoadBlockOffset(
    envConfig.SYNC_BLOCK_OFFSET
  );
  const syncDataOpt: SyncDataOptions = {
    rpcUrl: envConfig.COSMOS_RPC_URL,
    limit: envConfig.SYNC_LIMIT,
    maxThreadLevel: envConfig.SYNC_THREADS,
    offset: offset,
    interval: envConfig.SYNC_INTERVAL,
    queryTags: [],
  };
  if (offset < envConfig.SYNC_BLOCK_OFFSET) {
    syncDataOpt.offset = envConfig.SYNC_BLOCK_OFFSET;
  }
  if (envConfig.WASM_BRIDGE === "") {
    throw new Error("BRIDGE_WASM_ADDRESS is required");
  }
  const cosmosWatcher = createCosmosBridgeWatcher(
    envConfig.WASM_BRIDGE,
    syncDataOpt
  );
  // UPDATE BLOCK OFFSET TO DATABASE
  cosmosWatcher.on(CosmwasmWatcherEvent.SYNC_DATA, async (chunk: Txs) => {
    const { offset: newOffset } = chunk;
    await blockOffset.updateBlockOffset(newOffset);
    console.log("[SYNC_DATA] Update new offset at", newOffset);
  });
  // LISTEN ON THE PARSED_DATA FROM WATCHER
  cosmosWatcher.on(
    CosmwasmWatcherEvent.PARSED_DATA,
    async (data: BridgeParsedData) => {
      const { submitData, submittedTxs } = data;
      // Submitting serialized data to cosmwasm bridge
      const submitDataQueue = submitData.map((tx) => {
        return {
          name: CosmosWorkerJob.SubmitData,
          data: tx,
        };
      });
      await cosmosQueue.addBulk(submitDataQueue);
      // Relaying submitted transaction by relayer
      const updateClientDataPromise = submittedTxs.map((tx) =>
        createUpdateClientData(envConfig.COSMOS_RPC_URL, tx.height)
      );
      const updateClientData = await Promise.all(updateClientDataPromise);

      const relayDataQueue = updateClientData.map((clientData, i) => {
        return {
          name: TonWorkerJob.RelayCosmWasmData,
          data: {
            data: submittedTxs[i].data,
            clientData: clientData,
            txHash: submittedTxs[i].hash,
          },
        };
      });
      await tonQueue.addBulk(relayDataQueue);
    }
  );
  console.log("[RELAY] Start watching cosmos chain");
  await cosmosWatcher.start();
}

(async () => {
  // Setup All Client
  // Cosmwasm
  const wallet = await DirectSecp256k1HdWallet.fromMnemonic(
    envConfig.MNEMONIC,
    {
      prefix: "orai",
    }
  );
  const accounts = await wallet.getAccounts();
  const cosmosClient = await SigningCosmWasmClient.connectWithSigner(
    envConfig.COSMOS_RPC_URL,
    wallet,
    {
      gasPrice: GasPrice.fromString("0.002orai"),
      broadcastPollIntervalMs: 500,
    }
  );
  const bridgeWasm = new ReadWriteStateClient(
    cosmosClient,
    accounts[0].address,
    envConfig.WASM_BRIDGE
  );
  // TON
  const {
    walletContract,
    client: tonClient,
    key,
  } = await createTonWallet(
    envConfig.MNEMONIC,
    process.env.NODE_ENV as Network,
    envConfig.TON_CENTER
  );
  const lightClient = LightClient.createFromAddress(
    Address.parse(envConfig.TON_LIGHT_CLIENT)
  );
  const bridgeAdapter = BridgeAdapter.createFromAddress(
    Address.parse(envConfig.TON_BRIDGE)
  );
  const lightClientContract = tonClient.open(lightClient);
  const bridgeAdapterContract = tonClient.open(bridgeAdapter);

  // Run workers
  const connection: ConnectionOptions = {
    host: envConfig.REDIS_HOST,
    port: envConfig.REDIS_PORT,
  };
  const tonWorker = createTonWorker(
    connection,
    walletContract.sender(key.secretKey),
    lightClientContract,
    bridgeAdapterContract
  );
  const cosmosWorker = createCosmosWorker(connection, bridgeWasm);
  tonWorker.run();
  cosmosWorker.run();
  // Start watching
  await relay();
  const transferCw20 = await bridgeWasm.transferToTon({
    to: user.address.toString(),
    denom: jettonMinterSrcCosmos.address.toString(),
    amount: "1000000000",
    crcSrc: Src.COSMOS.toString(),
  });
  console.log("[Demo] Transfer CW20 to TON", transferCw20.transactionHash);
  const transferJetton = await bridgeWasm.transferToTon({
    to: user.address.toString(),
    denom: jettonMinterSrcTon.address.toString(),
    amount: "1000000000",
    crcSrc: Src.TON.toString(),
  });
  console.log("[Demo] Transfer jetton to TON", transferJetton.transactionHash);

  tonWorker.on("completed", async (job) => {
    const data = job.data;
    const cellBuffer = data.data;
    const sliceData = beginCell()
      .storeBuffer(Buffer.from(cellBuffer, "hex"))
      .endCell()
      .beginParse();
    const to = sliceData.loadAddress();
    const denom = sliceData.loadAddress();
    const amount = sliceData.loadUint(128);
    const crcSrc = sliceData.loadUint(32);
    if (crcSrc === Src.COSMOS) {
      console.log(
        "[TON-WORKER-EVENT-COMPLETED] Success transferTo",
        to.toString(),
        amount,
        denom.toString(),
        "src::cosmos"
      );
      const userJettonWallet = await jettonMinterSrcCosmos.getWalletAddress(to);
      const userJettonWalletBalance =
        JettonWallet.createFromAddress(userJettonWallet);
      const wallet = blockchain.openContract(userJettonWalletBalance);
      const balance = await wallet.getBalance();
      console.log(
        "[TON-WORKER-EVENT-COMPLETED] user",
        user.address.toString(),
        "balance",
        balance.amount,
        "denom",
        jettonMinterSrcCosmos.address.toString()
      );
    } else {
      console.log(
        "[TON-WORKER-EVENT-COMPLETED] Success transferTo",
        to.toString(),
        amount,
        denom.toString(),
        "src::ton"
      );
      const userJettonWallet = await jettonMinterSrcTon.getWalletAddress(to);
      const userJettonWalletBalance =
        JettonWallet.createFromAddress(userJettonWallet);
      const wallet = blockchain.openContract(userJettonWalletBalance);
      const balance = await wallet.getBalance();
      console.log(
        "[TON-WORKER-EVENT-COMPLETED] user",
        user.address.toString(),
        "balance",
        balance.amount,
        "denom",
        jettonMinterSrcTon.address.toString()
      );
    }
  });
})();
