import { Cell, Tuple, TupleItem, TupleItemSlice, beginCell } from "@ton/core";
import crypto from "crypto";
import { Any } from "cosmjs-types/google/protobuf/any";

import {
  Fee,
  Tip,
  TxBody,
  ModeInfo_Single,
  SignerInfo,
  AuthInfo,
} from "cosmjs-types/cosmos/tx/v1beta1/tx";

import { int64FromString, writeVarint64 } from "cosmjs-types/varint";
import { MsgExecuteContract } from "cosmjs-types/cosmwasm/wasm/v1/tx";

export type TestClientConfig = {
  id: number;
  counter: number;
};

export function testClientConfigToCell(config: TestClientConfig): Cell {
  return beginCell()
    .storeUint(config.id, 32)
    .storeUint(config.counter, 32)
    .endCell();
}
export type Version = {
  block: string | number;
  app?: string | number;
};

export type BlockId = {
  hash: string;
  parts: {
    hash: string;
    total: number;
  };
};

export type CanonicalVote = {
  type: number;
  height: number;
  round: number;
  block_id: BlockId;
  timestamp: string;
  chain_id: string;
};

export type TxBodyWasm = {
  messages: {
    typeUrl: "/cosmwasm.wasm.v1.MsgExecuteContract";
    value: MsgExecuteContract;
  }[];
  memo: string;
  timeoutHeight: number;
  extensionOptions: Any[];
  nonCriticalExtensionOptions: Any[];
};

export type TxWasm = {
  body: TxBodyWasm;
  authInfo: AuthInfo;
  signatures: string[];
};

export const getTimeComponent = (timestampz: string) => {
  const millis = new Date(timestampz).getTime();
  const seconds = Math.floor(millis / 1000);
  // ghetto, we're pulling the nanoseconds from the string
  const withoutZone = timestampz.slice(0, -1);
  const nanosStr = withoutZone.split(".")[1] || "";
  const nanoseconds = Number(nanosStr.padEnd(9, "0"));
  return { seconds, nanoseconds };
};

export const getVersionSlice = (version: Version): Cell => {
  let cell = beginCell();
  cell = cell.storeUint(Number(version.block), 32);
  if (version.app) {
    cell = cell.storeUint(Number(version.app), 32);
  }

  return cell.endCell();
};

export const getTimeSlice = (timestampz: string): Cell => {
  const { seconds, nanoseconds } = getTimeComponent(timestampz);
  let cell = beginCell();
  cell = cell
    .storeUint(seconds < 0 ? 0 : seconds, 32)
    .storeUint(nanoseconds < 0 ? 0 : nanoseconds, 32);

  return cell.endCell();
};

export const getInt64Slice = (modeInfo: ModeInfo_Single) => {
  const { lo, hi } = int64FromString(modeInfo.mode.toString());
  const buff = [] as number[];
  writeVarint64({ lo, hi }, buff, 0);
  return beginCell().storeBuffer(Buffer.from(buff)).endCell();
};

export const getBlockSlice = (blockId: BlockId): Cell => {
  return beginCell()
    .storeUint(blockId.hash ? BigInt("0x" + blockId.hash) : 0n, 256)
    .storeUint(blockId.parts.hash ? BigInt("0x" + blockId.parts.hash) : 0n, 256)
    .storeUint(blockId.parts.total, 8)
    .endCell();
};

export const getCanonicalVoteSlice = (vote: CanonicalVote): Cell => {
  return beginCell()
    .storeUint(vote.type, 32)
    .storeUint(vote.height, 32)
    .storeUint(vote.round, 32)
    .storeRef(getBlockSlice(vote.block_id))
    .storeRef(getTimeSlice(vote.timestamp))
    .storeRef(beginCell().storeBuffer(Buffer.from(vote.chain_id)).endCell())
    .endCell();
};

export const getSignInfoCell = (mode: SignerInfo): Cell => {
  const typeUrl = beginCell()
    .storeBuffer(Buffer.from(mode!.publicKey!.typeUrl))
    .endCell();
  const value = buildRecursiveSliceRef(mode!.publicKey!.value);
  const anyCell = beginCell()
    .storeRef(typeUrl)
    .storeRef(value || beginCell().endCell())
    .endCell();
  const modeInfo = mode.modeInfo?.single
    ? getInt64Slice(mode.modeInfo?.single)
    : beginCell().endCell();
  const { lo, hi } = int64FromString(mode.sequence.toString());
  const buff = [] as number[];
  writeVarint64({ lo, hi }, buff, 0);
  const sequence = beginCell().storeBuffer(Buffer.from(buff)).endCell();
  const inputCell = beginCell()
    .storeRef(anyCell)
    .storeRef(modeInfo)
    .storeRef(sequence)
    .endCell();
  return inputCell;
};

