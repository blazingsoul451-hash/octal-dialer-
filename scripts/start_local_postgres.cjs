// scripts/start_local_postgres.cjs
// Manages real native PostgreSQL local service for Zestify development & audit.

const fs = require('fs');
const path = require('path');
const backendNodeModules = path.join(__dirname, '../website_octal_dialer/backend/node_modules');
const { Client } = require(path.join(backendNodeModules, 'pg'));
const EmbeddedPostgres = require(path.join(backendNodeModules, 'embedded-postgres')).default;

const DB_DIR = path.join(__dirname, '../website_octal_dialer/backend/local_pg_cluster');
const PORT = 54330;
const USER = 'postgres';
const PASSWORD = 'devpassword123';
const DBNAME = 'zestify_local_dev';

async function main() {
  const isFirstTime = !fs.existsSync(DB_DIR);
  fs.mkdirSync(DB_DIR, { recursive: true });

  const pgServer = new EmbeddedPostgres({
    port: PORT,
    databaseDir: DB_DIR,
    user: USER,
    password: PASSWORD,
    persistent: true
  });

  if (isFirstTime) {
    console.log('[PostgreSQL] Initialising new cluster at', DB_DIR);
    await pgServer.initialise();
  }

  console.log(`[PostgreSQL] Starting native PostgreSQL engine on port ${PORT}...`);
  await pgServer.start();
  console.log(`[PostgreSQL] Engine online on 127.0.0.1:${PORT}`);

  // Create database zestify_local_dev if needed
  const adminClient = new Client({
    host: '127.0.0.1',
    port: PORT,
    user: USER,
    password: PASSWORD,
    database: 'postgres'
  });
  await adminClient.connect();

  const res = await adminClient.query("SELECT 1 FROM pg_database WHERE datname = $1", [DBNAME]);
  if (res.rows.length === 0) {
    console.log(`[PostgreSQL] Creating database "${DBNAME}"...`);
    await adminClient.query(`CREATE DATABASE "${DBNAME}"`);
  }
  await adminClient.end();

  console.log(`[PostgreSQL Ready] Native PostgreSQL 18 is ready.`);
  console.log(`ENGINE: PostgreSQL 18 (Native Binaries)`);
  console.log(`HOST: 127.0.0.1`);
  console.log(`PORT: ${PORT}`);
  console.log(`DATABASE: ${DBNAME}`);
  console.log(`DATABASE_URL: postgresql://${USER}:${PASSWORD}@127.0.0.1:${PORT}/${DBNAME}`);

  // Keep alive
  process.on('SIGINT', async () => {
    console.log('[PostgreSQL] Stopping...');
    await pgServer.stop();
    process.exit(0);
  });
  process.on('SIGTERM', async () => {
    console.log('[PostgreSQL] Stopping...');
    await pgServer.stop();
    process.exit(0);
  });
}

main().catch(err => {
  console.error('[PostgreSQL Error]:', err);
  process.exit(1);
});
