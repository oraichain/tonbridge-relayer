import { crc32 } from "./crc32";

export const BridgeAdapterOpCodes = {
  sendTx: crc32("op::send_tx"),
  confirmTx: crc32("op::confirm_tx"),
};

export const BridgeAdapterSrc = {
  COSMOS: crc32("src::cosmos"),
  TON: crc32("src::ton"),
};
