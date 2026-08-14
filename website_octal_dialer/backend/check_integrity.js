const Database = require('better-sqlite3');
const path = require('path');

const DB_FILE = path.join(__dirname, 'data', 'octal_dialer.db');
const db = new Database(DB_FILE, { readonly: true });

console.log('Running SQLite integrity check...\n');

const integrityResult = db.pragma('integrity_check');

console.log('Result type:', typeof integrityResult);
console.log('Result length:', integrityResult.length);
console.log('\nFull result:');
console.log(JSON.stringify(integrityResult, null, 2));

db.close();
