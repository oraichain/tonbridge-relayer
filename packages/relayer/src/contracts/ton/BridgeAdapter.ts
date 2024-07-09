import { crc32 } from "../../constants/crc32";

export const Src = {
  COSMOS: crc32("src::cosmos"),
  TON: crc32("src::ton"),
  TIMEOUT_SEND_PACKET: crc32("src::timeout_send_packet"),
};

export const Recv = {
  TIMEOUT_RECV_PACKET: crc32("recv::timeout_recv_packet"),
};