export const getFeeCell = (fee: Fee): Cell => {
  const { lo, hi } = int64FromString(fee.gasLimit.toString());
  const buff = [] as number[];
  writeVarint64({ lo, hi }, buff, 0);
  let amountsCell;
  for (let i = fee.amount.length - 1; i >= 0; i--) {
    const innerCell = beginCell()
      .storeRef(
        beginCell().storeBuffer(Buffer.from(fee.amount[i].denom)).endCell()
      )
      .storeRef(
        beginCell().storeBuffer(Buffer.from(fee.amount[i].amount)).endCell()
      )
      .endCell();
    if (!amountsCell) {
      amountsCell = beginCell()
        .storeRef(beginCell().endCell())
        .storeRef(innerCell)
        .endCell();
    } else {
      amountsCell = beginCell()
        .storeRef(amountsCell)
        .storeRef(innerCell)
        .endCell();
    }
  }
  const inputRef = beginCell()
    .storeRef(amountsCell!)
    .storeRef(beginCell().storeBuffer(Buffer.from(buff)).endCell())
    .storeRef(beginCell().storeBuffer(Buffer.from(fee.payer)).endCell())
    .storeRef(beginCell().storeBuffer(Buffer.from(fee.granter)).endCell())
    .endCell();
  return inputRef;
};

export const getTipCell = (tip: Tip): Cell => {
  let amountsCell;
  for (let i = tip.amount.length - 1; i >= 0; i--) {
    const innerCell = beginCell()
      .storeRef(
        beginCell().storeBuffer(Buffer.from(tip.amount[i].denom)).endCell()
      )
      .storeRef(
        beginCell().storeBuffer(Buffer.from(tip.amount[i].amount)).endCell()
      )
      .endCell();
    if (!amountsCell) {
      amountsCell = beginCell()
        .storeRef(beginCell().endCell())
        .storeRef(innerCell)
        .endCell();
    } else {
      amountsCell = beginCell()
        .storeRef(amountsCell)
        .storeRef(innerCell)
        .endCell();
    }
  }

  const inputCell = beginCell()
    .storeRef(amountsCell!)
    .storeRef(beginCell().storeBuffer(Buffer.from(tip.tipper)).endCell())
    .endCell();
  return inputCell;
};

export const buildCellTuple = (value: string | Uint8Array) => {
  const tupleCell: TupleItem[] = [];
  let longBuf = Buffer.from(value);
  if (typeof value === "string") {
    longBuf = Buffer.from(value, "base64");
  }

  for (let i = 0; i < longBuf.length; i += 127) {
    tupleCell.push({
      type: "slice",
      cell: beginCell()
        .storeBuffer(
          Buffer.from(longBuf.subarray(i, Math.min(longBuf.length, i + 127)))
        )
        .endCell(),
    });
  }
  return tupleCell;
};

export const buildRecursiveSliceRef = (
  value: string | Uint8Array
): Cell | undefined => {
  let longBuf = Buffer.from(value);
  let innerCell: Cell | undefined;

  if (typeof value === "string") {
    longBuf = Buffer.from(value, "base64");
  }

  for (let i = longBuf.length; i > 0; i -= 127) {
    if (!innerCell) {
      innerCell = beginCell()
        .storeRef(beginCell().endCell()) // This still stop when reach that ref, but this will be our convention for more than two refs recursive
        .storeBuffer(Buffer.from(longBuf.subarray(Math.max(0, i - 127), i)))
        .endCell();
    } else {
      innerCell = beginCell()
        .storeRef(innerCell)
        .storeBuffer(Buffer.from(longBuf.subarray(Math.max(0, i - 127), i)))
        .endCell();
    }
  }

  return innerCell;
};

