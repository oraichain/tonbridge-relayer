import { CosmWasmClient } from "@cosmjs/cosmwasm-stargate";
import { QueryClient } from "@cosmjs/stargate";
import { Tendermint37Client } from "@cosmjs/tendermint-rpc";
import { parseWasmEvents } from "@oraichain/oraidex-common";
import {
  BridgeAdapter,
  getExistenceProofSnakeCell,
  getPacketProofs,
} from "@oraichain/ton-bridge-contracts";
import { Network } from "@orbs-network/ton-access";
import { TransferPacket } from "@src/dtos/packets/TransferPacket";
import { BRIDGE_WASM_ACTION, CosmwasmBridgeParser } from "@src/services";
import { createTonWallet, waitSeqno } from "@src/utils";
import { Address, toNano } from "@ton/core";
import { ExistenceProof } from "cosmjs-types/cosmos/ics23/v1/proofs";
import * as dotenv from "dotenv";
dotenv.config();
const argv = process.argv.slice(2);
const provenHeight = parseInt(argv[0]);
const packetTx = argv[1];

(async () => {
  const needProvenHeight = provenHeight + 1;
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
  const wasmAttr = parseWasmEvents(tx.events);
  const filterByContractAddress = (attr: Record<string, string>) =>
    attr["_contract_address"] === process.env.WASM_BRIDGE;
  // This action come from user need to normalize and submit by relayer.
  const sendToTonEvents = wasmAttr
    .filter(filterByContractAddress)
    .filter((attr) => attr["action"] === BRIDGE_WASM_ACTION.SEND_TO_TON);
  const packetEvent = sendToTonEvents[0];

  const transferPacket = TransferPacket.fromRawAttributes(packetEvent);
  const tendermint37 = await Tendermint37Client.connect(
    process.env.COSMOS_RPC_URL
  );
  const queryClient = new QueryClient(tendermint37 as any);
  console.log(provenHeight, BigInt(packetEvent["seq"]));
  const packetProofs = await getPacketProofs(
    queryClient,
    process.env.WASM_BRIDGE,
    provenHeight,
    BigInt(packetEvent["seq"])
  );

  const proofs = packetProofs.map((proof) => {
    return ExistenceProof.fromJSON(proof);
  });
  await bridgeAdapterContract.sendBridgeRecvPacket(
    walletContract.sender(key.secretKey),
    {
      provenHeight: needProvenHeight,
      packet: transferPacket.intoCell(),
      proofs: getExistenceProofSnakeCell(proofs as any),
    },
    { value: toNano("0.7") }
  );
  await waitSeqno(walletContract, await walletContract.getSeqno(), 15);
})();
