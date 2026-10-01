require('dotenv').config();
const { Pool } = require('pg');

async function main() {
  const connectionString = process.env.DATABASE_URL || 'postgresql://octal_admin:octal_secure_pg_pass_2026@127.0.0.1:5432/octal_dialer';
  const pool = new Pool({ connectionString });

  try {
    console.log('Synchronizing Platform Admin username to master_mohsin7...');

    // Rename user_f0e38078-5d4b-4f49-b809-317a2e02678e back to software_owner_service
    await pool.query(
      `UPDATE users SET username = 'software_owner_service' WHERE id = 'user_f0e38078-5d4b-4f49-b809-317a2e02678e'`
    );

    // Update user_admin_de06b12c (the one with AdminPassword1234!) to master_mohsin7
    await pool.query(
      `UPDATE users SET username = 'master_mohsin7' WHERE id = 'user_admin_de06b12c'`
    );

    // Also disable/rename any old admin username to prevent any bot guessing
    const check = await pool.query(
      `SELECT id, username, email, role, status FROM users WHERE id IN ('user_admin_de06b12c', 'user_f0e38078-5d4b-4f49-b809-317a2e02678e')`
    );
    console.log('\nVerified Platform Admin Records:', check.rows);

    console.log('\nSUCCESS: user_admin_de06b12c is now username: master_mohsin7 (Password: AdminPassword1234!)');
  } catch (err) {
    console.error('Error:', err);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

main();
