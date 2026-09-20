// test_migration_013_real_pg.cjs
// Executes Migration 013 directly against a REAL local PostgreSQL 18.4 instance.
// Verifies schema migration, catalog constraints, and constraint enforcement.

const fs = require('fs');
const path = require('path');
const os = require('os');
const assert = require('assert/strict');
const { Client } = require('pg');
const EmbeddedPostgres = require('embedded-postgres').default;

async function runRealPgMigrationTest() {
  console.log('===============================================================');
  console.log('REAL POSTGRESQL 18: EXECUTING MIGRATION 012 -> 013 SEQUENCE');
  console.log('===============================================================\n');

  const testDir = path.join(os.tmpdir(), 'pg_mig013_test_' + Date.now());
  fs.mkdirSync(testDir, { recursive: true });
  const testPort = 54329;

  const pgServer = new EmbeddedPostgres({
    port: testPort,
    databaseDir: testDir,
    user: 'postgres',
    password: 'testpassword',
    persistent: false
  });

  let client;
  try {
    console.log(`1. Initialising PostgreSQL database cluster at ${testDir}...`);
    await pgServer.initialise();

    console.log(`2. Starting PostgreSQL on port ${testPort}...`);
    await pgServer.start();
    console.log('   PostgreSQL server started successfully.\n');

    client = new Client({
      host: '127.0.0.1',
      port: testPort,
      user: 'postgres',
      password: 'testpassword',
      database: 'postgres'
    });
    await client.connect();
    await client.query("SET client_encoding = 'UTF8'");
    console.log('3. Connected to test PostgreSQL database.\n');

    // Load schema files
    const dbDir = path.join(__dirname, '../src/db');
    const readSql = (p) => {
      let s = fs.readFileSync(p, 'utf8');
      return s.charCodeAt(0) === 0xFEFF ? s.slice(1) : s;
    };
    const schemaSql = readSql(path.join(dbDir, 'schema.sql'));
    const mig012Sql = readSql(path.join(dbDir, 'migrations/012_saas_structure_v2.sql'));
    const mig013Sql = readSql(path.join(dbDir, 'migrations/013_saas_structure_v2_corrections.sql'));

    console.log('4. Executing baseline schema.sql against PostgreSQL...');
    await client.query(schemaSql);
    console.log('   Baseline schema applied successfully.\n');

    console.log('5. Executing migration 012_saas_structure_v2.sql...');
    await client.query(mig012Sql);
    console.log('   Migration 012 applied successfully.\n');

    console.log('6. Executing migration 013_saas_structure_v2_corrections.sql (with DO $$ PL/pgSQL blocks)...');
    await client.query(mig013Sql);
    console.log('   Migration 013 applied successfully with ZERO syntax errors!\n');

    console.log('7. Verifying PostgreSQL catalog constraints and columns:');

    // Check columns in tenants
    const colRes = await client.query(`
      SELECT column_name, column_default, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'tenants' AND column_name IN ('customerType', 'maxTeamVisibility')
    `);
    const cols = colRes.rows.map(r => r.column_name);
    assert.ok(cols.includes('customerType'), 'tenants.customerType must exist');
    assert.ok(cols.includes('maxTeamVisibility'), 'tenants.maxTeamVisibility must exist');
    console.log('   ✓ tenants.customerType and tenants.maxTeamVisibility exist in catalog.');

    // Check team_settings table exists
    const tblRes = await client.query(`
      SELECT table_name FROM information_schema.tables WHERE table_name = 'team_settings'
    `);
    assert.equal(tblRes.rows.length, 1, 'team_settings table must exist');
    console.log('   ✓ team_settings table exists in catalog.');

    // Check constraints in pg_constraint
    const conRes = await client.query(`
      SELECT conname, contype 
      FROM pg_constraint 
      WHERE conname IN (
        'uq_team_settings_tenant_team',
        'chk_tenants_customer_type',
        'chk_tenants_max_team_visibility',
        'chk_team_settings_lead_visibility'
      )
    `);
    const conMap = Object.fromEntries(conRes.rows.map(r => [r.conname, r.contype]));
    assert.equal(conMap['uq_team_settings_tenant_team'], 'u', 'uq_team_settings_tenant_team unique constraint must exist');
    assert.equal(conMap['chk_tenants_customer_type'], 'c', 'chk_tenants_customer_type CHECK constraint must exist');
    assert.equal(conMap['chk_tenants_max_team_visibility'], 'c', 'chk_tenants_max_team_visibility CHECK constraint must exist');
    assert.equal(conMap['chk_team_settings_lead_visibility'], 'c', 'chk_team_settings_lead_visibility CHECK constraint must exist');
    console.log('   ✓ All 4 PostgreSQL constraints (1 unique, 3 check) confirmed in pg_constraint.\n');

    console.log('8. Testing real PostgreSQL constraint enforcement (DML):');

    // Valid insert
    await client.query(`
      INSERT INTO tenants (id, name, slug, "customerType", "maxTeamVisibility") 
      VALUES ('t-corp1', 'Valid Corp', 'valid-corp', 'COMPANY', 'TEAM_READ')
    `);
    console.log('   ✓ Valid tenant record inserted successfully.');

    // Invalid customerType check rejection
    let rejectedBadCustomerType = false;
    try {
      await client.query(`
        INSERT INTO tenants (id, name, slug, "customerType") 
        VALUES ('t-bad1', 'Bad Corp', 'bad-corp-1', 'FREELANCER_INVALID')
      `);
    } catch (err) {
      if (err.message.includes('chk_tenants_customer_type')) {
        rejectedBadCustomerType = true;
      }
    }
    assert.ok(rejectedBadCustomerType, 'PostgreSQL must reject invalid customerType via chk_tenants_customer_type');
    console.log('   ✓ PostgreSQL correctly rejected invalid customerType.');

    // Invalid maxTeamVisibility check rejection
    let rejectedBadMaxVis = false;
    try {
      await client.query(`
        INSERT INTO tenants (id, name, slug, "maxTeamVisibility") 
        VALUES ('t-bad2', 'Bad Corp', 'bad-corp-2', 'GLOBAL_LEAK')
      `);
    } catch (err) {
      if (err.message.includes('chk_tenants_max_team_visibility')) {
        rejectedBadMaxVis = true;
      }
    }
    assert.ok(rejectedBadMaxVis, 'PostgreSQL must reject invalid maxTeamVisibility via chk_tenants_max_team_visibility');
    console.log('   ✓ PostgreSQL correctly rejected invalid maxTeamVisibility.');

    // Valid team_settings insert
    await client.query(`
      INSERT INTO team_settings (id, "tenantId", "teamId", "leadVisibility") 
      VALUES ('ts-1', 't-corp1', 'team-alpha', 'TEAM_READ')
    `);
    console.log('   ✓ Valid team_settings record inserted successfully.');

    // Invalid leadVisibility check rejection
    let rejectedBadLeadVis = false;
    try {
      await client.query(`
        INSERT INTO team_settings (id, "tenantId", "teamId", "leadVisibility") 
        VALUES ('ts-bad', 't-corp1', 'team-beta', 'UNRESTRICTED')
      `);
    } catch (err) {
      if (err.message.includes('chk_team_settings_lead_visibility')) {
        rejectedBadLeadVis = true;
      }
    }
    assert.ok(rejectedBadLeadVis, 'PostgreSQL must reject invalid leadVisibility via chk_team_settings_lead_visibility');
    console.log('   ✓ PostgreSQL correctly rejected invalid leadVisibility.');

    // Composite unique violation rejection on ("tenantId", "teamId")
    let rejectedDuplicateTeam = false;
    try {
      await client.query(`
        INSERT INTO team_settings (id, "tenantId", "teamId", "leadVisibility") 
        VALUES ('ts-duplicate', 't-corp1', 'team-alpha', 'OWN')
      `);
    } catch (err) {
      if (err.message.includes('uq_team_settings_tenant_team')) {
        rejectedDuplicateTeam = true;
      }
    }
    assert.ok(rejectedDuplicateTeam, 'PostgreSQL must reject duplicate (tenantId, teamId) via uq_team_settings_tenant_team');
    console.log('   ✓ PostgreSQL correctly rejected duplicate ("tenantId", "teamId").\n');

    console.log('9. Verifying Migration 013 Idempotency (re-executing migration 013)...');
    await client.query(mig013Sql);
    console.log('   ✓ Migration 013 re-executed idempotently with zero errors!\n');

    console.log('===============================================================');
    console.log('SUCCESS: ALL REAL POSTGRESQL MIGRATION 013 TESTS PASSED!');
    console.log('===============================================================\n');
  } finally {
    if (client) {
      try { await client.end(); } catch (_) {}
    }
    try {
      await pgServer.stop();
      console.log('PostgreSQL server stopped cleanly.');
    } catch (_) {}
    try {
      fs.rmSync(testDir, { recursive: true, force: true });
    } catch (_) {}
  }
}

module.exports = { runRealPgMigrationTest };

if (require.main === module) {
  runRealPgMigrationTest().catch(err => {
    console.error('\n❌ REAL POSTGRESQL TEST FAILED:', err);
    process.exit(1);
  });
}
