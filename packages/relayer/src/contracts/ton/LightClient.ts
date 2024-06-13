import {
  Address,
  beginCell,
  Cell,
  Contract,
  contractAddress,
  ContractProvider,
  Dictionary,
  Sender,
  SendMode,
} from "@ton/core";

import {
  getAuthInfoInput,
  getBlockSlice,
  getMerkleProofs,
  getTimeSlice,
  getVersionSlice,
  txBodyWasmToRef,
} from "./utils";

import { crc32 } from "@src/constants/crc32";
import { Commit, Header, Validator } from "@cosmjs/tendermint-rpc";
import { TxWasm } from "@src/@types/common";

export type LightClientConfig = {
  height: number;
  chainId: string;
  dataHash: string;
  validatorHashSet: string;
  nextValidatorHashSet: string;
};

export function lightClientConfigToCell(config: LightClientConfig): Cell {
  return beginCell()
    .storeUint(0, 1)
    .storeUint(0, 8)
    .storeRef(
      beginCell()
        .storeUint(config.height, 32)
        .storeRef(
          beginCell().storeBuffer(Buffer.from(config.chainId)).endCell()
        )
        .storeRef(
          beginCell().storeBuffer(Buffer.from(config.dataHash)).endCell()
        )
        .storeRef(
          beginCell()
            .storeBuffer(Buffer.from(config.validatorHashSet))
            .endCell()
        )
        .endCell()
    )
    .storeRef(
      beginCell()
        .storeRef(
          beginCell()
            .storeUint(0, 256)
            .storeRef(beginCell().endCell())
            .storeRef(beginCell().storeDict(Dictionary.empty()).endCell())
            .endCell()
        )
        .storeRef(
          beginCell()
            .storeUint(0, 256)
            .storeRef(beginCell().endCell())
            .storeRef(beginCell().storeDict(Dictionary.empty()).endCell())
            .endCell()
        )
        .endCell()
    )
    .endCell();
}

export const Opcodes = {
  verify_block_hash: crc32("op::verify_block_hash"),
  store_untrusted_validators: crc32("op::store_untrusted_validators"),
  verify_sigs: crc32("op::verify_sigs"),
  verify_receipt: crc32("op::verify_receipt"),
  verify_untrusted_validators: crc32("op::verify_untrusted_validators"),
};

type SendOpts = {
  queryID?: number;
  value: bigint;
};

export class LightClient implements Contract {
  constructor(
    readonly address: Address,
    readonly init?: { code: Cell; data: Cell }
  ) {}

  static createFromAddress(address: Address) {
    return new LightClient(address);
  }

  static createFromConfig(
    config: LightClientConfig,
    code: Cell,
    workchain = 0
  ) {
    const data = lightClientConfigToCell(config);
    const init = { code, data };
    return new LightClient(contractAddress(workchain, init), init);
  }

  async sendDeploy(provider: ContractProvider, via: Sender, value: bigint) {
    await provider.internal(via, {
      value,
      sendMode: SendMode.PAY_GAS_SEPARATELY,
      body: beginCell().endCell(),
    });
  }

  async sendVerifyBlockHash(
    provider: ContractProvider,
    via: Sender,
    header: Header,
    validators: Validator[],
    commit: Commit,
    opts: SendOpts
  ) {
    const data = beginCell()
      .storeRef(getBlockHashCell(header))
      .storeRef(getValidatorsCell(validators))
      .storeRef(getCommitCell(commit))
      .endCell();

    await provider.internal(via, {
      value: opts.value,
      sendMode: SendMode.PAY_GAS_SEPARATELY,
      body: beginCell()
        .storeUint(Opcodes.verify_block_hash, 32)
        .storeUint(opts?.queryID || 0, 64)
        .storeRef(data)
        .endCell(),
    });
  }

  async sendVerifySigs(
    provider: ContractProvider,
    via: Sender,
    commit: Commit,
    opts: SendOpts
  ) {
    const commitCell = getCommitCell(commit);
    const cell = beginCell().storeRef(commitCell).endCell();
    await provider.internal(via, {
      value: opts.value,
      sendMode: SendMode.PAY_GAS_SEPARATELY,
      body: beginCell()
        .storeUint(Opcodes.verify_sigs, 32)
        .storeUint(opts?.queryID || 0, 64)
        .storeRef(cell)
        .endCell(),
    });
  }

  async sendVerifyReceipt(
    provider: ContractProvider,
    via: Sender,
    height: string,
    tx: TxWasm,
    leaves: Buffer[],
    leafData: Buffer,
    opts: SendOpts
  ) {
    const { signInfos, fee, tip } = getAuthInfoInput(tx.authInfo);
    const authInfo = beginCell()
      .storeRef(signInfos || beginCell().endCell())
      .storeRef(fee)
      .storeRef(tip)
      .endCell();

    const txBody = txBodyWasmToRef(tx.body);
    let signatureCell: Cell | undefined;

    for (let i = tx.signatures.length - 1; i >= 0; i--) {
      const signature = tx.signatures[i];
      const cell = beginCell()
        .storeRef(beginCell().storeBuffer(Buffer.from(signature)).endCell())
        .endCell();
      if (!signatureCell) {
        signatureCell = beginCell()
          .storeRef(beginCell().endCell())
          .storeRef(cell)
          .endCell();
      } else {
        signatureCell = beginCell()
          .storeRef(signatureCell)
          .storeRef(cell)
          .endCell();
      }
    }
    const txRaw = beginCell()
      .storeRef(authInfo)
      .storeRef(txBody)
      .storeRef(signatureCell || beginCell().endCell())
      .endCell();

    const { branch: proofs, positions } = getMerkleProofs(leaves, leafData);

    await provider.internal(via, {
      value: opts.value,
      sendMode: SendMode.PAY_GAS_SEPARATELY,
      body: beginCell()
        .storeUint(Opcodes.verify_receipt, 32)
        .storeUint(opts?.queryID || 0, 64)
        .storeRef(
          beginCell()
            .storeUint(BigInt(height), 32)
            .storeRef(txRaw)
            .storeRef(proofs || beginCell().endCell())
            .storeRef(positions)
            .endCell()
        )
        .endCell(),
    });
  }

