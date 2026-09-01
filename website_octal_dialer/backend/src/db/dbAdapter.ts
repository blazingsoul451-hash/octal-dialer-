/**
 * db/dbAdapter.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * PostgreSQL Database Adapter for Octal Dialer.
 * 
 * Provides:
 *  - Native PostgreSQL connection pooling via pool.ts
 *  - Automated SQL query translation (? -> $1, $2 and @named -> $1, $2)
 *  - Automated conflict resolution (INSERT OR IGNORE -> ON CONFLICT DO NOTHING)
 *  - Compatibility layer supporting both async (allAsync, getAsync, runAsync)
 *    and synchronous statement execution
 *  - Feature flag toggle (USE_POSTGRES) for safe rollback to SQLite if needed
 * ─────────────────────────────────────────────────────────────────────────────
 */

import path from 'path';
import fs from 'fs';
import { QueryResultRow } from 'pg';
import { getPool, query as pgQuery, withTransaction as pgWithTransaction, initializeSchema, isInMemoryDatabase } from './pool';

export const USE_POSTGRES = process.env.USE_POSTGRES !== 'false';

const DATA_DIR = path.join(__dirname, '../../data');
const DB_FILE = path.join(DATA_DIR, 'octal_dialer.db');

let sqliteFallback: any = null;

function getSqliteFallback(): any {
  if (!sqliteFallback) {
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
    // Dynamic import strictly isolated to rollback/legacy mode
    const SQLite = require('better-sqlite3');
    sqliteFallback = new SQLite(DB_FILE);
    sqliteFallback.pragma('journal_mode = WAL');
    sqliteFallback.pragma('foreign_keys = ON');
  }
  return sqliteFallback;
}

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

export class DbAdapter {
  private initialized = false;

  public async init(): Promise<void> {
    if (this.initialized) return;
    if (USE_POSTGRES) {
      console.log('[DbAdapter] Initializing PostgreSQL engine...');
      getPool();
      await initializeSchema(path.join(__dirname, 'schema.sql'));
      console.log('[DbAdapter] PostgreSQL engine online and schema ready.');
    } else {
      console.log('[DbAdapter] SQLite fallback mode active.');
      getSqliteFallback();
    }
    this.initialized = true;
  }

  public async query<T extends QueryResultRow = any>(sql: string, params: any[] = []): Promise<{ rows: T[]; rowCount: number }> {
    if (!USE_POSTGRES) {
      const db = getSqliteFallback();
      const stmt = db.prepare(sql);
      if (/^\s*(SELECT|PRAGMA)/i.test(sql)) {
        const rows = stmt.all(...params) as T[];
        return { rows, rowCount: rows.length };
      } else {
        const info = stmt.run(...params);
        return { rows: [], rowCount: info.changes };
      }
    }

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
    if (!USE_POSTGRES) {
      const db = getSqliteFallback();
      return db.transaction(fn as any)();
    }
    return pgWithTransaction(fn);
  }

  /**
   * Compatibility wrapper matching better-sqlite3 db.prepare()
   */
  public prepare(sql: string) {
    if (!USE_POSTGRES) {
      return getSqliteFallback().prepare(sql);
    }

    const self = this;
    return {
      all(...params: any[]) {
        const { sql: pgSql, params: pgParams } = transformSql(sql, params);
        return self.queryAll(pgSql, pgParams);
      },
      get(...params: any[]) {
        const { sql: pgSql, params: pgParams } = transformSql(sql, params);
        return self.queryOne(pgSql, pgParams);
      },
      run(...params: any[]) {
        const { sql: pgSql, params: pgParams } = transformSql(sql, params);
        return self.execute(pgSql, pgParams).then(res => ({
          changes: res.rowCount,
          rowCount: res.rowCount,
          lastInsertRowid: res.rows[0]?.id
        }));
      },
      allAsync(...params: any[]) {
        const { sql: pgSql, params: pgParams } = transformSql(sql, params);
        return self.queryAll(pgSql, pgParams);
      },
      getAsync(...params: any[]) {
        const { sql: pgSql, params: pgParams } = transformSql(sql, params);
        return self.queryOne(pgSql, pgParams);
      },
      runAsync(...params: any[]) {
        const { sql: pgSql, params: pgParams } = transformSql(sql, params);
        return self.execute(pgSql, pgParams).then(res => ({
          changes: res.rowCount,
          rowCount: res.rowCount,
          lastInsertRowid: res.rows[0]?.id
        }));
      }
    };
  }

  public pragma(setting: string): void {
    if (!USE_POSTGRES) {
      getSqliteFallback().pragma(setting);
    }
  }

  public exec(sql: string): Promise<void> {
    if (!USE_POSTGRES) {
      getSqliteFallback().exec(sql);
      return Promise.resolve();
    }
    return pgQuery(sql).then(() => {});
  }

  public transaction(fn: Function): Function {
    if (!USE_POSTGRES) {
      return getSqliteFallback().transaction(fn as any);
    }
    return async (...args: any[]) => {
      return this.withTransaction(async () => fn(...args));
    };
  }
}

export const dbAdapter = new DbAdapter();
export default dbAdapter;
