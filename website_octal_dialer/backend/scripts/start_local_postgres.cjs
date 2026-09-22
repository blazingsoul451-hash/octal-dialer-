// website_octal_dialer/backend/scripts/start_local_postgres.cjs
const fs = require('fs');
const path = require('path');
const { Client } = require('pg');
const EmbeddedPostgres = require('embedded-postgres').default;

const DB_DIR = path.join(__dirname, '../local_pg_cluster');
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

  // Connect to postgres to ensure zestify_local_dev database exists
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

  console.log('====================================================');
  console.log('[PostgreSQL Ready] Native PostgreSQL 18 is ready.');
  console.log(`DATABASE_ENGINE: PostgreSQL 18 (Native Embedded Engine)`);
  console.log(`DATABASE_HOST: 127.0.0.1`);
  console.log(`DATABASE_PORT: ${PORT}`);
  console.log(`DATABASE_NAME: ${DBNAME}`);
  console.log('====================================================');

  // Keep alive
  const handleExit = async () => {
    console.log('[PostgreSQL] Stopping engine...');
    await pgServer.stop();
    process.exit(0);
  };
  process.on('SIGINT', handleExit);
  process.on('SIGTERM', handleExit);
}

main().catch(err => {
  console.error('[PostgreSQL Error]:', err);
  process.exit(1);
});
