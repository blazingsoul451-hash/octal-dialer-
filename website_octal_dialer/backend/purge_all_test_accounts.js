const { getDatabase } = require('./dist/databaseManager');
const db = getDatabase();

console.log('--- PURGING ALL RESIDUAL TEST ACCOUNTS ---');

// Delete users that do not belong to legitimate accounts
db.prepare(`
  DELETE FROM users 
  WHERE username != 'mohsin1' 
    AND username != 'admin'
    AND (email IS NULL OR (email != 'blazingsoul451@gmail.com' AND email != 'admin@octaldialer.local'))
`).run();

// Demote any non-mohsin1 to user/admin
db.prepare(`
  UPDATE users 
  SET role = 'user' 
  WHERE username != 'mohsin1' AND email != 'blazingsoul451@gmail.com'
`).run();

// Ensure mohsin1 is the ONLY platform_admin
db.prepare(`
  UPDATE users 
  SET role = 'platform_admin' 
  WHERE username = 'mohsin1' OR email = 'blazingsoul451@gmail.com'
`).run();

const finalUsers = db.prepare('SELECT id, username, email, role, tenantId FROM users').all();
console.log('Final Users in Database:', finalUsers);
