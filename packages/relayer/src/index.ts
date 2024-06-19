import { envConfig } from "./config";
import { Address, beginCell } from "@ton/core";
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

import { createTonWallet } from "./utils";
import { Network } from "@orbs-network/ton-access";
import { relay } from "./relay";

(async () => {
  // Setup All Client
  // Cosmwasm
  const wallet = await DirectSecp256k1HdWallet.fromMnemonic(
    envConfig.TON_MNEMONIC,
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
    envConfig.TON_MNEMONIC,
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
      const jettonMinterSrcCosmos = JettonMinter.createFromAddress(denom);
      const jettonMinterSrcCosmosContract = tonClient.open(
        jettonMinterSrcCosmos
      );
      const userJettonWallet =
        await jettonMinterSrcCosmosContract.getWalletAddress(to);
      const userJettonWalletBalance =
        JettonWallet.createFromAddress(userJettonWallet);
      const userJettonWalletContract = tonClient.open(userJettonWalletBalance);
      const balance = await userJettonWalletContract.getBalance();
      console.log(
        "[TON-WORKER-EVENT-COMPLETED] user",
        to.toString(),
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
      const jettonMinterSrcTon = JettonMinter.createFromAddress(denom);
      const jettonMinterSrcTonContract = tonClient.open(jettonMinterSrcTon);
      const userJettonWallet =
        await jettonMinterSrcTonContract.getWalletAddress(to);
      const userJettonWalletBalance =
        JettonWallet.createFromAddress(userJettonWallet);
      const userJettonWalletContract = tonClient.open(userJettonWalletBalance);
      const balance = await userJettonWalletContract.getBalance();
      console.log(
        "[TON-WORKER-EVENT-COMPLETED] user",
        to.toString(),
        "balance",
        balance.amount,
        "denom",
        jettonMinterSrcTon.address.toString()
      );
    }
  });
})();
