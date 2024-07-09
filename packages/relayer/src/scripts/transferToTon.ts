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
  // console.log(
  //   Buffer.from(
  //     "000762616C616E63656F726169313238756730353933646B61747A3970637470667176786D7230386D796C6A7A736B396D746E64",
  //     "hex"
  //   ).length
  // );
  console.log(convertProofsToIcs23(result.proof));
  console.log(Buffer.from(result.value).toString());
})();

function convertProofsToIcs23(ops: ProofOps): Uint8Array {
  const proofs = ops.ops.map((op) => CommitmentProof.decode(op.data));
  const resp = MerkleProof.fromPartial({
    proofs,
  });
  console.log(resp.proofs[0].exist);
  return MerkleProof.encode(resp).finish();
}
