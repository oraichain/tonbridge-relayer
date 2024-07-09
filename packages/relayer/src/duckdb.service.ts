import { Connection, Database } from "duckdb-async";

export class DuckDb {
  private static instance: DuckDb | null = null;
  private constructor(public readonly conn: Connection) {}

  public static async getInstance(
    fileName: string = ":memory:"
  ): Promise<DuckDb> {
    if (!this.instance) {
      let db = await Database.create(fileName);
      await db.close(); // close to flush WAL file
      db = await Database.create(fileName);
      const conn = await db.connect();
      await conn.run(`
                INSTALL arrow;
                LOAD arrow;
                         `);
      this.instance = new DuckDb(conn);
    }

    return this.instance;
  }

  public static async closeInstance(): Promise<void> {
    if (this.instance) {
      await this.instance.conn.close();
      this.instance = null;
    }
  }
}
