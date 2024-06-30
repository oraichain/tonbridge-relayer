import { Cell, Contract,  ContractProvider,  Sender,  TupleReader } from '@ton/core';
import { TxWasm } from 'src/@types/common';

export interface IBridgeAdapter extends Contract {
     sendTx(
        provider: ContractProvider,
        via: Sender,
        height: bigint,
        txWasm: TxWasm,
        proofs: Cell | undefined,
        positions: Cell,
        data: Cell,
        value: bigint,
    ):Promise<void>;

     getBridgeData(provider: ContractProvider):Promise<TupleReader>;
}
