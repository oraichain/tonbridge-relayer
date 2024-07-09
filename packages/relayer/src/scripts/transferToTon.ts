import { fromBech32 } from "@cosmjs/encoding";
import { QueryClient } from "@cosmjs/stargate";
import { Tendermint37Client } from "@cosmjs/tendermint-rpc";
import { MerkleProof } from "cosmjs-types/ibc/core/commitment/v1/commitment";
import { CommitmentProof } from "cosmjs-types/cosmos/ics23/v1/proofs";
import { ProofOps } from "cosmjs-types/tendermint/crypto/proof";

const encodeNamespaces = (namespaces: Uint8Array[]): Uint8Array => {
  const ret = [];
  for (const ns of namespaces) {
    const lengthBuf = Buffer.allocUnsafe(2);
    console.log(ns.byteLength);
    lengthBuf.writeUInt16BE(ns.byteLength);
    ret.push(lengthBuf);
    ret.push(ns);
  }
  return Buffer.concat(ret);
};

(async () => {
  const tmClient = await Tendermint37Client.connect("https://rpc.orai.io");
  const queryClient = new QueryClient(tmClient as any);
  const contract = fromBech32(
    "orai15un8msx3n5zf9ahlxmfeqd2kwa5wm0nrpxer304m9nd5q6qq0g6sku5pdd"
  );
  const key = encodeNamespaces([Buffer.from("balance")]);
  const finalKey = Buffer.concat([
    key,
    Buffer.from("orai1mycmhyrmd6dusp408rtjgzlk7738vhtgqyhxxt"),
  ]);
  console.log(finalKey.length);
  console.log(finalKey);
  const result = await queryClient.queryRawProof(
    "wasm",
    Uint8Array.from([
      3,
      ...contract.data,
      ...finalKey,
      // ...Buffer.from(
      //   "000762616C616E636500009E24074FB1D1CB8D3039240EDD53EEA2C156",
      //   "hex"
      // ),
      // ...QuerySmartContractStateRequest.encode({
      //   address: "orai12hzjxfh77wl572gdzct2fxv2arxcwh6gykc7qh",
      //   queryData: toUtf8(
      //     JSON.stringify({
      //       token_info: {},
      //     })
      //   ),
      // }).finish(),
    ])
  );
<<<<<<< HEAD
  // console.log(
  //   Buffer.from(
  //     "000762616C616E63656F726169313238756730353933646B61747A3970637470667176786D7230386D796C6A7A736B396D746E64",
  //     "hex"
  //   ).length
  // );
  console.log(convertProofsToIcs23(result.proof));
  console.log(Buffer.from(result.value).toString());
=======
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
    seq: 0,
    amount: toNano(10).toString(),
    crcSrc: Src.COSMOS.toString(),
  });
  console.log("[Demo] Transfer CW20 to TON", transferCw20.transactionHash);

  const transferJetton = await bridgeWasm.transferToTon({
    to: userWallet.address.toString(),
    denom: jettonSrcTon,
    seq: 0,
    amount: toNano(10).toString(),
    crcSrc: Src.TON.toString(),
  });
  console.log("[Demo] Transfer Jetton to TON", transferJetton.transactionHash);
>>>>>>> 1bbb3e36ee0b96bed85881e4a6ba4b880fe1433e
})();

function convertProofsToIcs23(ops: ProofOps): Uint8Array {
  const proofs = ops.ops.map((op) => CommitmentProof.decode(op.data));
  const resp = MerkleProof.fromPartial({
    proofs,
  });
  console.log(resp.proofs[0].exist);
  return MerkleProof.encode(resp).finish();
}
