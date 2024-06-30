import { SigningCosmWasmClient } from "@cosmjs/cosmwasm-stargate";
import { DirectSecp256k1HdWallet } from "@cosmjs/proto-signing";
import { GasPrice } from "@cosmjs/stargate";
import { Network } from "@orbs-network/ton-access";
import { envConfig } from "@src/config";
import { ReadWriteStateClient } from "@src/contracts/cosmwasm/mock";
import { Src } from "@src/contracts/ton/BridgeAdapter";
import { createTonWallet, waitSeqno } from "@src/utils";
import { internal, toNano } from "@ton/core";
import { WalletContractV4 } from "@ton/ton";

(async () => {
  const jettonSrcCosmos = "EQCND3f8wrY1_NndTTqHFUQcx7hOP4QsiMYEwXvQr-b5Dr-o";
  const jettonSrcTon = "EQDpelECMyMN2XlwXohsnFLRTqs4zgaAuE8sd_kxIxRWjsuv";
  const wallet = await DirectSecp256k1HdWallet.fromMnemonic(
    envConfig.COSMOS_MNEMONIC,
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
  console.log(accounts[0].address);
  const bridgeWasm = new ReadWriteStateClient(
    cosmosClient,
    accounts[0].address,
    envConfig.WASM_BRIDGE
  );
  const { client, walletContract, key } = await createTonWallet(
    envConfig.TON_MNEMONIC,
    process.env.NODE_ENV as Network
  );

  const userWallet = WalletContractV4.create({
    workchain: 0,
    publicKey: key.publicKey,
    walletId: 110300,
  });

  if (!(await client.isContractDeployed(userWallet.address))) {
    const seqno = await walletContract.getSeqno();
    await walletContract.sendTransfer({
      seqno,
      secretKey: key.secretKey,
      messages: [
        internal({
          to: userWallet.address,
          value: toNano(0.5),
        }),
      ],
    });
    await waitSeqno(walletContract, seqno);
    const userWalletContract = client.open(userWallet);
    await userWalletContract.sendTransfer({
      seqno: 0,
      secretKey: key.secretKey,
      messages: [
        internal({
          to: walletContract.address,
          value: toNano(0.1),
        }),
      ],
    });
  }

  console.log("UserWalletContract deployed at", userWallet.address.toString());

  const transferCw20 = await bridgeWasm.transferToTon({
    to: userWallet.address.toString(),
    denom: jettonSrcCosmos,
    amount: toNano(10).toString(),
    crcSrc: Src.COSMOS.toString(),
  });
  console.log("[Demo] Transfer CW20 to TON", transferCw20.transactionHash);

  const transferJetton = await bridgeWasm.transferToTon({
    to: userWallet.address.toString(),
    denom: jettonSrcTon,
    amount: toNano(10).toString(),
    crcSrc: Src.TON.toString(),
  });
  console.log("[Demo] Transfer Jetton to TON", transferJetton.transactionHash);
})();
