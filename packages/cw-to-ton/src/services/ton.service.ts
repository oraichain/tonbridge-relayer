import {
  BridgeAdapter,
  LightClientMaster,
} from "@oraichain/ton-bridge-contracts";
import { retry } from "@src/utils";
import { OpenedContract, TonClient, WalletContractV4 } from "@ton/ton";

export class TonHandler {
  walletContract: OpenedContract<WalletContractV4>;
  tonClient: TonClient;
  lightClientMaster: OpenedContract<LightClientMaster>;
  bridgeAdapter: OpenedContract<BridgeAdapter>;

  constructor(
    walletContract: OpenedContract<WalletContractV4>,
    tonClient: TonClient,
    lightClientMaster: OpenedContract<LightClientMaster>,
    bridgeAdapter: OpenedContract<BridgeAdapter>
  ) {
    this.walletContract = walletContract;
    this.tonClient = tonClient;
    this.lightClientMaster = lightClientMaster;
    this.bridgeAdapter = bridgeAdapter;
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
}
