import {
  CHANNEL,
  SyncData,
  SyncDataOptions,
  Txs,
} from "@oraichain/cosmos-rpc-sync";
import { beginCell } from "@ton/core";
import { Event } from "@cosmjs/stargate";
import { parseWasmEvents } from "@oraichain/oraidex-common";
import { Log } from "@cosmjs/stargate/build/logs";
import { EventEmitter } from "stream";
import { BasicTxInfo } from "@src/@types/common";
import { Packets, ICosmwasmParser } from "@src/@types/interfaces/cosmwasm";
import { Tendermint34Client } from "@cosmjs/tendermint-rpc";
import { LightClientData } from "@src/@types/interfaces/cosmwasm/serialized";
import { checkTonDenom } from "@src/utils";
import {
  BridgeAdapterPacketOpcodes,
  serializeCommit,
  serializeHeader,
  serializeValidator,
} from "@oraichain/ton-bridge-contracts";
import { fromBech32 } from "@cosmjs/encoding";

export const enum BRIDGE_WASM_ACTION {
  SEND_TO_TON = "send_to_ton",
  SEND_TO_COSMOS = "send_to_cosmos",
}

export class CosmwasmBridgeParser implements ICosmwasmParser<Packets> {
  constructor(private bridgeWasmAddress: string) {}

  processChunk(chunk: Txs): Packets {
    const { txs } = chunk;
    const transferPackets = [];
    const ackPackets = [];
    const allBridgeData = txs
      .filter((tx) => tx.code === 0)
      .flatMap((tx) => {
        const logs: Log[] = JSON.parse(tx.rawLog);
        return logs.map((log) =>
          this.extractEventToPacket(
            log.events,
            tx.hash,
            tx.height,
            tx.timestamp
          )
        );
      })
      .filter((data) => data.transferPackets.length > 0);
    allBridgeData.forEach((data) => {
      transferPackets.push(...data.transferPackets);
      ackPackets.push(...data.ackPackets);
    });

    return {
      transferPackets: transferPackets.toSorted(
        (a: BasicTxInfo, b: BasicTxInfo) => a.height - b.height
      ),
      ackPackets: ackPackets.toSorted(
        (a: BasicTxInfo, b: BasicTxInfo) => a.height - b.height
      ),
    };
  }

  extractEventToPacket(
    events: readonly Event[],
    hash: string,
    height: number,
    timestamp: string
  ) {
    const basicInfo = {
      hash: hash,
      height: height,
      timestamp: timestamp,
    };
    const wasmAttr = parseWasmEvents(events);
    const filterByContractAddress = (attr: Record<string, string>) =>
      attr["_contract_address"] === this.bridgeWasmAddress;
    // This action come from user need to normalize and submit by relayer.
    const sendToTonEvents = wasmAttr
      .filter(filterByContractAddress)
      .filter((attr) => attr["action"] === BRIDGE_WASM_ACTION.SEND_TO_TON);

    const sendToCosmosEvents = wasmAttr
      .filter(filterByContractAddress)
      .filter((attr) => attr["action"] === BRIDGE_WASM_ACTION.SEND_TO_COSMOS);

    const transferPacket = sendToTonEvents.map((attr) => {
      return {
        data: this.transformEventToTransferPacket(
          BigInt(attr["opcode_packet"]),
          BigInt(attr["seq"]),
          BigInt(attr["token_origin"]),
          BigInt(attr["remote_amount"]),
          BigInt(attr["timeout_timestamp"]),
          attr["remote_receiver"],
          attr["remote_denom"],
          attr["local_sender"]
        ),
        ...basicInfo,
      };
    });
    const ackPackets = sendToCosmosEvents.map((attr) => {
      return {
        data: this.transformEventToTonAckPacket(
          BigInt(attr["opcode_packet"]),
          BigInt(attr["seq"]),
          Number(attr["ack"])
        ),
        ...basicInfo,
      };
    });
    return {
      transferPackets: transferPacket.length > 0 ? transferPacket : [],
      ackPackets: ackPackets.length > 0 ? ackPackets : [],
    };
  }

  transformEventToTonAckPacket(
    opcode_packet: bigint,
    seq: bigint,
    ack: number
  ) {
    return beginCell()
      .storeUint(opcode_packet, 32)
      .storeUint(seq, 64)
      .storeUint(ack, 2)
      .endCell();
  }

  transformEventToTransferPacket(
    opcode_packet: bigint,
    seq: bigint,
    token_origin: bigint,
    amount: bigint,
    timeout_timestamp: bigint,
    to: string,
    denom: string,
    local_sender: string
  ) {
    const bech32Address = fromBech32(local_sender).data;
    return beginCell()
      .storeUint(opcode_packet, 32)
      .storeUint(seq, 64)
      .storeUint(token_origin, 32)
      .storeUint(amount, 128)
      .storeUint(timeout_timestamp, 64)
      .storeAddress(checkTonDenom(to))
      .storeAddress(checkTonDenom(denom))
      .storeRef(
        beginCell()
          .storeUint(bech32Address.length, 8)
          .storeBuffer(Buffer.from(bech32Address))
          .endCell()
      )
      .endCell();
  }
}

export enum CosmwasmWatcherEvent {
  PARSED_DATA = "parsed_data",
  SYNC_DATA = "sync_data",
}

export class CosmwasmWatcher<T> extends EventEmitter {
  public running = false;

  constructor(
    private syncData: SyncData,
    private cosmwasmParser: ICosmwasmParser<T>
  ) {
    super();
  }

  async start() {
    if (this.syncData && this.running) {
      this.syncData.destroy();
    }
    this.running = true;
    await this.syncData.start();
    this.syncData.on(CHANNEL.QUERY, async (chunk: Txs) => {
      const parsedData = this.cosmwasmParser.processChunk(chunk) as Packets;
      if (parsedData && parsedData.transferPackets.length > 0) {
        this.emit(CosmwasmWatcherEvent.PARSED_DATA, parsedData);
      }

      if (chunk) {
        this.emit(CosmwasmWatcherEvent.SYNC_DATA, chunk);
      }
    });
  }
}

export const createUpdateClientData = async (
  rpcUrl: string,
  height: number
): Promise<LightClientData> => {
  const tendermintClient = await Tendermint34Client.connect(rpcUrl);
  const [
    {
      block: { lastCommit },
    },
    {
      block: { header },
    },
    { validators },
  ] = await Promise.all([
    tendermintClient.block(height + 1),
    tendermintClient.block(height),
    tendermintClient.validators({
      height,
      per_page: 100,
    }),
  ]);

  return {
    validators: validators.map(serializeValidator),
    lastCommit: serializeCommit(lastCommit),
    header: serializeHeader(header),
  };
};

export const createCosmosBridgeWatcher = (
  bridgeWasmAddress: string,
  syncDataOpt: SyncDataOptions
) => {
  const syncData = new SyncData(syncDataOpt);
  const bridgeParser = new CosmwasmBridgeParser(bridgeWasmAddress);
  const cosmwasmWatcher = new CosmwasmWatcher(syncData, bridgeParser);
  return cosmwasmWatcher;
};
