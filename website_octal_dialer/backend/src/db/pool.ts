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
import { AsyncLocalStorage } from 'node:async_hooks';

// All adapter helpers inside a transaction must use its checked-out connection.
const transactionContext = new AsyncLocalStorage<{ client: PoolClient; active: boolean; rollbackOnly: boolean }>();

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
  const transaction = transactionContext.getStore();
  if (transaction && !transaction.active) throw new Error('Query attempted after transaction completed. Await all transaction work.');
  const p = transaction?.client || getPool();
  const start = Date.now();
  try {
    const res = await p.query<T>(text, params);
    return res;
  } catch (err: any) {
    const duration = Date.now() - start;
    console.error(`[PostgreSQL Query Error] (${duration}ms):`, {
      message: err.message,
      query: text.slice(0, 150),
      paramCount: params ? params.length : 0
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
  const parent = transactionContext.getStore();
  if (parent) {
    if (!parent.active) throw new Error('Transaction already completed.');
    try {
      return await callback(parent.client);
    } catch (err) {
      parent.rollbackOnly = true;
      throw err;
    }
  }
  const p = getPool();
  if (isInMemory && (p as any)._memDb) {
    const backup = (p as any)._memDb.backup();
    const client = await p.connect();
    const context = { client, active: true, rollbackOnly: false };
    try {
      const result = await transactionContext.run(context, () => callback(client));
      if (context.rollbackOnly) throw new Error('Transaction aborted by nested operation.');
      return result;
    } catch (err) {
      backup.restore();
      throw err;
    } finally {
      context.active = false;
      client.release();
    }
  }

  const client = await p.connect();
  const context = { client, active: true, rollbackOnly: false };
  try {
    await client.query('BEGIN');
    const result = await transactionContext.run(context, () => callback(client));
    if (context.rollbackOnly) throw new Error('Transaction aborted by nested operation.');
    await client.query('COMMIT');
    return result;
  } catch (err) {
    try { await client.query('ROLLBACK'); } catch (rollbackError) {
      console.error('[PostgreSQL] Rollback failed:', rollbackError);
    }
    throw err;
  } finally {
    context.active = false;
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

const ADVISORY_LOCK_ID = 987654321;

let schemaInitPromise: Promise<void> | null = null;

export function initializeSchema(schemaFilePath?: string): Promise<void> {
  if (schemaInitPromise) {
    return schemaInitPromise;
  }

  schemaInitPromise = (async () => {
    const schemaPath = schemaFilePath && fs.existsSync(schemaFilePath) ? schemaFilePath : findSchemaFilePath();
    if (!fs.existsSync(schemaPath)) {
      throw new Error(`Schema file not found at: ${schemaPath}`);
    }
    const ddl = fs.readFileSync(schemaPath, 'utf-8');

    let dedicatedClient: PoolClient | null = null;
    let lockAcquired = false;

    // Multi-instance concurrency protection: Check out a dedicated connection for advisory lock on real databases
    if (!isInMemoryDatabase()) {
      const p = getPool();
      try {
        dedicatedClient = await p.connect();
        // Set bounded statement and lock timeouts on the migration connection
        await dedicatedClient.query('SET statement_timeout = 60000');
        await dedicatedClient.query('SET lock_timeout = 30000');
        await dedicatedClient.query('SELECT pg_advisory_lock($1)', [ADVISORY_LOCK_ID]);
        lockAcquired = true;
      } catch (e: any) {
        console.error('[PostgreSQL] Failed to acquire advisory lock for schema migration:', e.message);
        if (dedicatedClient) {
          try { dedicatedClient.release(true); } catch (_) {}
          dedicatedClient = null;
        }
        throw new Error(`Migration advisory lock acquisition failed: ${e.message}`);
      }
    }

    const runStmt = async <T extends QueryResultRow = any>(stmt: string, params?: any[]): Promise<QueryResult<T>> => {
      if (dedicatedClient) {
        return await dedicatedClient.query<T>(stmt, params);
      }
      return await query<T>(stmt, params);
    };

    try {
      // 1. Run baseline schema DDL
      const cleanDdl = ddl.replace(/--.*$/gm, '');
      const statements = cleanDdl
        .split(';')
        .map(s => s.trim())
        .filter(s => s.length > 0);

      for (const stmt of statements) {
        try {
          await runStmt(stmt);
        } catch (e: any) {
          const ignorable =
            e.message?.includes('already exists') ||
            e.message?.includes('duplicate key') ||
            e.message?.includes('multiple primary keys') ||
            e.message?.includes('parts have not been read');
          if (ignorable) {
            continue;
          }
          console.error(`[Schema Init Fatal] Statement failed: ${stmt.slice(0, 80)}... => ${e.message}`);
          throw new Error(`Schema initialization failed on statement: ${stmt.slice(0, 60)}... Error: ${e.message}`);
        }
      }

      // 2. Ensure schema_migrations table exists for versioned migration tracking
      try {
        await runStmt(`
          CREATE TABLE IF NOT EXISTS schema_migrations (
            id TEXT PRIMARY KEY,
            name TEXT,
            appliedAt TEXT
          );
        `);
      } catch (e: any) {
        if (!e.message?.includes('already exists') && !e.message?.includes('parts have not been read')) {
          throw e;
        }
      }

      // Ensure revoked_tokens table exists for stateless token revocation
      try {
        await runStmt(`
          CREATE TABLE IF NOT EXISTS revoked_tokens (
            token TEXT PRIMARY KEY,
            "revokedAt" TEXT NOT NULL,
            "expiresAt" TEXT NOT NULL
          );
        `);
        await runStmt(`
          CREATE INDEX IF NOT EXISTS idx_revoked_tokens_expiresAt ON revoked_tokens("expiresAt");
        `);
      } catch (e: any) {
        if (!e.message?.includes('already exists') && !e.message?.includes('parts have not been read')) {
          throw e;
        }
      }

      // 3. Find and run incremental migrations on real PostgreSQL from src/db/migrations
      if (!isInMemoryDatabase()) {
        const migrationsDirCandidates = [
          path.join(__dirname, 'migrations'),
          path.join(__dirname, '../../src/db/migrations'),
          path.join(process.cwd(), 'src/db/migrations'),
          path.join(process.cwd(), 'dist/db/migrations')
        ];
        let migrationsDir: string | null = null;
        for (const dir of migrationsDirCandidates) {
          if (fs.existsSync(dir)) {
            migrationsDir = dir;
            break;
          }
        }

        if (!migrationsDir) {
          throw new Error('[PostgreSQL Migrations Fatal] Migration directory not found in any expected paths: ' + migrationsDirCandidates.join(', '));
        }

        const appliedRows = await runStmt<{ id: string }>('SELECT id FROM schema_migrations');
        const appliedSet = new Set(appliedRows.rows.map(r => r.id));

        const files = fs.readdirSync(migrationsDir)
          .filter(f => f.endsWith('.sql'))
          .sort();

        for (const file of files) {
          const migrationId = file.replace(/\.sql$/, '');
          if (appliedSet.has(migrationId)) {
            continue;
          }

          const sqlFile = path.join(migrationsDir, file);
          const migrationSql = fs.readFileSync(sqlFile, 'utf-8');

          // Wrap each transactional migration and its applied-marker insertion in the same transaction
          await runStmt('BEGIN');
          try {
            await runStmt(migrationSql);
            await runStmt(
              'INSERT INTO schema_migrations (id, name, appliedAt) VALUES ($1, $2, $3) ON CONFLICT (id) DO NOTHING',
              [migrationId, file, new Date().toISOString()]
            );
            await runStmt('COMMIT');
            console.log(`[PostgreSQL Migrations] Applied: ${file}`);
          } catch (migErr: any) {
            await runStmt('ROLLBACK');
            console.error(`[PostgreSQL Migrations] Failed applying migration ${file}:`, migErr.message);
            throw migErr;
          }
        }
      }

      console.log('[PostgreSQL] Schema initialized successfully (all tables ready).');
    } finally {
      if (dedicatedClient) {
        let discardConnection = false;
        if (lockAcquired) {
          try {
            const unlockRes = await dedicatedClient.query('SELECT pg_advisory_unlock($1)', [ADVISORY_LOCK_ID]);
            const unlocked = unlockRes.rows[0]?.pg_advisory_unlock;
            if (unlocked !== true) {
              console.warn('[PostgreSQL] Advisory unlock returned false or lock not held. Connection lock ownership uncertain.');
              discardConnection = true;
            }
          } catch (e: any) {
            console.warn('[PostgreSQL] Advisory lock release warning:', e.message);
            discardConnection = true;
          }
        }
        try {
          await dedicatedClient.query('RESET statement_timeout; RESET lock_timeout;');
        } catch (resetErr: any) {
          console.warn('[PostgreSQL] Reset session timeouts warning:', resetErr.message);
          discardConnection = true;
        }

        try {
          if (discardConnection) {
            console.warn('[PostgreSQL] Discarding migration connection from pool due to uncertain lock state or reset failure.');
            dedicatedClient.release(true);
          } else {
            dedicatedClient.release();
          }
        } catch (releaseErr: any) {
          console.warn('[PostgreSQL] Dedicated client release warning:', releaseErr.message);
        }
      }
    }
  })().catch(err => {
    schemaInitPromise = null;
    throw err;
  });

  return schemaInitPromise;
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
