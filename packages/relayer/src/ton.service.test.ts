import { Address, beginCell, Cell, internal, toNano } from "@ton/core";
import { envConfig } from "./config";
import { createTonWallet, waitSeqno } from "./utils";
import {
  BridgeAdapter,
  deserializeCommit,
  deserializeHeader,
  deserializeValidator,
  JettonMinter,
  JettonWallet,
  LightClient,
  LightClientOpcodes,
  Src,
} from "@oraichain/ton-bridge-contracts";
import {
  getBlockHashCell,
  getCommitCell,
  getValidatorsCell,
} from "@oraichain/ton-bridge-contracts/wrappers/utils";
import { BridgeAdapterTracer, LightClientTracer } from "./services/ton.service";
import {
  CosmwasmBridgeParser,
  createUpdateClientData,
} from "./services/cosmos.service";
import { DirectSecp256k1HdWallet } from "@cosmjs/proto-signing";
import { SigningCosmWasmClient } from "@cosmjs/cosmwasm-stargate";
import { ReadWriteStateClient } from "./contracts/cosmwasm/mock";
import { WalletContractV4 } from "@ton/ton";
import { getCosmosTxAndProofByHash } from "./worker";
import { sha256 } from "@cosmjs/crypto";
import { GasPrice } from "@cosmjs/stargate";

