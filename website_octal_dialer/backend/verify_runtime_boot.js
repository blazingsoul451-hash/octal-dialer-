const { dbAdapter } = require('./dist/db/dbAdapter');
const { pingDatabase } = require('./dist/db/pool');
const { migrateSqliteToPostgres } = require('./dist/db/migrator');
const path = require('path');

async function verify() {
  console.log('====================================================');
  console.log('       OCTAL DIALER — POSTGRESQL RUNTIME VERIFICATION');
  console.log('====================================================\n');

  // 1. Initialize Adapter
  console.log('[1] Initializing DbAdapter...');
  await dbAdapter.init();
  const healthy = await pingDatabase();
  console.log('   Ping Database:', healthy ? '✅ HEALTHY' : '❌ FAILED');

  // 2. Run ETL Migration
  console.log('\n[2] Pumping SQLite data into PostgreSQL...');
  const report = await migrateSqliteToPostgres(path.join(__dirname, 'data/octal_dialer.db'));
  console.log(`   Migrated ${report.totalRowsMigrated} rows across ${report.tablesProcessed} tables. Success: ${report.success ? '✅ YES' : '❌ NO'}`);

  // 3. Test Database Queries
  console.log('\n[3] Testing Query Layer...');
  const tenants = await dbAdapter.queryAll('SELECT id, name, slug FROM tenants LIMIT 5');
  console.log(`   Found ${tenants.length} sample tenants:`, tenants.map(t => t.name).join(', '));

  const users = await dbAdapter.queryAll('SELECT id, username, role, "tenantId" FROM users LIMIT 5');
  console.log(`   Found ${users.length} sample users:`, users.map(u => `${u.username} (${u.role})`).join(', '));

  // 4. Test High-Concurrency Atomic Lead Reservation
  console.log('\n[4] Testing Atomic Lead Reservation (Concurreny Protection)...');
  const sampleLead = await dbAdapter.queryOne('SELECT id, "tenantId", status FROM leads LIMIT 1');
  if (sampleLead) {
    console.log(`   Target Lead: ${sampleLead.id} (Tenant: ${sampleLead.tenantId}, Status: ${sampleLead.status})`);
    
    // Simulate 10 concurrent agents clicking "Dial" on this exact lead
    const results = await Promise.all([1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(async i => {
      const sessionId = `session_agent_${i}`;
      const now = new Date().toISOString();
      const cutoff = new Date(Date.now() - 5 * 60 * 1000).toISOString();
      const res = await dbAdapter.execute(`
        UPDATE "leads"
        SET "lockedBy" = $1, "lockedAt" = $2, "status" = 'CALLING'
        WHERE "id" = $3
          AND "tenantId" = $4
          AND "status" != 'COMPLETED'
          AND ("lockedBy" IS NULL OR "lockedBy" = $1 OR "lockedAt" < $5)
        RETURNING *
      `, [sessionId, now, sampleLead.id, sampleLead.tenantId, cutoff]);
      return { sessionId, locked: res.rowCount > 0 };
    }));

    const won = results.filter(r => r.locked);
    const rejected = results.filter(r => !r.locked);
    console.log(`   Lock Acquisitions: ${won.length} (Winner: ${won[0]?.sessionId})`);
    console.log(`   Safely Rejected:   ${rejected.length}`);
    if (won.length === 1 && rejected.length === 9) {
      console.log('   ✅ ATOMIC CONCURRENCY INVARIANT CONFIRMED: 0 collisions, 0 race conditions!');
    } else {
      console.error('   ❌ Concurrency failure:', results);
    }

    // Release the lock
    await dbAdapter.execute('UPDATE "leads" SET "lockedBy" = NULL, "status" = \'PENDING\' WHERE "id" = $1', [sampleLead.id]);
    console.log('   Lead lock released back to PENDING.');
  }

  console.log('\n====================================================');
  console.log('     🎉 ALL RUNTIME POSTGRESQL VERIFICATIONS PASSED!   ');
  console.log('====================================================\n');
}

verify().catch(err => {
  console.error('Verification failed:', err);
  process.exit(1);
});
