import {
  TonbridgeBridgeClient,
  TonbridgeValidatorClient,
} from "@oraichain/tonbridge-contracts-sdk";
import {
  LiteClient,
  LiteEngine,
  LiteRoundRobinEngine,
  LiteSingleEngine,
} from "ton-lite-client";
import TonWeb from "tonweb";
import TonBlockProcessor from "./block-processor";
import TonTxProcessor from "./tx-processor";
import TonToCwRelayer from "./index";
import dotenv from "dotenv";
import { initSignClient } from "./client";
import { intToIP } from "./constants";

dotenv.config();

const CW_TON_BRIDGE = process.env.CW_TON_BRIDGE;
const CW_TON_VALDATOR = process.env.CW_TON_VALDATOR;
const JETTON_BRIDGE = process.env.JETTON_BRIDGE;

function validate() {
  if (!CW_TON_BRIDGE || !CW_TON_VALDATOR || !JETTON_BRIDGE) {
    throw new Error("Missing parameters");
  }
}

(async () => {
  validate();
  const client = await initSignClient(process.env.MNEMONIC);
  // setup lite engine server
  const { liteservers } = await fetch(
    "https://ton.org/global.config.json"
  ).then((data) => data.json());
  const engines: LiteEngine[] = [];
  engines.push(
    ...liteservers.map(
      (server: any) =>
        new LiteSingleEngine({
          host: `tcp://${intToIP(server.ip)}:${server.port}`,
          publicKey: Buffer.from(server.id.key, "base64"),
        })
    )
  );
  const liteEngine = new LiteRoundRobinEngine(engines);
  const liteClient = new LiteClient({ engine: liteEngine });

  // should host a private ton http api in production: https://github.com/toncenter/ton-http-api
  const tonWeb = new TonWeb(
    new TonWeb.HttpProvider(process.env.TON_HTTP_API_URL)
  );

  const validator = new TonbridgeValidatorClient(
    client.client,
    client.sender,
    CW_TON_VALDATOR
  );
  const bridge = new TonbridgeBridgeClient(
    client.client,
    client.sender,
    CW_TON_BRIDGE
  );

  const blockProcessor = new TonBlockProcessor(validator, liteClient, tonWeb);
  const txProcessor = new TonTxProcessor(
    validator,
    bridge,
    liteClient,
    blockProcessor,
    JETTON_BRIDGE
    // "b4c796dc353687b1b571da07ef428e1d90eeac4922c8c2ee19b82a41dd66cac3"
  );

  const relayer = new TonToCwRelayer()
    .withBlockProcessor(blockProcessor)
    .withTxProcessor(txProcessor);

  relayer.relay();
})();
