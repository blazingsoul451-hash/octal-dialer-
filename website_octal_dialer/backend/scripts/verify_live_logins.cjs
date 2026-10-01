require('dotenv').config({ path: '/home/ubuntu/octal-backend/.env' });
const { Pool } = require('pg');
const crypto = require('crypto');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

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

async function test() {
  const res = await pool.query('SELECT username, email, "passwordHash", role, status, "tenantId" FROM users');
  console.log('=== REAL POSTGRESQL USERS ===');
  
  const passwordsToTest = [
    'AdminPassword1234!',
    'CustomerPass1234!',
    'testpassword123',
    'Admin1234!',
    'password123',
    'Octal1234!',
    'admin123',
    'Secret123!'
  ];

  for (const user of res.rows) {
    let matchedPassword = null;
    for (const pass of passwordsToTest) {
      if (verifyPassword(pass, user.passwordHash)) {
        matchedPassword = pass;
        break;
      }
    }
    console.log(`Username: "${user.username}" | Email: "${user.email}" | Role: "${user.role}" | Tenant: "${user.tenantId}" | Password: ${matchedPassword ? '✅ ' + matchedPassword : '❓ Not in common list'}`);
  }

  await pool.end();
}

test().catch(err => {
  console.error(err);
  process.exit(1);
});
