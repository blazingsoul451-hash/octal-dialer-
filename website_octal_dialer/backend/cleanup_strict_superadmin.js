const { getDatabase } = require('./dist/databaseManager');
const db = getDatabase();

console.log('=== STRICT SUPER ADMIN CLEANUP ===');

// 1. Delete all fake / test users
const deleteFakeUsers = db.prepare(`
  DELETE FROM users 
  WHERE username LIKE '%_1786%' 
     OR username LIKE 'test_%' 
     OR username LIKE 'testuser%' 
     OR username LIKE 'alpha_%' 
     OR username LIKE 'beta_%' 
     OR username LIKE 'spoof_%' 
     OR username LIKE 'attacker_%' 
     OR username LIKE 'impersonator%' 
     OR username LIKE 'stale_%' 
     OR username LIKE 'superadmin_%' 
     OR username LIKE 'bad_user%' 
     OR username LIKE 'tadmin_%' 
     OR username LIKE 'tagent_%'
     OR username LIKE 'agent_%'
     OR username LIKE 'admin_user_%'
     OR username LIKE 'target_%'
     OR username LIKE 'billing_%'
     OR username LIKE 'user_test_%'
     OR username LIKE 'google_verified_%'
     OR username LIKE 'newgoogleuser%'
     OR username LIKE 'googleuser_%'
`);
const res1 = deleteFakeUsers.run();
console.log('Deleted fake users count:', res1.changes);

// 2. Demote any other platform_admin accounts so ONLY mohsin1 (blazingsoul451@gmail.com) is platform_admin
db.prepare(`
  UPDATE users 
  SET role = 'user' 
  WHERE role = 'platform_admin' 
    AND username != 'mohsin1' 
    AND (email IS NULL OR email != 'blazingsoul451@gmail.com')
`).run();

// 3. Ensure mohsin1 has platform_admin role
db.prepare(`
  UPDATE users 
  SET role = 'platform_admin' 
  WHERE username = 'mohsin1' OR email = 'blazingsoul451@gmail.com'
`).run();

// 4. Verify user list
const remainingUsers = db.prepare('SELECT id, username, email, role, tenantId FROM users').all();
console.log('\n--- REMAINING LEGITIMATE USERS ---');
console.log(JSON.stringify(remainingUsers, null, 2));

const superAdmins = remainingUsers.filter(u => u.role === 'platform_admin');
console.log('\n--- SUPER ADMINS (MUST BE EXACTLY 1) ---');
console.log(superAdmins);
