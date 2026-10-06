const db = require('./dist/db/dbAdapter').default;
const dotenv = require('dotenv');
dotenv.config();

async function check() {
  try {
    await db.init();
    const cols = await db.queryAll("SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'users';");
    console.log("Users table columns:", cols.map(c => c.column_name).join(", "));
    
    const users = await db.queryAll('SELECT id, username, role, "tenantId" FROM users LIMIT 10;');
    console.log("Users in DB:");
    console.table(users);
    
    const leads = await db.queryAll("SELECT status, count(*) as count FROM leads GROUP BY status;");
    console.log("Leads summary:");
    console.table(leads);

    const tenants = await db.queryAll("SELECT id, name, plan, subscription_status FROM tenants;");
    console.log("Tenants:");
    console.table(tenants);

    process.exit(0);
  } catch (err) {
    console.error("DB check failed:", err);
    process.exit(1);
  }
}

check();
