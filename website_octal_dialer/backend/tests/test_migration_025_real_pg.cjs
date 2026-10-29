// test_migration_025_real_pg.cjs
// Executes the FULL migration chain (schema.sql + every numbered migration)
// against a REAL embedded PostgreSQL instance, then proves the behaviour that
// migration 025 is supposed to deliver.
//
// This is the test that static review cannot substitute for: a migration can
// typecheck, read correctly, and still abort the transaction on real data.

const fs = require('fs');
const path = require('path');
const os = require('os');
const assert = require('assert/strict');
const { Client } = require('pg');
const EmbeddedPostgres = require('embedded-postgres').default;

let passed = 0;
async function check(name, fn) {
  try {
    await fn();
    passed++;
    console.log(`PASS ${name}`);
  } catch (err) {
    console.error(`FAIL ${name}`);
    console.error(err);
    process.exitCode = 1;
    throw err;
  }
}

async function run() {
  console.log('===============================================================');
  console.log('REAL POSTGRESQL: FULL MIGRATION CHAIN THROUGH 025');
  console.log('===============================================================\n');

  const testDir = path.join(os.tmpdir(), 'pg_mig025_' + Date.now());
  fs.mkdirSync(testDir, { recursive: true });
  const testPort = 54331;

  const pgServer = new EmbeddedPostgres({
    port: testPort,
    databaseDir: testDir,
    user: 'postgres',
    password: 'testpassword',
    persistent: false
  });

  let client;
  try {
    await pgServer.initialise();
    await pgServer.start();

    client = new Client({
      host: '127.0.0.1',
      port: testPort,
      user: 'postgres',
      password: 'testpassword',
      database: 'postgres'
    });
    await client.connect();
    await client.query("SET client_encoding = 'UTF8'");
    console.log('PostgreSQL ready.\n');

    const dbDir = path.join(__dirname, '../src/db');
    const readSql = (p) => {
      const s = fs.readFileSync(p, 'utf8');
      return s.charCodeAt(0) === 0xFEFF ? s.slice(1) : s;
    };

    // ── Baseline + every migration up to (not including) 025 ────────────────
    await check('baseline schema.sql applies cleanly', async () => {
      await client.query(readSql(path.join(dbDir, 'schema.sql')));
    });

    const migrations = fs
      .readdirSync(path.join(dbDir, 'migrations'))
      .filter((f) => f.endsWith('.sql'))
      .sort();

    const before025 = migrations.filter((f) => !f.startsWith('025_'));
    for (const file of before025) {
      await check(`migration ${file} applies`, async () => {
        await client.query('BEGIN');
        try {
          await client.query(readSql(path.join(dbDir, 'migrations', file)));
          await client.query('COMMIT');
        } catch (e) {
          await client.query('ROLLBACK');
          throw e;
        }
      });
    }

    // ── Seed the exact condition that used to break 025 ──────────────────────
    await check('seed duplicate pending tasks that the old code permitted', async () => {
      const payload = JSON.stringify({ postUrls: ['https://facebook.com/groups/x'] });
      for (let i = 0; i < 3; i++) {
        await client.query(
          `INSERT INTO fb_task_queue (id, "tenantId", "profileId", "taskType", payload, status, "createdAt", "updatedAt")
           VALUES ($1, 'tenant_dupe', 'profile_a', 'post_group', $2, 'pending', $3, $3)`,
          [`task_dupe_${i}`, payload, new Date(Date.now() + i * 1000).toISOString()]
        );
      }
      const { rows } = await client.query(
        `SELECT COUNT(*)::int AS n FROM fb_task_queue WHERE "tenantId" = 'tenant_dupe' AND status = 'pending'`
      );
      assert.equal(rows[0].n, 3, 'three identical pending tasks must exist before the migration');
    });

    // Orphans that the new foreign keys must tolerate.
    await check('seed orphan rows that the new foreign keys must clean', async () => {
      const now = new Date().toISOString();
      await client.query(
        `INSERT INTO outreach_threads (id, "tenantId", channel, "prospectAddress", "lastMessageAt", "createdAt", "updatedAt", "emailLeadId")
         VALUES ('thr_orphan', 'tenant_dupe', 'email', 'x@example.com', $1, $1, $1, 'lead_does_not_exist')`,
        [now]
      );
      await client.query(
        `INSERT INTO outreach_messages (id, "threadId", "tenantId", direction, channel, "senderAddress", "recipientAddress", "externalMessageId", "createdAt")
         VALUES ('msg_orphan', 'thread_does_not_exist', 'tenant_dupe', 'inbound', 'email', 'a@b.c', 'd@e.f', 'ext_orphan', $1)`,
        [now]
      );
      await client.query(
        `INSERT INTO email_dispatch_logs (id, "tenantId", "leadId", "leadEmail", "accountId", "accountEmail", subject, "sentAt", "campaignRunId")
         VALUES ('disp_orphan', 'tenant_dupe', 'lead_does_not_exist', 'a@b.c', 'acc', 'acc@b.c', 'hi', $1, 'run_does_not_exist')`,
        [now]
      );
    });

    // ── The migration under test ────────────────────────────────────────────
    await check('migration 025 applies in a single transaction', async () => {
      await client.query('BEGIN');
      try {
        await client.query(readSql(path.join(dbDir, 'migrations/025_fb_persistence_and_integrity.sql')));
        await client.query('COMMIT');
      } catch (e) {
        await client.query('ROLLBACK');
        throw e;
      }
    });

    // ── Behaviour it was supposed to deliver ────────────────────────────────
    await check('duplicate pending tasks were collapsed to exactly one', async () => {
      const { rows } = await client.query(
        `SELECT status, COUNT(*)::int AS n FROM fb_task_queue
          WHERE "tenantId" = 'tenant_dupe' GROUP BY status ORDER BY status`
      );
      const byStatus = Object.fromEntries(rows.map((r) => [r.status, r.n]));
      assert.equal(byStatus.pending, 1, 'exactly one pending task must survive');
      assert.equal(byStatus.superseded, 2, 'the other two must be marked superseded');
    });

    await check('the oldest duplicate is the one kept', async () => {
      const { rows } = await client.query(
        `SELECT id FROM fb_task_queue WHERE "tenantId" = 'tenant_dupe' AND status = 'pending'`
      );
      assert.equal(rows[0].id, 'task_dupe_0', 'the earliest createdAt must be retained');
    });

    await check('the pending-dedupe index now rejects a duplicate insert', async () => {
      const payload = JSON.stringify({ postUrls: ['https://facebook.com/groups/x'] });
      const now = new Date().toISOString();
      await assert.rejects(
        client.query(
          `INSERT INTO fb_task_queue (id, "tenantId", "profileId", "taskType", payload, status, "createdAt", "updatedAt")
           VALUES ('task_dupe_new', 'tenant_dupe', 'profile_a', 'post_group', $1, 'pending', $2, $2)`,
          [payload, now]
        ),
        /duplicate key|unique/i,
        'a second identical pending task must be refused'
      );
    });

    await check('a non-pending duplicate is still allowed', async () => {
      const payload = JSON.stringify({ postUrls: ['https://facebook.com/groups/x'] });
      const now = new Date().toISOString();
      await client.query(
        `INSERT INTO fb_task_queue (id, "tenantId", "profileId", "taskType", payload, status, "createdAt", "updatedAt")
         VALUES ('task_done_dupe', 'tenant_dupe', 'profile_a', 'post_group', $1, 'completed', $2, $2)`,
        [payload, now]
      );
    });

    await check('orphan rows were cleaned and foreign keys now exist', async () => {
      const { rows: msg } = await client.query(`SELECT COUNT(*)::int AS n FROM outreach_messages WHERE id = 'msg_orphan'`);
      assert.equal(msg[0].n, 0, 'orphan outreach_messages row must be deleted');

      const { rows: disp } = await client.query(`SELECT COUNT(*)::int AS n FROM email_dispatch_logs WHERE id = 'disp_orphan'`);
      assert.equal(disp[0].n, 0, 'orphan dispatch log must be deleted');

      const { rows: thr } = await client.query(`SELECT "emailLeadId" FROM outreach_threads WHERE id = 'thr_orphan'`);
      assert.equal(thr[0].emailLeadId, null, 'dangling lead reference must be nulled');

      const { rows: fks } = await client.query(
        `SELECT constraint_name FROM information_schema.table_constraints
          WHERE constraint_type = 'FOREIGN KEY' AND constraint_name IN
          ('fk_outreach_messages_thread','fk_outreach_threads_email_lead','fk_email_dispatch_lead','fk_email_dispatch_run')`
      );
      assert.equal(fks.length, 4, 'all four foreign keys must be present');
    });

    await check('cascade actually fires when a lead is deleted', async () => {
      const now = new Date().toISOString();
      await client.query(
        `INSERT INTO email_leads (id, email, name, company, status, stage, "createdAt", "tenantId")
         VALUES ('lead_cascade', 'c@d.e', 'C', 'Co', 'pending', 1, $1, 'tenant_dupe')`,
        [now]
      );
      await client.query(
        `INSERT INTO email_dispatch_logs (id, "tenantId", "leadId", "leadEmail", "accountId", "accountEmail", subject, "sentAt")
         VALUES ('disp_cascade', 'tenant_dupe', 'lead_cascade', 'c@d.e', 'acc', 'acc@b.c', 'hi', $1)`,
        [now]
      );
      await client.query(`DELETE FROM email_leads WHERE id = 'lead_cascade'`);

      const { rows } = await client.query(`SELECT COUNT(*)::int AS n FROM email_dispatch_logs WHERE id = 'disp_cascade'`);
      assert.equal(rows[0].n, 0, 'dispatch logs must cascade with their lead');
    });

    await check('the new Facebook persistence tables and columns exist', async () => {
      for (const t of ['fb_campaign_config', 'fb_groups', 'fb_activity_log']) {
        const { rows } = await client.query(`SELECT to_regclass($1) AS t`, [t]);
        assert.ok(rows[0].t, `${t} must exist`);
      }
      const { rows: cols } = await client.query(
        `SELECT column_name FROM information_schema.columns
          WHERE table_name = 'fb_accounts' AND column_name IN ('cookiesEnc','note','lastRunAt','lastResetDate','createdAt')`
      );
      assert.equal(cols.length, 5, 'fb_accounts must gain all five columns');

      const { rows: qcols } = await client.query(
        `SELECT column_name FROM information_schema.columns
          WHERE table_name = 'fb_task_queue' AND column_name IN ('claimedAt','attempts','claimedByAgentId')`
      );
      assert.equal(qcols.length, 3, 'fb_task_queue must gain its lease columns');
    });

    await check('teams.status default was normalised to lowercase', async () => {
      const { rows } = await client.query(
        `SELECT column_default FROM information_schema.columns
          WHERE table_name = 'teams' AND column_name = 'status'`
      );
      assert.match(rows[0].column_default, /'active'/, "default must be 'active', not 'Active'");
    });

    await check('migration 025 is idempotent (re-running is a no-op)', async () => {
      await client.query('BEGIN');
      try {
        await client.query(readSql(path.join(dbDir, 'migrations/025_fb_persistence_and_integrity.sql')));
        await client.query('COMMIT');
      } catch (e) {
        await client.query('ROLLBACK');
        throw e;
      }
      const { rows } = await client.query(
        `SELECT COUNT(*)::int AS n FROM fb_task_queue WHERE "tenantId" = 'tenant_dupe' AND status = 'pending'`
      );
      assert.equal(rows[0].n, 1, 'a second run must not change the collapsed state');
    });

    console.log(`\n${passed} real-PostgreSQL migration checks passed.`);
  } finally {
    if (client) {
      try { await client.end(); } catch (_) {}
    }
    try { await pgServer.stop(); } catch (_) {}
    try { fs.rmSync(testDir, { recursive: true, force: true }); } catch (_) {}
  }
}

run().catch((err) => {
  console.error('\nReal PostgreSQL migration test FAILED.');
  console.error(err);
  process.exit(1);
});
