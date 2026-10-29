-- ============================================================================
-- 025_fb_persistence_and_integrity.sql
--
-- 1. Promotes the Facebook Auto-Poster from loose JSON files on disk to durable,
--    tenant-scoped PostgreSQL tables (accounts incl. encrypted cookie jars,
--    campaign config, join config, group targets, activity log).
-- 2. Adds stale-claim recovery fields + a pending-dedupe guard to fb_task_queue.
-- 3. Adds referential integrity (with orphan cleanup) to the emailer and
--    omnichannel tables so deletes cannot silently break reply attribution.
-- 4. Normalises the legacy capitalised `teams.status` default.
-- ============================================================================

-- --- 1. fb_accounts: becomes the source of truth for Facebook profiles ------
ALTER TABLE fb_accounts ADD COLUMN IF NOT EXISTS "cookiesEnc" TEXT;
ALTER TABLE fb_accounts ADD COLUMN IF NOT EXISTS "note" TEXT DEFAULT '';
ALTER TABLE fb_accounts ADD COLUMN IF NOT EXISTS "lastRunAt" TEXT;
ALTER TABLE fb_accounts ADD COLUMN IF NOT EXISTS "lastResetDate" TEXT;
ALTER TABLE fb_accounts ADD COLUMN IF NOT EXISTS "createdAt" TEXT;

UPDATE fb_accounts SET "createdAt" = COALESCE("createdAt", "updatedAt") WHERE "createdAt" IS NULL;

CREATE INDEX IF NOT EXISTS idx_fb_accounts_tenant ON fb_accounts("tenantId", status);

-- --- 2. fb_campaign_config: post caption + target URLs, one row per tenant --
CREATE TABLE IF NOT EXISTS "fb_campaign_config" (
  "tenantId" TEXT PRIMARY KEY,
  "caption" TEXT NOT NULL DEFAULT '',
  "postUrls" TEXT NOT NULL DEFAULT '[]',
  "keywords" TEXT NOT NULL DEFAULT '[]',
  "joinsPerSession" INTEGER NOT NULL DEFAULT 5,
  "maxPostsPerDay" INTEGER NOT NULL DEFAULT 10,
  "delayMinMinutes" INTEGER NOT NULL DEFAULT 3,
  "delayMaxMinutes" INTEGER NOT NULL DEFAULT 9,
  "updatedAt" TEXT NOT NULL DEFAULT ''
);

-- --- 3. fb_groups: discovered / joined group targets ------------------------
CREATE TABLE IF NOT EXISTS "fb_groups" (
  "id" TEXT PRIMARY KEY,
  "tenantId" TEXT NOT NULL,
  "name" TEXT NOT NULL DEFAULT 'Facebook Group',
  "url" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'pending',
  "profileId" TEXT,
  "joinedAt" TEXT,
  "createdAt" TEXT NOT NULL DEFAULT '',
  UNIQUE("tenantId", "url")
);

CREATE INDEX IF NOT EXISTS idx_fb_groups_tenant_status ON fb_groups("tenantId", status);