export const buildSliceTupleFromUint8Array = (value: Uint8Array) => {
  const tupleCell: TupleItem[] = [];

  for (let i = 0; i < value.length; i += 127) {
    tupleCell.push({
      type: "slice",
      cell: beginCell()
        .storeBuffer(
          Buffer.from(value.subarray(i, Math.min(value.length, i + 127)))
        )
        .endCell(),
    });
  }
  return tupleCell;
};

export const anyToTuple = (value: Any): Tuple => {
  const tupleAny: TupleItem[] = [];

  const typeUrlSlice: TupleItemSlice = {
    type: "slice",
    cell: beginCell().storeBuffer(Buffer.from(value.typeUrl)).endCell(),
  };

  tupleAny.push(typeUrlSlice);
  tupleAny.push({ type: "tuple", items: buildCellTuple(value.value) });

  return {
    type: "tuple",
    items: tupleAny,
  };
};

const leafPrefix = Uint8Array.from([0]);
const innerPrefix = Uint8Array.from([1]);

// getSplitPoint returns the largest power of 2 less than length
const getSplitPoint = (length: number) => {
  if (length < 1) {
    throw new Error("Trying to split a tree with size < 1");
  }

  const bitlen = (Math.log2(length) + 1) >> 0;
  let k = 1 << (bitlen - 1);
  if (k === length) {
    k >>= 1;
  }
  return k;
};

// returns tmhash(0x01 || left || right)
export const innerHash = (left: Buffer, right: Buffer) => {
  return crypto
    .createHash("sha256")
    .update(Buffer.concat([innerPrefix, left, right]))
    .digest();
};

export const leafHash = (leaf: Buffer) => {
  const leafBuf = Buffer.concat([leafPrefix, leaf]);
  return crypto.createHash("sha256").update(leafBuf).digest();
};

export interface MerkleTree {
  left?: MerkleTree;
  right?: MerkleTree;
  parent?: MerkleTree;
  value?: Buffer;
}

export const getMerkleTree = (
  items: Buffer[],
  lookUp: { [key: string]: MerkleTree } = {}
) => {
  const root: MerkleTree = {};
  switch (items.length) {
    case 0:
      root.value = crypto.createHash("sha256").update(Buffer.from([])).digest();
      break;
    case 1:
      root.value = leafHash(items[0]);
      break;
    default:
      const k = getSplitPoint(items.length);
      root.left = getMerkleTree(items.slice(0, k), lookUp).root;
      root.right = getMerkleTree(items.slice(k), lookUp).root;
      root.value = innerHash(root.left.value!, root.right.value!);
      root.left.parent = root.right.parent = root;
  }
  lookUp[root.value!.toString("hex")] = root;
  return { root, lookUp };
};

export const getMerkleProofs = (leaves: Buffer[], leafData: Buffer) => {
  const { root, lookUp } = getMerkleTree(leaves);
  const leaf = leafHash(leafData);
  let node = lookUp[Buffer.from(leaf).toString("hex")];
  let positions = beginCell();
  let branch = [];
  let branchCell: Cell | undefined;
  while (node.parent) {
    const isRight = node.parent.right!.value!.equals(node.value!);
    // left is 1, right is 0
    positions = positions.storeBit(isRight ? 1 : 0);
    branch.push(isRight ? node.parent.left!.value! : node.parent.right!.value!);
    node = node.parent;
  }

  for (let i = branch.length - 1; i >= 0; i--) {
    const innerCell = beginCell().storeBuffer(branch[i]).endCell();
    if (!branchCell) {
      branchCell = beginCell()
        .storeRef(beginCell().endCell())
        .storeRef(innerCell)
        .endCell();
    } else {
      branchCell = beginCell()
        .storeRef(branchCell)
        .storeRef(innerCell)
        .endCell();
    }
  }

  return { root, branch: branchCell, positions: positions.endCell() };
};

