/**
 * Phase 3 Independent Audit Script
 * Verifies actual database state against Phase 3 requirements
 */

const Database = require('better-sqlite3');
const path = require('path');

const DB_FILE = path.join(__dirname, 'data', 'octal_dialer.db');
const db = new Database(DB_FILE, { readonly: true });

console.log('═══════════════════════════════════════════════════════════════════════════');
console.log('PHASE 3 INDEPENDENT AUDIT');
console.log('═══════════════════════════════════════════════════════════════════════════\n');

// ═══════════════════════════════════════════════════════════════════════════
// AUDIT 1: MODIFIED TABLES (19)
// ═══════════════════════════════════════════════════════════════════════════

console.log('AUDIT 1: MODIFIED TABLES (19 tables reported as modified)\n');

const MODIFIED_TABLES = [
  'users',
  'campaigns',
  'leads',
  'call_logs',
  'scraped_leads',
  'email_leads',
  'email_accounts',
  'email_templates',
  'devices',
  'call_attempts',
  'call_events',
  'dispositions',
  'suppression_list',
  'module_settings',
  'user_permissions',
  'user_tool_permissions',
  'audit_logs',
  'audit_logs_admin',
  'api_keys'
];

const modifiedTableAudit = [];

MODIFIED_TABLES.forEach(table => {
  const columns = db.pragma(`table_info(${table})`);
  const tenantIdCol = columns.find(c => c.name === 'tenantId');

  // Check if tenantId exists
  if (!tenantIdCol) {
    console.log(`❌ FAIL: ${table} - tenantId column MISSING`);
    modifiedTableAudit.push({ table, hasTenantId: false, status: 'FAIL' });
    return;
  }

  // Check if index exists
  const indexes = db.pragma(`index_list(${table})`);
  const hasIndex = indexes.some(i => i.name === `idx_${table}_tenantId`);

  // Get row count and NULL count
  const rowCount = db.prepare(`SELECT COUNT(*) as count FROM ${table}`).get().count;
  const nullCount = db.prepare(`SELECT COUNT(*) as count FROM ${table} WHERE tenantId IS NULL`).get().count;

  // Get foreign keys
  const foreignKeys = db.pragma(`foreign_key_list(${table})`);

  console.log(`Table: ${table}`);
  console.log(`  tenantId column: ✅ EXISTS (type: ${tenantIdCol.type}, notnull: ${tenantIdCol.notnull})`);
  console.log(`  tenantId index: ${hasIndex ? '✅ EXISTS' : '❌ MISSING'}`);
  console.log(`  Row count: ${rowCount}`);
  console.log(`  NULL tenantId: ${nullCount}`);
  console.log(`  Foreign keys: ${foreignKeys.length}`);

  modifiedTableAudit.push({
    table,
    hasTenantId: true,
    hasIndex,
    rowCount,
    nullCount,
    foreignKeyCount: foreignKeys.length,
    nullable: tenantIdCol.notnull === 0,
    status: hasIndex && nullCount === 0 ? 'PASS' : 'WARNING'
  });
  console.log();
});

// ═══════════════════════════════════════════════════════════════════════════
// AUDIT 2: UNCHANGED TABLES (11)
// ═══════════════════════════════════════════════════════════════════════════

console.log('AUDIT 2: UNCHANGED TABLES (11 tables should NOT have tenantId)\n');

const UNCHANGED_TABLES = [
  'sessions_store',
  'commands',
  'ota_versions',
  'module_tools',
  'system_settings',
  'system_metrics',
  'custom_roles',
  'tenants',
  'plans',
  'plan_features',
  'subscriptions'
];

const unchangedTableAudit = [];

