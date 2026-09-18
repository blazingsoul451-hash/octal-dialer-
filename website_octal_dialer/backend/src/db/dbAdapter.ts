/**
 * db/dbAdapter.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * PostgreSQL Database Adapter for Octal Dialer.
 *
 * This is the ONLY production database adapter.
 * All operations are asynchronous and route through src/db/pool.ts → pg.Pool → PostgreSQL.
 *
 * SQLite is NOT available through this adapter.
 * SQLite exists ONLY in isolated migration tooling (src/db/migrator.ts).
 *
 * Provides:
 *  - query<T>(sql, params)        → { rows: T[], rowCount: number }
 *  - queryOne<T>(sql, params)     → T | undefined
 *  - queryAll<T>(sql, params)     → T[]
 *  - execute(sql, params)         → { rowCount: number, rows: any[] }
 *  - withTransaction<T>(fn)       → T
 *  - init()                       → void (initializes pool + schema)
 * ─────────────────────────────────────────────────────────────────────────────
 */

import path from 'path';
import { QueryResultRow } from 'pg';
import { getPool, query as pgQuery, withTransaction as pgWithTransaction, initializeSchema } from './pool';

/**
 * Transform SQL for PostgreSQL compatibility:
 *  - Convert ? placeholders to $1, $2, $3 positional params
 *  - Convert @named placeholders to $1, $2, $3 positional params
 *  - Rewrite INSERT OR IGNORE → INSERT ... ON CONFLICT DO NOTHING
 *  - Rewrite datetime('now') → now()
 */
export function transformSql(sql: string, params: any[] = []): { sql: string; params: any[] } {
  let finalSql = sql;
  let finalParams: any[] = [];

  // Check if parameters passed as a single named-property object
  if (params.length === 1 && params[0] !== null && typeof params[0] === 'object' && !Array.isArray(params[0])) {
    const obj = params[0];
    let idx = 1;
    finalSql = finalSql.replace(/@([a-zA-Z0-9_]+)/g, (_, name) => {
      finalParams.push(obj[name]);
      return `$${idx++}`;
    });
  } else {
    finalParams = params.flat();
    let idx = 1;
    let inStr = false;
    let quoteChar = '';
    let out = '';
    for (let i = 0; i < finalSql.length; i++) {
      const c = finalSql[i];
      if (!inStr && (c === "'" || c === '"')) {
        inStr = true;
        quoteChar = c;
        out += c;
      } else if (inStr && c === quoteChar) {
        inStr = false;
        out += c;
      } else if (!inStr && c === '?') {
        out += `$${idx++}`;
      } else {
        out += c;
      }
    }
    finalSql = out;
  }

  // Rewrite SQLite conflict syntax to PostgreSQL standard
  if (/INSERT\s+OR\s+IGNORE\s+INTO/i.test(finalSql)) {
    finalSql = finalSql.replace(/INSERT\s+OR\s+IGNORE\s+INTO/gi, 'INSERT INTO');
    if (!finalSql.includes('ON CONFLICT')) {
      finalSql += ' ON CONFLICT DO NOTHING';
    }
  }

  // Remove SQLite datetime('now') -> now()
  finalSql = finalSql.replace(/datetime\('now'\)/gi, 'now()');

  return { sql: finalSql, params: finalParams };
}

/**
 * PostgreSQL-only database adapter.
 * All methods are asynchronous. No SQLite fallback.
 */
export class DbAdapter {
  private initialized = false;
  private initPromise: Promise<void> | null = null;

  public async init(): Promise<void> {
    if (this.initialized) return;
    if (this.initPromise) return this.initPromise;

    this.initPromise = (async () => {
      console.log('[DbAdapter] Initializing PostgreSQL engine...');
      getPool();
      await initializeSchema(path.join(__dirname, 'schema.sql'));
      console.log('[DbAdapter] PostgreSQL engine online and schema ready.');
      this.initialized = true;
    })();

    try {
      await this.initPromise;
    } catch (err) {
      this.initPromise = null;
      throw err;
    }
  }

  public async query<T extends QueryResultRow = any>(sql: string, params: any[] = []): Promise<{ rows: T[]; rowCount: number }> {
    const { sql: pgSql, params: pgParams } = transformSql(sql, params);
    const result = await pgQuery<T>(pgSql, pgParams);
    return {
      rows: result.rows,
      rowCount: result.rowCount || 0
    };
  }

  public async queryOne<T extends QueryResultRow = any>(sql: string, params: any[] = []): Promise<T | undefined> {
    const res = await this.query<T>(sql, params);
    return res.rows[0];
  }

  public async queryAll<T extends QueryResultRow = any>(sql: string, params: any[] = []): Promise<T[]> {
    const res = await this.query<T>(sql, params);
    return res.rows;
  }

  public async execute(sql: string, params: any[] = []): Promise<{ rowCount: number; rows: any[] }> {
    return this.query(sql, params);
  }

  public async withTransaction<T>(fn: (client: any) => Promise<T>): Promise<T> {
    return pgWithTransaction(fn);
  }
}

export const dbAdapter = new DbAdapter();
export default dbAdapter;
