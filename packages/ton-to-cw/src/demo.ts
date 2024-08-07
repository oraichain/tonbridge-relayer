// import { SimulateCosmWasmClient } from "@oraichain/cw-simulate";
// import { ORAI, toAmount } from "@oraichain/oraidex-common";
// import { OraiswapTokenClient } from "@oraichain/oraidex-contracts-sdk";
// import {
//   InstantiateMsg as Cw20InstantiateMsg,
//   MinterResponse,
// } from "@oraichain/oraidex-contracts-sdk/build/OraiswapToken.types";
// import { deployContract } from "@oraichain/tonbridge-contracts-build";
// import {
//   TonbridgeBridgeClient,
//   TonbridgeValidatorClient,
// } from "@oraichain/tonbridge-contracts-sdk";
// import {
//   LiteClient,
//   LiteEngine,
//   LiteRoundRobinEngine,
//   LiteSingleEngine,
// } from "ton-lite-client";
// import TonWeb from "tonweb";
// import TonBlockProcessor from "./block-processor";
// import TonTxProcessor from "./tx-processor";
// import TonToCwRelayer from ".";
// import dotenv from "dotenv";
// import { InstantiateMsg } from "@oraichain/tonbridge-contracts-sdk/build/TonbridgeBridge.types";
// dotenv.config();

// export function intToIP(int: number) {
//   var part1 = int & 255;
//   var part2 = (int >> 8) & 255;
//   var part3 = (int >> 16) & 255;
//   var part4 = (int >> 24) & 255;

//   return part4 + "." + part3 + "." + part2 + "." + part1;
// }

// (async () => {
//   const client = new SimulateCosmWasmClient({
//     chainId: "Oraichain",
//     bech32Prefix: "orai",
//     metering: true,
//   });
//   const sender = "orai12zyu8w93h0q2lcnt50g3fn0w3yqnhy4fvawaqz";

//   // setup lite engine server
//   const { liteservers } = await fetch(
//     "https://ton.org/global.config.json"
//   ).then((data) => data.json());
//   const engines: LiteEngine[] = [];
//   engines.push(
//     ...liteservers.map(
//       (server: any) =>
//         new LiteSingleEngine({
//           host: `tcp://${intToIP(server.ip)}:${server.port}`,
//           publicKey: Buffer.from(server.id.key, "base64"),
//         })
//     )
//   );
//   const liteEngine = new LiteRoundRobinEngine(engines);
//   const liteClient = new LiteClient({ engine: liteEngine });

//   // should host a private ton http api in production: https://github.com/toncenter/ton-http-api
//   const tonWeb = new TonWeb(
//     new TonWeb.HttpProvider(process.env.TON_HTTP_API_URL)
//   );

//   const masterchainInfo = await liteClient.getMasterchainInfoExt();
//   const { rawBlockData } = await TonBlockProcessor.queryKeyBlock(
//     masterchainInfo.last.seqno,
//     liteClient
//   );
//   let initialKeyBlockBoc = rawBlockData.data.toString("hex");

//   // deploy contracts
//   const validatorDeployResult = await deployContract(
//     client,
//     sender,
//     { boc: initialKeyBlockBoc },
//     "bridge-validator",
//     "cw-tonbridge-validator"
//   );
//   const bridgeDeployResult = await deployContract(
//     client,
//     sender,
//     {
//       bridge_adapter: "EQAE8anZidQFTKcsKS_98iDEXFkvuoa1YmVPxQC279zAoV7R",
//       relayer_fee_token: { native_token: { denom: ORAI } },
//       relayer_fee_receiver: sender,
//       swap_router_contract: sender,
//       token_fee_receiver: sender,
//       validator_contract_addr: validatorDeployResult.contractAddress,
//     } as InstantiateMsg,
//     "bridge-bridge",
//     "cw-tonbridge-bridge"
//   );
//   const dummyTokenDeployResult = await deployContract(
//     client,
//     sender,
//     {
//       decimals: 6,
//       initial_balances: [
//         { address: sender, amount: toAmount(10000).toString() },
//       ],
//       name: "Dummy Token",
//       symbol: "DUMMY",
//       mint: {
//         minter: bridgeDeployResult.contractAddress,
//       } as MinterResponse,
//     } as Cw20InstantiateMsg,
//     "dummy-token",
//     "oraiswap-token"
//   );

//   const validator = new TonbridgeValidatorClient(
//     client,
//     sender,
//     validatorDeployResult.contractAddress
//   );
//   const bridge = new TonbridgeBridgeClient(
//     client,
//     sender,
//     bridgeDeployResult.contractAddress
//   );
//   const dummyToken = new OraiswapTokenClient(
//     client,
//     sender,
//     dummyTokenDeployResult.contractAddress
//   );

//   // FIXME: change denom & channel id to correct denom and channel id
//   await bridge.updateMappingPair({
//     denom: ORAI,
//     localAssetInfo: { token: { contract_addr: dummyToken.contractAddress } },
//     localChannelId: "channel-0",
//     localAssetInfoDecimals: 6,
//     remoteDecimals: 9, // standard of TEPS: https://github.com/ton-blockchain/TEPs/blob/master/text/0064-token-data-standard.md
//     opcode: "0000000000000000000000000000000000000000000000000000000000000002",
//   });

//   const blockProcessor = new TonBlockProcessor(validator, liteClient, tonWeb);
//   const txProcessor = new TonTxProcessor(
//     validator,
//     bridge,
//     liteClient,
//     blockProcessor,
//     "EQAwHLrVuAOgcA1x53KDXxyAL5ETqQFaAa7tT0wIi7UOrkNS"
//     // "b4c796dc353687b1b571da07ef428e1d90eeac4922c8c2ee19b82a41dd66cac3"
//   );

//   const relayer = new TonToCwRelayer()
//     .withBlockProcessor(blockProcessor)
//     .withTxProcessor(txProcessor);

//   relayer.relay();
// })();
