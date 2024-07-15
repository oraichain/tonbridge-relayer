import { Config as TonConfig } from "@oraichain/tonbridge-relayer-to-ton";
export type Config = {};

export type TonConfig = {
  tonCenterUrl: string;
  tonCenterApiKey: string;
};

export type CosmosConfig = {
  rpcUrl: string;
  prefix: string;
  denom: string;
  gasFee: string;
  mnemonic: string;
  ton_bridge: string;
  ton_validator: string;
};
