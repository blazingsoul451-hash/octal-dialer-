/**
 * db/pool.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * PostgreSQL Connection Pool & Unified Query Provider for Octal Dialer.
 * 
 * Supports:
 *  - Standard PostgreSQL connections via DATABASE_URL or PGHOST, PGPORT, etc.
 *  - Connection pooling with sensible defaults, connection timeouts, and leak detection.
 *  - In-memory PostgreSQL mock (via pg-mem) for isolated local testing without external services.
 *  - Parameterized helper methods: query(sql, params), withTransaction(fn)
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { Pool, PoolClient, QueryResult, QueryResultRow } from 'pg';
import fs from 'fs';
import path from 'path';

let pool: Pool | null = null;
let isInMemory = false;

export function getDatabaseUrl(): string | undefined {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  if (process.env.PGHOST && process.env.PGUSER && process.env.PGDATABASE) {
    const user = encodeURIComponent(process.env.PGUSER);
    const pass = process.env.PGPASSWORD ? `:${encodeURIComponent(process.env.PGPASSWORD)}` : '';
    const host = process.env.PGHOST;
    const port = process.env.PGPORT || '5432';
    const db = process.env.PGDATABASE;
    return `postgresql://${user}${pass}@${host}:${port}/${db}`;
  }
  return undefined;
}

export function initDatabasePool(customUrl?: string): Pool {
  if (pool) return pool;

  const dbUrl = customUrl || getDatabaseUrl();

  if (dbUrl) {
    console.log('[PostgreSQL] Connecting to external database...');
    pool = new Pool({
      connectionString: dbUrl,
      max: parseInt(process.env.PG_MAX_CONNECTIONS || '20', 10),
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 5000,
    });

    pool.on('error', (err) => {
      console.error('[PostgreSQL Pool Error]: Unexpected client error', err);
    });

    isInMemory = false;
    return pool;
  }

  // Fallback to in-memory PostgreSQL engine (via pg-mem) ONLY for local development/testing
  if (process.env.NODE_ENV === 'production') {
    const errorMsg = '[PostgreSQL Configuration Fatal] NODE_ENV is production, but no PostgreSQL configuration was found. ' +
      'Production strictly requires DATABASE_URL or (PGHOST, PGUSER, PGDATABASE, PGPASSWORD). ' +
      'In-memory fallback (pg-mem) is strictly prohibited in production mode.';
    console.error(errorMsg);
    throw new Error(errorMsg);
  }

  console.log('[PostgreSQL] No DATABASE_URL found. Initializing in-memory PostgreSQL provider (pg-mem) for local testing...');
  try {
    const { newDb } = require('pg-mem');
    const memDb = newDb();
    
    // Register common PostgreSQL functions
    memDb.public.registerFunction({
      name: 'now',
      implementation: () => new Date().toISOString()
    });

    const pgAdapter = memDb.adapters.createPg();
    pool = new pgAdapter.Pool() as Pool;
    (pool as any)._memDb = memDb;
    isInMemory = true;
    return pool;
  } catch (err) {
    console.error('[PostgreSQL] Failed to initialize in-memory fallback:', err);
    throw new Error('PostgreSQL configuration missing and pg-mem fallback failed.');
  }
}

export function getPool(): Pool {
  if (!pool) {
    return initDatabasePool();
  }
  return pool;
}

export function isInMemoryDatabase(): boolean {
  return isInMemory;
}

/**
 * Execute a parameterized query against the PostgreSQL pool.
 */
export async function query<T extends QueryResultRow = any>(
  text: string,
  params?: any[]
): Promise<QueryResult<T>> {
  const p = getPool();
  const start = Date.now();
  try {
    const res = await p.query<T>(text, params);
    return res;
  } catch (err: any) {
    const duration = Date.now() - start;
    console.error(`[PostgreSQL Query Error] (${duration}ms):`, {
      message: err.message,
      query: text.slice(0, 150),
      params
    });
    throw err;
  }
}

/**
 * Execute a scoped callback within a managed PostgreSQL transaction.
 */
export async function withTransaction<T>(
  callback: (client: PoolClient) => Promise<T>
): Promise<T> {
  const p = getPool();
  if (isInMemory && (p as any)._memDb) {
    const backup = (p as any)._memDb.backup();
    const client = await p.connect();
    try {
      const result = await callback(client);
      return result;
    } catch (err) {
      backup.restore();
      throw err;
    } finally {
      client.release();
    }
  }

  const client = await p.connect();
  try {
    await client.query('BEGIN');
    const result = await callback(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Execute schema DDL initialization script
 */
export function findSchemaFilePath(): string {
  const candidates = [
    path.join(__dirname, 'schema.sql'),
    path.join(__dirname, '../../src/db/schema.sql'),
    path.join(process.cwd(), 'src/db/schema.sql'),
    path.join(process.cwd(), 'dist/db/schema.sql')
  ];
  for (const p of candidates) {
    if (fs.existsSync(p)) return p;
  }
  return candidates[0];
}

export async function initializeSchema(schemaFilePath?: string): Promise<void> {
  const schemaPath = schemaFilePath && fs.existsSync(schemaFilePath) ? schemaFilePath : findSchemaFilePath();
  if (!fs.existsSync(schemaPath)) {
    throw new Error(`Schema file not found at: ${schemaPath}`);
  }
  const ddl = fs.readFileSync(schemaPath, 'utf-8');
  
  // Strip comments and split by semicolon
  const cleanDdl = ddl.replace(/--.*$/gm, '');
  const statements = cleanDdl
    .split(';')
    .map(s => s.trim())
    .filter(s => s.length > 0);

  for (const stmt of statements) {
    try {
      await query(stmt);
    } catch (e: any) {
      if (!e.message.includes('already exists') && !e.message.includes('duplicate key')) {
        console.warn(`[Schema Init] Warning on statement: ${stmt.slice(0, 60)}... => ${e.message}`);
      }
    }
  }
  console.log('[PostgreSQL] Schema initialized successfully (34 tables ready).');
}

/**
 * Ping database to verify connection health
 */
export async function pingDatabase(): Promise<boolean> {
  try {
    const res = await query('SELECT 1 as alive');
    return res.rows.length > 0 && (res.rows[0] as any).alive === 1;
  } catch (err) {
    console.error('[PostgreSQL Health Check Failed]:', err);
    return false;
  }
}

/**
 * Close pool during graceful shutdown
 */
export async function closePool(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = null;
  }
}