UNCHANGED_TABLES.forEach(table => {
  const exists = db.prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name = ?`).get(table);

  if (!exists) {
    console.log(`❌ FAIL: ${table} - TABLE MISSING`);
    unchangedTableAudit.push({ table, exists: false, status: 'FAIL' });
    return;
  }

  const columns = db.pragma(`table_info(${table})`);
  const hasTenantId = columns.some(c => c.name === 'tenantId');

  const rowCount = db.prepare(`SELECT COUNT(*) as count FROM ${table}`).get().count;

  console.log(`Table: ${table}`);
  console.log(`  tenantId column: ${hasTenantId ? '❌ EXISTS (should NOT)' : '✅ ABSENT (correct)'}`);
  console.log(`  Row count: ${rowCount}`);

  unchangedTableAudit.push({
    table,
    exists: true,
    hasTenantId,
    rowCount,
    status: hasTenantId ? 'FAIL' : 'PASS'
  });
  console.log();
});

// ═══════════════════════════════════════════════════════════════════════════
// AUDIT 3: TENANT DATA
// ═══════════════════════════════════════════════════════════════════════════

console.log('AUDIT 3: TENANT DATA\n');

const tenantCount = db.prepare('SELECT COUNT(*) as count FROM tenants').get().count;
const tenants = db.prepare('SELECT * FROM tenants').all();

console.log(`Tenant count: ${tenantCount}`);
if (tenantCount !== 1) {
  console.log(`❌ FAIL: Expected exactly 1 tenant, found ${tenantCount}`);
} else {
  console.log(`✅ PASS: Exactly 1 tenant exists`);
  console.log(`\nTenant details:`);
  tenants.forEach(t => {
    console.log(`  ID: ${t.id}`);
    console.log(`  Name: ${t.name}`);
    console.log(`  Slug: ${t.slug}`);
    console.log(`  Status: ${t.status}`);
  });
}
console.log();

// ═══════════════════════════════════════════════════════════════════════════
// AUDIT 4: PLAN AND SUBSCRIPTION DATA
// ═══════════════════════════════════════════════════════════════════════════

console.log('AUDIT 4: PLAN AND SUBSCRIPTION DATA\n');

const planCount = db.prepare('SELECT COUNT(*) as count FROM plans').get().count;
const plans = db.prepare('SELECT * FROM plans').all();

console.log(`Plan count: ${planCount}`);
if (planCount !== 1) {
  console.log(`❌ FAIL: Expected exactly 1 plan, found ${planCount}`);
} else {
  console.log(`✅ PASS: Exactly 1 plan exists`);
  plans.forEach(p => {
    console.log(`  ID: ${p.id}`);
    console.log(`  Name: ${p.name}`);
    console.log(`  Price Monthly: ${p.priceMonthly}`);
    console.log(`  Price Yearly: ${p.priceYearly}`);
  });
}
console.log();

const subCount = db.prepare('SELECT COUNT(*) as count FROM subscriptions').get().count;
const subs = db.prepare('SELECT * FROM subscriptions').all();

console.log(`Subscription count: ${subCount}`);
if (subCount !== 1) {
  console.log(`❌ FAIL: Expected exactly 1 subscription, found ${subCount}`);
} else {
  console.log(`✅ PASS: Exactly 1 subscription exists`);
  subs.forEach(s => {
    console.log(`  ID: ${s.id}`);
    console.log(`  Tenant ID: ${s.tenantId}`);
    console.log(`  Plan ID: ${s.planId}`);
    console.log(`  Status: ${s.status}`);
    console.log(`  Period End: ${s.currentPeriodEnd}`);
  });
}
console.log();

// ═══════════════════════════════════════════════════════════════════════════
// AUDIT 5: TENANT ASSIGNMENT DISTRIBUTION
// ═══════════════════════════════════════════════════════════════════════════

console.log('AUDIT 5: TENANT ASSIGNMENT DISTRIBUTION\n');

let totalRowsWithTenantId = 0;
let totalNullTenantId = 0;
let nonDefaultTenantRows = 0;

MODIFIED_TABLES.forEach(table => {
  const rowCount = db.prepare(`SELECT COUNT(*) as count FROM ${table}`).get().count;
  if (rowCount > 0) {
    const distribution = db.prepare(`
      SELECT tenantId, COUNT(*) as count FROM ${table}
      GROUP BY tenantId
    `).all();

    distribution.forEach(({ tenantId, count }) => {
      console.log(`  ${table.padEnd(30)} tenantId=${tenantId || 'NULL'}: ${count} rows`);

      if (tenantId === null) {
        totalNullTenantId += count;
      } else {
        totalRowsWithTenantId += count;
        if (tenantId !== 'tenant_default') {
          nonDefaultTenantRows += count;
        }
      }
    });
  }
});

console.log();
console.log(`Total rows with tenantId: ${totalRowsWithTenantId}`);
console.log(`Total rows with NULL tenantId: ${totalNullTenantId}`);
console.log(`Rows assigned to non-default tenant: ${nonDefaultTenantRows}`);

if (totalNullTenantId > 0) {
  console.log(`❌ FAIL: ${totalNullTenantId} rows have NULL tenantId`);
} else {
  console.log(`✅ PASS: All existing rows have tenantId assigned`);
}

if (nonDefaultTenantRows > 0) {
  console.log(`⚠️  WARNING: ${nonDefaultTenantRows} rows assigned to non-default tenant`);
}

console.log();

// ═══════════════════════════════════════════════════════════════════════════
// AUDIT 6: FOREIGN KEY INTEGRITY
// ═══════════════════════════════════════════════════════════════════════════

console.log('AUDIT 6: FOREIGN KEY INTEGRITY\n');

const fkCheck = db.pragma('foreign_key_check');

if (fkCheck.length > 0) {
  console.log(`❌ FAIL: Foreign key violations detected:`);
  fkCheck.forEach(fk => {
    console.log(`   Table: ${fk.table}, Row: ${fk.rowid}, Parent: ${fk.parent}, FK Index: ${fk.fkid}`);
  });
} else {
  console.log(`✅ PASS: No foreign key violations`);
}
console.log();

// ═══════════════════════════════════════════════════════════════════════════
// AUDIT 7: SQLITE INTEGRITY
// ═══════════════════════════════════════════════════════════════════════════

console.log('AUDIT 7: SQLITE INTEGRITY\n');

const integrityResult = db.pragma('integrity_check');
const isOk = integrityResult.length === 1 && integrityResult[0].integrity_check === 'ok';

if (isOk) {
  console.log(`✅ PASS: SQLite integrity check passed`);
} else {
  console.log(`❌ FAIL: SQLite integrity check failed:`);
  integrityResult.forEach(line => console.log(`   ${JSON.stringify(line)}`));
}
console.log();

// ═══════════════════════════════════════════════════════════════════════════
// AUDIT 8: INDEX VERIFICATION
// ═══════════════════════════════════════════════════════════════════════════

console.log('AUDIT 8: INDEX VERIFICATION\n');

let missingIndexes = [];

MODIFIED_TABLES.forEach(table => {
  const indexName = `idx_${table}_tenantId`;
  const indexes = db.pragma(`index_list(${table})`);
  const hasIndex = indexes.some(i => i.name === indexName);

  if (!hasIndex) {
    console.log(`❌ FAIL: ${indexName} MISSING`);
    missingIndexes.push(indexName);
  } else {
    console.log(`✅ PASS: ${indexName} exists`);
  }
});

console.log();
if (missingIndexes.length > 0) {
  console.log(`Total missing indexes: ${missingIndexes.length}`);
}

// ═══════════════════════════════════════════════════════════════════════════
// AUDIT 9: INDIRECT TENANT OWNERSHIP ANALYSIS
// ═══════════════════════════════════════════════════════════════════════════

console.log('AUDIT 9: INDIRECT TENANT OWNERSHIP ANALYSIS\n');

console.log('Analyzing tables that MIGHT be indirectly tenant-owned:\n');

// leads -> campaigns -> tenantId
const leadsSchema = db.pragma('table_info(leads)');
const leadsFKs = db.pragma('foreign_key_list(leads)');
const leadsHasCampaignId = leadsSchema.some(c => c.name === 'campaignId');
const leadsHasTenantId = leadsSchema.some(c => c.name === 'tenantId');

console.log('Table: leads');
console.log(`  Has campaignId: ${leadsHasCampaignId ? 'YES' : 'NO'}`);
console.log(`  Has direct tenantId: ${leadsHasTenantId ? 'YES' : 'NO'}`);
console.log(`  Analysis: Could be indirectly owned via campaigns.tenantId`);
console.log(`  Decision: ${leadsHasTenantId ? 'Direct tenantId added (denormalized for performance)' : 'Only indirect ownership'}`);
console.log();

// call_logs -> leadId -> campaigns -> tenantId
const callLogsSchema = db.pragma('table_info(call_logs)');
const callLogsHasLeadId = callLogsSchema.some(c => c.name === 'leadId');
const callLogsHasTenantId = callLogsSchema.some(c => c.name === 'tenantId');

console.log('Table: call_logs');
console.log(`  Has leadId: ${callLogsHasLeadId ? 'YES' : 'NO'}`);
console.log(`  Has direct tenantId: ${callLogsHasTenantId ? 'YES' : 'NO'}`);
console.log(`  Analysis: Could be indirectly owned via leads.tenantId`);
console.log(`  Decision: ${callLogsHasTenantId ? 'Direct tenantId added (denormalized for performance)' : 'Only indirect ownership'}`);
console.log();

// call_attempts -> leadId -> campaigns -> tenantId
const callAttemptsSchema = db.pragma('table_info(call_attempts)');
const callAttemptsHasLeadId = callAttemptsSchema.some(c => c.name === 'leadId');
const callAttemptsHasTenantId = callAttemptsSchema.some(c => c.name === 'tenantId');

console.log('Table: call_attempts');
console.log(`  Has leadId: ${callAttemptsHasLeadId ? 'YES' : 'NO'}`);
console.log(`  Has direct tenantId: ${callAttemptsHasTenantId ? 'YES' : 'NO'}`);
console.log(`  Analysis: Could be indirectly owned via leads.tenantId`);
console.log(`  Decision: ${callAttemptsHasTenantId ? 'Direct tenantId added (denormalized)' : 'Only indirect ownership'}`);
console.log();

// call_events -> attemptId -> call_attempts -> leads -> campaigns -> tenantId
const callEventsSchema = db.pragma('table_info(call_events)');
const callEventsHasAttemptId = callEventsSchema.some(c => c.name === 'attemptId');
const callEventsHasTenantId = callEventsSchema.some(c => c.name === 'tenantId');

console.log('Table: call_events');
console.log(`  Has attemptId: ${callEventsHasAttemptId ? 'YES' : 'NO'}`);
console.log(`  Has direct tenantId: ${callEventsHasTenantId ? 'YES' : 'NO'}`);
console.log(`  Analysis: Could be indirectly owned via call_attempts.tenantId`);
console.log(`  Decision: ${callEventsHasTenantId ? 'Direct tenantId added (deeply denormalized)' : 'Only indirect ownership'}`);
console.log();

// user_permissions -> userId -> users -> tenantId
const userPermsSchema = db.pragma('table_info(user_permissions)');
const userPermsHasUserId = userPermsSchema.some(c => c.name === 'userId');
const userPermsHasTenantId = userPermsSchema.some(c => c.name === 'tenantId');

console.log('Table: user_permissions');
console.log(`  Has userId: ${userPermsHasUserId ? 'YES' : 'NO'}`);
console.log(`  Has direct tenantId: ${userPermsHasTenantId ? 'YES' : 'NO'}`);
console.log(`  Analysis: Could be indirectly owned via users.tenantId`);
console.log(`  Decision: ${userPermsHasTenantId ? 'Direct tenantId added (denormalized)' : 'Only indirect ownership'}`);
console.log();

// ═══════════════════════════════════════════════════════════════════════════
// AUDIT 10: SPECIFIC TABLE CONCERNS
// ═══════════════════════════════════════════════════════════════════════════

console.log('AUDIT 10: SPECIFIC TABLE CONCERNS\n');

// sessions_store - should this be tenant-owned?
const sessionsSchema = db.pragma('table_info(sessions_store)');
const sessionsHasTenantId = sessionsSchema.some(c => c.name === 'tenantId');
const sessionsHasUserId = sessionsSchema.some(c => c.name === 'userId');

console.log('Table: sessions_store');
console.log(`  Has userId: ${sessionsHasUserId ? 'YES' : 'NO'}`);
console.log(`  Has tenantId: ${sessionsHasTenantId ? 'YES' : 'NO'}`);
console.log(`  Analysis: Transient session data, linked to users who have tenantId`);
console.log(`  Decision: ${sessionsHasTenantId ? '⚠️  Has tenantId (may be unnecessary)' : '✅ No tenantId (correct - ephemeral data)'}`);
console.log();

// commands - should this be tenant-owned?
const commandsSchema = db.pragma('table_info(commands)');
const commandsHasTenantId = commandsSchema.some(c => c.name === 'tenantId');
const commandsHasLeadId = commandsSchema.some(c => c.name === 'leadId');
const commandsHasSessionId = commandsSchema.some(c => c.name === 'sessionId');

console.log('Table: commands');
console.log(`  Has leadId: ${commandsHasLeadId ? 'YES' : 'NO'}`);
console.log(`  Has sessionId: ${commandsHasSessionId ? 'YES' : 'NO'}`);
console.log(`  Has tenantId: ${commandsHasTenantId ? 'YES' : 'NO'}`);
console.log(`  Analysis: Temporary command queue with TTL, linked to leads (which have tenantId)`);
console.log(`  Decision: ${commandsHasTenantId ? '⚠️  Has tenantId (may be unnecessary)' : '✅ No tenantId (correct - ephemeral with TTL)'}`);
console.log();

// custom_roles - platform or tenant-owned?
const customRolesSchema = db.pragma('table_info(custom_roles)');
const customRolesHasTenantId = customRolesSchema.some(c => c.name === 'tenantId');

console.log('Table: custom_roles');
console.log(`  Has tenantId: ${customRolesHasTenantId ? 'YES' : 'NO'}`);
console.log(`  Analysis: Admin panel feature - could be platform-wide OR tenant-specific`);
console.log(`  Decision: ${customRolesHasTenantId ? '⚠️  Has tenantId (tenant-specific roles)' : '✅ No tenantId (platform roles) - Phase 3 choice'}`);
console.log(`  Note: May need tenantId in Phase 6 (Admin Separation) for tenant admin roles`);
console.log();

db.close();

console.log('═══════════════════════════════════════════════════════════════════════════');
console.log('AUDIT COMPLETE');
console.log('═══════════════════════════════════════════════════════════════════════════');
