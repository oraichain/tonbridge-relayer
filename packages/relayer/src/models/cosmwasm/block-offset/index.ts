import { DuckDb } from "@src/services/duckdb.service";

export class CosmosBlockOffset {
  private DuckDb: DuckDb;

  constructor(DuckDb: DuckDb) {
    this.DuckDb = DuckDb;
  }

  public async createTable() {
    const conn = this.DuckDb.conn;
    await conn.run(`
            CREATE TABLE IF NOT EXISTS block_offset (
                height UINTEGER
            );
        `);
  }

  public async mayLoadBlockOffset(firstBlockOffset: number) {
    const block_offset = await this.getBlockOffset();
    if (!block_offset) {
      await this.insertBlockOffset(firstBlockOffset);
      return firstBlockOffset;
    }
    return block_offset;
  }

  private async insertBlockOffset(height: number) {
    const conn = this.DuckDb.conn;
    await conn.all(`INSERT INTO block_offset VALUES (?)`, height);
  }

  private async getBlockOffset() {
    const conn = this.DuckDb.conn;
    const result = await conn.all(`SELECT * FROM block_offset`);
    if (result.length === 0) {
      return 0;
    }
    return result[0].height as number;
  }

  public async updateBlockOffset(height: number) {
    const conn = this.DuckDb.conn;
    await conn.all(`UPDATE block_offset SET height = ?`, height);
  }
}
