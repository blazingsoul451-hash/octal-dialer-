require('dotenv').config({ path: '/home/ubuntu/octal-backend/.env' });
const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function run() {
  console.log('Ensuring all active tenants have all 7 core modules enabled...');
  const tenants = await pool.query('SELECT id, name FROM tenants');
  const modules = ['crm', 'octalDialer', 'campaigns', 'leads', 'reports', 'autoEmailer', 'facebookPoster'];
  const now = new Date().toISOString();

  for (const t of tenants.rows) {
    for (const mod of modules) {
      await pool.query(`
        INSERT INTO tenant_module_entitlements (id, "tenantId", "moduleId", enabled, "updatedBy", "updatedAt")
        VALUES ($1, $2, $3, 1, 'system_sync', $4)
        ON CONFLICT ("tenantId", "moduleId") DO UPDATE SET enabled = 1, "updatedAt" = $4
      `, [`tme_${t.id}_${mod}`, t.id, mod, now]);
    }
    console.log(`Synced 7 modules for tenant: ${t.name} (${t.id})`);
  }

  await pool.end();
  console.log('Done!');
}

run().catch(err => {
  console.error(err);
  process.exit(1);
});
