-- ============================================================================
-- 022_auto_emailer_upgrade.sql
-- Auto Emailer Architecture Upgrade:
-- 1. Alter id columns in email_accounts, email_leads, email_templates from INTEGER to TEXT
-- 2. Add dailyLimit, sentToday, lastResetDate to email_accounts
-- 3. Add unsubscribeToken, unsubscribedAt to email_leads
-- 4. Add bodyHtml to email_templates
-- 5. Create email_campaign_runs for persistent campaign queue state
-- 6. Create email_dispatch_logs for audit, delivery, and open/click telemetry
-- 7. Create email_unsubscribes for multi-tenant suppression compliance
-- ============================================================================

-- 1. Alter id columns to TEXT (safe type conversion)
ALTER TABLE email_accounts ALTER COLUMN id TYPE TEXT USING id::TEXT;
ALTER TABLE email_leads ALTER COLUMN id TYPE TEXT USING id::TEXT;
ALTER TABLE email_templates ALTER COLUMN id TYPE TEXT USING id::TEXT;

-- 2. Add Mailbox Quota & Rotation tracking
ALTER TABLE email_accounts ADD COLUMN IF NOT EXISTS "dailyLimit" INTEGER NOT NULL DEFAULT 50;
ALTER TABLE email_accounts ADD COLUMN IF NOT EXISTS "sentToday" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE email_accounts ADD COLUMN IF NOT EXISTS "lastResetDate" TEXT;

-- 3. Add Unsubscribe & Compliance tracking to leads
ALTER TABLE email_leads ADD COLUMN IF NOT EXISTS "unsubscribeToken" TEXT;
ALTER TABLE email_leads ADD COLUMN IF NOT EXISTS "unsubscribedAt" TEXT;

-- 4. Add Rich HTML template capability
ALTER TABLE email_templates ADD COLUMN IF NOT EXISTS "bodyHtml" TEXT;

-- 5. Persistent Campaign Runs table
CREATE TABLE IF NOT EXISTS email_campaign_runs (
  id TEXT PRIMARY KEY,
  "tenantId" TEXT NOT NULL,
  name TEXT NOT NULL DEFAULT 'Outreach Campaign',
  status TEXT NOT NULL DEFAULT 'idle',
  "totalLeads" INTEGER NOT NULL DEFAULT 0,
  "sentCount" INTEGER NOT NULL DEFAULT 0,
  "failedCount" INTEGER NOT NULL DEFAULT 0,
  "openedCount" INTEGER NOT NULL DEFAULT 0,
  "clickedCount" INTEGER NOT NULL DEFAULT 0,
  "selectedAccountIds" TEXT,
  "limitCount" INTEGER NOT NULL DEFAULT 300,
  "startedAt" TEXT,
  "completedAt" TEXT,
  "createdAt" TEXT NOT NULL
);

-- 6. Persistent Dispatch Logs for Telemetry (Opens, Clicks, Bounces)
CREATE TABLE IF NOT EXISTS email_dispatch_logs (
  id TEXT PRIMARY KEY,
  "tenantId" TEXT NOT NULL,
  "campaignRunId" TEXT,
  "leadId" TEXT NOT NULL,
  "leadEmail" TEXT NOT NULL,
  "accountId" TEXT NOT NULL,
  "accountEmail" TEXT NOT NULL,
  stage INTEGER NOT NULL DEFAULT 1,
  subject TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'sent',
  "errorMessage" TEXT,
  "sentAt" TEXT NOT NULL,
  "openedAt" TEXT,
  "clickedAt" TEXT,
  "trackingToken" TEXT UNIQUE
);

-- 7. Unsubscribe Suppression List table
CREATE TABLE IF NOT EXISTS email_unsubscribes (
  id TEXT PRIMARY KEY,
  "tenantId" TEXT NOT NULL,
  email TEXT NOT NULL,
  "unsubscribedAt" TEXT NOT NULL,
  UNIQUE("tenantId", email)
);

-- 8. Composite Performance & Isolation Indexes
CREATE INDEX IF NOT EXISTS idx_email_dispatch_tenant_sent ON email_dispatch_logs("tenantId", "sentAt");
CREATE INDEX IF NOT EXISTS idx_email_dispatch_tracking ON email_dispatch_logs("trackingToken");
CREATE INDEX IF NOT EXISTS idx_email_campaign_runs_tenant ON email_campaign_runs("tenantId", status);
CREATE INDEX IF NOT EXISTS idx_email_unsubscribes_tenant_email ON email_unsubscribes("tenantId", email);
CREATE INDEX IF NOT EXISTS idx_email_leads_tenant_email ON email_leads("tenantId", email);
