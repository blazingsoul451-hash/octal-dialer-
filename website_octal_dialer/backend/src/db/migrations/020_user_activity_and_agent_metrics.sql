-- Migration 020: Granular User Activity Logs, Agent Performance Scorecards, and Call Log Attribution

-- 1. Attribution columns on call_logs
ALTER TABLE "call_logs" ADD COLUMN IF NOT EXISTS "userId" TEXT;
ALTER TABLE "call_logs" ADD COLUMN IF NOT EXISTS "userName" TEXT;
CREATE INDEX IF NOT EXISTS "idx_call_logs_tenant_user" ON "call_logs"("tenantId", "userId");

-- 2. User Activity Audit Trail (Granular log for logins, exports, imports, edits, dispositions)
CREATE TABLE IF NOT EXISTS "user_activity_logs" (
  "id" TEXT PRIMARY KEY,
  "tenantId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "username" TEXT NOT NULL,
  "action" TEXT NOT NULL,
  "resourceType" TEXT NOT NULL DEFAULT 'system',
  "resourceId" TEXT,
  "details" TEXT,
  "ipAddress" TEXT,
  "userAgent" TEXT,
  "timestamp" TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS "idx_user_activity_logs_tenant" ON "user_activity_logs"("tenantId");
CREATE INDEX IF NOT EXISTS "idx_user_activity_logs_user" ON "user_activity_logs"("tenantId", "userId");
CREATE INDEX IF NOT EXISTS "idx_user_activity_logs_action" ON "user_activity_logs"("tenantId", "action");
CREATE INDEX IF NOT EXISTS "idx_user_activity_logs_time" ON "user_activity_logs"("tenantId", "timestamp" DESC);

-- 3. Agent Daily Performance Metrics (Scorecard rollup per agent per day)
CREATE TABLE IF NOT EXISTS "agent_daily_metrics" (
  "id" TEXT PRIMARY KEY,
  "tenantId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "username" TEXT NOT NULL DEFAULT '',
  "date" TEXT NOT NULL,
  "totalCalls" INTEGER NOT NULL DEFAULT 0,
  "answeredCalls" INTEGER NOT NULL DEFAULT 0,
  "failedCalls" INTEGER NOT NULL DEFAULT 0,
  "busyCalls" INTEGER NOT NULL DEFAULT 0,
  "noAnswerCalls" INTEGER NOT NULL DEFAULT 0,
  "totalTalkSeconds" INTEGER NOT NULL DEFAULT 0,
  "avgTalkSeconds" INTEGER NOT NULL DEFAULT 0,
  "firstCallAt" TEXT,
  "lastCallAt" TEXT,
  "updatedAt" TEXT NOT NULL,
  CONSTRAINT "uq_agent_daily_metrics" UNIQUE ("tenantId", "userId", "date")
);
CREATE INDEX IF NOT EXISTS "idx_agent_daily_metrics_tenant_date" ON "agent_daily_metrics"("tenantId", "date" DESC);
CREATE INDEX IF NOT EXISTS "idx_agent_daily_metrics_user_date" ON "agent_daily_metrics"("tenantId", "userId", "date" DESC);
