import {
  Address,
  Cell,
  CommonMessageInfoInternal,
  TonClient,
  Transaction,
} from "@ton/ton";
import {
  LightClientOpcodes,
  BridgeAdapterOpcodes,
  JettonOpCodes,
  LightClientMasterOpcodes,
} from "@oraichain/ton-bridge-contracts";

import { isSuccessVmTx, retry } from "@src/utils";
import {
  Api,
  HttpClient,
  Transaction as TonApiTransaction,
} from "tonapi-sdk-js";

export abstract class Tracer {
  private readonly timeout: number;
  private isTimeout: boolean = false;
  private timer: NodeJS.Timeout;
  contract: Address;
  tonClient: TonClient;
  tonApi: Api<HttpClient>;
  constructor(tonClient: TonClient, contract: Address, timeout: number) {
    this.tonClient = tonClient;
    this.timeout = timeout;
    this.contract = contract;
    this.isTimeout = false;
  }

  async subscribeTxs() {
    return this.tonClient.getTransactions(this.contract, {
      limit: 5,
    });
  }

  startTrace() {
    this.timer = setTimeout(() => {
      this.isTimeout = true;
    }, this.timeout);
  }

  resetTrace() {
    this.endTrace();
    this.isTimeout = false;
    this.startTrace();
  }

  endTrace() {
    clearTimeout(this.timer);
  }

  async findOutgoingTransactions(
    transaction: Transaction
  ): Promise<TonApiTransaction> {
    const trace = await this.tonApi.traces.getTrace(
      transaction.hash().toString("hex")
    );
    const children = trace.children[0].transaction;
    return children;
  }

  async traverseOutgoingTransactions(transaction: Transaction): Promise<void> {
    if (this.isTimeout) {
      throw new Error("Timeout");
    }

    // const outTxs = await retry(
    //   () => this.findOutgoingTransactions(transaction),
    //   5,
    //   10000
    // ).catch(console.error);
    // do smth with out txs
    // if (outTxs) {
    //   for (const out of outTxs) {
    //     const isContinue = this.handleOutTx(out);
    //     if (isContinue) {
    //       await this.traverseOutgoingTransactions(out);
    //     }
    //   }
    // }
  }

  abstract handleOutTx(outTx: Transaction): boolean;
}

export class BridgeAdapterTracer extends Tracer {
  constructor(tonClient: TonClient, bridgeAdapter: Address, timeout: number) {
    super(tonClient, bridgeAdapter, timeout);
  }

  async traceBridgeRecvPacket(bodyBridgeRecvPacket: Cell) {
    this.startTrace();
    await retry(
      async () => {
        const txs = await this.subscribeTxs();
        for (const tx of txs) {
          const inMsg = tx.inMessage;
          const body = inMsg?.body.beginParse();
          if (inMsg?.info.type === "internal" && body.remainingBits > 32) {
            const op = body.loadUint(32);
            const isTxSuccess = isSuccessVmTx(tx);
            if (
              op === BridgeAdapterOpcodes.bridgeRecvPacket &&
              bodyBridgeRecvPacket.hash().toString("hex") ===
                inMsg?.body.hash().toString("hex") &&
              isTxSuccess
            ) {
              console.log(
                "Successfully relay packet at",
                tx.hash().toString("hex"),
                "at lt",
                tx.lt
              );
              return;
            }
          }
        }
        throw new Error("Not found BridgeAdapterOpcodes.sendTx");
      },
      5,
      10000
    );

    this.endTrace();
  }

  handleOutTx(outTx: Transaction) {
    const src = outTx.inMessage.info.src;
    const amount = (outTx.inMessage.info as CommonMessageInfoInternal).value
      .coins;
    if (
      outTx.inMessage.body.beginParse().remainingBits > 32 &&
      isSuccessVmTx(outTx)
    ) {
      const op = outTx.inMessage.body.beginParse().loadUint(32);
      console.log(op.toString(16));
      return this.handleSendTxOps(op, outTx);
    } else if (
      src.toString() === this.contract.toString() &&
      isSuccessVmTx(outTx) &&
      amount > 0n
    ) {
      console.log(
        "Successfully send ton to user with hash",
        outTx.hash().toString("base64"),
        "at lt",
        outTx.lt
      );
      return false;
    }
    throw new Error("Invalid transaction");
  }

  handleSendTxOps(op: number, transaction: Transaction) {
    switch (op) {
      case LightClientMasterOpcodes.receive_packet: {
        // handle smt
        console.log(
          "verify_receipt with hash",
          transaction.hash().toString("base64"),
          "at lt",
          transaction.lt
        );
        return true;
      }
      case BridgeAdapterOpcodes.bridgeRecvPacket: {
        // handle smt
        console.log(
          "confirmTx with hash",
          transaction.hash().toString("base64"),
          "at lt",
          transaction.lt
        );
        return true;
      }
      case JettonOpCodes.MINT: {
        // handle smt
        console.log(
          "MINT with hash",
          transaction.hash().toString("base64"),
          "at lt",
          transaction.lt
        );
        return true;
      }
      case JettonOpCodes.TRANSFER: {
        // handle smt
        console.log(
          "TRANSFER with hash",
          transaction.hash().toString("base64"),
          "at lt",
          transaction.lt
        );
        return true;
      }
      case JettonOpCodes.INTERNAL_TRANSFER: {
        // handle smt
        console.log(
          "INTERNAL_TRANSFER with hash",
          transaction.hash().toString("base64"),
          "at lt",
          transaction.lt
        );
        return false;
      }
    }
  }
}

export class LightClientTracer extends Tracer {
  constructor(tonClient: TonClient, lightClient: Address, timeout: number) {
    super(tonClient, lightClient, timeout);
  }

  async traceUpdateBlock(bodyUpdateBlock: Cell) {
    this.startTrace();
    await retry(
      async () => {
        const txs = await this.subscribeTxs();
        for (const tx of txs) {
          const inMsg = tx.inMessage;
          const body = inMsg?.body.beginParse();
          if (inMsg?.info.type === "internal" && body.remainingBits > 32) {
            const op = body.loadUint(32);
            const isTxSuccess = isSuccessVmTx(tx);
            if (
              op === LightClientOpcodes.verify_block_hash &&
              bodyUpdateBlock.hash().toString("hex") ===
                inMsg?.body.hash().toString("hex") &&
              isTxSuccess
            ) {
              console.log(
                "LightClientOpcodes.verify_block_hash with hash",
                tx.hash().toString("hex"),
                "at lt",
                tx.lt
              );
              await this.traverseOutgoingTransactions(tx);
              return;
            }
          }
        }
        throw new Error("Not found LightClientOpcodes.verify_block_hash");
      },
      5,
      5000
    );

    this.endTrace();
  }

  handleOutTx(outTx: Transaction) {
    if (
      outTx.inMessage.body.beginParse().remainingBits > 32 &&
      isSuccessVmTx(outTx)
    ) {
      const op = outTx.inMessage.body.beginParse().loadUint(32);
      return this.handleUpdateBlockOps(op, outTx);
    } else {
      return false;
    }
  }

  handleUpdateBlockOps(op: number, tx: Transaction) {
    switch (op) {
      case LightClientOpcodes.verify_untrusted_validators: {
        // handle smt
        console.log(
          "verify_untrusted_validators with hash",
          tx.hash().toString("base64"),
          "at lt",
          tx.lt
        );
        return true;
      }
      case LightClientOpcodes.verify_sigs:
        // handle smt
        console.log(
          "verify_sigs with hash",
          tx.hash().toString("base64"),
          "at lt",
          tx.lt
        );
    }
    return false;
  }
}
