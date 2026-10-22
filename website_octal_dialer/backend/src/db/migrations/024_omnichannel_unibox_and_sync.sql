-- ============================================================================
-- 024_omnichannel_unibox_and_sync.sql
-- Unifies Email (RFC 2822 + IMAP IDLE), Facebook (Desktop Worker Queue + Wire Sniffer),
-- Omnichannel Unibox Threads/Messages, and Priority Android Auto-Dialer Handoff.
-- ============================================================================

-- 1. Upgrade email_accounts with IMAP IDLE state & health columns
ALTER TABLE email_accounts ADD COLUMN IF NOT EXISTS "imapHost" TEXT;
ALTER TABLE email_accounts ADD COLUMN IF NOT EXISTS "imapPort" INTEGER DEFAULT 993;
ALTER TABLE email_accounts ADD COLUMN IF NOT EXISTS "lastImapUid" BIGINT DEFAULT 0;
ALTER TABLE email_accounts ADD COLUMN IF NOT EXISTS "imapStatus" TEXT DEFAULT 'disconnected';
ALTER TABLE email_accounts ADD COLUMN IF NOT EXISTS "lastSyncedAt" TEXT;
ALTER TABLE email_accounts ADD COLUMN IF NOT EXISTS "accessToken" TEXT;
ALTER TABLE email_accounts ADD COLUMN IF NOT EXISTS "refreshToken" TEXT;

-- 2. Upgrade email_dispatch_logs with deterministic RFC 2822 Message-ID
ALTER TABLE email_dispatch_logs ADD COLUMN IF NOT EXISTS "messageId" TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS idx_email_dispatch_message_id ON email_dispatch_logs("messageId") WHERE "messageId" IS NOT NULL;

-- 3. Upgrade email_leads to link with canonical dialer leads & store extracted phones
ALTER TABLE email_leads ADD COLUMN IF NOT EXISTS phone TEXT;
ALTER TABLE email_leads ADD COLUMN IF NOT EXISTS "dialerLeadId" TEXT;
ALTER TABLE email_leads ADD COLUMN IF NOT EXISTS "repliedAt" TEXT;
ALTER TABLE email_leads ADD COLUMN IF NOT EXISTS "lastIntent" TEXT;

-- 4. Upgrade canonical leads table with priority & omnichannel provenance
ALTER TABLE leads ADD COLUMN IF NOT EXISTS priority INTEGER NOT NULL DEFAULT 0;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS "sourceChannel" TEXT DEFAULT 'csv';
ALTER TABLE leads ADD COLUMN IF NOT EXISTS "lastReplySnippet" TEXT;
CREATE INDEX IF NOT EXISTS idx_leads_priority_queue ON leads("tenantId", "campaignId", status, priority DESC, "createdAt" ASC);

-- 5. Unified Omnichannel Threads (Email + Facebook DM + Facebook Comment + Calls)
CREATE TABLE IF NOT EXISTS outreach_threads (
  id TEXT PRIMARY KEY,
  "tenantId" TEXT NOT NULL,
  "leadId" TEXT,                  -- Links to canonical leads.id
  "emailLeadId" TEXT,             -- Links to email_leads.id
  "campaignId" TEXT,
  channel TEXT NOT NULL,          -- 'email' | 'facebook_dm' | 'facebook_comment' | 'call'
  "accountId" TEXT,               -- email_accounts.id or fb_accounts.id
  "externalThreadId" TEXT,        -- FB thread_fbid or Root Email Message-ID
  "prospectAddress" TEXT NOT NULL,-- Email address, FB Profile URL/ID, or Phone
  "prospectName" TEXT NOT NULL DEFAULT 'Prospect',
  "prospectCompany" TEXT DEFAULT '',
  subject TEXT,
  status TEXT NOT NULL DEFAULT 'open', -- 'open' | 'replied_hot' | 'objection' | 'ooo' | 'dnc' | 'closed'
  "sequenceLocked" INTEGER NOT NULL DEFAULT 0, -- 1 = Stop-on-Reply triggered
  "unreadCount" INTEGER NOT NULL DEFAULT 0,
  "lastMessageSnippet" TEXT,
  "lastMessageAt" TEXT NOT NULL,
  "createdAt" TEXT NOT NULL,
  "updatedAt" TEXT NOT NULL,
  UNIQUE("tenantId", channel, "externalThreadId")
);
CREATE INDEX IF NOT EXISTS idx_outreach_threads_tenant_status ON outreach_threads("tenantId", status, "lastMessageAt" DESC);
CREATE INDEX IF NOT EXISTS idx_outreach_threads_prospect ON outreach_threads("tenantId", "prospectAddress");

-- 6. Unified Omnichannel Messages (Idempotent Event Ledger)
CREATE TABLE IF NOT EXISTS outreach_messages (
  id TEXT PRIMARY KEY,
  "threadId" TEXT NOT NULL REFERENCES outreach_threads(id) ON DELETE CASCADE,
  "tenantId" TEXT NOT NULL,
  direction TEXT NOT NULL CHECK (direction IN ('outbound', 'inbound')),
  channel TEXT NOT NULL,          -- 'email' | 'facebook_dm' | 'facebook_comment' | 'call'
  "senderAddress" TEXT NOT NULL,
  "recipientAddress" TEXT NOT NULL,
  "externalMessageId" TEXT NOT NULL, -- RFC 2822 Message-ID or FB message_id
  "inReplyTo" TEXT,
  "referencesHeader" TEXT,
  subject TEXT,
  "bodyRaw" TEXT,
  "bodyClean" TEXT,               -- Stripped via crisp-im/email-reply-parser
  intent TEXT,                    -- 'positive' | 'phone_shared' | 'question' | 'ooo' | 'dnc'
  "extractedPhone" TEXT,
  "createdAt" TEXT NOT NULL,
  UNIQUE("tenantId", channel, "externalMessageId")
);
CREATE INDEX IF NOT EXISTS idx_outreach_messages_thread ON outreach_messages("threadId", "createdAt" ASC);
CREATE INDEX IF NOT EXISTS idx_outreach_messages_msgid ON outreach_messages("externalMessageId");

-- 7. Cloud-Synced Facebook Accounts & Desktop Task Queue (Replaces local JSON files)
CREATE TABLE IF NOT EXISTS fb_accounts (
  id TEXT PRIMARY KEY,
  "tenantId" TEXT NOT NULL,
  "profileId" TEXT NOT NULL,
  name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'valid',
  "dailyLimit" INTEGER NOT NULL DEFAULT 25,
  "sentToday" INTEGER NOT NULL DEFAULT 0,
  "lastSyncCursor" TEXT,
  "updatedAt" TEXT NOT NULL,
  UNIQUE("tenantId", "profileId")
);

CREATE TABLE IF NOT EXISTS fb_task_queue (
  id TEXT PRIMARY KEY,
  "tenantId" TEXT NOT NULL,
  "profileId" TEXT NOT NULL,
  "taskType" TEXT NOT NULL,       -- 'group_share' | 'group_join' | 'send_dm'
  payload TEXT NOT NULL,          -- JSON config
  status TEXT NOT NULL DEFAULT 'pending', -- 'pending' | 'claimed' | 'completed' | 'failed' | 'cancelled_on_reply'
  "claimedByAgentId" TEXT,
  "createdAt" TEXT NOT NULL,
  "updatedAt" TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_fb_tasks_tenant_status ON fb_task_queue("tenantId", status, "createdAt" ASC);
