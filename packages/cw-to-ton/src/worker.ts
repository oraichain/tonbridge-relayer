import { ConnectionOptions, Job, Worker } from "bullmq";
import { Cell, OpenedContract, Sender, toNano } from "@ton/core";
import { LightClientData } from "./@types/interfaces/cosmwasm";
import {
  BridgeAdapter,
  LightClientMaster,
  deserializeCommit,
  deserializeHeader,
  deserializeValidator,
  getExistenceProofSnakeCell,
} from "@oraichain/ton-bridge-contracts";

import { TonClient, WalletContractV4 } from "@ton/ton";
import { retry, sleep, waitSeqno } from "./utils";
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

export const createTonWorker = (
  connection: ConnectionOptions,
  walletContract: OpenedContract<WalletContractV4>,
  sender: Sender,
  tonClient: TonClient, // TODO: Using when implement trace transaction
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
        console.log("[TON-WORKER] Update light client at", provenHeight);
        try {
          // retry 3 times with 5s delay
          retry(
            async () => {
              await lightClientMaster.sendVerifyBlockHash(
                sender,
                {
                  header: deserializeHeader(clientData.header),
                  validators: clientData.validators.map(deserializeValidator),
                  commit: deserializeCommit(clientData.lastCommit),
                },
                { value: toNano("3.5") }
              );
            },
            3,
            5000
          );
          await waitSeqno(walletContract, await walletContract.getSeqno());
          await sleep(30000); // TODO: Alter by tracing transaction to get the result
        } catch (error) {
          throw new Error(`[TON-WORKER] Update light client failed: ${error}`);
        }
      }
      const { packetBoc: packet, proofs: serializeProofs } = packetAndProof;
      const proofs = serializeProofs.map((proof) => {
        return ExistenceProof.fromJSON(proof);
      });
      retry(
        async () => {
          await bridgeAdapter.sendBridgeRecvPacket(
            sender,
            {
              provenHeight,
              packet: Cell.fromBoc(Buffer.from(packet, "hex"))[0],
              proofs: getExistenceProofSnakeCell(proofs),
            },
            { value: toNano("0.7") }
          );
        },
        3,
        5000
      );
      console.log("[TON-WORKER] Relay packet successfully");
      await waitSeqno(walletContract, await walletContract.getSeqno());
    },
    {
      connection,
      autorun: false,
    }
  );
  return tonWorker;
};
