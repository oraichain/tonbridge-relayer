import { Job, Worker } from "bullmq";
import { envConfig } from "./config";
import { OpenedContract, toNano } from "@ton/core";
import { SandboxContract, Treasury, TreasuryContract } from "@ton/sandbox";
import { LightClient, Opcodes } from "./contracts/ton/LightClient";
import { BridgeAdapter } from "./contracts/ton/BridgeAdapter";
import { Commit, Header, Validator } from "@cosmjs/tendermint-rpc";
import { WalletContractV4 } from "@ton/ton";

const connection = {
  host: envConfig.REDIS_HOST,
  port: envConfig.REDIS_PORT,
};

export type RelayCosmwasmData = {
  data: string;
  clientData: LightClientData;
  txHash: string;
};

export type LightClientData = {
  validators: readonly Validator[];
  lastCommit: Commit;
  header: Header;
};

export enum TonWorkerJob {
  RelayCosmWasmData = "RelayCosmWasmData",
}

const updateBlock = async (
  lightClient: SandboxContract<LightClient>,
  relayer: SandboxContract<TreasuryContract>,
  clientData: LightClientData
) => {
  const { header, lastCommit, validators } = clientData;

  let result = await lightClient.sendVerifyBlockHash(
    relayer.getSender(),
    {
      appHash: Buffer.from(header.appHash).toString("hex"),
      chainId: header.chainId,
      consensusHash: Buffer.from(header.consensusHash).toString("hex"),
      dataHash: Buffer.from(header.dataHash).toString("hex"),
      evidenceHash: Buffer.from(header.evidenceHash).toString("hex"),
      height: BigInt(header.height),
      lastBlockId: header.lastBlockId,
      lastCommitHash: Buffer.from(header.lastCommitHash).toString("hex"),
      lastResultsHash: Buffer.from(header.lastResultsHash).toString("hex"),
      validatorHash: Buffer.from(header.validatorsHash).toString("hex"),
      nextValidatorHash: Buffer.from(header.nextValidatorsHash).toString("hex"),
      proposerAddress: Buffer.from(header.proposerAddress).toString("hex"),
      time: header.time.toISOString(),
      version: header.version,
    },
    { value: toNano("0.5") }
  );

  result = await lightClient.sendStoreUntrustedValidators(
    relayer.getSender(),
    validators,
    {
      value: toNano("0.5"),
    }
  );
  console.log(Opcodes.store_untrusted_validators);

  result = await lightClient.sendVerifyUntrustedValidators(
    relayer.getSender(),
    {
      value: toNano("1"),
    }
  );

  console.log(Opcodes.verify_untrusted_validators);

  result = await lightClient.sendVerifySigs(relayer.getSender(), lastCommit, {
    value: toNano("1"),
  });

  console.log("verify_sigs", Opcodes.verify_sigs);

  console.log("Finished: ", {
    height: await lightClient.getHeight(),
    chainId: await lightClient.getChainId(),
    dataHash: (await lightClient.getDataHash()).toString("hex"),
    validatorHash: (await lightClient.getValidatorHash()).toString("hex"),
  });
};

export const createTonWorker = (
  lightClient: OpenedContract<LightClient> | SandboxContract<LightClient>,
  bridgeAdapter: OpenedContract<BridgeAdapter> | SandboxContract<BridgeAdapter>
) => {
  const tonWorker = new Worker(
    "ton",
    async (job: Job<RelayCosmwasmData>) => {
      const data = job.data;
      switch (job.name) {
        case TonWorkerJob.RelayCosmWasmData:
          const height = await lightClient.getHeight();
          if (height < data.clientData.header.height) {
          }
          break;
        default:
          throw new Error(`Unknown job name: ${job.name}`);
      }
    },
    {
      connection,
      autorun: false,
    }
  );
  return tonWorker;
};
