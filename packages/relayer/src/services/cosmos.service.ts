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

export const enum BRIDGE_WASM_ACTION {
  BRIDGE_TO_TON = "bridge_to_ton",
}

export class CosmwasmBridgeParser implements ICosmwasmParser<Packets> {
  constructor(private bridgeWasmAddress: string) {}

  processChunk(chunk: Txs): Packets {
    const { txs } = chunk;
    const packets = [];
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
      .filter((data) => data.packetTransfer.length > 0);
    allBridgeData.forEach((data) => {
      packets.push(...data.packetTransfer);
    });

    return {
      packets: packets.toSorted(
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
    const packetTransferToTon = wasmAttr
      .filter(filterByContractAddress)
      .filter((attr) => attr["action"] === BRIDGE_WASM_ACTION.BRIDGE_TO_TON);
    // parse event to `to, denom, amount, crcSrc`
    const packetTransfer = packetTransferToTon.map((attr) => {
      return {
        data: this.transformToTransferPacket(
          Number(attr["seq"]),
          attr["dest_receiver"],
          attr["dest_denom"],
          BigInt(attr["remote_amount"]),
          BigInt(attr["crc_src"]),
          BigInt(attr["timeout"]),
          attr["local_sender"]
        ),
        ...basicInfo,
      };
    });
    return {
      packetTransfer: packetTransfer.length > 0 ? packetTransfer : [],
    };
  }

  transformToTransferPacket(
    seq: number,
    to: string,
    denom: string,
    amount: bigint,
    crcSrc: bigint,
    timeout: bigint,
    local_sender: string
  ) {
    return beginCell()
      .storeUint(seq, 64)
      .storeUint(BridgeAdapterPacketOpcodes.sendToTon, 32)
      .storeUint(crcSrc, 32)
      .storeAddress(checkTonDenom(to))
      .storeAddress(checkTonDenom(denom))
      .storeUint(amount, 128)
      .storeUint(timeout, 64)
      .storeRef(beginCell().storeBuffer(Buffer.from(local_sender)).endCell())
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
      if (parsedData && parsedData.packets.length > 0) {
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
