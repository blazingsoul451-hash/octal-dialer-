const { db } = require('../dist/databaseManager.js');

async function inspect() {
  try {
    const users = await db.queryAll('SELECT id, username, "displayName", email, role, "roleId", "tenantId", status FROM users');
    console.log('--- DATABASE USERS ---');
    console.log(JSON.stringify(users, null, 2));

    const tenants = await db.queryAll('SELECT id, name, "customerType", "maxTeamVisibility", plan, status FROM tenants');
    console.log('--- DATABASE TENANTS ---');
    console.log(JSON.stringify(tenants, null, 2));

    const customRoles = await db.queryAll('SELECT * FROM custom_roles');
    console.log('--- DATABASE CUSTOM ROLES ---');
    console.log(JSON.stringify(customRoles, null, 2));
  } catch (err) {
    console.error('Error inspecting database:', err);
  } finally {
    process.exit(0);
  }
}

inspect();
