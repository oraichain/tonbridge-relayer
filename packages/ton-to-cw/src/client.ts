import * as cosmwasm from "@cosmjs/cosmwasm-stargate";
import {
  DirectSecp256k1HdWallet,
  DirectSecp256k1Wallet,
} from "@cosmjs/proto-signing";
import "dotenv/config";
import { Decimal } from "@cosmjs/math";
import { GasPrice } from "@cosmjs/stargate";

export const initQueryClient = async () => {
  const client = await cosmwasm.CosmWasmClient.connect(
    process.env.RPC_URL || "https://rpc.orai.io/"
  );
  return client;
};

export const initSignClient = async () => {
  const prefix = process.env.PREFIX || "orai";
  const denom = process.env.DENOM || "orai";
  const gas_fee = process.env.GAS_FEE || "0.001";

  const wallet = await DirectSecp256k1HdWallet.fromMnemonic(
    process.env.mnemonic,
    {
      // hdPaths: [stringToPath(chain.HD_PATH || "m/44'/118'/0'/0/0")],
      prefix,
    }
  );

  const [firstAccount] = await wallet.getAccounts();

  const client = await cosmwasm.SigningCosmWasmClient.connectWithSigner(
    process.env.RPC_URL || "https://rpc.orai.io",
    wallet,
    {
      // gasPrice: new GasPrice(Decimal.fromUserInput(gas_fee, 6), denom),
      gasPrice: GasPrice.fromString("0.001orai"),
      broadcastPollIntervalMs: 500,
    }
  );
  return { sender: firstAccount.address, client };
};
