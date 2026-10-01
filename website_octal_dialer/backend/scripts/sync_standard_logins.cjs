require('dotenv').config({ path: '/home/ubuntu/octal-backend/.env' });
const { Pool } = require('pg');
const crypto = require('crypto');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${hash}`;
}

function verifyPassword(password, stored) {
  try {
    if (!stored || !stored.includes(':')) return false;
    const [salt, hash] = stored.split(':');
    const candidate = crypto.scryptSync(password, salt, 64).toString('hex');
    return hash === candidate;
  } catch (e) {
    return false;
  }
}

async function run() {
  console.log('=== SYNCHRONIZING PLATFORM CREDENTIALS ===\n');

  const targets = [
    {
      username: 'master_mohsin7',
      password: 'AdminPassword1234!',
      role: 'superadmin',
      label: 'Platform Super Admin (Platform Portal)'
    },
    {
      username: 'company_owner',
      password: 'CompanyPassword1234!',
      role: 'admin',
      label: 'Company Owner (Workspace & CRM Admin)'
    },
    {
      username: 'team_lead',
      password: 'TeamLeadPassword1234!',
      role: 'team_lead',
      label: 'Team Lead (Team Dashboard & Reports)'
    },
    {
      username: 'worker_agent',
      password: 'AgentPassword1234!',
      role: 'user',
      label: 'Agent / Dialer User (Dialer & CRM HUD)'
    }
  ];

  for (const t of targets) {
    const newHash = hashPassword(t.password);
    
    // Check if user exists
    const check = await pool.query('SELECT id, username FROM users WHERE username = $1', [t.username]);
    if (check.rows.length > 0) {
      await pool.query(
        'UPDATE users SET "passwordHash" = $1, status = $2, role = $3, "updatedAt" = $4 WHERE username = $5',
        [newHash, 'Active', t.role, new Date().toISOString(), t.username]
      );
      console.log(`Updated existing user: ${t.username}`);
    } else {
      const id = 'user_' + crypto.randomBytes(8).toString('hex');
      await pool.query(
        'INSERT INTO users (id, username, email, "passwordHash", role, status, "tenantId", "createdAt", "updatedAt") VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $8)',
        [id, t.username, `${t.username}@acme.com`, newHash, t.role, 'Active', 'tenant_default', new Date().toISOString()]
      );
      console.log(`Created new user: ${t.username}`);
    }

    // Immediate verification of hash
    const row = await pool.query('SELECT "passwordHash" FROM users WHERE username = $1', [t.username]);
    const valid = verifyPassword(t.password, row.rows[0].passwordHash);
    console.log(`✓ Verified ${t.username} password: ${valid ? 'VALID' : 'INVALID'}`);
  }

  console.log('\n=== ALL CREDENTIALS READY FOR USER ===');
  await pool.end();
}

run().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
