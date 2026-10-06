const { Pool } = require('pg');
const crypto = require('crypto');
const dotenv = require('dotenv');
dotenv.config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://octal_admin:octal_secure_pg_pass_2026@127.0.0.1:5432/octal_dialer'
});

function hashPassword(password, salt) {
  const s = salt || crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, s, 64).toString('hex');
  return `${s}:${hash}`;
}

async function main() {
  const now = new Date().toISOString();

  // 1. Ensure a primary company workspace exists with all modules entitled
  const tenantId = 'tenant_default';
  const tenantCheck = await pool.query('SELECT * FROM tenants WHERE id = $1', [tenantId]);
  if (tenantCheck.rows.length === 0) {
    await pool.query(`
      INSERT INTO tenants (id, name, slug, status, "createdAt", "updatedAt", "customerType", "maxTeamVisibility", "leadPoolMode", "maxAgents", tier)
      VALUES ($1, 'Acme Global Corp', 'acme-global', 'active', $2, $2, 'COMPANY', 'TEAM_COLLABORATE', 'shared', 50, 'enterprise')
    `, [tenantId, now]);
  } else {
    await pool.query(`
      UPDATE tenants SET name = 'Acme Global Corp', status = 'active', "maxAgents" = 50, "updatedAt" = $2 WHERE id = $1
    `, [tenantId, now]);
  }

  // Canonical modules
  const canonicalModules = [
    'crm',
    'campaigns',
    'leads',
    'octalDialer',
    'reports',
    'autoEmailer',
    'facebookPoster',
    'googleScraper',
    'facebookScraper'
  ];

  for (const mod of canonicalModules) {
    const entId = `ent_${tenantId}_${mod}`;
    await pool.query(`
      INSERT INTO tenant_module_entitlements (id, "tenantId", "moduleId", enabled, "updatedBy", "updatedAt")
      VALUES ($1, $2, $3, 1, 'SYSTEM', $4)
      ON CONFLICT ("tenantId", "moduleId") DO UPDATE SET enabled = 1, "updatedAt" = $4
    `, [entId, tenantId, mod, now]);
  }

  // 2. Define the 4 target accounts
  const accounts = [
    {
      roleType: 'Software Owner (Super Admin)',
      username: 'software_owner',
      email: 'software_owner@zestify.local',
      password: 'SoftwareOwnerPass123!',
      role: 'platform_admin',
      tenantId: null, // Strictly detached from customer tenancy
      displayName: 'System Software Owner'
    },
    {
      roleType: 'Company Owner (Tenant Admin)',
      username: 'company_owner',
      email: 'company_owner@acme.com',
      password: 'CompanyOwnerPass123!',
      role: 'admin',
      tenantId: tenantId,
      displayName: 'Sarah Jenkins (Company Owner)'
    },
    {
      roleType: 'Team Lead (Supervisor)',
      username: 'team_lead',
      email: 'team_lead@acme.com',
      password: 'TeamLeadPass123!',
      role: 'team_lead',
      tenantId: tenantId,
      displayName: 'Marcus Vance (Team Lead)'
    },
    {
      roleType: 'Worker / Agent (Telecaller)',
      username: 'worker_agent',
      email: 'worker_agent@acme.com',
      password: 'WorkerPass123!',
      role: 'user',
      tenantId: tenantId,
      displayName: 'Alex Rivera (Agent)'
    }
  ];

  const createdUsers = [];

  for (const acc of accounts) {
    const pwdHash = hashPassword(acc.password);
    
    // Check if exists by username or email
    const existing = await pool.query(
      'SELECT id FROM users WHERE username = $1 OR email = $2',
      [acc.username, acc.email]
    );

    let userId;
    if (existing.rows.length > 0) {
      userId = existing.rows[0].id;
      await pool.query(`
        UPDATE users 
        SET username = $1, email = $2, "displayName" = $3, "passwordHash" = $4, role = $5, "tenantId" = $6, status = 'active', "emailVerified" = 1, "updatedAt" = $7, "roleId" = NULL
        WHERE id = $8
      `, [acc.username, acc.email, acc.displayName, pwdHash, acc.role, acc.tenantId, now, userId]);
      console.log(`Updated user: ${acc.username} (${acc.role})`);
    } else {
      userId = 'user_' + crypto.randomUUID();
      await pool.query(`
        INSERT INTO users (id, username, email, "displayName", "passwordHash", role, "tenantId", status, "authProvider", "emailVerified", "createdAt", "updatedAt")
        VALUES ($1, $2, $3, $4, $5, $6, $7, 'active', 'local', 1, $8, $8)
      `, [userId, acc.username, acc.email, acc.displayName, pwdHash, acc.role, acc.tenantId, now]);
      console.log(`Created user: ${acc.username} (${acc.role})`);
    }

    // Grant user tool permissions for tenant users
    if (acc.tenantId) {
      for (const mod of canonicalModules) {
        const permId = `perm_${userId}_${mod}`;
        await pool.query(`
          INSERT INTO user_permissions (id, "userId", "moduleId", enabled, "grantedBy", "tenantId", "grantedAt")
          VALUES ($1, $2, $3, 1, 'SYSTEM', $4, $5)
          ON CONFLICT (id) DO UPDATE SET enabled = 1
        `, [permId, userId, mod, acc.tenantId, now]);
      }
    }

    createdUsers.push({
      roleType: acc.roleType,
      username: acc.username,
      email: acc.email,
      password: acc.password,
      role: acc.role,
      tenantId: acc.tenantId,
      userId
    });
  }

  // 3. Ensure Team Alpha exists and assign Team Lead + Worker
  const teamId = 'team_alpha_sales';
  const teamCheck = await pool.query('SELECT id FROM teams WHERE id = $1', [teamId]);
  const teamLeadUserId = createdUsers.find(u => u.username === 'team_lead').userId;
  const workerUserId = createdUsers.find(u => u.username === 'worker_agent').userId;

  if (teamCheck.rows.length === 0) {
    await pool.query(`
      INSERT INTO teams (id, name, description, "leaderId", "tenantId", status, "createdAt", "updatedAt")
      VALUES ($1, 'Alpha Sales Squad', 'Primary Outbound Telephony & CRM Squad', $2, $3, 'active', $4, $4)
    `, [teamId, teamLeadUserId, tenantId, now]);
    console.log('Created team: Alpha Sales Squad');
  } else {
    await pool.query(`
      UPDATE teams SET name = 'Alpha Sales Squad', "leaderId" = $1, status = 'active', "updatedAt" = $2 WHERE id = $3
    `, [teamLeadUserId, now, teamId]);
    console.log('Updated team: Alpha Sales Squad');
  }

  // Set team members
  await pool.query('DELETE FROM team_members WHERE "teamId" = $1', [teamId]);
  await pool.query(`
    INSERT INTO team_members (id, "teamId", "userId", "tenantId", "roleInTeam", "joinedAt")
    VALUES ($1, $2, $3, $4, 'LEADER', $5)
  `, [`tm_${teamId}_${teamLeadUserId}`, teamId, teamLeadUserId, tenantId, now]);

  await pool.query(`
    INSERT INTO team_members (id, "teamId", "userId", "tenantId", "roleInTeam", "joinedAt")
    VALUES ($1, $2, $3, $4, 'MEMBER', $5)
  `, [`tm_${teamId}_${workerUserId}`, teamId, workerUserId, tenantId, now]);

  console.log('\n======================================================');
  console.log('  SUCCESSFULLY CONFIGURED 4 LOGINS IN PRODUCTION');
  console.log('======================================================');
  for (const u of createdUsers) {
    console.log(`[${u.roleType}]`);
    console.log(`  Username: ${u.username}`);
    console.log(`  Email:    ${u.email}`);
    console.log(`  Password: ${u.password}`);
    console.log(`  Role:     ${u.role}`);
    console.log(`  Tenant:   ${u.tenantId || 'GLOBAL (Platform Owner)'}`);
    console.log('------------------------------------------------------');
  }

  await pool.end();
}

main().catch(err => {
  console.error('Fatal provisioning error:', err);
  process.exit(1);
});
