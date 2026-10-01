const { hashPassword } = require('/home/ubuntu/octal-backend/dist/authManager');
const { Client } = require('/home/ubuntu/octal-backend/node_modules/pg');

async function main() {
  const { hash } = hashPassword('CompanyPassword1234!');
  const c = new Client('postgresql://octal_admin:octal_secure_pg_pass_2026@127.0.0.1:5432/octal_dialer');
  await c.connect();
  await c.query('UPDATE users SET "passwordHash" = $1, status = \'Active\' WHERE username = \'mohsin_mughal7\'', [hash]);
  console.log('mohsin_mughal7 password updated to CompanyPassword1234!');
  await c.end();
}

main().catch(console.error);
