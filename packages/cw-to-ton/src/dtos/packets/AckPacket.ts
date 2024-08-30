import { beginCell, Cell } from "@ton/core";
import { IntoCell } from "./interface";

export interface AckPacketArgs {
  opcode_packet: string;
  seq: string;
  ack: string;
}

export enum ACK {
  Ok = 0,
  Err = 1,
  Timeout = 2,
}

export class AckPacket implements IntoCell {
  opcode_packet: bigint;
  seq: bigint;
  ack: ACK;

  constructor(args: AckPacketArgs) {
    this.opcode_packet = BigInt(args.opcode_packet);
    this.seq = BigInt(args.seq);
    this.ack = Number(args.ack);
  }

  static fromRawAttributes(attrs: Record<string, string>) {
    return new AckPacket({
      opcode_packet: attrs["opcode_packet"],
      seq: attrs["seq"],
      ack: attrs["ack"],
    });
  }

  intoCell(): Cell {
    return beginCell()
      .storeUint(this.opcode_packet, 32)
      .storeUint(this.seq, 64)
      .storeUint(this.ack, 2)
      .endCell();
  }
}
