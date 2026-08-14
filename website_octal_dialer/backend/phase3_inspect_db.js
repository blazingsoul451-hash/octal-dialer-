/**
 * Phase 3 Pre-Migration Database Inspection
 *
 * This script:
 * 1. Verifies Phase 0 backup exists
 * 2. Inspects current database schema
 * 3. Records row counts for all tables
 * 4. Identifies which tables are tenant-owned
 */

const Database = require('better-sqlite3');
const fs = require('fs');
const path = require('path');

const DB_FILE = path.join(__dirname, 'data', 'octal_dialer.db');
const BACKUP_DIR = path.join(__dirname, 'data', 'backups');

console.log('═══════════════════════════════════════════════════════════════════════════');
console.log('PHASE 3: PRE-MIGRATION DATABASE INSPECTION');
console.log('═══════════════════════════════════════════════════════════════════════════\n');

// STEP 1: Verify backup exists
console.log('STEP 1: VERIFY PHASE 0 BACKUP\n');

if (!fs.existsSync(BACKUP_DIR)) {
  console.error('❌ BLOCKED: Backup directory does not exist:', BACKUP_DIR);
  process.exit(1);
}

const backupFiles = fs.readdirSync(BACKUP_DIR).filter(f => f.endsWith('.db'));
if (backupFiles.length === 0) {
  console.error('❌ BLOCKED: No backup files found in:', BACKUP_DIR);
  process.exit(1);
}

console.log('✅ Backup directory exists:', BACKUP_DIR);
console.log('✅ Found backup file(s):');
backupFiles.forEach(f => {
  const fullPath = path.join(BACKUP_DIR, f);
  const stats = fs.statSync(fullPath);
  console.log(`   - ${f} (${stats.size.toLocaleString()} bytes, ${stats.mtime.toISOString()})`);
});
console.log();

// STEP 2: Open current database
console.log('STEP 2: OPEN CURRENT DATABASE\n');

if (!fs.existsSync(DB_FILE)) {
  console.error('❌ BLOCKED: Database file does not exist:', DB_FILE);
  process.exit(1);
}

const db = new Database(DB_FILE, { readonly: true });
console.log('✅ Opened database:', DB_FILE);
console.log();

// STEP 3: List all tables
console.log('STEP 3: INSPECT CURRENT SCHEMA\n');

const tables = db.prepare(`
  SELECT name FROM sqlite_master
  WHERE type='table' AND name NOT LIKE 'sqlite_%'
  ORDER BY name
`).all();

console.log(`Found ${tables.length} tables:\n`);

// STEP 4: Get row counts and schema for each table
console.log('STEP 4: ROW COUNTS AND SCHEMA\n');

const tableData = [];

for (const { name } of tables) {
  const countRow = db.prepare(`SELECT COUNT(*) as count FROM ${name}`).get();
  const count = countRow.count;

  const schemaRow = db.prepare(`SELECT sql FROM sqlite_master WHERE type='table' AND name = ?`).get(name);
  const schema = schemaRow ? schemaRow.sql : 'N/A';

  // Get column info
  const columns = db.pragma(`table_info(${name})`);
  const columnNames = columns.map(c => c.name).join(', ');

  tableData.push({ name, count, columnNames, schema });

  console.log(`Table: ${name}`);
  console.log(`  Rows: ${count.toLocaleString()}`);
  console.log(`  Columns: ${columnNames}`);
  console.log();
}

// STEP 5: Verify Phase 2 tables exist
console.log('STEP 5: VERIFY PHASE 2 TABLES\n');

const phase2Tables = ['tenants', 'plans', 'plan_features', 'subscriptions'];
const phase2Exists = phase2Tables.every(t => tables.some(({ name }) => name === t));

if (!phase2Exists) {
  console.error('❌ BLOCKED: Phase 2 tables not found. Missing tables:',
    phase2Tables.filter(t => !tables.some(({ name }) => name === t)));
  db.close();
  process.exit(1);
}

console.log('✅ All Phase 2 tables exist:');
phase2Tables.forEach(t => {
  const row = tableData.find(d => d.name === t);
  console.log(`   - ${t} (${row.count} rows)`);
});
console.log();

// STEP 6: Identify tenant-owned tables
console.log('STEP 6: TENANT OWNERSHIP ANALYSIS\n');

