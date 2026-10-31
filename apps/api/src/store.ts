import pg from 'pg';
export interface Store {
  get<T>(collection: string, id: string): Promise<T | undefined>;
  list<T>(collection: string): Promise<T[]>;
  put<T>(collection: string, id: string, value: T): Promise<void>;
  remove(collection: string, id: string): Promise<void>;
  transaction<T>(key: string, work: (store: Store) => Promise<T>): Promise<T>;
  ping(): Promise<void>;
  close(): Promise<void>;
}
export class MemoryStore implements Store {
  private data = new Map<string, unknown>();
  private queue: Promise<unknown> = Promise.resolve();
  async get<T>(c: string, id: string) {
    return structuredClone(this.data.get(`${c}/${id}`)) as T | undefined;
  }
  async list<T>(c: string) {
    return [...this.data]
      .filter(([k]) => k.startsWith(`${c}/`))
      .map(([, v]) => structuredClone(v) as T);
  }
  async put<T>(c: string, id: string, v: T) {
    this.data.set(`${c}/${id}`, structuredClone(v));
  }
  async remove(c: string, id: string) {
    this.data.delete(`${c}/${id}`);
  }
  transaction<T>(_key: string, work: (store: Store) => Promise<T>): Promise<T> {
    const result = this.queue.then(async () => {
      const before = structuredClone(this.data);
      try {
        return await work(this);
      } catch (error) {
        this.data = before;
        throw error;
      }
    });
    this.queue = result.catch(() => {});
    return result;
  }
  async ping() {}
  async close() {}
}
export class PostgresStore implements Store {
  private pool: pg.Pool;
  constructor(
    url: string,
    private schema: string,
    private client?: pg.PoolClient,
    pool?: pg.Pool,
  ) {
    if (!/^[a-z]+$/.test(schema)) throw new Error('Invalid schema');
    this.pool =
      pool ?? new pg.Pool({ connectionString: url, max: 4, connectionTimeoutMillis: 3000 });
    if (!pool)
      this.pool.on('error', (error: Error & { code?: string }) => {
        console.error(
          JSON.stringify({
            level: 'error',
            message: 'PostgreSQL idle connection closed; pool will reconnect',
            code: error.code,
          }),
        );
      });
  }
  private query(text: string, values: unknown[] = []) {
    return (this.client ?? this.pool).query(text, values);
  }
  async get<T>(c: string, id: string) {
    const r = await this.query(
      `SELECT value FROM ${this.schema}.records WHERE collection=$1 AND id=$2`,
      [c, id],
    );
    return r.rows[0]?.value as T | undefined;
  }
  async list<T>(c: string) {
    const r = await this.query(
      `SELECT value FROM ${this.schema}.records WHERE collection=$1 ORDER BY id`,
      [c],
    );
    return r.rows.map((x) => x.value as T);
  }
  async put<T>(c: string, id: string, v: T) {
    await this.query(
      `INSERT INTO ${this.schema}.records(collection,id,value) VALUES($1,$2,$3) ON CONFLICT(collection,id) DO UPDATE SET value=EXCLUDED.value`,
      [c, id, JSON.stringify(v)],
    );
  }
  async remove(c: string, id: string) {
    await this.query(`DELETE FROM ${this.schema}.records WHERE collection=$1 AND id=$2`, [c, id]);
  }
  async transaction<T>(key: string, work: (store: Store) => Promise<T>): Promise<T> {
    if (this.client) return work(this);
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`${this.schema}:${key}`]);
      const value = await work(new PostgresStore('', this.schema, client, this.pool));
      await client.query('COMMIT');
      return value;
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  }
  async ping() {
    await this.query(`SELECT 1 FROM ${this.schema}.records LIMIT 1`);
  }
  async close() {
    if (!this.client) await this.pool.end();
  }
}
