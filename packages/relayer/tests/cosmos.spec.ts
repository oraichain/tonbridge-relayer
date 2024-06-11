import {Event} from '@cosmjs/stargate';
import { BridgeAdapterSrc } from '../src/constants';
import  * as dataTxs from './mock/data/MockBridgeTx.json';
import { BRIDGE_ACTION, CosmwasmBridgeParser } from '../src/cosmos.service';

describe("CosmosParser", ()=>{
    it('should parse events transfer_to_ton from Tx[]', async()=>{
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
       const cosmosParser = new CosmwasmBridgeParser("orai1xv4vq2gjthk3j8d3q4sud5vzv2z3d8j2u3g8f0");
       const {submitData} =  cosmosParser.processChunk(dataTxs as any);
       console.log(submitData[0]);
       expect(submitData.length).toBe(1);
    })

    it('should parse events submit from Tx[]', async()=>{
        const expectedEvent:Event = {
         type: 'wasm',
         "attributes":[
             {
                 "key":"_contract_address",
                 "value":"orai1xv4vq2gjthk3j8d3q4sud5vzv2z3d8j2u3g8f0"
             },
             {
                 "key":"action",
                 "value":`${BRIDGE_ACTION.RELAYER_SUBMIT}`
             },
             {
                "key":"data",
                "value": "80002255D73E3A5C1A9589F0AECE31E97B54B261AC3D7D16D4F1068FDF9D4B4E18300211F355730DC692D5CF82A6AF76CBC41E5E7B29613B70581035C0D53561F70ED417D78400139517D2"
             }
         ]
        }
        const rawLog = JSON.parse(dataTxs.txs[0].rawLog);
        rawLog[0].events.push(expectedEvent);
        dataTxs.txs[0].rawLog = JSON.stringify(rawLog);
        const cosmosParser = new CosmwasmBridgeParser("orai1xv4vq2gjthk3j8d3q4sud5vzv2z3d8j2u3g8f0");
        const {submittedTxs} =  cosmosParser.processChunk(dataTxs as any);
        expect(submittedTxs.length > 0).toBeTruthy();
     })
})