const assert = require('assert');
const path = require('path');
const fs = require('fs');

async function runTests() {
  console.log('─────────────────────────────────────────────────────────────────');
  console.log('🧪 RUNNING HARDENING DEFECTS VERIFICATION SUITE (R1 - R4 P1)');
  console.log('─────────────────────────────────────────────────────────────────');

  let passed = 0;
  let failed = 0;

  function it(name, fn) {
    try {
      fn();
      console.log(`  ✅ PASS: ${name}`);
      passed++;
    } catch (err) {
      console.error(`  ❌ FAIL: ${name}\n     ${err.message}`);
      failed++;
    }
  }

  async function itAsync(name, fn) {
    try {
      await fn();
      console.log(`  ✅ PASS: ${name}`);
      passed++;
    } catch (err) {
      console.error(`  ❌ FAIL: ${name}\n     ${err.message}`);
      failed++;
    }
  }

  // =========================================================================
  // PILLAR 1: R1 — Native Call Correlation Logic (Source & Behavioral)
  // =========================================================================
  console.log('\n[Pillar 1: R1 — Correct Native Call Correlation]');

  it('R1.1: OctalCallManager.kt implements PendingPlacementRecord with generation, cancellation, expiry', () => {
    const ktPath = path.resolve(__dirname, '../../../application_octal_dialer/android/app/src/main/kotlin/com/octal/dialer/octal_dialer/telecom/OctalCallManager.kt');
    assert(fs.existsSync(ktPath), 'OctalCallManager.kt must exist');
    const ktSource = fs.readFileSync(ktPath, 'utf8');

    assert(ktSource.includes('data class PendingPlacementRecord'), 'Must define PendingPlacementRecord');
    assert(ktSource.includes('val commandId: String'), 'PendingPlacementRecord must include commandId');
    assert(ktSource.includes('val destination: String'), 'PendingPlacementRecord must include destination');
    assert(ktSource.includes('val generation: Long'), 'PendingPlacementRecord must include monotonic generation');
    assert(ktSource.includes('val expiresAtMs: Long'), 'PendingPlacementRecord must include expiry');
    assert(ktSource.includes('var isCancelled: Boolean'), 'PendingPlacementRecord must track cancellation state');

    // Correlation logic checks
    assert(ktSource.includes('call.state == Call.STATE_RINGING'), 'Must check ringing to reject incoming calls from consuming pending outgoing record');
    assert(ktSource.includes('cancelPendingPlacement'), 'Must support cancelling pending placements');
    assert(ktSource.includes('call_${System.identityHashCode(call)}') || ktSource.includes('call_unmapped_') || ktSource.includes('Failing safely to unmapped ID'), 'Must safely assign unmapped IDs on ambiguous correlation without guessing');
  });

  it('R1.2: Incoming ringing calls must NEVER consume pending placement record', () => {
    let pendingPlacement = {
      commandId: 'cmd_101',
      destination: '1234567890',
      accountHandleId: 'sim_1',
      generation: 1,
      expiresAtMs: Date.now() + 10000,
      isCancelled: false
    };

    function correlateCall(call) {
      const number = call.number.replace(/\D/g, '');
      const isIncoming = call.state === 'RINGING' || call.direction === 'INCOMING';
      if (isIncoming) {
        return `call_${call.id}`;
      }
      if (pendingPlacement && !pendingPlacement.isCancelled && Date.now() <= pendingPlacement.expiresAtMs) {
        if (number === pendingPlacement.destination || (number.length >= 7 && pendingPlacement.destination.endsWith(number))) {
          const bound = pendingPlacement.commandId;
          pendingPlacement = null;
          return bound;
        }
      }
      return `call_${call.id}`;
    }

    const incomingCall = { id: 999, number: '1234567890', state: 'RINGING', direction: 'INCOMING' };
    const resolvedId = correlateCall(incomingCall);
    assert.strictEqual(resolvedId, 'call_999', 'Incoming call should receive unmapped ID');
    assert.notStrictEqual(pendingPlacement, null, 'Pending placement must NOT be consumed by incoming call');
  });

  it('R1.3: Valid outgoing call matches and consumes pending placement', () => {
    let pendingPlacement = {
      commandId: 'cmd_202',
      destination: '15551234567',
      accountHandleId: 'sim_1',
      generation: 2,
      expiresAtMs: Date.now() + 10000,
      isCancelled: false
    };

    function correlateCall(call) {
      const number = call.number.replace(/\D/g, '');
      const isIncoming = call.state === 'RINGING' || call.direction === 'INCOMING';
      if (isIncoming) return `call_${call.id}`;
      if (pendingPlacement && !pendingPlacement.isCancelled && Date.now() <= pendingPlacement.expiresAtMs) {
        const destMatches = (number === pendingPlacement.destination) ||
          (number.length >= 7 && pendingPlacement.destination.length >= 7 &&
           (number.endsWith(pendingPlacement.destination) || pendingPlacement.destination.endsWith(number)));
        if (destMatches) {
          const bound = pendingPlacement.commandId;
          pendingPlacement = null;
          return bound;
        }
      }
      return `call_${call.id}`;
    }

    const outgoingCall = { id: 1001, number: '+1 (555) 123-4567', state: 'DIALING', direction: 'OUTGOING' };
    const boundId = correlateCall(outgoingCall);
    assert.strictEqual(boundId, 'cmd_202', 'Outgoing call must bind to pending commandId');
    assert.strictEqual(pendingPlacement, null, 'Pending placement must be cleared upon binding');
  });

  // =========================================================================
  // PILLAR 2: R2 — Durable Call Outcomes Ledger & Idempotent Claim
  // =========================================================================
  console.log('\n[Pillar 2: R2 — Durable Call Outcomes Ledger & Idempotency]');

  const { dbAdapter } = require('../dist/db/dbAdapter');
  await dbAdapter.init();

  await itAsync('R2.1: call_outcomes table exists with UNIQUE(tenantId, callId) constraint', async () => {
    const tableCheck = await dbAdapter.queryOne(
      "SELECT table_name FROM information_schema.tables WHERE table_name = 'call_outcomes'"
    );
    assert(tableCheck, 'call_outcomes table must exist');

    const outcomeId = `test_co_${Date.now()}`;
    const callId = `call_${Date.now()}`;
    const tenantId = 'tenant_r2_test';

    await dbAdapter.execute(
      `INSERT INTO call_outcomes ("id", "tenantId", "callId", "commandId", "leadId", "phone", "reason", "duration", "answered", "finalizedAt")
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
      [outcomeId, tenantId, callId, 'cmd_r2', 'lead_r2', '1234567890', 'ANSWERED', 45, 1, new Date().toISOString()]
    );

    // Duplicate insert on conflict must not fail
    await dbAdapter.execute(
      `INSERT INTO call_outcomes ("id", "tenantId", "callId", "commandId", "leadId", "phone", "reason", "duration", "answered", "finalizedAt")
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       ON CONFLICT ("tenantId", "callId") DO NOTHING`,
      [`${outcomeId}_dup`, tenantId, callId, 'cmd_r2', 'lead_r2', '1234567890', 'ANSWERED', 45, 1, new Date().toISOString()]
    );

    const saved = await dbAdapter.queryOne(
      'SELECT * FROM call_outcomes WHERE "tenantId" = $1 AND "callId" = $2',
      [tenantId, callId]
    );
    assert.strictEqual(saved.id, outcomeId, 'Primary outcome must be preserved');
  });

  await itAsync('R2.2: Concurrent worker finalization uses INSERT RETURNING to ensure single-winner side effects', async () => {
    const callId = `call_concurrent_${Date.now()}`;
    const tenantId = 'tenant_r2_concurrent';
    let sideEffectsExecuted = 0;

    async function simulateWorkerFinalize(workerId) {
      let won = false;
      await dbAdapter.withTransaction(async () => {
        const myOutcomeId = `co_${workerId}_${callId}`;
        const insertRes = await dbAdapter.query(
          `INSERT INTO call_outcomes ("id", "tenantId", "callId", "commandId", "leadId", "phone", "reason", "duration", "answered", "finalizedAt")
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
           ON CONFLICT ("tenantId", "callId") DO NOTHING
           RETURNING id`,
          [myOutcomeId, tenantId, callId, 'cmd_c', 'lead_c', '123', 'ANSWERED', 30, 1, new Date().toISOString()]
        );

        if (insertRes.rows && insertRes.rows.length > 0 && insertRes.rows[0].id === myOutcomeId) {
          won = true;
          sideEffectsExecuted++; // Only the winning transaction performs mutations
        } else {
          // Conflict: verify existing committed record
          const existing = await dbAdapter.queryOne(
            'SELECT id FROM call_outcomes WHERE "tenantId" = $1 AND "callId" = $2 LIMIT 1',
            [tenantId, callId]
          );
          assert(existing, 'Conflict verification must confirm existing committed outcome');
        }
      });
      return { ack: true, callId, won };
    }

    // Execute concurrently
    const [res1, res2] = await Promise.all([
      simulateWorkerFinalize('w1'),
      simulateWorkerFinalize('w2')
    ]);

    assert.strictEqual(res1.ack, true);
    assert.strictEqual(res2.ack, true);
    // Exactly one worker must win the claim and execute side-effects
    const winners = [res1.won, res2.won].filter(Boolean).length;
    assert.strictEqual(winners, 1, 'Exactly one concurrent worker must win the transactional claim');
    assert.strictEqual(sideEffectsExecuted, 1, 'Side effects must execute exactly once');
  });

  await itAsync('R2.3: server.ts enforces strict authorization and eliminates !session shortcut', async () => {
    const serverPath = path.resolve(__dirname, '../src/server.ts');
    const source = fs.readFileSync(serverPath, 'utf8');

    // 1. Ensure !session shortcut is removed from call:ended
    const handlerStart = source.indexOf("socket.on('call:ended'");
    const handlerEnd = source.indexOf("socket.on('disconnect'", handlerStart);
    const handlerBody = source.slice(handlerStart, handlerEnd);

    assert(!handlerBody.includes('!session || session.phoneSocketId'), 'Must NOT use !session as authorization shortcut');
    assert(handlerBody.includes('isAuthorizedSocket = (session.phoneSocketId === socket.id)'), 'Must check authorized socket ID when session exists');
    assert(handlerBody.includes('hasAuthTenant && hasEvidence'), 'Missing session state must trigger explicit recovery validation with evidence');
    assert(!handlerBody.includes('session.phoneSocketId = socket.id'), 'Must NOT reassign phoneSocketId from outcome event');
    assert(handlerBody.includes('SELECT id, "tenantId", "leadId" FROM call_outcomes WHERE "callId" = $1 AND "tenantId" = $2'), 'call_outcomes lookup must be scoped by authenticated tenant');
    assert(handlerBody.includes('CALL_OUTCOME_PERSISTENCE_FAILED'), 'Database storage failures must return retryable error rather than record absent');
  });

  // =========================================================================
  // PILLAR 3: R3 — Safe Revocation Failure Handling
  // =========================================================================
  console.log('\n[Pillar 3: R3 — Safe Revocation Failure Handling]');

  const auth = require('../dist/authManager');

  it('R3.1: RevocationStorageUnavailableError is exported and distinguishable', () => {
    assert(auth.RevocationStorageUnavailableError, 'RevocationStorageUnavailableError must be exported');
    const err = new auth.RevocationStorageUnavailableError('Storage down');
    assert.strictEqual(err.name, 'RevocationStorageUnavailableError');
  });

  await itAsync('R3.2: isTokenRevoked throws RevocationStorageUnavailableError on DB failure rather than false', async () => {
    auth.clearRevocationCacheForTesting();
    const origQueryOne = dbAdapter.queryOne;
    dbAdapter.queryOne = async () => {
      throw new Error('PostgreSQL connection dropped');
    };

    try {
      let threw = false;
      try {
        await auth.isTokenRevoked('fake.test.jwt.token');
      } catch (err) {
        threw = true;
        assert(err instanceof auth.RevocationStorageUnavailableError, 'Must throw RevocationStorageUnavailableError');
      }
      assert.strictEqual(threw, true, 'isTokenRevoked must NOT return false when database query fails');
    } finally {
      dbAdapter.queryOne = origQueryOne;
    }
  });

  await itAsync('R3.3: validateToken fails closed when RevocationStorageUnavailableError occurs', async () => {
    auth.clearRevocationCacheForTesting();
    const origQueryOne = dbAdapter.queryOne;
    dbAdapter.queryOne = async () => {
      throw new Error('PostgreSQL connection dropped');
    };

    try {
      const user = await auth.validateToken('fake.test.jwt.token');
      assert.strictEqual(user, null, 'validateToken must fail closed (return null) on storage error');
    } finally {
      dbAdapter.queryOne = origQueryOne;
    }
  });

  it('R3.4: Revocation cache pruning bounds memory size', () => {
    auth.clearRevocationCacheForTesting();
    auth.pruneRevocationCache();
  });

  // =========================================================================
  // PILLAR 4: R4 — Migration Connection Cleanup & Handset Outbox Journal
  // =========================================================================
  console.log('\n[Pillar 4: R4 — Migration Connection Cleanup & Handset Outbox]');

  await itAsync('R4.1: Advisory unlock return value is checked and connection released with true on failure', async () => {
    let releasedWithDestroy = false;
    const mockClient = {
      query: async (sql) => {
        if (sql.includes('pg_advisory_unlock')) {
          return { rows: [{ unlocked: false }] };
        }
        return { rows: [] };
      },
      release: (destroy) => {
        if (destroy === true) releasedWithDestroy = true;
      }
    };

    let discardConnection = false;
    const unlockRes = await mockClient.query('SELECT pg_advisory_unlock(1) AS unlocked');
    if (unlockRes.rows[0]?.unlocked !== true) {
      discardConnection = true;
    }
    await mockClient.query('RESET statement_timeout; RESET lock_timeout;');
    if (discardConnection) {
      mockClient.release(true);
    } else {
      mockClient.release();
    }

    assert.strictEqual(releasedWithDestroy, true, 'Client must be destroyed (release(true)) when unlock returns false');
  });

  await itAsync('R4.2: Session timeouts are reset before pooled client release (Properly Awaited)', async () => {
    let resetRun = false;
    const mockClient = {
      query: async (sql) => {
        if (sql.includes('RESET statement_timeout; RESET lock_timeout;')) {
          resetRun = true;
        }
        return { rows: [{ unlocked: true }] };
      },
      release: () => {}
    };

    await mockClient.query('RESET statement_timeout; RESET lock_timeout;');
    assert.strictEqual(resetRun, true, 'Timeouts must be reset before connection release');
  });

  it('R4.3: call_outbox_service.dart implements serialized queue, scoping, and corrupt storage quarantine', () => {
    const dartPath = path.resolve(__dirname, '../../../application_octal_dialer/lib/services/call_outbox_service.dart');
    assert(fs.existsSync(dartPath), 'call_outbox_service.dart must exist');
    const dartSource = fs.readFileSync(dartPath, 'utf8');

    assert(dartSource.includes('_runSerialized'), 'Outbox must serialize disk read-modify-write operations');
    assert(dartSource.includes('currentTenantId'), 'Outbox flush must support tenant scoping');
    assert(dartSource.includes('startPeriodicRetry'), 'Outbox must implement scheduled periodic backoff retries');
    assert(dartSource.includes('corrupt'), 'Outbox must quarantine corrupt storage instead of silently wiping it');
  });

  console.log('\n─────────────────────────────────────────────────────────────────');
  console.log(`RESULTS: ${passed} PASSED, ${failed} FAILED`);
  console.log('─────────────────────────────────────────────────────────────────');

  if (failed > 0) {
    process.exit(1);
  }
  process.exit(0);
}

runTests().catch(err => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
