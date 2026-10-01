const { Pool } = require('pg');
require('dotenv').config();
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
async function clean() {
  const res = await pool.query(
    "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE pid <> pg_backend_pid() AND datname = 'zestify_local_dev'"
  );
  console.log('Terminated stale backends:', res.rowCount);
  await pool.end();
}
clean().catch(console.error);
