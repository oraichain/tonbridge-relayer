import { beginCell, Cell } from "@ton/core";
import { IntoCell } from "./interface";
import { checkTonDenom } from "@src/utils";
import { fromBech32 } from "@cosmjs/encoding";

export interface TransferPacketArgs {
  seq: string;
  opcode_packet: string;
  token_origin: string;
  remote_amount: string;
  timeout_timestamp: string;
  remote_receiver: string;
  remote_denom: string;
  local_sender: string;
}

export class TransferPacket implements IntoCell {
  seq: number;
  opcode_packet: number;
  token_origin: number;
  remote_amount: bigint;
  timeout_timestamp: bigint;
  remote_denom: string;
  remote_receiver: string;
  local_sender: string;

  constructor(args: TransferPacketArgs) {
    this.local_sender = args.local_sender;
    this.remote_denom = args.remote_denom;
    this.remote_receiver = args.remote_receiver;
    this.timeout_timestamp = BigInt(args.timeout_timestamp);
    this.remote_amount = BigInt(args.remote_amount);
    this.token_origin = Number(args.token_origin);
    this.opcode_packet = Number(args.opcode_packet);
    this.seq = Number(args.seq);
  }

  static fromRawAttributes(attrs: Record<string, string>) {
    return new TransferPacket({
      seq: attrs["seq"],
      opcode_packet: attrs["opcode_packet"],
      token_origin: attrs["token_origin"],
      remote_amount: attrs["remote_amount"],
      timeout_timestamp: attrs["timeout_timestamp"],
      remote_receiver: attrs["remote_receiver"],
      remote_denom: attrs["remote_denom"],
      local_sender: attrs["local_sender"],
    });
  }

  intoCell(): Cell {
    const bech32Address = fromBech32(this.local_sender).data;
    return beginCell()
      .storeUint(this.opcode_packet, 32)
      .storeUint(this.seq, 64)
      .storeUint(this.token_origin, 32)
      .storeUint(this.remote_amount, 128)
      .storeUint(this.timeout_timestamp, 64)
      .storeAddress(checkTonDenom(this.remote_receiver))
      .storeAddress(checkTonDenom(this.remote_denom))
      .storeRef(
        beginCell()
          .storeUint(bech32Address.length, 8)
          .storeBuffer(Buffer.from(bech32Address))
          .endCell()
      )
      .endCell();
  }
}
