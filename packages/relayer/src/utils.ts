import {
  Validator,
  Header,
  BlockId,
  Commit,
  toRfc3339WithNanoseconds,
  fromRfc3339WithNanoseconds,
} from "@cosmjs/tendermint-rpc";
import {
  SerializedValidator,
  SerializedBlockId,
  SerializedHeader,
  SerializedCommit,
} from "./@types/interfaces/cosmwasm";

export const serializeValidator = (
  validator: Validator
): SerializedValidator => {
  return {
    address: Buffer.from(validator.address).toString("hex"),
    pub_key: {
      type: validator.pubkey.algorithm,
      value: Buffer.from(validator.pubkey.data).toString("hex"),
    },
    voting_power: validator.votingPower,
    proposer_priority: validator.proposerPriority,
  };
};

export const serializeBlockId = (
  blockId: BlockId | null
): SerializedBlockId => {
  return blockId
    ? {
        hash: Buffer.from(blockId.hash).toString("hex"),
        parts: {
          total: blockId.parts.total,
          hash: Buffer.from(blockId.parts.hash).toString("hex"),
        },
      }
    : null;
};

export const serializeHeader = (header: Header): SerializedHeader => {
  return {
    ...header,
    lastBlockId: serializeBlockId(header.lastBlockId),
    time: toRfc3339WithNanoseconds(header.time),
    blockId: serializeBlockId(header.lastBlockId),
    lastCommitHash: Buffer.from(header.lastCommitHash).toString("hex"),
    dataHash: Buffer.from(header.dataHash).toString("hex"),
    validatorsHash: Buffer.from(header.validatorsHash).toString("hex"),
    nextValidatorsHash: Buffer.from(header.nextValidatorsHash).toString("hex"),
    consensusHash: Buffer.from(header.consensusHash).toString("hex"),
    appHash: Buffer.from(header.appHash).toString("hex"),
    lastResultsHash: Buffer.from(header.lastResultsHash).toString("hex"),
    evidenceHash: Buffer.from(header.evidenceHash).toString("hex"),
    proposerAddress: Buffer.from(header.proposerAddress).toString("hex"),
  };
};

export const serializeCommit = (commit: Commit): SerializedCommit => {
  return {
    ...commit,
    blockId: serializeBlockId(commit.blockId),
    signatures: commit.signatures.map((sig) => {
      return {
        blockIdFlag: sig.blockIdFlag,
        validatorAddress: sig.validatorAddress
          ? Buffer.from(sig.validatorAddress).toString("hex")
          : null,
        timestamp: sig.timestamp
          ? toRfc3339WithNanoseconds(sig.timestamp)
          : null,
        signature: sig.signature
          ? Buffer.from(sig.signature).toString("hex")
          : null,
      };
    }),
  };
};

export const deserializeValidator = (
  serializedValidator: SerializedValidator
): Validator => {
  return {
    address: Buffer.from(serializedValidator.address, "hex"),
    pubkey: {
      algorithm: serializedValidator.pub_key.type,
      data: Buffer.from(serializedValidator.pub_key.value, "hex"),
    },
    votingPower: serializedValidator.voting_power,
    proposerPriority: serializedValidator.proposer_priority,
  };
};

export const deserializeBlockId = (
  serializedBlockId: SerializedBlockId | null
): BlockId | null => {
  if (serializedBlockId) {
    return {
      hash: Buffer.from(serializedBlockId.hash, "hex"),
      parts: {
        total: serializedBlockId.parts.total,
        hash: Buffer.from(serializedBlockId.parts.hash, "hex"),
      },
    };
  } else {
    return null;
  }
};

export const deserializeHeader = (
  serializedHeader: SerializedHeader
): Header => {
  return {
    ...serializedHeader,
    time: fromRfc3339WithNanoseconds(serializedHeader.time),
    lastBlockId: deserializeBlockId(serializedHeader.blockId),
    lastCommitHash: Buffer.from(serializedHeader.lastCommitHash, "hex"),
    dataHash: Buffer.from(serializedHeader.dataHash, "hex"),
    validatorsHash: Buffer.from(serializedHeader.validatorsHash, "hex"),
    nextValidatorsHash: Buffer.from(serializedHeader.nextValidatorsHash, "hex"),
    consensusHash: Buffer.from(serializedHeader.consensusHash, "hex"),
    appHash: Buffer.from(serializedHeader.appHash, "hex"),
    lastResultsHash: Buffer.from(serializedHeader.lastResultsHash, "hex"),
    evidenceHash: Buffer.from(serializedHeader.evidenceHash, "hex"),
    proposerAddress: Buffer.from(serializedHeader.proposerAddress, "hex"),
  };
};

export const deserializeCommit = (
  serializedCommit: SerializedCommit
): Commit => {
  return {
    ...serializedCommit,
    blockId: deserializeBlockId(serializedCommit.blockId),
    signatures: serializedCommit.signatures.map((sig) => {
      return {
        blockIdFlag: sig.blockIdFlag,
        validatorAddress: sig.validatorAddress
          ? Buffer.from(sig.validatorAddress, "hex")
          : Buffer.from(""),
        timestamp: sig.timestamp
          ? fromRfc3339WithNanoseconds(sig.timestamp)
          : new Date("0001-01-01T00:00:00Z"),
        signature: sig.signature ? Buffer.from(sig.signature, "hex") : null,
      };
    }),
  };
};
