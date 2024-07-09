import { ConnectionOptions, Job, Worker } from "bullmq";
import { envConfig } from "./config";
import { Cell, OpenedContract, Sender, toNano } from "@ton/core";
import {
  BridgeAdapter,
  LightClientMaster,
} from "@oraichain/ton-bridge-contracts";
import { Tendermint34Client } from "@cosmjs/tendermint-rpc";
import { decodeTxRaw, Registry } from "@cosmjs/proto-signing";
import { defaultRegistryTypes } from "@cosmjs/stargate";
import { MsgExecuteContract } from "cosmjs-types/cosmwasm/wasm/v1/tx";
import { TxWasm } from "@oraichain/ton-bridge-contracts/wrappers/@types";
import {
  getMerkleProofs,
  getExistenceProofSnakeCell,
} from "@oraichain/ton-bridge-contracts/wrappers/utils";
import { Packet, LightClientData } from "./@types/interfaces/cosmwasm";
import {
  deserializeCommit,
  deserializeHeader,
  deserializeValidator,
} from "@oraichain/ton-bridge-contracts/wrappers/utils";

import { TonClient, WalletContractV4 } from "@ton/ton";
import { sleep, waitSeqno } from "./utils";
import { ExistenceProof } from "cosmjs-types/cosmos/ics23/v1/proofs";

export type RelayCosmwasmData = {
  data: {
    packetBoc: string;
    proofs: ExistenceProof[];
  };
  clientData: LightClientData;
  provenHeight: number;
};

export enum TonWorkerJob {
  RelayPacket = "RelayPacket",
}

export enum CosmosWorkerJob {
  SubmitData = "SubmitData",
}

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

export const createTonWorker = (
  connection: ConnectionOptions,
  walletContract: OpenedContract<WalletContractV4>,
  sender: Sender,
  tonClient: TonClient,
  lightClientMaster: OpenedContract<LightClientMaster>,
  bridgeAdapter: OpenedContract<BridgeAdapter>
) => {
  const tonWorker = new Worker(
    "ton",
    async (job: Job<RelayCosmwasmData>) => {
      const data = job.data;
      const { data: packetAndProof, provenHeight, clientData } = data;
      const currentHeight = await lightClientMaster.getTrustedHeight();
      if (currentHeight < provenHeight) {
        await lightClientMaster.sendVerifyBlockHash(
          sender,
          {
            header: deserializeHeader(clientData.header),
            validators: clientData.validators.map(deserializeValidator),
            commit: deserializeCommit(clientData.lastCommit),
          },
          { value: toNano("3") }
        );
        await waitSeqno(walletContract, await walletContract.getSeqno());
        await sleep(30000);
      }

      const { packetBoc: packet, proofs: serializeProofs } = packetAndProof;
      const proofs = serializeProofs.map((proof) => {
        return ExistenceProof.fromJSON(proof);
      });

      await bridgeAdapter.sendBridgeRecvPacket(
        sender,
        {
          provenHeight,
          packet: Cell.fromBoc(Buffer.from(packet, "hex"))[0],
          proofs: getExistenceProofSnakeCell(proofs)!,
        },
        { value: toNano("0.8") }
      );
      console.log("[TON-WORKER] Relay packet successfully");
      await waitSeqno(walletContract, await walletContract.getSeqno());
      await sleep(30000);
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
  bridgeWasm: any
) => {
  const cosmosWorker = new Worker(
    "cosmos",
    async (job: Job<Packet>) => {
      const data = job.data;
      switch (job.name) {
        case CosmosWorkerJob.SubmitData: {
          console.log("[COSMOS-WORKER] Submitting data to cosmos bridge");
          const result = await bridgeWasm.submitBridgeToTonInfo(data);
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
