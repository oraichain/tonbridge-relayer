import { Network } from "@orbs-network/ton-access";
import { envConfig } from "@src/config";
import { MOCK_BOC } from "@src/contracts/ton/boc/mock";
import {
  jettonContentToCell,
  JettonMinter,
} from "@src/contracts/ton/JettonMinter";
import { createTonWallet, waitSeqno } from "@src/utils";
import { Address, Cell, toNano } from "@ton/core";

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
    uri: "https://orai.io",
  });
  const jettonMinter = client.open(
    JettonMinter.createFromConfig(
      {
        adminAddress: Address.parse(envConfig.TON_BRIDGE),
        content,
        jettonWalletCode: jettonWalletCode,
      },
      jettonMinterCode
    )
  );
  await jettonMinter.sendDeploy(
    walletContract.sender(key.secretKey),
    toNano(0.05)
  );

  await waitSeqno(walletContract, await walletContract.getSeqno());
  console.log("JettonMinter deployed at", jettonMinter.address.toString()); //EQCND3f8wrY1_NndTTqHFUQcx7hOP4QsiMYEwXvQr-b5Dr-o
})();
