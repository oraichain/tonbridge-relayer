export type Config = {
  cwTonBridge: string;
  cwTonValidators: string;
  jettonBridge: string;
  tonHttpApiURL: string;
  tonApiKey: string;
  mnemonic: string;
};

export function loadConfig(): Config {
  return {
    cwTonBridge: process.env.CW_TON_BRIDGE,
    cwTonValidators: process.env.CW_TON_VALDATOR,
    jettonBridge: process.env.JETTON_BRIDGE,
    tonHttpApiURL: process.env.TON_HTTP_API_URL,
    tonApiKey: process.env.TON_API_KEY,
    mnemonic: process.env.MNEMONIC,
  };
}
