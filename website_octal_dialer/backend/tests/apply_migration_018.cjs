const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: 'postgresql://postgres:devpassword123@127.0.0.1:54330/zestify_local_dev'
});

async function run() {
  const migPath = path.join(__dirname, '../src/db/migrations/018_platform_authority_isolation.sql');
  const sql = fs.readFileSync(migPath, 'utf8');
  console.log('Applying Migration 018...');
  await pool.query(sql);
  await pool.query(
    `INSERT INTO schema_migrations (id, name, appliedat) VALUES ('018_platform_authority_isolation', '018_platform_authority_isolation.sql', $1) ON CONFLICT (id) DO NOTHING`,
    [new Date().toISOString()]
  );
  console.log('Migration 018 successfully executed on local PostgreSQL 18.4');

  const res = await pool.query(`SELECT id, username, role, "tenantId" FROM users WHERE LOWER(role) IN ('platform_admin', 'master_admin', 'super_admin')`);
  console.log('Platform Admins:');
  console.table(res.rows);

  const tenantDefaultUsers = await pool.query(`SELECT id, username, role, "tenantId" FROM users WHERE "tenantId" = 'tenant_default'`);
  console.log('Tenant Default Users (Customer Workspace Users Only):');
  console.table(tenantDefaultUsers.rows);

  await pool.end();
}

run().catch(e => {
  console.error(e);
  process.exit(1);
});
