import { envConfig } from "./config";
import { Address, beginCell, Cell } from "@ton/core";
import {
  BridgeAdapter,
  Src,
  JettonMinter,
  JettonWallet,
  LightClientMaster,
} from "@oraichain/ton-bridge-contracts";
import { ConnectionOptions } from "bullmq";
import { createTonWorker } from "./worker";
import { DirectSecp256k1HdWallet } from "@cosmjs/proto-signing";
import { SigningCosmWasmClient } from "@cosmjs/cosmwasm-stargate";
import { GasPrice } from "@cosmjs/stargate";
import { createTonWallet } from "./utils";
import { Network } from "@orbs-network/ton-access";
import { relay } from "./relay";
import { WalletContractV4 } from "@ton/ton";

(async () => {
  // Setup All Client
  // TON
  const {
    walletContract,
    client: tonClient,
    key,
  } = await createTonWallet(
    envConfig.TON_MNEMONIC,
    process.env.NODE_ENV as Network
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
  const connection: ConnectionOptions = {
    host: envConfig.REDIS_HOST,
    port: envConfig.REDIS_PORT,
  };
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
  await relay();
  tonWorker.on("completed", async (job) => {
    const { data, provenHeight, clientData } = job.data;
    const { packetBoc, proofs } = data;
    const packet = Cell.fromBoc(Buffer.from(packetBoc, "hex"))[0];
    const packetSlice = packet.beginParse();
    const seq = packetSlice.loadUint(64);
    const packet_op = packetSlice.loadUint(32);
    const crcSrc = packetSlice.loadUint(32);
    const to = packetSlice.loadAddress();
    const denom = packetSlice.loadMaybeAddress();
    const amount = packetSlice.loadUint(128);
    const timeout = packetSlice.loadUint(64);
    if (crcSrc === Src.COSMOS) {
      console.log(
        "[TON-WORKER-EVENT-COMPLETED] Success transfer packet",
        seq,
        "to",
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
        "[TON-WORKER-EVENT-COMPLETED] User",
        to.toString(),
        "balance",
        balance.amount,
        "denom",
        jettonMinterSrcCosmos.address.toString()
      );
    } else {
      console.log(
        "[TON-WORKER-EVENT-COMPLETED] Success packet",
        seq,
        "to",
        to.toString(),
        amount,
        denom.toString(),
        "src::ton"
      );
      if (denom) {
        const jettonMinterSrcTon = JettonMinter.createFromAddress(denom);
        const jettonMinterSrcTonContract = tonClient.open(jettonMinterSrcTon);
        const userJettonWallet =
          await jettonMinterSrcTonContract.getWalletAddress(to);
        const userJettonWalletBalance =
          JettonWallet.createFromAddress(userJettonWallet);
        const userJettonWalletContract = tonClient.open(
          userJettonWalletBalance
        );
        const balance = await userJettonWalletContract.getBalance();
        console.log(
          "[TON-WORKER-EVENT-COMPLETED] user",
          to.toString(),
          "balance",
          balance.amount,
          "denom",
          jettonMinterSrcTon.address.toString()
        );
      } else {
        const balance = await tonClient.getBalance(to);
        console.log(
          "[TON-WORKER-EVENT-COMPLETED] user",
          to.toString(),
          "balance",
          balance
        );
      }
    }
  });
})();