  async sendVerifyUntrustedValidators(
    provider: ContractProvider,
    via: Sender,
    opts?: SendOpts
  ) {
    await provider.internal(via, {
      value: opts.value,
      sendMode: SendMode.PAY_GAS_SEPARATELY,
      body: beginCell()
        .storeUint(Opcodes.verify_untrusted_validators, 32)
        .storeUint(opts?.queryID || 0, 64)
        .storeRef(beginCell().endCell())
        .endCell(),
    });
  }

  async sendStoreUntrustedValidators(
    provider: ContractProvider,
    via: Sender,
    validators: Validator[],
    opts?: SendOpts
  ) {
    const validatorCell = getValidatorsCell(validators);
    await provider.internal(via, {
      value: opts.value,
      sendMode: SendMode.PAY_GAS_SEPARATELY,
      body: beginCell()
        .storeUint(Opcodes.store_untrusted_validators, 32)
        .storeUint(opts?.queryID || 0, 64)
        .storeRef(validatorCell!)
        .endCell(),
    });
  }

  async getHeight(provider: ContractProvider) {
    const result = await provider.get("get_height", []);
    return result.stack.readNumber();
  }

  async getChainId(provider: ContractProvider) {
    const result = await provider.get("get_chain_id", []);
    return result.stack.readBuffer().toString("utf-8");
  }

  async getDataHash(provider: ContractProvider) {
    const result = await provider.get("get_data_hash", []);
    return result.stack.readBuffer();
  }

  async getValidatorHash(provider: ContractProvider) {
    const result = await provider.get("get_validator_hash_set", []);
    return result.stack.readBuffer();
  }
}

const getCommitCell = (commit: Commit) => {
  let signatureCell: Cell | undefined;
  for (let i = commit.signatures.length - 1; i >= 0; i--) {
    const signature = commit.signatures[i];
    const cell = beginCell()
      .storeUint(signature.blockIdFlag, 8)
      .storeBuffer(Buffer.from(signature.validatorAddress))
      .storeRef(getTimeSlice(signature.timestamp))
      .storeBuffer(
        signature.signature ? Buffer.from(signature.signature) : Buffer.from("")
      )
      .endCell();
    if (!signatureCell) {
      signatureCell = beginCell()
        .storeRef(beginCell().endCell())
        .storeRef(cell)
        .endCell();
    } else {
      signatureCell = beginCell()
        .storeRef(signatureCell)
        .storeRef(cell)
        .endCell();
    }
  }
  const commitCell = beginCell()
    .storeUint(BigInt(commit.height), 32)
    .storeUint(BigInt(commit.round), 32)
    .storeRef(getBlockSlice(commit.blockId))
    .storeRef(signatureCell)
    .endCell();
  return commitCell;
};

const getValidatorsCell = (validators: Validator[]) => {
  let validatorCell;
  for (let i = validators.length - 1; i >= 0; i--) {
    let builder = beginCell().storeBuffer(Buffer.from(validators[i].address));
    if (validators[i]?.pubkey?.data) {
      builder = builder.storeRef(
        beginCell()
          .storeBuffer(Buffer.from(validators[i].pubkey.data))
          .endCell()
      );
    } else {
      builder = builder.storeRef(
        beginCell()
          .storeBuffer(
            Buffer.from(
              Array.from({ length: 32 })
                .map(() => 0)
                .join(""),
              "hex"
            )
          )
          .endCell()
      );
    }
    builder = builder.storeUint(validators[i].votingPower, 32);
    const innerCell = builder.endCell();
    if (!validatorCell) {
      validatorCell = beginCell()
        .storeRef(beginCell().endCell())
        .storeRef(innerCell)
        .endCell();
    } else {
      validatorCell = beginCell()
        .storeRef(validatorCell)
        .storeRef(innerCell)
        .endCell();
    }
  }
  return validatorCell;
};

const getBlockHashCell = (header: Header) => {
  const cell = beginCell()
    .storeRef(getVersionSlice(header.version))
    .storeRef(beginCell().storeBuffer(Buffer.from(header.chainId)).endCell())
    .storeUint(header.height, 32)
    .storeRef(getTimeSlice(header.time))
    .storeRef(getBlockSlice(header.lastBlockId))
    .storeBuffer(Buffer.from(header.proposerAddress));

  const hashCell1 = beginCell()
    .storeRef(beginCell().storeBuffer(Buffer.from(header.lastCommitHash)))
    .storeRef(beginCell().storeBuffer(Buffer.from(header.dataHash)))
    .storeRef(beginCell().storeBuffer(Buffer.from(header.validatorsHash)))
    .storeRef(beginCell().storeBuffer(Buffer.from(header.nextValidatorsHash)));

  const hashCell2 = beginCell()
    .storeRef(beginCell().storeBuffer(Buffer.from(header.consensusHash)))
    .storeRef(beginCell().storeBuffer(Buffer.from(header.appHash)))
    .storeRef(beginCell().storeBuffer(Buffer.from(header.lastResultsHash)))
    .storeRef(beginCell().storeBuffer(Buffer.from(header.evidenceHash)));

  const dsCell = beginCell()
    .storeRef(cell)
    .storeRef(hashCell1)
    .storeRef(hashCell2)
    .endCell();

  return dsCell;
};