const tenantOwnedTables = [
  { name: 'users', owned: true, reason: 'Each tenant has their own users/agents' },
  { name: 'campaigns', owned: true, reason: 'Campaigns are tenant-specific' },
  { name: 'leads', owned: true, reason: 'Leads belong to tenant campaigns' },
  { name: 'call_logs', owned: true, reason: 'Call logs are tenant activity' },
  { name: 'scraped_leads', owned: true, reason: 'Scraped data belongs to tenant' },
  { name: 'email_leads', owned: true, reason: 'Email leads belong to tenant' },
  { name: 'email_accounts', owned: true, reason: 'Email accounts are tenant-owned' },
  { name: 'email_templates', owned: true, reason: 'Templates can be tenant-specific (excluding system templates)' },
  { name: 'devices', owned: true, reason: 'Devices paired by tenant users' },
  { name: 'call_attempts', owned: true, reason: 'Call attempts are tenant activity' },
  { name: 'call_events', owned: true, reason: 'Call events are tenant activity' },
  { name: 'dispositions', owned: true, reason: 'Dispositions are tenant data' },
  { name: 'suppression_list', owned: true, reason: 'DNC list is tenant-specific' },
  { name: 'module_settings', owned: true, reason: 'Settings are per-user/tenant' },
  { name: 'user_permissions', owned: true, reason: 'Permissions are for tenant users' },
  { name: 'user_tool_permissions', owned: true, reason: 'Tool permissions are for tenant users' },
  { name: 'audit_logs', owned: true, reason: 'Audit logs track tenant activity' },
  { name: 'audit_logs_admin', owned: true, reason: 'Admin audit logs track tenant admin activity' },
  { name: 'api_keys', owned: true, reason: 'API keys belong to tenant users' },

  { name: 'sessions_store', owned: false, reason: 'Session storage is transient, not tenant-owned data' },
  { name: 'commands', owned: false, reason: 'Temporary command queue, not persistent tenant data' },
  { name: 'ota_versions', owned: false, reason: 'Platform OTA versions, not tenant data' },
  { name: 'module_tools', owned: false, reason: 'Platform tool registry, not tenant data' },
  { name: 'system_settings', owned: false, reason: 'Platform settings, not tenant settings' },
  { name: 'system_metrics', owned: false, reason: 'Platform health metrics, not tenant data' },
  { name: 'custom_roles', owned: false, reason: 'Platform role definitions (may be tenant-owned in future, but not in Phase 3)' },

  { name: 'tenants', owned: false, reason: 'Platform table' },
  { name: 'plans', owned: false, reason: 'Platform table' },
  { name: 'plan_features', owned: false, reason: 'Platform table' },
  { name: 'subscriptions', owned: false, reason: 'Links tenants to plans, but not tenant-owned data' }
];

console.log('TENANT OWNERSHIP DECISION TABLE:\n');
console.log('| Table                    | Tenant-Owned | Add tenantId | Reason');
console.log('|--------------------------|--------------|--------------|--------');

tenantOwnedTables.forEach(({ name, owned, reason }) => {
  const exists = tables.some(t => t.name === name);
  if (exists) {
    const ownedStr = owned ? 'YES' : 'NO';
    const addStr = owned ? 'YES' : 'NO';
    console.log(`| ${name.padEnd(24)} | ${ownedStr.padEnd(12)} | ${addStr.padEnd(12)} | ${reason}`);
  }
});
console.log();

// STEP 7: Row count summary for tenant-owned tables
console.log('STEP 7: PRE-MIGRATION ROW COUNT SNAPSHOT\n');

const ownedTableNames = tenantOwnedTables.filter(t => t.owned).map(t => t.name);
let totalRows = 0;

console.log('Tables that will receive tenantId:\n');
ownedTableNames.forEach(name => {
  const row = tableData.find(d => d.name === name);
  if (row) {
    console.log(`  ${name.padEnd(30)} ${row.count.toLocaleString().padStart(8)} rows`);
    totalRows += row.count;
  }
});

console.log(`\n  TOTAL ROWS TO MIGRATE:      ${totalRows.toLocaleString().padStart(8)}`);
console.log();

// STEP 8: Check if any table already has tenantId
console.log('STEP 8: CHECK FOR EXISTING tenantId COLUMNS\n');

let alreadyMigrated = false;

ownedTableNames.forEach(name => {
  const columns = db.pragma(`table_info(${name})`);
  const hasTenantId = columns.some(c => c.name === 'tenantId');
  if (hasTenantId) {
    console.log(`⚠️  ${name} already has tenantId column`);
    alreadyMigrated = true;
  }
});

if (!alreadyMigrated) {
  console.log('✅ No tables have tenantId column yet (fresh migration)');
} else {
  console.log('\n⚠️  WARNING: Some tables already have tenantId. Migration may be partially complete.');
}
console.log();

// STEP 9: Check current tenant count
console.log('STEP 9: CHECK EXISTING TENANTS\n');

const tenantCount = db.prepare('SELECT COUNT(*) as count FROM tenants').get().count;
const tenants = db.prepare('SELECT * FROM tenants').all();

console.log(`Current tenant count: ${tenantCount}`);
if (tenantCount > 0) {
  console.log('Existing tenants:');
  tenants.forEach(t => {
    console.log(`  - ${t.id} | ${t.slug} | ${t.name} | ${t.status}`);
  });
} else {
  console.log('✅ No tenants exist yet (expected for fresh migration)');
}
console.log();

// Close database
db.close();

console.log('═══════════════════════════════════════════════════════════════════════════');
console.log('PRE-MIGRATION INSPECTION COMPLETE');
console.log('═══════════════════════════════════════════════════════════════════════════');
console.log();

if (!phase2Exists) {
  console.log('❌ STATUS: PHASE 3 BLOCKED - Phase 2 tables missing');
  process.exit(1);
}

console.log('✅ STATUS: READY FOR MIGRATION');
console.log();
console.log('Next steps:');
console.log('  1. Create default tenant');
console.log('  2. Add tenantId columns to tenant-owned tables');
console.log('  3. Populate tenantId with default tenant');
console.log('  4. Add indexes for tenantId');
console.log('  5. Verify zero data loss');
