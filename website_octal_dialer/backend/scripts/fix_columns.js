const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

async function main() {
  try {
    await pool.query('ALTER TABLE tenants RENAME COLUMN leadpoolmode TO "leadPoolMode"');
    console.log('Successfully renamed leadpoolmode to leadPoolMode');
  } catch (err) {
    console.log('leadpoolmode rename note:', err.message);
  }

  try {
    await pool.query('ALTER TABLE tenants RENAME COLUMN maxagents TO "maxAgents"');
    console.log('Successfully renamed maxagents to maxAgents');
  } catch (err) {
    console.log('maxagents rename note:', err.message);
  }

  await pool.end();
}

main().catch(console.error);
