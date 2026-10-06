const db = require('./dist/db/dbAdapter').default;
const crypto = require('crypto');
require('dotenv').config();

function verify(pw, stored) {
  try {
    if (!stored || !stored.includes(':')) return false;
    const [salt, hash] = stored.split(':');
    const cand = crypto.scryptSync(pw, salt, 64).toString('hex');
    return hash === cand;
  } catch { return false; }
}

async function run() {
  await db.init();
  const users = await db.queryAll('SELECT username, role, "passwordHash" FROM users;');
  const candidates = [
    'AdminPassword1234!',
    'OwnerPassword1234!',
    'AgentPassword1234!',
    'TeamLeadPassword123!',
    'TeamLeadPass123!',
    'CompanyOwnerPass123!',
    'SoftwareOwnerPass123!',
    'WorkerPass123!',
    'devpassword123',
    'password123',
    'admin123'
  ];

  for (const u of users) {
    let matched = false;
    for (const p of candidates) {
      if (verify(p, u.passwordHash)) {
        console.log(`MATCH: username=${u.username} (role=${u.role}) -> password=${p}`);
        matched = true;
        break;
      }
    }
    if (!matched) {
      console.log(`NO MATCH: username=${u.username} (role=${u.role})`);
    }
  }
  process.exit(0);
}

run();