-- --- 4. fb_activity_log: durable post/join history for the Reports suite ----
CREATE TABLE IF NOT EXISTS "fb_activity_log" (
  "id" TEXT PRIMARY KEY,
  "tenantId" TEXT NOT NULL,
  "profileId" TEXT,
  "type" TEXT NOT NULL DEFAULT 'post',
  "target" TEXT,
  "detail" TEXT,
  "status" TEXT NOT NULL DEFAULT 'success',
  "createdAt" TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_fb_activity_tenant_created
  ON fb_activity_log("tenantId", "createdAt" DESC);

-- --- 5. fb_task_queue: stale-claim recovery + pending dedupe ----------------
ALTER TABLE fb_task_queue ADD COLUMN IF NOT EXISTS "claimedByAgentId" TEXT;
ALTER TABLE fb_task_queue ADD COLUMN IF NOT EXISTS "claimedAt" TEXT;
ALTER TABLE fb_task_queue ADD COLUMN IF NOT EXISTS "attempts" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE fb_task_queue ADD COLUMN IF NOT EXISTS "errorMessage" TEXT;

-- Back-fill claimedAt for anything already sitting in 'processing' so the
-- reaper can evaluate it instead of leaving it stuck forever.
UPDATE fb_task_queue
   SET "claimedAt" = COALESCE("claimedAt", "updatedAt")
 WHERE status = 'processing' AND "claimedAt" IS NULL;

CREATE INDEX IF NOT EXISTS idx_fb_tasks_claimed
  ON fb_task_queue(status, "claimedAt");

-- Collapse any duplicate pending rows that the pre-index code allowed, keeping
-- the oldest of each group. Without this the UNIQUE index below fails, the
-- whole migration transaction rolls back, and the server cannot start.
WITH ranked AS (
  SELECT id,
         ROW_NUMBER() OVER (
           PARTITION BY "tenantId", "profileId", "taskType", md5(payload)
           ORDER BY "createdAt" ASC, id ASC
         ) AS rn
    FROM fb_task_queue
   WHERE status = 'pending'
)
UPDATE fb_task_queue t
   SET status = 'superseded',
       "errorMessage" = 'Collapsed duplicate pending task during migration 025',
       "updatedAt" = to_char(now(), 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
  FROM ranked r
 WHERE t.id = r.id AND r.rn > 1;

-- Prevent the same outbound action being queued twice while still pending.
CREATE UNIQUE INDEX IF NOT EXISTS idx_fb_tasks_pending_dedupe
  ON fb_task_queue("tenantId", "profileId", "taskType", md5(payload))
  WHERE status = 'pending';

-- --- 6. Referential integrity (orphans cleared first, then constrained) -----

-- 6a. outreach_messages must belong to a live thread.
DELETE FROM outreach_messages
 WHERE "threadId" NOT IN (SELECT id FROM outreach_threads);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
     WHERE constraint_name = 'fk_outreach_messages_thread'
  ) THEN
    ALTER TABLE outreach_messages
      ADD CONSTRAINT fk_outreach_messages_thread
      FOREIGN KEY ("threadId") REFERENCES outreach_threads(id) ON DELETE CASCADE;
  END IF;
END $$;

-- 6b. A thread's email lead reference must resolve (or be NULL).
UPDATE outreach_threads
   SET "emailLeadId" = NULL
 WHERE "emailLeadId" IS NOT NULL
   AND "emailLeadId" NOT IN (SELECT id FROM email_leads);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
     WHERE constraint_name = 'fk_outreach_threads_email_lead'
  ) THEN
    ALTER TABLE outreach_threads
      ADD CONSTRAINT fk_outreach_threads_email_lead
      FOREIGN KEY ("emailLeadId") REFERENCES email_leads(id) ON DELETE SET NULL;
  END IF;
END $$;

-- 6c. Dispatch logs are what reply-matching reads; orphans mean silent
--     attribution loss, so cascade them with their lead.
DELETE FROM email_dispatch_logs
 WHERE "leadId" NOT IN (SELECT id FROM email_leads);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
     WHERE constraint_name = 'fk_email_dispatch_lead'
  ) THEN
    ALTER TABLE email_dispatch_logs
      ADD CONSTRAINT fk_email_dispatch_lead
      FOREIGN KEY ("leadId") REFERENCES email_leads(id) ON DELETE CASCADE;
  END IF;
END $$;

-- 6d. Dispatch logs tied to a deleted campaign run lose their run reference
--     but must survive (they are the per-lead send history).
UPDATE email_dispatch_logs
   SET "campaignRunId" = NULL
 WHERE "campaignRunId" IS NOT NULL
   AND "campaignRunId" NOT IN (SELECT id FROM email_campaign_runs);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
     WHERE constraint_name = 'fk_email_dispatch_run'
  ) THEN
    ALTER TABLE email_dispatch_logs
      ADD CONSTRAINT fk_email_dispatch_run
      FOREIGN KEY ("campaignRunId") REFERENCES email_campaign_runs(id) ON DELETE SET NULL;
  END IF;
END $$;

-- --- 7. Normalise the capitalised legacy teams.status default ---------------
ALTER TABLE teams ALTER COLUMN "status" SET DEFAULT 'active';
UPDATE teams SET "status" = 'active' WHERE "status" = 'Active';
