import { BlockStorage, LogFunction, ShardBlock } from "tonweb";

// inspired by InMemoryBlockStorage
export default class CustomInMemoryBlockStorage implements BlockStorage {
  /**
   * @todo: should we use `Map` here?
   * Map of the processed masterchain blocks:
   * `key` is the block number, while
   * `value` reflects `isProcessed` state.
   */
  public masterchainBlocks: { [mcBlockNumber: number]: boolean } = {};
  /**
   * @todo: should we use `Map` here?
   * Map of the processed shardchain blocks:
   * The `key` should be constructed this way:
   * `${workchain}_${shardId}_${shardBlockNumber}`
   * and the `value` reflects `isProcessed` state.
   */
  public shardchainBlocks: { [key: string]: boolean } = {};

  private masterchainBlockKeys: number[] = [];
  private shardchainBlockKeys: string[] = [];

  constructor(
    private readonly logFunction: LogFunction,
    private readonly maxCachedBlockSize: number = 10000
  ) {}

  private buildShardChainBlockKey(
    workchain: number,
    shardId: string,
    shardBlockNumber: number
  ) {
    return workchain + "_" + shardId + "_" + shardBlockNumber;
  }

  async insertBlocks(
    mcBlockNumber: number,
    shardBlockNumbers: ShardBlock[]
  ): Promise<void> {
    if (this.logFunction) {
      this.logFunction("mc processed " + mcBlockNumber);
    }
    // INSERT INTO masterchainBlocks VALUES (blockNumber, TRUE);
    if (this.masterchainBlocks[mcBlockNumber] !== undefined)
      throw new Error("mc already exists " + mcBlockNumber);
    this.masterchainBlocks[mcBlockNumber] = true;
    this.masterchainBlockKeys.push(mcBlockNumber);

    await this.insertShardBlocks(shardBlockNumbers);
  }

  /**
   * @private
   * Insert new UNprocessed shardchain block numbers
   * Block number (workchain + shardId + shardBlockNumber) should be IGNORED if it is already in the storage
   * @param   shardBlockNumbers {[{workchain: number, shardId: string, shardBlockNumber: number}]}
   */
  async insertShardBlocks(shardBlockNumbers: ShardBlock[]) {
    for (const { workchain, shardId, shardBlockNumber } of shardBlockNumbers) {
      const shardBlockKey = this.buildShardChainBlockKey(
        workchain,
        shardId,
        shardBlockNumber
      );
      if (this.shardchainBlocks[shardBlockKey] !== undefined) continue;
      if (this.logFunction) {
        this.logFunction(
          "insert shard " + workchain + " " + shardId + " " + shardBlockNumber
        );
      }
      // INSERT INTO shardchainBlocks VALUES (workchain, shardId, shardBlockNumber, FALSE);
      this.shardchainBlocks[shardBlockKey] = false;
    }
  }

  async getLastMasterchainBlockNumber(): Promise<number | undefined> {
    // SELECT MAX(blockNumber) FROM masterchainBlocks
    const blockNumbers = Object.keys(this.masterchainBlocks)
      .map((x) => Number(x))
      .sort((a, b) => b - a);
    return blockNumbers[0];
  }

  async setBlockProcessed(
    workchain: number,
    shardId: string,
    shardBlockNumber: number,
    prevShardBlocks: ShardBlock[]
  ): Promise<void> {
    if (this.logFunction) {
      this.logFunction(
        "shard processed " + workchain + " " + shardId + " " + shardBlockNumber
      );
    }
    // UPDATE shardchainBlocks SET processed = TRUE WHERE workchain = ? AND shardId = ? AND shardBlockNumber = ?
    const shardBlockKey = this.buildShardChainBlockKey(
      workchain,
      shardId,
      shardBlockNumber
    );
    if (this.shardchainBlocks[shardBlockKey] === undefined)
      throw new Error("shard not exists " + shardBlockKey);
    this.shardchainBlocks[shardBlockKey] = true;
    this.shardchainBlockKeys.push(shardBlockKey);

    await this.insertShardBlocks(prevShardBlocks);
  }
  async getUnprocessedShardBlock(): Promise<ShardBlock | undefined> {
    // SELECT workchain, shardId, shardBlockNumber from sharchainBlocks WHERE processed = FALSE LIMIT 1
    for (let key in this.shardchainBlocks) {
      if (this.shardchainBlocks[key] === false) {
        const arr = key.split("_");
        return {
          workchain: Number(arr[0]),
          shardId: arr[1],
          shardBlockNumber: Number(arr[2]),
        };
      }
    }
    return undefined;
  }

  /**
   * This method is used to make sure our memory does not keep increasing.
   */
  pruneStoredBlocks() {
    // prune masterchain blocks
    if (this.masterchainBlockKeys.length > this.maxCachedBlockSize) {
      const pruneSize =
        this.masterchainBlockKeys.length - this.maxCachedBlockSize;
      const deletedKeys = this.masterchainBlockKeys.splice(0, pruneSize);
      for (const key of deletedKeys) {
        delete this.masterchainBlocks[key];
      }
    }

    // prune shardchain blocks
    if (this.shardchainBlockKeys.length > this.maxCachedBlockSize) {
      const pruneSize =
        this.shardchainBlockKeys.length - this.maxCachedBlockSize;
      const deletedKeys = this.shardchainBlockKeys.splice(0, pruneSize);
      for (const key of deletedKeys) {
        delete this.shardchainBlocks[key];
      }
    }
  }
}
