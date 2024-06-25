import {
  CHANNEL,
  SyncData,
  SyncDataOptions,
  Txs,
} from "@oraichain/cosmos-rpc-sync";
import { Address, beginCell } from "@ton/core";
import { Event } from "@cosmjs/stargate";
import { parseWasmEvents } from "@oraichain/oraidex-common";
import { Log } from "@cosmjs/stargate/build/logs";
import { EventEmitter } from "stream";
import { BasicTxInfo } from "@src/@types/common";
import {
  BridgeParsedData,
  ICosmwasmParser,
} from "@src/@types/interfaces/cosmwasm";
import { Tendermint34Client } from "@cosmjs/tendermint-rpc";
import {
  serializeCommit,
  serializeHeader,
  serializeValidator,
} from "@src/utils";
import {
  LightClientData,
  SerializedTx,
} from "@src/@types/interfaces/cosmwasm/serialized";

export const enum BRIDGE_ACTION {
  TRANSFER_TO_TON = "transfer_to_ton",
  RELAYER_SUBMIT = "submit_bridge_to_ton_info",
}

export class CosmwasmBridgeParser implements ICosmwasmParser<BridgeParsedData> {
  constructor(private bridgeWasmAddress: string) {}

  processChunk(chunk: Txs): BridgeParsedData {
    const { txs } = chunk;
    const submittedTxs = [];
    const submitData = [];
    const allBridgeData = txs
      .filter((tx) => tx.code === 0)
      .flatMap((tx) => {
        const logs: Log[] = JSON.parse(tx.rawLog);
        return logs.map((log) =>
          this.extractEventToBridgeData(
            log.events,
            tx.hash,
            tx.height,
            tx.timestamp
          )
        );
      })
      .filter(
        (data) => data.submittedTxs.length > 0 || data.submitData.length > 0
      );

    allBridgeData.forEach((data) => {
      submittedTxs.push(...data.submittedTxs);
      submitData.push(...data.submitData);
    });
    return {
      submittedTxs: submittedTxs.toSorted(
        (a: BasicTxInfo, b: BasicTxInfo) => a.height - b.height
      ),
      submitData: submitData.toSorted(
        (a: BasicTxInfo, b: BasicTxInfo) => a.height - b.height
      ),
    };
  }

  extractEventToBridgeData(
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
    const transferToTon = wasmAttr
      .filter(filterByContractAddress)
      .filter((attr) => attr["action"] === BRIDGE_ACTION.TRANSFER_TO_TON);
    // This action come from relayer need to relay to TON.
    const relayerSubmitEvent = wasmAttr
      .filter(filterByContractAddress)
      .filter((attr) => attr["action"] === BRIDGE_ACTION.RELAYER_SUBMIT)
      .map((attr) => {
        return {
          ...attr,
          ...basicInfo,
        };
      });
    // parse event to `to, denom, amount, crcSrc`
    const submitData = transferToTon.map((attr) => {
      return {
        data: this.transformToSubmitActionCell(
          Number(attr["seq"]),
          attr["dest_receiver"],
          attr["dest_denom"],
          BigInt(attr["remote_amount"]),
          BigInt(attr["crc_src"])
        ),
        ...basicInfo,
      };
    });
    return {
      submittedTxs: relayerSubmitEvent.length > 0 ? relayerSubmitEvent : [],
      submitData: submitData.length > 0 ? submitData : [],
    };
  }

  transformToSubmitActionCell(
    seq: number,
    to: string,
    denom: string,
    amount: bigint,
    crcSrc: bigint
  ) {
    return Buffer.from(
      beginCell()
        .storeUint(seq, 64)
        .storeAddress(Address.parse(to))
        .storeAddress(Address.parse(denom))
        .storeUint(amount, 128)
        .storeUint(crcSrc, 32)
        .endCell()
        .bits.toString(),
      "hex"
    )
      .toString("hex")
      .toUpperCase();
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
      const parsedData = this.cosmwasmParser.processChunk(chunk);
      if (parsedData) {
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
      block: { header, txs },
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
    txs: txs.map((tx) => Buffer.from(tx).toString("hex")) as SerializedTx[],
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
