import { ConnectionOptions, Job, Worker } from "bullmq";
import { envConfig } from "./config";
import { beginCell, OpenedContract, Sender, toNano } from "@ton/core";
import { SandboxContract } from "@ton/sandbox";
import { LightClient } from "./contracts/ton/LightClient";
import { BridgeAdapter } from "./contracts/ton/BridgeAdapter";
import {
  Commit,
  Header,
  Tendermint34Client,
  Validator,
} from "@cosmjs/tendermint-rpc";
import { decodeTxRaw, Registry } from "@cosmjs/proto-signing";
import { defaultRegistryTypes } from "@cosmjs/stargate";
import { MsgExecuteContract } from "cosmjs-types/cosmwasm/wasm/v1/tx";
import { TxWasm } from "./@types/common";
import { getMerkleProofs } from "./contracts/ton/utils";
import { BridgeData } from "./@types/interfaces/cosmwasm";
import { ReadWriteStateInterface } from "./contracts/cosmwasm/mock";

export type RelayCosmwasmData = {
  data: string;
  clientData: LightClientData;
  txHash: string;
};

export type LightClientData = {
  validators: readonly Validator[];
  lastCommit: Commit;
  header: Header;
  txs: Uint8Array[];
};

export enum TonWorkerJob {
  RelayCosmWasmData = "RelayCosmWasmData",
}

export const updateBlock = async (
  lightClient: SandboxContract<LightClient> | OpenedContract<LightClient>,
  sender: Sender,
  clientData: LightClientData
) => {
  const { header, lastCommit, validators } = clientData;
  console.log(header.time);
  const result = await lightClient.sendVerifyBlockHash(
    sender,
    {
      appHash: header.appHash,
      chainId: header.chainId,
      consensusHash: header.consensusHash,
      dataHash: header.dataHash,
      evidenceHash: header.evidenceHash,
      height: header.height,
      lastBlockId: header.lastBlockId,
      lastCommitHash: header.lastCommitHash,
      lastResultsHash: header.lastResultsHash,
      validatorHash: header.validatorsHash,
      nextValidatorHash: header.nextValidatorsHash,
      proposerAddress: header.proposerAddress,
      time: header.time.toString(),
      version: header.version,
    },
    [...validators],
    lastCommit,
    { value: toNano("2") }
  );
  console.log(result);
};

export const getTxAndProofByHash = async (
  txHash: string,
  txs: Uint8Array[]
) => {
  const tendermintClient = await Tendermint34Client.connect(
    envConfig.COSMOS_RPC_URL
  );
  const tx = await tendermintClient.tx({
    hash: Buffer.from(txHash, "hex"),
    prove: true,
  });
  const decodedTx = decodeTxRaw(tx.tx);
  const registry = new Registry(defaultRegistryTypes);
  registry.register(decodedTx.body.messages[0].typeUrl, MsgExecuteContract);
  const rawMsg = decodedTx.body.messages.map((msg) => {
    return {
      typeUrl: msg.typeUrl,
      value: registry.decode(msg) as MsgExecuteContract,
    };
  });
  const decodedTxWithRawMsg: TxWasm = {
    ...decodedTx,
    body: {
      messages: rawMsg,
      memo: decodedTx.body.memo,
      timeoutHeight: decodedTx.body.timeoutHeight,
      extensionOptions: decodedTx.body.extensionOptions,
      nonCriticalExtensionOptions: decodedTx.body.nonCriticalExtensionOptions,
    },
  };
  const index = tx.proof.proof.index;
  const txsBuffer = txs.map(Buffer.from);
  const { branch: proofs, positions } = getMerkleProofs(
    txsBuffer,
    txsBuffer[index]
  );

  return { txWasm: decodedTxWithRawMsg, proofs, positions };
};

export const createTonWorker = (
  connection: ConnectionOptions,
  sender: Sender,
  lightClient: OpenedContract<LightClient> | SandboxContract<LightClient>,
  bridgeAdapter: OpenedContract<BridgeAdapter> | SandboxContract<BridgeAdapter>
) => {
  const tonWorker = new Worker(
    "ton",
    async (job: Job<RelayCosmwasmData>) => {
      const data = job.data;
      switch (job.name) {
        case TonWorkerJob.RelayCosmWasmData: {
          const height = await lightClient.getHeight();
          console.log(height);
          if (height < data.clientData.header.height) {
            console.log(
              "[TON-WORKER] Updating block:",
              data.clientData.header.height
            );
            await updateBlock(lightClient, sender, data.clientData).catch(
              console.error
            );
            console.log(
              "[TON-WORKER] Updating block:",
              data.clientData.header.height,
              "successfully"
            );
            console.log("Finished: ", {
              height: await lightClient.getHeight(),
              chainId: await lightClient.getChainId(),
              dataHash: (await lightClient.getDataHash()).toString("hex"),
              validatorHash: (await lightClient.getValidatorHash()).toString(
                "hex"
              ),
            });
          }
          const { txWasm, proofs, positions } = await getTxAndProofByHash(
            data.txHash,
            data.clientData.txs
          );
          console.log("Relaying tx:", data.txHash, "at height:", height);
          await bridgeAdapter.sendTx(
            sender,
            BigInt(data.clientData.header.height),
            txWasm,
            proofs,
            positions,
            beginCell().storeBuffer(Buffer.from(data.data, "hex")).endCell(),
            toNano("2")
          );
          console.log("Relaying tx:", data.txHash, "successfully");
          break;
        }
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

export enum CosmosWorkerJob {
  SubmitData = "SubmitData",
}

export const createCosmosWorker = (
  connection: ConnectionOptions,
  bridgeWasm: ReadWriteStateInterface
) => {
  const cosmosWorker = new Worker(
    "cosmos",
    async (job: Job<BridgeData>) => {
      const data = job.data;
      switch (job.name) {
        case CosmosWorkerJob.SubmitData: {
          console.log("Submitting data to cosmos bridge");
          const result = await bridgeWasm.submit(data);
          console.log("Submit successfully at", result.transactionHash);
          break;
        }
        default:
          throw new Error(`Unknown job name: ${job.name}`);
      }
    },
    {
      connection,
      autorun: false,
    }
  );
  return cosmosWorker;
};