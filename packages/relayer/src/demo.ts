import { beginCell, Cell, toNano } from "@ton/core";
import { Blockchain } from "@ton/sandbox";
import { MOCK_BOC } from "./contracts/ton/boc/mock";
import { LightClient } from "./contracts/ton/LightClient";
import { BridgeAdapter, Src } from "./contracts/ton/BridgeAdapter";
import { envConfig } from "./config";
import { ConnectionOptions } from "bullmq";
import { createCosmosWorker, createTonWorker } from "./worker";
import { relay } from ".";
import { JettonMinter } from "./contracts/ton/JettonMinter";
import { DirectSecp256k1HdWallet } from "@cosmjs/proto-signing";
import { SigningCosmWasmClient } from "@cosmjs/cosmwasm-stargate";
import { ReadWriteStateClient } from "./contracts/cosmwasm/mock";
import { GasPrice } from "@cosmjs/stargate";

(async () => {
  // Setup
  const blockchain = await Blockchain.create();
  const lightClientCode = Cell.fromBoc(
    Buffer.from(MOCK_BOC.LIGHT_CLIENT, "hex")
  )[0];
  const bridgeAdapterCode = Cell.fromBoc(
    Buffer.from(MOCK_BOC.BRIDGE_ADAPTER, "hex")
  )[0];
  const jettonWalletCode = Cell.fromBoc(
    Buffer.from(MOCK_BOC.JETTON_WALLET, "hex")
  )[0];
  const jettonMinterCode = Cell.fromBoc(
    Buffer.from(MOCK_BOC.JETTON_MINTER, "hex")
  )[0];
  // Deploying to TON sandbox blockchain
  const deployer = await blockchain.treasury("deployer");
  const sender = deployer.getSender();
  const lightClient = blockchain.openContract(
    LightClient.createFromConfig(
      {
        chainId: "Oraichain",
        height: 1,
        validatorHashSet: "",
        dataHash: "",
        nextValidatorHashSet: "",
      },
      lightClientCode
    )
  );
  await lightClient.sendDeploy(sender, toNano("0.5"));
  console.log("Deployed LightClient at", lightClient.address.toString());
  const bridgeAdapter = blockchain.openContract(
    BridgeAdapter.createFromConfig(
      {
        light_client: lightClient.address,
        bridge_wasm_smart_contract: envConfig.BRIDGE_WASM_ADDRESS,
        jetton_wallet_code: jettonWalletCode,
      },
      bridgeAdapterCode
    )
  );
  await bridgeAdapter.sendDeploy(sender, toNano("0.05"));
  console.log("Deployed bridgeAdapter at", bridgeAdapter.address.toString());
  const jettonMinterSrcCosmos = blockchain.openContract(
    JettonMinter.createFromConfig(
      {
        adminAddress: bridgeAdapter.address,
        content: bridgeAdapterCode,
        jettonWalletCode: jettonWalletCode,
      },
      jettonMinterCode
    )
  );
  await jettonMinterSrcCosmos.sendDeploy(sender, toNano("0.05"));
  const jettonMinterSrcTon = blockchain.openContract(
    JettonMinter.createFromConfig(
      {
        adminAddress: deployer.address,
        content: beginCell().endCell(),
        jettonWalletCode: jettonWalletCode,
      },
      jettonMinterCode
    )
  );
  await jettonMinterSrcTon.sendDeploy(sender, toNano("0.05"));

  // SigningCosmwasmClient
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
    }
  );
  const bridgeWasm = new ReadWriteStateClient(
    cosmosClient,
    accounts[0].address,
    envConfig.BRIDGE_WASM_ADDRESS
  );
  // Run workers
  const connection: ConnectionOptions = {
    host: envConfig.REDIS_HOST,
    port: envConfig.REDIS_PORT,
  };
  const tonWorker = createTonWorker(
    connection,
    sender,
    lightClient,
    bridgeAdapter
  );
  const cosmosWorker = createCosmosWorker(connection, bridgeWasm);
  tonWorker.run();
  cosmosWorker.run();
  // Start watching
  await relay();
  await bridgeWasm.transferToTon({
    to: deployer.address.toString(),
    denom: jettonMinterSrcCosmos.address.toString(),
    amount: "1000000000",
    crcSrc: Src.COSMOS.toString(),
  });
})();