(async () => {
  const jettonSrcTon = "EQA5FnPP13uZPJQq7aj6UHLEukJJZSZW053cU1Wu6R6BpYYB";
  const jettonSrcCosmos = "EQCLXr2mFlnNWzjsJX7A2yd4gRPUKPQizFvE6y5n42C0B6FF";

  const hdWallet = await DirectSecp256k1HdWallet.fromMnemonic(
    envConfig.COSMOS_MNEMONIC,
    { prefix: "orai" }
  );
  const signClient = await SigningCosmWasmClient.connectWithSigner(
    envConfig.COSMOS_RPC_URL,
    hdWallet,
    { gasPrice: GasPrice.fromString("0.002orai") }
  );
  const parser = new CosmwasmBridgeParser(envConfig.WASM_BRIDGE);
  const [sender, ...rest] = await hdWallet.getAccounts();
  const bridgeAdapter = new ReadWriteStateClient(
    signClient,
    sender.address,
    envConfig.WASM_BRIDGE
  );

  const { walletContract, client, key } = await createTonWallet(
    envConfig.TON_MNEMONIC,
    "testnet"
  );
  const user = WalletContractV4.create({
    workchain: 0,
    publicKey: key.publicKey,
    walletId: 110300,
  });

  const userContract = client.open(user);
  // await walletContract.sendTransfer({
  //   seqno: await walletContract.getSeqno(),
  //   secretKey: key.secretKey,
  //   messages: [
  //     internal({
  //       to: userContract.address,
  //       value: toNano("1"),
  //       bounce: false,
  //     }),
  //   ],
  // });
  if (!(await client.isContractDeployed(user.address))) {
    console.log("Deploying user contract");
    await walletContract.sendTransfer({
      seqno: await walletContract.getSeqno(),
      secretKey: key.secretKey,
      messages: [
        internal({
          to: userContract.address,
          value: toNano("0.05"),
          bounce: false,
        }),
      ],
    });
    await waitSeqno(walletContract, await walletContract.getSeqno());
    await userContract.sendTransfer({
      seqno: await userContract.getSeqno(),
      secretKey: key.secretKey,
      messages: [
        internal({
          to: walletContract.address,
          value: toNano("0.01"),
        }),
      ],
    });
    await waitSeqno(userContract, await userContract.getSeqno());
    console.log(userContract.address);
  }
  const jettonMinterSrcTon = client.open(
    JettonMinter.createFromAddress(Address.parse(jettonSrcTon))
  );
  const jettonMinterSrcCosmos = client.open(
    JettonMinter.createFromAddress(Address.parse(jettonSrcCosmos))
  );

  const userAddressSrcTon = await jettonMinterSrcTon.getWalletAddress(
    userContract.address
  );
  const userJettonSrcTonWallet = client.open(
    JettonWallet.createFromAddress(userAddressSrcTon)
  );

  console.log(userContract.address.toString());

  const submitSrcTon = parser.transformToSubmitActionCell(
    0,
    userContract.address.toString(),
    jettonSrcCosmos,
    toNano(10),
    BigInt(Src.COSMOS)
  );

  // const result = await bridgeAdapter.submitBridgeToTonInfo({
  //   data: submitSrcTon,
  // });
  // const blockHeight = result.height;
  // const lightClient = LightClient.createFromAddress(
  //   Address.parse(envConfig.COSMOS_LIGHT_CLIENT)
  // );
  // const lightClientContract = client.open(lightClient);
  // const { header, lastCommit, validators, txs } = await createUpdateClientData(
  //   "https://rpc.orai.io",
  //   blockHeight
  // );

  // await lightClientContract.sendVerifyBlockHash(
  //   walletContract.sender(key.secretKey),
  //   {
  //     header: deserializeHeader(header),
  //     validators: validators.map(deserializeValidator),
  //     commit: deserializeCommit(lastCommit),
  //   },
  //   { value: toNano("2.5") }
  // );

  // const dataCell = beginCell()
  //   .storeRef(getBlockHashCell(deserializeHeader(header)))
  //   .storeRef(getValidatorsCell(validators.map(deserializeValidator)))
  //   .storeRef(getCommitCell(deserializeCommit(lastCommit)))
  //   .endCell();

  // const bodyCell = beginCell()
  //   .storeUint(LightClientOpcodes.verify_block_hash, 32)
  //   .storeUint(0, 64)
  //   .storeRef(dataCell)
  //   .endCell();

  // await waitSeqno(walletContract, await walletContract.getSeqno());

  // const lightClientTracer = new LightClientTracer(
  //   client,
  //   lightClientContract.address,
  //   60000
  // );
  // await lightClientTracer.traceUpdateBlock(bodyCell);

  // const bridgeAdapterContract = client.open(
  //   BridgeAdapter.createFromAddress(Address.parse(envConfig.TON_BRIDGE))
  // );
  // console.log(result.transactionHash);

  // const { txWasm, proofs, positions } = await getCosmosTxAndProofByHash(
  //   result.transactionHash,
  //   txs.map((tx) => sha256(Buffer.from(tx, "hex")))
  // );

  // await bridgeAdapterContract.sendTx(
  //   walletContract.sender(key.secretKey),
  //   {
  //     height: BigInt(result.height),
  //     tx: txWasm,
  //     proofs: proofs,
  //     positions: positions,
  //     data: beginCell().storeBuffer(Buffer.from(submitSrcTon, "hex")).endCell(),
  //   },
  //   { value: toNano("0.3") }
  // );
  // await waitSeqno(walletContract, await walletContract.getSeqno());

  // const body = BridgeAdapter.buildBridgeAdapterSendTxBody({
  //   height: BigInt(result.height),
  //   tx: txWasm,
  //   proofs: proofs,
  //   positions: positions,
  //   data: beginCell().storeBuffer(Buffer.from(submitSrcTon, "hex")).endCell(),
  // });
  // console.log(body.toBoc().toString("hex"));
  const body = Cell.fromBoc(
    Buffer.from(
      "b5ee9c7241021f010002e1000428946282250000000000000000000000000183249b011d1d1e030002101a0300030a1d02001d04030005080902000607003e2f636f736d6f732e63727970746f2e736563703235366b312e5075624b657901460a21025e9c3ec6fb0ebd8dee12ea703f596fc93c8c660aaa48a86d5293d48c4140a0651d0002010004cf1904000b0f1d1d02001d0c02000d0e00086f72616900063332300006a4df090400111d1d1d02001d120200131400482f636f736d7761736d2e7761736d2e76312e4d736745786563757465436f6e7472616374030015181d0200161700566f7261693132703079776a77637061353030723966756630686c7937387a796a656c74616b727a6b763063007e6f726169317071326e6673796c673334347a366677786b797a753074776d7672346d64727763327a6d346672796e6c63746579706a743832736d326b32667501d07b227375626d69745f6272696467655f746f5f746f6e5f696e666f223a7b2264617461223a223030303030303030303030303030303038303046343231453844353037393044414638434344373643343634454134453643383842413730363446433135434231421901fe33343832323933423232413745373445463030323244374146363938353936373335364345334230393546423033364339444532303434463530413344303842333136463133414342393946384438324430314330303030303030303030303030303030303030303030303935303246393030303133393531374432227d7d1d02001d1b01001c00800c7057207727bc2f0d4fd5d6be67adb2f905c1da80ff0d8822fb5195c14a3bef0a810f925dfc4cc516d2d5fabf94ed23e85c9847ad094d9ea1058c047a66a96d000000be0000000000000000800f421e8d50790daf8ccd76c464ea4e6c88ba7064fc15cb1b3482293b22a7e74ef0022d7af6985967356ce3b095fb036c9de2044f50a3d08b316f13acb99f8d82d01c000000000000000000000009502f9000139517d279dafdeb",
      "hex"
    )
  )[0];
  const bridgeTracer = new BridgeAdapterTracer(
    client,
    // bridgeAdapterContract.address,
    Address.parse(envConfig.TON_BRIDGE),
    60000
  );
  await bridgeTracer.traceSendTx(body);

  // console.log((await userJettonSrcTonWallet.getBalance()).amount);
})();