export const txBodyWasmToRef = (txBodyWasm: TxBodyWasm) => {
  let messagesCell: Cell | undefined;

  for (let i = txBodyWasm.messages.length - 1; i >= 0; i--) {
    const typeUrl = beginCell()
      .storeBuffer(Buffer.from(txBodyWasm.messages[i].typeUrl))
      .endCell();
    const value = msgExecuteContractToCell(txBodyWasm.messages[i].value);
    const innerCell = beginCell()
      .storeRef(typeUrl)
      .storeRef(value || beginCell().endCell())
      .endCell();
    if (!messagesCell) {
      messagesCell = beginCell()
        .storeRef(beginCell().endCell())
        .storeRef(innerCell)
        .endCell();
    } else {
      messagesCell = beginCell()
        .storeRef(messagesCell)
        .storeRef(innerCell)
        .endCell();
    }
  }

  const memo_timeout_height_builder = beginCell();

  if (txBodyWasm.memo) {
    memo_timeout_height_builder.storeRef(
      beginCell().storeBuffer(Buffer.from(txBodyWasm.memo, "hex")).endCell()
    );
  }

  if (txBodyWasm.timeoutHeight > 0n) {
    memo_timeout_height_builder.storeUint(txBodyWasm.timeoutHeight, 64);
  }

  let extCell;
  for (let i = txBodyWasm.extensionOptions.length - 1; i >= 0; i--) {
    const typeUrl = beginCell()
      .storeBuffer(Buffer.from(txBodyWasm.extensionOptions[i].typeUrl))
      .endCell();
    const value = buildRecursiveSliceRef(txBodyWasm.extensionOptions[i].value);
    const innerCell = beginCell()
      .storeRef(typeUrl)
      .storeRef(value || beginCell().endCell())
      .endCell();
    if (!extCell) {
      extCell = beginCell()
        .storeRef(beginCell().endCell())
        .storeRef(innerCell)
        .endCell();
    } else {
      extCell = beginCell().storeRef(extCell).storeRef(innerCell).endCell();
    }
  }

  let nonExtCell;
  for (let i = txBodyWasm.nonCriticalExtensionOptions.length - 1; i >= 0; i--) {
    const typeUrl = beginCell()
      .storeBuffer(
        Buffer.from(txBodyWasm.nonCriticalExtensionOptions[i].typeUrl)
      )
      .endCell();
    const value = buildRecursiveSliceRef(
      txBodyWasm.nonCriticalExtensionOptions[i].value
    );
    const innerCell = beginCell()
      .storeRef(typeUrl)
      .storeRef(value || beginCell().endCell())
      .endCell();
    if (!nonExtCell) {
      nonExtCell = beginCell()
        .storeRef(beginCell().endCell())
        .storeRef(innerCell)
        .endCell();
    } else {
      nonExtCell = beginCell()
        .storeRef(nonExtCell)
        .storeRef(innerCell)
        .endCell();
    }
  }

  return beginCell()
    .storeRef(messagesCell ? messagesCell : beginCell().endCell())
    .storeRef(memo_timeout_height_builder.endCell())
    .storeRef(extCell ? extCell : beginCell().endCell())
    .storeRef(nonExtCell ? nonExtCell : beginCell().endCell())
    .endCell();
};

