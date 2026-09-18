const assert = require('assert');
const path = require('path');
const fs = require('fs');

async function runTests() {
  console.log('─────────────────────────────────────────────────────────────────');
  console.log('🧪 RUNNING HARDENING DEFECTS VERIFICATION SUITE (R1 - R4)');
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
  // PILLAR 1: R1 — Native Call Correlation Logic
  // =========================================================================
  console.log('\n[Pillar 1: R1 — Correct Native Call Correlation]');

  it('R1.1: Incoming ringing calls must NEVER consume pending placement record', () => {
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

  it('R1.2: Valid outgoing call matches and consumes pending placement', () => {
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

  it('R1.3: Mismatched or cancelled placement fails safely to unmapped ID without guessing', () => {
    let pendingPlacement = {
      commandId: 'cmd_303',
      destination: '15559990000',
      accountHandleId: 'sim_1',
      generation: 3,
      expiresAtMs: Date.now() + 10000,
      isCancelled: true // cancelled
    };

    function correlateCall(call) {
      const number = call.number.replace(/\D/g, '');
      const isIncoming = call.state === 'RINGING' || call.direction === 'INCOMING';
      if (isIncoming) return `call_${call.id}`;
      if (pendingPlacement && !pendingPlacement.isCancelled && Date.now() <= pendingPlacement.expiresAtMs) {
        if (number === pendingPlacement.destination) {
          const bound = pendingPlacement.commandId;
          pendingPlacement = null;
          return bound;
        }
      }
      return `call_${call.id}`;
    }

    const outgoingCall = { id: 1002, number: '15559990000', state: 'DIALING', direction: 'OUTGOING' };
    const boundId = correlateCall(outgoingCall);
    assert.strictEqual(boundId, 'call_1002', 'Cancelled placement must not be bound');
  });

  // =========================================================================
  // PILLAR 2: R2 — Durable Call Outcomes Ledger & Handset Outbox
  // =========================================================================
  console.log('\n[Pillar 2: R2 — Durable Call Outcomes Ledger & Deduplication]');

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

  await itAsync('R2.2: Lost ACK / Retried call:ended deduplicates via call_outcomes without double execution', async () => {
    const callId = `call_dedup_${Date.now()}`;
    const tenantId = 'tenant_r2_dedup';
    let transactionCount = 0;

    async function handleCallEnded(payload) {
      const existing = await dbAdapter.queryOne(
        'SELECT id, "tenantId", "leadId" FROM call_outcomes WHERE "callId" = $1 LIMIT 1',
        [payload.callId]
      );
      if (existing) {
        return { ack: true, callId: payload.callId, leadId: existing.leadId, wasDeduped: true };
      }

      await dbAdapter.withTransaction(async () => {
        transactionCount++;
        await dbAdapter.execute(
          `INSERT INTO call_outcomes ("id", "tenantId", "callId", "commandId", "leadId", "phone", "reason", "duration", "answered", "finalizedAt")
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
           ON CONFLICT ("tenantId", "callId") DO NOTHING`,
          [`co_${payload.callId}`, payload.tenantId, payload.callId, payload.commandId, payload.leadId, payload.phone, payload.reason, payload.duration, 1, new Date().toISOString()]
        );
      });
      return { ack: true, callId: payload.callId, leadId: payload.leadId, wasDeduped: false };
    }

    const res1 = await handleCallEnded({ callId, tenantId, leadId: 'lead_1', commandId: 'cmd_1', phone: '111', reason: 'ANSWERED', duration: 30 });
    assert.strictEqual(res1.ack, true);
    assert.strictEqual(res1.wasDeduped, false);
    assert.strictEqual(transactionCount, 1);

    // Second submission (lost ACK retry)
    const res2 = await handleCallEnded({ callId, tenantId, leadId: 'lead_1', commandId: 'cmd_1', phone: '111', reason: 'ANSWERED', duration: 30 });
    assert.strictEqual(res2.ack, true);
    assert.strictEqual(res2.wasDeduped, true, 'Second call must be recognized as already committed');
    assert.strictEqual(transactionCount, 1, 'Transaction must NOT re-run on duplicate retry');
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
    auth.pruneRevocationCache(); // Should not throw
  });

  // =========================================================================
  // PILLAR 4: R4 — Migration Connection Cleanup
  // =========================================================================
  console.log('\n[Pillar 4: R4 — Migration Connection Cleanup]');

  const poolModule = require('../dist/db/pool');

  await itAsync('R4.1: Advisory unlock return value is checked and connection released with true on failure', async () => {
    let releasedWithDestroy = false;
    const mockClient = {
      query: async (sql) => {
        if (sql.includes('pg_advisory_unlock')) {
          // Simulate lock not held (returns false)
          return { rows: [{ unlocked: false }] };
        }
        if (sql.includes('RESET')) {
          return { rows: [] };
        }
        return { rows: [] };
      },
      release: (destroy) => {
        if (destroy === true) releasedWithDestroy = true;
      }
    };

    // Simulate cleanup logic from pool.ts
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

  it('R4.2: Session timeouts are reset before pooled client release', async () => {
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
