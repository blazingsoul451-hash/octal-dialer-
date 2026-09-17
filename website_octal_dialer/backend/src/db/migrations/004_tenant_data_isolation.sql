-- ============================================================================
-- 004_tenant_data_isolation.sql
-- Multi-Tenant Data Isolation & Referential Protection Migration
-- 1. Create missing daily_campaign_activity table if not exists
-- 2. Backfill dispositions.tenantId from leads.tenantId for legacy rows
-- 3. Create composite tenant-scoping indexes for high-volume operational tables
-- ============================================================================

-- 1. Create table daily_campaign_activity if not exists
CREATE TABLE IF NOT EXISTS "daily_campaign_activity" (
  "id" TEXT PRIMARY KEY,
  "tenantId" TEXT NOT NULL,
  "campaignId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "activityDate" TEXT NOT NULL,
  "workingSeconds" INTEGER NOT NULL DEFAULT 0,
  "talkSeconds" INTEGER NOT NULL DEFAULT 0,
  "callsPlaced" INTEGER NOT NULL DEFAULT 0,
  "callsAnswered" INTEGER NOT NULL DEFAULT 0,
  "lastState" TEXT NOT NULL DEFAULT 'PAUSED',
  "lastHeartbeat" TEXT NOT NULL,
  UNIQUE("tenantId", "campaignId", "userId", "activityDate")
);

-- 2. Backfill NULL tenantId in dispositions from parent leads
UPDATE dispositions d
SET "tenantId" = l."tenantId"
FROM leads l
WHERE d."leadId" = l.id
  AND d."tenantId" IS NULL
  AND l."tenantId" IS NOT NULL;

-- 3. Composite Tenant-Scoping Indexes for Fast, Isolated Lookups
CREATE INDEX IF NOT EXISTS idx_dispositions_tenant_lead ON dispositions("tenantId", "leadId");
CREATE INDEX IF NOT EXISTS idx_audit_logs_tenant_ts ON audit_logs("tenantId", "timestamp");
CREATE INDEX IF NOT EXISTS idx_lead_activities_tenant_lead ON lead_activities("tenantId", "leadId");
CREATE INDEX IF NOT EXISTS idx_email_leads_tenant_status ON email_leads("tenantId", "status");
CREATE INDEX IF NOT EXISTS idx_email_accounts_tenant ON email_accounts("tenantId");
CREATE INDEX IF NOT EXISTS idx_email_templates_tenant ON email_templates("tenantId");
CREATE INDEX IF NOT EXISTS idx_scraped_leads_tenant ON scraped_leads("tenantId");
CREATE INDEX IF NOT EXISTS idx_subscriptions_tenant ON subscriptions("tenantId");
CREATE INDEX IF NOT EXISTS idx_user_permissions_tenant_user ON user_permissions("tenantId", "userId");
CREATE INDEX IF NOT EXISTS idx_daily_campaign_act ON daily_campaign_activity("tenantId", "userId", "activityDate");
