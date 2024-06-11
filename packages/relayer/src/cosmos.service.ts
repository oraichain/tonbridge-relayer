import { CHANNEL, SyncData, Tx, Txs } from "@oraichain/cosmos-rpc-sync";
import { Address, beginCell } from "@ton/core";
import { Event } from "@cosmjs/stargate";
import {parseWasmEvents} from '@oraichain/oraidex-common';
import { Log } from "@cosmjs/stargate/build/logs";
import { EventEmitter } from "stream";

export const enum BRIDGE_ACTION {
    TRANSFER_TO_TON = "transfer_to_ton",
    RELAYER_SUBMIT = "submit"
}

export class CosmwasmParser {
    constructor(private bridgeWasmAddress:string){}

    processChunk(chunk: Txs){
        const {txs} = chunk;
        const allBridgeData = txs.flatMap(tx => {
            const logs:Log[] = JSON.parse(tx.rawLog);
            return logs.map(log => this.extractEventToBridgeData(log.events, tx.hash, tx.height, tx.timestamp))
        }).filter(data => data.relayerSubmitEvent.length > 0 || data.submitData.length > 0);
        return {allBridgeData}
    }

    extractEventToBridgeData(events: readonly Event[], hash:string, height:number, timestamp:string){
        const basicInfo = {
            hash: hash,
            height: height,
            timestamp: timestamp
        }
        const wasmAttr = parseWasmEvents(events);
        const filterByContractAddress = (attr: any) => attr["_contract_address"] === this.bridgeWasmAddress;
        // This action come from user need to normalize and submit by relayer.
        const transferToTon = wasmAttr.filter(filterByContractAddress).filter(attr => attr["action"] === BRIDGE_ACTION.TRANSFER_TO_TON);
        // This action come from relayer need to relay to TON.
        const relayerSubmitEvent = wasmAttr.filter(filterByContractAddress).filter(attr => attr["action"] === BRIDGE_ACTION.RELAYER_SUBMIT);
        // parse event to `to, denom, amount, crcSrc`
        const submitData = transferToTon.map(attr => this.transformToSubmitActionCell(attr["to"], attr["denom"], BigInt(attr["amount"]), BigInt(attr["crcSrc"])));
        return {
            relayerSubmitEvent:relayerSubmitEvent.length > 0 ? {
                ...relayerSubmitEvent,
                ...basicInfo // we need for fetching header, validators and commits
            }: [],
            submitData: submitData.length > 0 ? submitData : [],
        }
    }

    transformToSubmitActionCell(to: string, denom:string, amount: bigint, crcSrc: bigint){
        return Buffer.from(beginCell()
        .storeAddress(Address.parse(to))
        .storeAddress(Address.parse(denom))
        .storeUint(amount, 32)
        .storeUint(crcSrc, 32)
        .endCell().bits.toString(),'hex').toString('hex').toUpperCase();
    }
}


export class CosmwasmWatcher extends EventEmitter {
    public running = false;
    constructor(private syncData: SyncData, private cosmwasmParser: CosmwasmParser){
        super();
    }

    async start(){
        if(this.syncData && this.running){
            this.syncData.destroy();
        }

        this.running = true;
        await this.syncData.start();

        this.syncData.on(CHANNEL.QUERY, async(chunk:Txs)=>{
            const {offset: newOffSet} = chunk;
            // TODO: Update offset here for database of relayer
            const {allBridgeData} = await this.cosmwasmParser.processChunk(chunk);
            const transferToTonData = allBridgeData.map(data => data.submitData);
            const relayerSubmitEvent = allBridgeData.flatMap(data => data.relayerSubmitEvent);
            if(transferToTonData.length > 0){
                this.emit(BRIDGE_ACTION.TRANSFER_TO_TON, transferToTonData);
            }
            if(relayerSubmitEvent.length > 0){
                this.emit(BRIDGE_ACTION.RELAYER_SUBMIT, relayerSubmitEvent);
            }
        })
    }
}