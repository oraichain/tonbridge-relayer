import { CosmWasmClient } from "@cosmjs/cosmwasm-stargate";
import { fromBech32 } from "@cosmjs/encoding";
import { QueryClient } from "@cosmjs/stargate";
import { Tendermint37Client } from "@cosmjs/tendermint-rpc";
import { parseWasmEvents } from "@oraichain/oraidex-common";
import {
  BridgeAdapter,
  encodeNamespaces,
  getAckPacketProofs,
  getExistenceProofSnakeCell,
  getPacketProofs,
} from "@oraichain/ton-bridge-contracts";
import { Network } from "@orbs-network/ton-access";
import { BRIDGE_WASM_ACTION, CosmwasmBridgeParser } from "@src/services";
import { createTonWallet, waitSeqno } from "@src/utils";
import { Address, Cell, toNano } from "@ton/core";
import { ExistenceProof } from "cosmjs-types/cosmos/ics23/v1/proofs";
import * as dotenv from "dotenv";
dotenv.config();

(async () => {
  const parser = new CosmwasmBridgeParser(process.env.WASM_BRIDGE);
  const provenHeight = 30475520;
  const needProvenHeight = provenHeight + 1;
  const packetTx =
    "2AAC055FFDE3CA280E7737DC333AF19B859D70A0D4080F68054232B855196F71";
  const { client, walletContract, key } = await createTonWallet(
    process.env.TON_MNEMONIC,
    process.env.NODE_ENV as Network
  );
  const bridgeAdapter = BridgeAdapter.createFromAddress(
    Address.parse(process.env.TON_BRIDGE)
  );
  const bridgeAdapterContract = client.open(bridgeAdapter);
  const cosmwasmClient = await CosmWasmClient.connect(
    process.env.COSMOS_RPC_URL
  );
  const tx = await cosmwasmClient.getTx(packetTx);
  console.log(tx);
  const wasmAttr = parseWasmEvents(tx.events);
  const filterByContractAddress = (attr: Record<string, string>) =>
    attr["_contract_address"] === process.env.WASM_BRIDGE;
  // This action come from user need to normalize and submit by relayer.
  const sendToCosmosEvents = wasmAttr
    .filter(filterByContractAddress)
    .filter((attr) => attr["action"] === BRIDGE_WASM_ACTION.SEND_TO_COSMOS);
  const packetEvent = sendToCosmosEvents[0];

  const ackPacket = parser.transformEventToTonAckPacket(
    BigInt(packetEvent["opcode_packet"]),
    BigInt(packetEvent["seq"]),
    parseInt(packetEvent["ack"])
  );
  const ackBoc = ackPacket.toBoc().toString("hex");

  const tendermint37 = await Tendermint37Client.connect(
    process.env.COSMOS_RPC_URL
  );
  const queryClient = new QueryClient(tendermint37 as any);
  console.log(provenHeight, BigInt(packetEvent["seq"]));
  const packetProofs = await getAckPacketProofs(
    queryClient,
    process.env.WASM_BRIDGE,
    provenHeight,
    BigInt(packetEvent["seq"])
  );
  console.log(packetProofs);
  const proofs = packetProofs.map((proof) => {
    return ExistenceProof.fromJSON(proof);
  });
  await bridgeAdapterContract.sendBridgeRecvPacket(
    walletContract.sender(key.secretKey),
    {
      provenHeight: needProvenHeight,
      packet: Cell.fromBoc(Buffer.from(ackBoc, "hex"))[0],
      proofs: getExistenceProofSnakeCell(proofs as any),
    },
    { value: toNano("0.7") }
  );
  await waitSeqno(walletContract, await walletContract.getSeqno(), 15);
})();
