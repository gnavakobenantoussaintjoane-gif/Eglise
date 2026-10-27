import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import pg from 'pg';
import { env, isTest, isProduction } from '../config/env.js';

export interface QueryResult<T> {
  rows: T[];
  rowCount: number;
}

/** Interface minimale partagee par pg et PGlite. */
export interface Database {
  readonly driver: 'pg' | 'pglite';
  query<T = Record<string, unknown>>(
    sql: string,
    params?: readonly unknown[],
  ): Promise<QueryResult<T>>;
  exec(sql: string): Promise<void>;
  transaction<T>(fn: (tx: Queryable) => Promise<T>): Promise<T>;
  close(): Promise<void>;
}

export interface Queryable {
  query<T = Record<string, unknown>>(
    sql: string,
    params?: readonly unknown[],
  ): Promise<QueryResult<T>>;
  /** Execute un script multi-instructions (migrations). */
  exec(sql: string): Promise<void>;
}

class PgDatabase implements Database {
  readonly driver = 'pg' as const;
  private readonly pool: pg.Pool;

  constructor(connectionString: string) {
    this.pool = new pg.Pool({
      connectionString,
      max: env.DB_POOL_MAX,
      ssl: isProduction ? { rejectUnauthorized: false } : undefined,
    });
  }

  async query<T>(sql: string, params: readonly unknown[] = []): Promise<QueryResult<T>> {
    const result = await this.pool.query(sql, params as unknown[]);
    return { rows: result.rows as T[], rowCount: result.rowCount ?? 0 };
  }

  async exec(sql: string): Promise<void> {
    await this.pool.query(sql);
  }

  async transaction<T>(fn: (tx: Queryable) => Promise<T>): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query('begin');
      const result = await fn({
        query: async <R>(sql: string, params: readonly unknown[] = []) => {
          const res = await client.query(sql, params as unknown[]);
          return { rows: res.rows as R[], rowCount: res.rowCount ?? 0 };
        },
        exec: async (statement: string) => {
          await client.query(statement);
        },
      });
      await client.query('commit');
      return result;
    } catch (error) {
      await client.query('rollback');
      throw error;
    } finally {
      client.release();
    }
  }

  async close(): Promise<void> {
    await this.pool.end();
  }
}

class PgliteDatabase implements Database {
  readonly driver = 'pglite' as const;
  private readonly db: PGlite;
  private queue: Promise<unknown> = Promise.resolve();

  constructor(dataDir?: string) {
    if (dataDir) mkdirSync(dataDir, { recursive: true });
    this.db = new PGlite(dataDir ?? 'memory://');
  }

  /** PGlite n'accepte qu'une operation a la fois : on serialise. */
  private run<T>(fn: () => Promise<T>): Promise<T> {
    const next = this.queue.then(fn, fn);
    this.queue = next.catch(() => undefined);
    return next;
  }

  async query<T>(sql: string, params: readonly unknown[] = []): Promise<QueryResult<T>> {
    return this.run(async () => {
      const result = await this.db.query<T>(sql, params as unknown[]);
      // PGlite renvoie le nombre de lignes touchees dans `affectedRows` (0 ligne
      // pour un DELETE sans RETURNING) : `rows.length` ne suffit pas.
      const affected = (result as unknown as { affectedRows?: number }).affectedRows;
      return { rows: result.rows, rowCount: affected ?? result.rows.length };
    });
  }

  async exec(sql: string): Promise<void> {
    await this.run(async () => {
      await this.db.exec(sql);
    });
  }

  async transaction<T>(fn: (tx: Queryable) => Promise<T>): Promise<T> {
    return this.run(async () => {
      await this.db.exec('begin');
      try {
        const result = await fn({
          query: async <R>(sql: string, params: readonly unknown[] = []) => {
            const res = await this.db.query<R>(sql, params as unknown[]);
            const affected = (res as unknown as { affectedRows?: number }).affectedRows;
            return { rows: res.rows, rowCount: affected ?? res.rows.length };
          },
          exec: async (statement: string) => {
            await this.db.exec(statement);
          },
        });
        await this.db.exec('commit');
        return result;
      } catch (error) {
        await this.db.exec('rollback');
        throw error;
      }
    });
  }

  async close(): Promise<void> {
    await this.db.close();
  }
}

let instance: Database | null = null;

/**
 * En test, base en memoire : chaque execution de test demarre proprement.
 * En developpement sans DATABASE_URL, PGlite persiste dans backend/var/pglite.
 */
export function getDatabase(): Database {
  if (instance) return instance;

  if (env.DATABASE_URL) {
    instance = new PgDatabase(env.DATABASE_URL);
  } else if (isTest) {
    instance = new PgliteDatabase(undefined);
  } else {
    instance = new PgliteDatabase(path.resolve(env.PGLITE_DATA_DIR));
  }

  return instance;
}

export async function closeDatabase(): Promise<void> {
  if (!instance) return;
  await instance.close();
  instance = null;
}

export const database = getDatabase();
