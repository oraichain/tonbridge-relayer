import { MsgExecuteContract } from "cosmjs-types/cosmwasm/wasm/v1/tx";
import { Any } from "cosmjs-types/google/protobuf/any";
import { AuthInfo } from 'cosmjs-types/cosmos/tx/v1beta1/tx';


export type TxBodyWasm = {
    messages: {
        typeUrl: '/cosmwasm.wasm.v1.MsgExecuteContract';
        value: MsgExecuteContract;
    }[];
    memo: string;
    timeoutHeight: number;
    extensionOptions: Any[];
    nonCriticalExtensionOptions: Any[];
};

export type TxWasm = {
    body: TxBodyWasm;
    authInfo: AuthInfo;
    signatures: string[];
};

export type BasicTxInfo = {
    hash: string;
    height: number;
    time?: string;
  };