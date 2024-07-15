export type Config = {
  cwTonBridge: string;
  cwTonValidators: string;
  jettonBridge: string;
  tonHttpApiURL: string;
  mnemonic: string;
};

export function loadConfig(): Config {
  return {
    cwTonBridge: process.env.CW_TON_BRIDGE,
    cwTonValidators: process.env.CW_TON_VALDATOR,
    jettonBridge: process.env.JETTON_BRIDGE,
    tonHttpApiURL: process.env.TON_HTTP_API_URL,
    mnemonic: process.env.MNEMONIC,
  };
}
