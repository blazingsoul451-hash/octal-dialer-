const { Pool } = require('pg');

const pool = new Pool({
  connectionString: 'postgresql://postgres:devpassword123@127.0.0.1:54330/zestify_local_dev'
});

async function main() {
  console.log('=== CHECKING USERS WITH PLATFORM ROLES ===');
  const res = await pool.query(`SELECT id, username, email, role, "tenantId", status FROM users WHERE LOWER(role) IN ('platform_admin', 'master_admin', 'super_admin')`);
  console.table(res.rows);

  console.log('\n=== CHECKING TENANT_DEFAULT USER DISTRIBUTION ===');
  const tenantUsers = await pool.query(`SELECT role, count(*) FROM users WHERE "tenantId" = 'tenant_default' GROUP BY role`);
  console.table(tenantUsers.rows);

  console.log('\n=== CHECKING IF PLATFORM ADMIN IS IN ANY TEAMS ===');
  const teamMembers = await pool.query(`
    SELECT tm."teamId", tm."userId", u.username, u.role 
    FROM team_members tm 
    JOIN users u ON tm."userId" = u.id 
    WHERE LOWER(u.role) IN ('platform_admin', 'master_admin', 'super_admin')
  `);
  console.table(teamMembers.rows);

  console.log('\n=== CHECKING IF PLATFORM ADMIN IS ASSIGNED TO LEADS ===');
  const leadAssignees = await pool.query(`
    SELECT l.id, l.name, l."assignedTo", u.username, u.role
    FROM leads l
    JOIN users u ON l."assignedTo" = u.id
    WHERE LOWER(u.role) IN ('platform_admin', 'master_admin', 'super_admin')
  `);
  console.table(leadAssignees.rows);

  console.log('\n=== CHECKING MIGRATIONS APPLIED ===');
  const migrations = await pool.query(`SELECT * FROM schema_migrations ORDER BY id`);
  console.table(migrations.rows);

  await pool.end();
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
