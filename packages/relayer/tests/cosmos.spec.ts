import {Event} from '@cosmjs/stargate';
import { BridgeAdapterSrc } from '../src/constants';
import  * as dataTxs from './mock/data/MockBridgeTx.json';
import { CosmwasmParser } from '../src/cosmos.service';

describe("CosmosParser", ()=>{
    it('should parse events from Tx[]', async()=>{
       const expectedEvent:Event = {
        type: 'wasm',
        "attributes":[
            {
                "key":"_contract_address",
                "value":"orai1xv4vq2gjthk3j8d3q4sud5vzv2z3d8j2u3g8f0"
            },
            {
                "key":"action",
                "value":"transfer_to_ton"
            },
            {
                "key":"to",
                "value":"EQABEq658dLg1KxPhXZxj0vapZMNYevotqeINH786lpwwSnT"
            },
            {
                "key":"denom",
                "value":"EQCEfNVcw3GktXPgqavdsvEHl57KWE7cFgQNcDVNWH3DtYie"
            },
            {
                "key":"amount",
                "value":"100000000"
            },
            {
                "key":"crcSrc",
                "value": BridgeAdapterSrc.COSMOS.toString()
            }
        ]
       }
       const rawLog = JSON.parse(dataTxs.txs[0].rawLog);
       rawLog[0].events.push(expectedEvent);
       dataTxs.txs[0].rawLog = JSON.stringify(rawLog);
       const cosmosParser = new CosmwasmParser("orai1xv4vq2gjthk3j8d3q4sud5vzv2z3d8j2u3g8f0");
       const result =  cosmosParser.processChunk(dataTxs as any);
       console.log(result.allBridgeData);
    })
})