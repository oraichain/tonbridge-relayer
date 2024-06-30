import { Network } from "@orbs-network/ton-access";
import { envConfig } from "@src/config";
import { MOCK_BOC } from "@src/contracts/ton/boc/mock";
import {
  jettonContentToCell,
  JettonMinter,
} from "@src/contracts/ton/JettonMinter";
import { createTonWallet, waitSeqno } from "@src/utils";
import { Address, Cell, toNano } from "@ton/core";
import { JettonWallet } from "@ton/ton";

// const exampleContent = {
//   name: "tORAIX",
//   description: "Sample of Jetton",
//   symbol: "TOX",
//   decimals: 6,
//   image: "https://s2.coinmarketcap.com/static/img/coins/64x64/20487.png",
// };

(async () => {
  const jettonMinterCode = Cell.fromBoc(
    Buffer.from(MOCK_BOC.JETTON_MINTER, "hex")
  )[0];
  const jettonWalletCode = Cell.fromBoc(
    Buffer.from(MOCK_BOC.JETTON_WALLET, "hex")
  )[0];
  const { client, walletContract, key } = await createTonWallet(
    envConfig.TON_MNEMONIC,
    process.env.NODE_ENV as Network
  );

  const content = jettonContentToCell({
    type: 1,
    uri: "https://oraidex.io",
  });
  const jettonMinter = client.open(
    JettonMinter.createFromConfig(
      {
        adminAddress: walletContract.address,
        content,
        jettonWalletCode: jettonWalletCode,
      },
      jettonMinterCode
    )
  );
  // await jettonMinter.sendDeploy(
  //   walletContract.sender(key.secretKey),
  //   toNano(0.05)
  // );

  // await waitSeqno(walletContract, await walletContract.getSeqno());
  console.log("JettonMinter deployed at", jettonMinter.address.toString()); //EQDpelECMyMN2XlwXohsnFLRTqs4zgaAuE8sd_kxIxRWjsuv

  // Send liquidity toNano(1_000_000) to TON_BRIDGE
  // const jettonBridgeAdapter = await jettonMinter.getWalletAddress(
  //   Address.parse(envConfig.TON_BRIDGE)
  // );
  // console.log(jettonBridgeAdapter.toString());

  // await jettonMinter.sendMint(walletContract.sender(key.secretKey), {
  //   toAddress: Address.parse(envConfig.TON_BRIDGE),
  //   jettonAmount: toNano(1000000),
  //   amount: toNano("0.05"),
  //   value: toNano("0.05"),
  //   queryId: 0,
  // });

  // await waitSeqno(walletContract, await walletContract.getSeqno());
  // const jettonWallet = client.open(JettonWallet.create(jettonBridgeAdapter));
  // console.log(await jettonWallet.getBalance());
})();
