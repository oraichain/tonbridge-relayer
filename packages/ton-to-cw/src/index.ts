import dotenv from "dotenv";
import TonBlockProcessor from "./block-processor";
import TonTxProcessor from "./tx-processor";
import { setTimeout } from "timers/promises";
dotenv.config();

export default class TonToCwRelayer {
  private blockProcessor: TonBlockProcessor;
  private txProcessor: TonTxProcessor;

  withBlockProcessor(processor: TonBlockProcessor) {
    this.blockProcessor = processor;
    return this;
  }

  withTxProcessor(processor: TonTxProcessor) {
    this.txProcessor = processor;
    return this;
  }

  async relay() {
    const processInterval = 3000; // 3s
    if (!this.blockProcessor || !this.txProcessor)
      throw new Error("block and tx processors are not initialized yet");

    try {
      while (true) {
        try {
          const latestMasterchainBlock =
            await this.blockProcessor.getMasterchainInfo();
          const { rawBlockData, parsedBlock } =
            await this.blockProcessor.queryKeyBlock(
              latestMasterchainBlock.last.seqno
            );
          await this.blockProcessor.verifyMasterchainKeyBlock(rawBlockData);
          await this.blockProcessor.storeKeyBlockNextValSet(
            rawBlockData,
            parsedBlock
          );
          await this.txProcessor.processTransactions();
        } catch (error) {
          console.error("error processing block and tx: ", error);
        }
        await setTimeout(processInterval);
      }
    } catch (error) {
      console.error("Error in subcribing blocks: ", error);
    }
  }
}
