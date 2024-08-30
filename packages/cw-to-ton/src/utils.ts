import { getHttpEndpoint, Network } from "@orbs-network/ton-access";
import {
  WalletContractV3R2,
  WalletContractV4,
  TonClient,
  internal,
  OpenedContract,
  Transaction,
  Address,
  Cell,
} from "@ton/ton";
import { mnemonicToWalletKey } from "@ton/crypto";
import { NULL_TON_ADDRESS } from "./constants";
import { BridgeAdapterPacketOpcodes } from "@oraichain/ton-bridge-contracts";
import { Tx } from "@oraichain/cosmos-rpc-sync";

export async function waitSeqno(
  walletContract:
    | OpenedContract<WalletContractV3R2>
    | OpenedContract<WalletContractV4>,
  seqno: number,
  attempts = 10
) {
  let attempt = 0;
  let currentSeqno = seqno;
  while (currentSeqno == seqno) {
    if (attempt > attempts) {
      throw new Error("transaction timeout");
    }
    console.log("waiting for transaction to confirm...");
    await new Promise((resolve) => setTimeout(resolve, 5000));
    currentSeqno = await retry(async () => {
      return walletContract.getSeqno();
    });
    attempt++;
  }
  console.log("transaction confirmed!");
}

export async function createTonWallet(
  mnemonic: string,
  network: Network,
  endpoint?: string,
  apiKey?: string
) {
  const finalEndpoint = endpoint || (await getHttpEndpoint({ network }));
  const client = new TonClient({ endpoint: finalEndpoint, apiKey });
  if (!mnemonic) {
    throw new Error("Mnemonic is not set");
  }
  const key = await mnemonicToWalletKey(mnemonic.split(" "));
  // NOTE: Testnet using WalletContractV3R2 and Mainnet using WalletContractV4
  let wallet = WalletContractV4.create({
    publicKey: key.publicKey,
    workchain: 0,
  });

  if (network === "testnet") {
    wallet = WalletContractV3R2.create({
      publicKey: key.publicKey,
      workchain: 0,
    });
  }
  const walletContract = client.open(wallet);
  // Deployed by sending a simple transaction to another subwallet. Since the subwallet have not been deployed,
  // the fund will return.
  if (!(await client.isContractDeployed(wallet.address))) {
    const subWallet2 = WalletContractV4.create({
      publicKey: key.publicKey,
      workchain: 0,
      walletId: 110300,
    });
    const seqno = await walletContract.getSeqno();
    await walletContract.sendTransfer({
      secretKey: key.secretKey,
      seqno,
      messages: [
        internal({
          to: subWallet2.address,
          value: "0.05",
        }),
      ],
    });
    // wait until confirmed
    await waitSeqno(walletContract, seqno);
  }
  return { client, walletContract, key };
}

export async function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function isSuccessVmTx(tx: Transaction) {
  return (
    tx.description.type === "generic" &&
    tx.description?.actionPhase?.success &&
    tx.description?.computePhase?.type === "vm" &&
    tx.description?.computePhase?.success
  );
}

export async function retry<T>(
  fn: (...params: any[]) => Promise<T>,
  retries: number = 3,
  delay: number = 3000,
  ...params: any[]
): Promise<T> {
  for (let i = 0; i < retries; i++) {
    try {
      return await fn(...params);
    } catch (e) {
      if (i === retries - 1) {
        throw e;
      }
      await sleep(delay);
    }
  }
}

export function checkTonDenom(address: string) {
  if (address === NULL_TON_ADDRESS) {
    return null;
  }
  return Address.parse(address);
}

export function getJobIdFromPacket(packet: string) {
  const cs = Cell.fromBoc(Buffer.from(packet, "hex"))[0].beginParse();
  const op = cs.loadUint(32);
  const seq = cs.loadUint(64);
  return getJobIdFromOpcodePacket(op, BigInt(seq));
}

export function getJobIdFromOpcodePacket(opcodePacket: number, seq: bigint) {
  return opcodePacket == BridgeAdapterPacketOpcodes.sendToTon
    ? `sendToTon-${seq}`
    : `ackSendToCosmos-${seq}`;
}

export function filterOutSuccessTx(tx: Tx) {
  return tx.code === 0;
}
