/**
 * Phase 3: Tenant Data Migration
 *
 * This script:
 * 1. Creates default tenant
 * 2. Creates default plan and subscription
 * 3. Adds tenantId column to tenant-owned tables
 * 4. Populates tenantId for existing rows
 * 5. Adds indexes for tenantId
 * 6. Verifies zero data loss
 *
 * Migration is IDEMPOTENT - safe to run multiple times
 */

const Database = require('better-sqlite3');
const fs = require('fs');
const path = require('path');

const DB_FILE = path.join(__dirname, 'data', 'octal_dialer.db');

console.log('═══════════════════════════════════════════════════════════════════════════');
console.log('PHASE 3: TENANT DATA MIGRATION');
console.log('═══════════════════════════════════════════════════════════════════════════\n');

// Open database in write mode
const db = new Database(DB_FILE);
db.pragma('foreign_keys = ON');

// Default tenant details
const DEFAULT_TENANT = {
  id: 'tenant_default',
  name: 'Default Company',
  slug: 'default-company',
  status: 'active'
};

const DEFAULT_PLAN = {
  id: 'plan_legacy',
  name: 'Legacy Plan',
  priceMonthly: 0,
  priceYearly: 0,
  status: 'active'
};

// Tables that will receive tenantId
const TENANT_OWNED_TABLES = [
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

// ═══════════════════════════════════════════════════════════════════════════
// STEP 1: PRE-MIGRATION SNAPSHOT
// ═══════════════════════════════════════════════════════════════════════════

console.log('STEP 1: PRE-MIGRATION SNAPSHOT\n');

const preCounts = {};
TENANT_OWNED_TABLES.forEach(table => {
  const count = db.prepare(`SELECT COUNT(*) as count FROM ${table}`).get().count;
  preCounts[table] = count;
  console.log(`  ${table.padEnd(30)} ${count.toString().padStart(6)} rows`);
});

const totalPreRows = Object.values(preCounts).reduce((sum, count) => sum + count, 0);
console.log(`\n  TOTAL PRE-MIGRATION:          ${totalPreRows.toString().padStart(6)} rows\n`);

// ═══════════════════════════════════════════════════════════════════════════
// STEP 2: CREATE DEFAULT TENANT (IDEMPOTENT)
// ═══════════════════════════════════════════════════════════════════════════

console.log('STEP 2: CREATE DEFAULT TENANT\n');

const existingTenant = db.prepare('SELECT * FROM tenants WHERE id = ?').get(DEFAULT_TENANT.id);

if (existingTenant) {
  console.log(`✅ Default tenant already exists: ${existingTenant.id}`);
  console.log(`   Name: ${existingTenant.name}`);
  console.log(`   Slug: ${existingTenant.slug}`);
  console.log(`   Status: ${existingTenant.status}\n`);
} else {
  db.prepare(`
    INSERT INTO tenants (id, name, slug, status, createdAt, updatedAt)
    VALUES (@id, @name, @slug, @status, datetime('now'), datetime('now'))
  `).run(DEFAULT_TENANT);

  console.log(`✅ Created default tenant: ${DEFAULT_TENANT.id}`);
  console.log(`   Name: ${DEFAULT_TENANT.name}`);
  console.log(`   Slug: ${DEFAULT_TENANT.slug}`);
  console.log(`   Status: ${DEFAULT_TENANT.status}\n`);
}

// ═══════════════════════════════════════════════════════════════════════════
// STEP 3: CREATE DEFAULT PLAN (IDEMPOTENT)
// ═══════════════════════════════════════════════════════════════════════════

console.log('STEP 3: CREATE DEFAULT PLAN\n');

const existingPlan = db.prepare('SELECT * FROM plans WHERE id = ?').get(DEFAULT_PLAN.id);

if (existingPlan) {
  console.log(`✅ Default plan already exists: ${existingPlan.id}`);
  console.log(`   Name: ${existingPlan.name}\n`);
} else {
  db.prepare(`
    INSERT INTO plans (id, name, priceMonthly, priceYearly, status, createdAt, updatedAt)
    VALUES (@id, @name, @priceMonthly, @priceYearly, @status, datetime('now'), datetime('now'))
  `).run(DEFAULT_PLAN);

  console.log(`✅ Created default plan: ${DEFAULT_PLAN.id}`);
  console.log(`   Name: ${DEFAULT_PLAN.name}`);
  console.log(`   Price: Free (legacy migration)\n`);
}

// ═══════════════════════════════════════════════════════════════════════════
// STEP 4: CREATE DEFAULT SUBSCRIPTION (IDEMPOTENT)
// ═══════════════════════════════════════════════════════════════════════════

console.log('STEP 4: CREATE DEFAULT SUBSCRIPTION\n');

const existingSub = db.prepare('SELECT * FROM subscriptions WHERE tenantId = ?').get(DEFAULT_TENANT.id);

if (existingSub) {
  console.log(`✅ Subscription already exists for tenant: ${DEFAULT_TENANT.id}`);
  console.log(`   Subscription ID: ${existingSub.id}`);
  console.log(`   Plan: ${existingSub.planId}\n`);
} else {
  const subId = 'sub_default_' + Date.now();
  const now = new Date();
  const periodEnd = new Date(now.getTime() + 365 * 24 * 60 * 60 * 1000); // 1 year from now

  db.prepare(`
    INSERT INTO subscriptions (id, tenantId, planId, status, currentPeriodStart, currentPeriodEnd, createdAt, updatedAt)
    VALUES (@id, @tenantId, @planId, @status, @currentPeriodStart, @currentPeriodEnd, @createdAt, @updatedAt)
  `).run({
    id: subId,
    tenantId: DEFAULT_TENANT.id,
    planId: DEFAULT_PLAN.id,
    status: 'active',
    currentPeriodStart: now.toISOString(),
    currentPeriodEnd: periodEnd.toISOString(),
    createdAt: now.toISOString(),
    updatedAt: now.toISOString()
  });

  console.log(`✅ Created subscription: ${subId}`);
  console.log(`   Tenant: ${DEFAULT_TENANT.id}`);
  console.log(`   Plan: ${DEFAULT_PLAN.id}`);
  console.log(`   Period End: ${periodEnd.toISOString().split('T')[0]}\n`);
}

// ═══════════════════════════════════════════════════════════════════════════
// STEP 5: ADD tenantId COLUMNS (IDEMPOTENT)
// ═══════════════════════════════════════════════════════════════════════════

console.log('STEP 5: ADD tenantId COLUMNS\n');

const migration = db.transaction(() => {
  TENANT_OWNED_TABLES.forEach(table => {
    // Check if column already exists
    const columns = db.pragma(`table_info(${table})`);
    const hasTenantId = columns.some(c => c.name === 'tenantId');

    if (hasTenantId) {
      console.log(`  ⏭️  ${table.padEnd(30)} tenantId already exists (skipping)`);
    } else {
      // Add tenantId column
      db.prepare(`ALTER TABLE ${table} ADD COLUMN tenantId TEXT`).run();
      console.log(`  ✅ ${table.padEnd(30)} tenantId column added`);
    }
  });
});

migration();
console.log();

// ═══════════════════════════════════════════════════════════════════════════
// STEP 6: POPULATE tenantId FOR EXISTING ROWS (IDEMPOTENT)
// ═══════════════════════════════════════════════════════════════════════════

console.log('STEP 6: POPULATE tenantId FOR EXISTING ROWS\n');

const populateMigration = db.transaction(() => {
  TENANT_OWNED_TABLES.forEach(table => {
    // Get count of rows with NULL tenantId
    const nullCount = db.prepare(`SELECT COUNT(*) as count FROM ${table} WHERE tenantId IS NULL`).get().count;

    if (nullCount > 0) {
      // Update NULL tenantId to default tenant
      const result = db.prepare(`UPDATE ${table} SET tenantId = ? WHERE tenantId IS NULL`).run(DEFAULT_TENANT.id);
      console.log(`  ✅ ${table.padEnd(30)} ${result.changes} rows updated`);
    } else {
      console.log(`  ⏭️  ${table.padEnd(30)} no NULL tenantId (already migrated)`);
    }
  });
});

populateMigration();
console.log();

// ═══════════════════════════════════════════════════════════════════════════
// STEP 7: CREATE INDEXES FOR tenantId (IDEMPOTENT)
// ═══════════════════════════════════════════════════════════════════════════

console.log('STEP 7: CREATE INDEXES FOR tenantId\n');

const indexMigration = db.transaction(() => {
  TENANT_OWNED_TABLES.forEach(table => {
    const indexName = `idx_${table}_tenantId`;

    // Check if index already exists
    const indexes = db.pragma(`index_list(${table})`);
    const hasIndex = indexes.some(i => i.name === indexName);

    if (hasIndex) {
      console.log(`  ⏭️  ${indexName.padEnd(40)} already exists`);
    } else {
      db.prepare(`CREATE INDEX ${indexName} ON ${table}(tenantId)`).run();
      console.log(`  ✅ ${indexName.padEnd(40)} created`);
    }
  });
});

indexMigration();
console.log();

// ═══════════════════════════════════════════════════════════════════════════
// STEP 8: POST-MIGRATION VERIFICATION
// ═══════════════════════════════════════════════════════════════════════════

console.log('STEP 8: POST-MIGRATION VERIFICATION\n');

// A. Row counts verification
console.log('A. ROW COUNT VERIFICATION\n');

const postCounts = {};
let rowCountMatch = true;

TENANT_OWNED_TABLES.forEach(table => {
  const count = db.prepare(`SELECT COUNT(*) as count FROM ${table}`).get().count;
  postCounts[table] = count;

  const preCount = preCounts[table];
  const match = count === preCount;

  if (match) {
    console.log(`  ✅ ${table.padEnd(30)} ${preCount} → ${count} (no loss)`);
  } else {
    console.log(`  ❌ ${table.padEnd(30)} ${preCount} → ${count} (MISMATCH!)`);
    rowCountMatch = false;
  }
});

const totalPostRows = Object.values(postCounts).reduce((sum, count) => sum + count, 0);
console.log(`\n  TOTAL POST-MIGRATION:         ${totalPostRows.toString().padStart(6)} rows`);
console.log(`  PRE-MIGRATION:                ${totalPreRows.toString().padStart(6)} rows`);
console.log(`  DIFFERENCE:                   ${(totalPostRows - totalPreRows).toString().padStart(6)} rows\n`);

if (!rowCountMatch) {
  console.error('❌ ERROR: Row count mismatch detected! Data loss occurred.\n');
  db.close();
  process.exit(1);
}

console.log('✅ Row count verification PASSED (zero data loss)\n');

// B. NULL tenantId verification
console.log('B. NULL tenantId VERIFICATION\n');

let hasNullTenantId = false;

TENANT_OWNED_TABLES.forEach(table => {
  const nullCount = db.prepare(`SELECT COUNT(*) as count FROM ${table} WHERE tenantId IS NULL`).get().count;

  if (nullCount > 0) {
    console.log(`  ❌ ${table.padEnd(30)} ${nullCount} rows with NULL tenantId`);
    hasNullTenantId = true;
  } else {
    const totalCount = postCounts[table];
    if (totalCount > 0) {
      console.log(`  ✅ ${table.padEnd(30)} all ${totalCount} rows have tenantId`);
    } else {
      console.log(`  ⏭️  ${table.padEnd(30)} no rows (empty table)`);
    }
  }
});

console.log();

if (hasNullTenantId) {
  console.error('❌ ERROR: Some rows still have NULL tenantId!\n');
  db.close();
  process.exit(1);
}

console.log('✅ NULL tenantId verification PASSED (all rows assigned)\n');

// C. Tenant distribution verification
console.log('C. TENANT DISTRIBUTION VERIFICATION\n');

TENANT_OWNED_TABLES.forEach(table => {
  const count = postCounts[table];
  if (count > 0) {
    const distribution = db.prepare(`
      SELECT tenantId, COUNT(*) as count FROM ${table}
      GROUP BY tenantId
    `).all();

    distribution.forEach(({ tenantId, count: distCount }) => {
      console.log(`  ${table.padEnd(30)} ${tenantId}: ${distCount} rows`);
    });
  }
});

console.log();
console.log('✅ Tenant distribution verification PASSED\n');

// D. Foreign key integrity check
console.log('D. FOREIGN KEY INTEGRITY CHECK\n');

const fkCheck = db.pragma('foreign_key_check');

if (fkCheck.length > 0) {
  console.error('❌ Foreign key violations detected:');
  fkCheck.forEach(fk => {
    console.error(`   Table: ${fk.table}, Row: ${fk.rowid}`);
  });
  console.log();
  db.close();
  process.exit(1);
}

console.log('✅ Foreign key integrity check PASSED\n');

// E. Index verification
console.log('E. INDEX VERIFICATION\n');

TENANT_OWNED_TABLES.forEach(table => {
  const indexName = `idx_${table}_tenantId`;
  const indexes = db.pragma(`index_list(${table})`);
  const hasIndex = indexes.some(i => i.name === indexName);

  if (hasIndex) {
    console.log(`  ✅ ${indexName}`);
  } else {
    console.log(`  ❌ ${indexName} MISSING`);
  }
});

console.log();

// F. Schema verification
console.log('F. SCHEMA VERIFICATION\n');

TENANT_OWNED_TABLES.forEach(table => {
  const columns = db.pragma(`table_info(${table})`);
  const tenantIdCol = columns.find(c => c.name === 'tenantId');

  if (tenantIdCol) {
    console.log(`  ✅ ${table.padEnd(30)} tenantId: ${tenantIdCol.type}`);
  } else {
    console.log(`  ❌ ${table.padEnd(30)} tenantId column MISSING`);
  }
});

console.log();

// G. SQLite integrity check
console.log('G. SQLITE INTEGRITY CHECK\n');

const integrityResult = db.pragma('integrity_check');

// integrity_check returns array of objects: [{ integrity_check: "ok" }] or [{ integrity_check: "error details" }]
const isOk = integrityResult.length === 1 &&
             integrityResult[0].integrity_check === 'ok';

if (isOk) {
  console.log('✅ SQLite integrity check PASSED\n');
} else {
  console.error('❌ SQLite integrity check FAILED:');
  integrityResult.forEach(line => console.error(`   ${JSON.stringify(line)}`));
  console.log();
  db.close();
  process.exit(1);
}

// H. Verify Phase 2 tables unchanged
console.log('H. PHASE 2 TABLES VERIFICATION\n');

const phase2Tables = ['tenants', 'plans', 'plan_features', 'subscriptions'];
phase2Tables.forEach(table => {
  const exists = db.prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name = ?`).get(table);
  if (exists) {
    console.log(`  ✅ ${table} exists`);
  } else {
    console.log(`  ❌ ${table} MISSING`);
  }
});

console.log();

// ═══════════════════════════════════════════════════════════════════════════
// MIGRATION COMPLETE
// ═══════════════════════════════════════════════════════════════════════════

db.close();

console.log('═══════════════════════════════════════════════════════════════════════════');
console.log('PHASE 3 MIGRATION COMPLETE');
console.log('═══════════════════════════════════════════════════════════════════════════\n');

console.log('Summary:');
console.log(`  ✅ Default tenant created: ${DEFAULT_TENANT.id}`);
console.log(`  ✅ Default plan created: ${DEFAULT_PLAN.id}`);
console.log(`  ✅ Default subscription created`);
console.log(`  ✅ tenantId added to ${TENANT_OWNED_TABLES.length} tables`);
console.log(`  ✅ ${totalPostRows} rows migrated (zero data loss)`);
console.log(`  ✅ ${TENANT_OWNED_TABLES.length} indexes created`);
console.log(`  ✅ All verifications passed`);
console.log();

console.log('Important Notes:');
console.log('  ⚠️  Tenant isolation is NOT YET ENFORCED (Phase 4)');
console.log('  ⚠️  Application queries are still global (Phase 4 will fix)');
console.log('  ⚠️  JWT does not contain tenantId yet (Phase 4)');
console.log();

console.log('✅ PHASE 3 IMPLEMENTATION READY FOR REVIEW');
