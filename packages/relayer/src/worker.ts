import { ConnectionOptions, Job, Worker } from "bullmq";
import { envConfig } from "./config";
import { beginCell, OpenedContract, Sender, toNano } from "@ton/core";
import { printTransactionFees, SandboxContract } from "@ton/sandbox";
import { LightClient, BridgeAdapter } from "@oraichain/ton-bridge-contracts";
import { Tendermint34Client } from "@cosmjs/tendermint-rpc";
import { decodeTxRaw, Registry } from "@cosmjs/proto-signing";
import { defaultRegistryTypes } from "@cosmjs/stargate";
import { MsgExecuteContract } from "cosmjs-types/cosmwasm/wasm/v1/tx";
import { TxWasm } from "@oraichain/ton-bridge-contracts/wrappers/@types";
import { getMerkleProofs } from "@oraichain/ton-bridge-contracts/wrappers/utils";
import { BridgeData, LightClientData } from "./@types/interfaces/cosmwasm";
import { ReadWriteStateInterface } from "./contracts/cosmwasm/mock";
import {
  deserializeCommit,
  deserializeHeader,
  deserializeValidator,
} from "@oraichain/ton-bridge-contracts/wrappers/utils";
import { sha256 } from "@cosmjs/crypto";

export type RelayCosmwasmData = {
  data: string;
  clientData: LightClientData;
  txHash: string;
};

export enum TonWorkerJob {
  RelayCosmWasmData = "RelayCosmWasmData",
}

export enum CosmosWorkerJob {
  SubmitData = "SubmitData",
}

export const updateCosmosLightClient = async (
  lightClient: SandboxContract<LightClient> | OpenedContract<LightClient>,
  sender: Sender,
  clientData: LightClientData
) => {
  const { header, lastCommit, validators } = clientData;
  const result = await lightClient.sendVerifyBlockHash(
    sender,
    {
      header: deserializeHeader(header),
      validators: validators.map(deserializeValidator),
      commit: deserializeCommit(lastCommit),
    },
    { value: toNano("3") }
  );
  return result;
};

export const getCosmosTxAndProofByHash = async (
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

export const createSandBoxTonWorker = (
  connection: ConnectionOptions,
  sender: Sender,
  lightClient: SandboxContract<LightClient>,
  bridgeAdapter: SandboxContract<BridgeAdapter>
) => {
  const tonWorker = new Worker(
    "ton",
    async (job: Job<RelayCosmwasmData>) => {
      const data = job.data;
      switch (job.name) {
        case TonWorkerJob.RelayCosmWasmData: {
          const height = await lightClient.getHeight();
          console.log("[TON-WORKER] LightClient current height", height);
          if (height < data.clientData.header.height) {
            console.log(
              "[TON-WORKER] Updating block:",
              data.clientData.header.height
            );
            const result = await updateCosmosLightClient(
              lightClient,
              sender,
              data.clientData
            );
            printTransactionFees((result as any).transactions);
            console.log(
              "[TON-WORKER] Updating block:",
              data.clientData.header.height,
              "successfully"
            );
          }
          const { txWasm, proofs, positions } = await getCosmosTxAndProofByHash(
            data.txHash,
            data.clientData.txs.map((tx) => sha256(Buffer.from(tx, "hex")))
          );
          console.log(
            "[TON-WORKER] Relaying tx:",
            data.txHash,
            "at height:",
            data.clientData.header.height
          );
          const result = await bridgeAdapter.sendTx(
            sender,
            {
              height: BigInt(data.clientData.header.height),
              tx: txWasm,
              proofs: proofs,
              positions: positions,
              data: beginCell()
                .storeBuffer(Buffer.from(data.data, "hex"))
                .endCell(),
            },
            { value: toNano("2") }
          );
          console.log("[bridgeAdapter-sendTx]");
          printTransactionFees((result as any).transactions);
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

export const createTonWorker = (
  connection: ConnectionOptions,
  sender: Sender,
  lightClient: OpenedContract<LightClient>,
  bridgeAdapter: OpenedContract<BridgeAdapter>
) => {
  const tonWorker = new Worker(
    "ton",
    async (job: Job<RelayCosmwasmData>) => {
      const data = job.data;
      switch (job.name) {
        case TonWorkerJob.RelayCosmWasmData: {
          const height = await lightClient.getHeight();
          console.log("[TON-WORKER] LightClient current height", height);
          if (height < data.clientData.header.height) {
            console.log(
              "[TON-WORKER] Updating block:",
              data.clientData.header.height
            );
            await updateCosmosLightClient(lightClient, sender, data.clientData);
            console.log(
              "[TON-WORKER] Updating block:",
              data.clientData.header.height,
              "successfully"
            );
          }
          const { txWasm, proofs, positions } = await getCosmosTxAndProofByHash(
            data.txHash,
            data.clientData.txs.map((tx) => sha256(Buffer.from(tx, "hex")))
          );
          console.log(
            "[TON-WORKER] Relaying tx:",
            data.txHash,
            "at height:",
            data.clientData.header.height
          );
          await bridgeAdapter.sendTx(
            sender,
            {
              height: BigInt(data.clientData.header.height),
              tx: txWasm,
              proofs: proofs,
              positions: positions,
              data: beginCell()
                .storeBuffer(Buffer.from(data.data, "hex"))
                .endCell(),
            },
            { value: toNano("2") }
          );
          console.log("[bridgeAdapter-sendTx]");
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
          console.log("[COSMOS-WORKER] Submitting data to cosmos bridge");
          const result = await bridgeWasm.submit(data);
          console.log(
            "[COSMOS-WORKER] Submit successfully at",
            result.transactionHash
          );
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
