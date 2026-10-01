const { Pool } = require('pg');
const pool = new Pool({
  connectionString: 'postgresql://postgres:devpassword123@127.0.0.1:54330/zestify_local_dev'
});

async function main() {
  const tables = await pool.query("SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY table_name");
  console.log('Tables:', tables.rows.map(r => r.table_name));

  const superAdmins = await pool.query("SELECT id, username, email, role, \"tenantId\" FROM users WHERE role IN ('superadmin', 'platform_admin')");
  console.log('SuperAdmins:', superAdmins.rows);

  await pool.end();
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
