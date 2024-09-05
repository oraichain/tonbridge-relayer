import {
  BridgeAdapter,
  deserializeCommit,
  deserializeHeader,
  deserializeValidator,
  getExistenceProofSnakeCell,
  LightClientMaster,
} from "@oraichain/ton-bridge-contracts";
import { LightClientData } from "@src/@types";
import { IntoCell } from "@src/dtos/packets/interface";
import { retry, sleep, waitSeqno } from "@src/utils";
import {
  OpenedContract,
  Sender,
  toNano,
  TonClient,
  WalletContractV4,
} from "@ton/ton";
import { ExistenceProof } from "cosmjs-types/cosmos/ics23/v1/proofs";
import { Logger } from "winston";

export enum TonSideFee {
  UPDATE_CLIENT = "3.5",
  SEND_PACKET = "0.7",
}

export class TonHandler {
  walletContract: OpenedContract<WalletContractV4>;
  sender: Sender;
  tonClient: TonClient;
  lightClientMaster: OpenedContract<LightClientMaster>;
  bridgeAdapter: OpenedContract<BridgeAdapter>;
  pollInterval: number;
  logger: Logger;

  constructor(
    walletContract: OpenedContract<WalletContractV4>,
    tonClient: TonClient,
    sender: Sender,
    lightClientMaster: OpenedContract<LightClientMaster>,
    bridgeAdapter: OpenedContract<BridgeAdapter>,
    logger: Logger,
    pollInterval?: number
  ) {
    this.walletContract = walletContract;
    this.tonClient = tonClient;
    this.sender = sender;
    this.lightClientMaster = lightClientMaster;
    this.bridgeAdapter = bridgeAdapter;
    this.logger = logger;
    this.pollInterval = pollInterval || 5000;
  }

  getLatestLightClientHeight = async () => {
    return await retry(
      async () => {
        try {
          return await this.lightClientMaster.getTrustedHeight();
        } catch (e) {
          throw new Error(
            `TonHandler:Error when getLatestLightClientHeight:${e}`
          );
        }
      },
      3,
      1000
    );
  };

  getLightClientAddressAtHeight = async (height: bigint) => {
    return retry(
      async () => {
        try {
          return await this.lightClientMaster.getLightClientAddress(height);
        } catch (e) {
          throw new Error(
            `TonHandler:Error when getLightClientAddressAtHeight:${e}`
          );
        }
      },
      3,
      1000
    );
  };

  getSenderTonBalance = async () => {
    return retry(async () => {
      try {
        return this.walletContract.getBalance();
      } catch (e) {
        throw new Error(`TonHandler:Error when getSenderTonBalance:${e}`);
      }
    });
  };

  async updateLightClient(clientData: LightClientData) {
    const header = deserializeHeader(clientData.header);
    const height = BigInt(header.height);
    await retry(
      async () => {
        try {
          await this.lightClientMaster.sendVerifyBlockHash(
            this.sender,
            {
              header: header,
              validators: clientData.validators.map(deserializeValidator),
              commit: deserializeCommit(clientData.lastCommit),
            },
            {
              value: toNano(TonSideFee.UPDATE_CLIENT),
            }
          );
        } catch (e) {
          throw new Error(`TonHandler:Error when updateLightClient:${e}`);
        }
      },
      3,
      5000
    );
    const seqno = await this.walletContract.getSeqno();
    const lightClientAddress = await retry(async () => {
      try {
        return await this.lightClientMaster.getLightClientAddress(height);
      } catch (e) {
        throw new Error(
          `TonHandler:Error when getLightClientAddressAtHeight:${e}`
        );
      }
    });
    await waitSeqno(this.walletContract, seqno, 15);
    while (true) {
      const isDeployed =
        await this.tonClient.isContractDeployed(lightClientAddress);
      if (isDeployed) {
        break;
      }
      await sleep(this.pollInterval);
    }
  }

  async waitSeqno(seqno: number, attempts: number) {
    let attempt = 0;
    let currentSeqno = seqno;
    while (currentSeqno == seqno) {
      if (attempt > attempts) {
        throw new Error(
          `TonHandler:waitSeqno transaction timeout after ${attempts} attempts`
        );
      }
      this.logger.info("TonHandler:waiting for transaction to confirm...");
      await new Promise((resolve) => setTimeout(resolve, 5000));
      currentSeqno = await retry(async () => {
        return this.walletContract.getSeqno();
      });
      attempt++;
    }
    this.logger.info("TonHandler:transaction confirmed!");
  }

  async sendPacket(
    provenHeight: number,
    packet: IntoCell,
    proofs: ExistenceProof[]
  ) {
    try {
      const seqno = await retry(async () => {
        try {
          return this.walletContract.getSeqno();
        } catch (e) {
          throw new Error(`TonHandler:Error when getSeqno:${e}`);
        }
      });

      await retry(
        async () => {
          try {
            await this.bridgeAdapter.sendBridgeRecvPacket(
              this.sender,
              {
                provenHeight,
                packet: packet.intoCell(),
                proofs: getExistenceProofSnakeCell(proofs),
              },
              { value: toNano(TonSideFee.SEND_PACKET) }
            );
          } catch (e) {
            throw new Error(`TonHandler:Error when sendPacket:${e}`);
          }
        },
        3,
        5000
      );

      await waitSeqno(this.walletContract, seqno, 15);
    } catch (error) {
      throw new Error(`TonHandler:Error when sendPacket:${error}`);
    }
  }
}