export const txBodyToSliceRef = (txBodyWasm: TxBody) => {
  let messagesCell;
  for (let i = txBodyWasm.messages.length - 1; i >= 0; i--) {
    const typeUrl = beginCell()
      .storeBuffer(Buffer.from(txBodyWasm.messages[i].typeUrl))
      .endCell();
    const value = buildRecursiveSliceRef(txBodyWasm.messages[i].value);
    const innerCell = beginCell()
      .storeRef(typeUrl)
      .storeRef(value || beginCell().endCell())
      .endCell();
    if (!messagesCell) {
      messagesCell = beginCell()
        .storeRef(beginCell().endCell())
        .storeRef(innerCell)
        .endCell();
    } else {
      messagesCell = beginCell()
        .storeRef(messagesCell)
        .storeRef(innerCell)
        .endCell();
    }
  }

  const memo_timeout_height_builder = beginCell();
  if (txBodyWasm.memo) {
    const memoBuilder = beginCell().storeBuffer(
      Buffer.from(txBodyWasm.memo, "hex")
    );
    memo_timeout_height_builder.storeRef(memoBuilder.endCell());
  }

  if (txBodyWasm.timeoutHeight > 0n) {
    memo_timeout_height_builder.storeUint(txBodyWasm.timeoutHeight, 64);
  }

  let extCell;
  for (let i = txBodyWasm.extensionOptions.length - 1; i >= 0; i--) {
    const typeUrl = beginCell()
      .storeBuffer(Buffer.from(txBodyWasm.extensionOptions[i].typeUrl))
      .endCell();
    const value = buildRecursiveSliceRef(txBodyWasm.extensionOptions[i].value);
    const innerCell = beginCell()
      .storeRef(typeUrl)
      .storeRef(value || beginCell().endCell())
      .endCell();
    if (!extCell) {
      extCell = beginCell()
        .storeRef(beginCell().endCell())
        .storeRef(innerCell)
        .endCell();
    } else {
      extCell = beginCell().storeRef(extCell).storeRef(innerCell).endCell();
    }
  }

  let nonExtCell;
  for (let i = txBodyWasm.nonCriticalExtensionOptions.length - 1; i >= 0; i--) {
    const typeUrl = beginCell()
      .storeBuffer(
        Buffer.from(txBodyWasm.nonCriticalExtensionOptions[i].typeUrl)
      )
      .endCell();
    const value = buildRecursiveSliceRef(
      txBodyWasm.nonCriticalExtensionOptions[i].value
    );
    const innerCell = beginCell()
      .storeRef(typeUrl)
      .storeRef(value || beginCell().endCell())
      .endCell();
    if (!nonExtCell) {
      nonExtCell = beginCell()
        .storeRef(beginCell().endCell())
        .storeRef(innerCell)
        .endCell();
    } else {
      nonExtCell = beginCell()
        .storeRef(nonExtCell)
        .storeRef(innerCell)
        .endCell();
    }
  }

  return beginCell()
    .storeRef(messagesCell ? messagesCell : beginCell().endCell())
    .storeRef(memo_timeout_height_builder.endCell())
    .storeRef(extCell ? extCell : beginCell().endCell())
    .storeRef(nonExtCell ? nonExtCell : beginCell().endCell())
    .endCell();
};

export const msgExecuteContractToCell = (msg: MsgExecuteContract) => {
  const sender_contract = beginCell()
    .storeRef(beginCell().storeBuffer(Buffer.from(msg.sender)).endCell())
    .storeRef(beginCell().storeBuffer(Buffer.from(msg.contract)).endCell())
    .endCell();

  const msgToTuple = buildRecursiveSliceRef(msg.msg);

  let fundCell;
  for (let i = msg.funds.length - 1; i >= 0; i--) {
    const item = msg.funds[i];
    const innerCell = beginCell()
      .storeRef(beginCell().storeBuffer(Buffer.from(item.denom)).endCell())
      .storeRef(beginCell().storeBuffer(Buffer.from(item.amount)).endCell())
      .endCell();
    if (!fundCell) {
      fundCell = beginCell()
        .storeRef(beginCell().endCell())
        .storeRef(innerCell)
        .endCell();
    } else {
      fundCell = beginCell().storeRef(fundCell).storeRef(innerCell).endCell();
    }
  }

  return beginCell()
    .storeRef(sender_contract)
    .storeRef(msgToTuple ?? beginCell().endCell())
    .storeRef(fundCell ?? beginCell().endCell())
    .endCell();
};

export type PubKey = {
  type?: string;
  value?: string;
};

export type Validators = {
  address: string;
  pub_key: PubKey;
  voting_power: string;
  proposer_priority: string;
};

export type Header = {
  version: Version;
  chain_id: string;
  height: string;
  time: string;
  last_block_id: BlockId;
};

export type Commit = {
  height: string;
  round: number;
  block_id: BlockId;
  signatures: Signature[];
};

export type Signature = {
  block_id_flag: number;
  validator_address: string;
  timestamp: string;
  signature: string | null;
};

export function getAuthInfoInput(data: AuthInfo) {
  let finalSignInfosCell;
  for (let i = data.signerInfos.length - 1; i >= 0; i--) {
    const innerCell = getSignInfoCell(data.signerInfos[i]);
    if (!finalSignInfosCell) {
      finalSignInfosCell = beginCell()
        .storeRef(beginCell().endCell())
        .storeRef(innerCell)
        .endCell();
    } else {
      finalSignInfosCell = beginCell()
        .storeRef(finalSignInfosCell!)
        .storeRef(innerCell)
        .endCell();
    }
  }
  let fee = beginCell().endCell();
  if (data.fee) {
    fee = getFeeCell(data.fee) as any;
  }
  let tip = beginCell().endCell();
  if (data.tip) {
    tip = getTipCell(data.tip) as any;
  }
  return { signInfos: finalSignInfosCell, fee, tip };
}
