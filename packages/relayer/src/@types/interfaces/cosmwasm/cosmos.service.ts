import { Txs } from "@oraichain/cosmos-rpc-sync";
import { BasicTxInfo } from "@src/@types/common";

export interface ICosmwasmParser<T> {
    processChunk(chunk: Txs): T;
}

export type BridgeData =  {
    data:string,
} & BasicTxInfo;

export type BridgeParsedData = {
    submitData: BridgeData[],
    submittedTxs: BridgeData[]
}