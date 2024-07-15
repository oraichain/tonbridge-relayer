import { Config as CwToTonConfig } from "@oraichain/tonbridge-relayer-to-ton";
import { Config as TonToCwConfig } from "@oraichain/tonbridge-relayer-to-cw";

export type Config = {
  cwToTon: CwToTonConfig;
  tonToCw: TonToCwConfig;
};
