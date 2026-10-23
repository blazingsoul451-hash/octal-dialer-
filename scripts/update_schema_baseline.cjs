const fs = require('fs');
const path = require('path');

const schemaPath = path.resolve(__dirname, '../website_octal_dialer/backend/src/db/schema.sql');
let s = fs.readFileSync(schemaPath, 'utf8');

// 1. call_logs: add userId and userName
const oldCallLogs =
`CREATE TABLE IF NOT EXISTS "call_logs" (
  "id" TEXT PRIMARY KEY,
  "leadId" TEXT NOT NULL,
  "leadName" TEXT NOT NULL DEFAULT '',
  "leadPhone" TEXT NOT NULL DEFAULT '',
  "campaignName" TEXT NOT NULL DEFAULT '',
  "outcome" TEXT NOT NULL DEFAULT '',
  "duration" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "timestamp" TEXT NOT NULL,
  "tenantId" TEXT
);`.replace(/\r?\n/g, '\r\n');

const newCallLogs =
`CREATE TABLE IF NOT EXISTS "call_logs" (
  "id" TEXT PRIMARY KEY,
  "leadId" TEXT NOT NULL,
  "leadName" TEXT NOT NULL DEFAULT '',
  "leadPhone" TEXT NOT NULL DEFAULT '',
  "campaignName" TEXT NOT NULL DEFAULT '',
  "outcome" TEXT NOT NULL DEFAULT '',
  "duration" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "timestamp" TEXT NOT NULL,
  "tenantId" TEXT,
  "userId" TEXT,
  "userName" TEXT
);`.replace(/\r?\n/g, '\r\n');

if (s.includes(oldCallLogs)) {
  s = s.replace(oldCallLogs, newCallLogs);
}

// 2. leads: add priority, sourceChannel, lastReplySnippet
const oldLeads =
`CREATE TABLE IF NOT EXISTS "leads" (
  "id" TEXT PRIMARY KEY,
  "campaignId" TEXT NOT NULL,
  "name" TEXT NOT NULL DEFAULT '',
  "phone" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'PENDING',
  "outcome" TEXT,
  "duration" DOUBLE PRECISION,
  "lockedBy" TEXT,
  "lockedAt" TEXT,
  "createdAt" TEXT NOT NULL DEFAULT '',
  "tenantId" TEXT,
  "address" TEXT,
  "listingId" TEXT,
  "assignedTo" TEXT,
  "crmCompanyId" TEXT,
  "contactId" TEXT,
  "requirement" TEXT,
  "country" TEXT,
  "email" TEXT
);`.replace(/\r?\n/g, '\r\n');

const newLeads =
`CREATE TABLE IF NOT EXISTS "leads" (
  "id" TEXT PRIMARY KEY,
  "campaignId" TEXT NOT NULL,
  "name" TEXT NOT NULL DEFAULT '',
  "phone" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'PENDING',
  "outcome" TEXT,
  "duration" DOUBLE PRECISION,
  "lockedBy" TEXT,
  "lockedAt" TEXT,
  "createdAt" TEXT NOT NULL DEFAULT '',
  "tenantId" TEXT,
  "address" TEXT,
  "listingId" TEXT,
  "assignedTo" TEXT,
  "crmCompanyId" TEXT,
  "contactId" TEXT,
  "requirement" TEXT,
  "country" TEXT,
  "email" TEXT,
  "priority" INTEGER NOT NULL DEFAULT 0,
  "sourceChannel" TEXT DEFAULT 'csv',
  "lastReplySnippet" TEXT
);`.replace(/\r?\n/g, '\r\n');

if (s.includes(oldLeads)) {
  s = s.replace(oldLeads, newLeads);
}

// 3. email_accounts: add imap columns
const oldEmailAccounts =
`CREATE TABLE IF NOT EXISTS "email_accounts" (
  "id" TEXT PRIMARY KEY,
  "email" TEXT NOT NULL,
  "password" TEXT NOT NULL,
  "senderName" TEXT,
  "smtpHost" TEXT NOT NULL DEFAULT 'smtp.office365.com',
  "smtpPort" INTEGER NOT NULL DEFAULT 587,
  "status" TEXT NOT NULL DEFAULT 'active',
  "createdAt" TEXT NOT NULL DEFAULT '',
  "tenantId" TEXT,
  "authType" TEXT DEFAULT 'password',
  "refreshToken" TEXT,
  "accessToken" TEXT,
  "dailyLimit" INTEGER NOT NULL DEFAULT 50,
  "sentToday" INTEGER NOT NULL DEFAULT 0,
  "lastResetDate" TEXT
);`.replace(/\r?\n/g, '\r\n');

const newEmailAccounts =
`CREATE TABLE IF NOT EXISTS "email_accounts" (
  "id" TEXT PRIMARY KEY,
  "email" TEXT NOT NULL,
  "password" TEXT NOT NULL,
  "senderName" TEXT,
  "smtpHost" TEXT NOT NULL DEFAULT 'smtp.office365.com',
  "smtpPort" INTEGER NOT NULL DEFAULT 587,
  "status" TEXT NOT NULL DEFAULT 'active',
  "createdAt" TEXT NOT NULL DEFAULT '',
  "tenantId" TEXT,
  "authType" TEXT DEFAULT 'password',
  "refreshToken" TEXT,
  "accessToken" TEXT,
  "dailyLimit" INTEGER NOT NULL DEFAULT 50,
  "sentToday" INTEGER NOT NULL DEFAULT 0,
  "lastResetDate" TEXT,
  "imapHost" TEXT,
  "imapPort" INTEGER DEFAULT 993,
  "lastImapUid" BIGINT DEFAULT 0,
  "imapStatus" TEXT DEFAULT 'disconnected',
  "lastSyncedAt" TEXT
);`.replace(/\r?\n/g, '\r\n');

if (s.includes(oldEmailAccounts)) {
  s = s.replace(oldEmailAccounts, newEmailAccounts);
}

// 4. email_leads: add phone, dialerLeadId, repliedAt, lastIntent
if (!s.includes('"dialerLeadId"')) {
  s = s.replace(
    '  "unsubscribedAt" TEXT,\r\n  CONSTRAINT "uq_email_leads_tenant_email"',
    '  "unsubscribedAt" TEXT,\r\n  "phone" TEXT,\r\n  "dialerLeadId" TEXT,\r\n  "repliedAt" TEXT,\r\n  "lastIntent" TEXT,\r\n  CONSTRAINT "uq_email_leads_tenant_email"'
  );
}

// 5. email_dispatch_logs: add messageId
if (!s.includes('"messageId" TEXT')) {
  s = s.replace(
    '  "trackingToken" TEXT UNIQUE\r\n);',
    '  "trackingToken" TEXT UNIQUE,\r\n  "messageId" TEXT\r\n);'
  );
}

// 6. Append tables from migration 024 if not present
if (!s.includes('outreach_threads')) {
  s += '\r\n\r\n-- Table: outreach_threads\r\n' +
    'CREATE TABLE IF NOT EXISTS "outreach_threads" (\r\n' +
    '  "id" TEXT PRIMARY KEY,\r\n' +
    '  "tenantId" TEXT NOT NULL,\r\n' +
    '  "leadId" TEXT,\r\n' +
    '  "emailLeadId" TEXT,\r\n' +
    '  "campaignId" TEXT,\r\n' +
    '  "channel" TEXT NOT NULL,\r\n' +
    '  "accountId" TEXT,\r\n' +
    '  "externalThreadId" TEXT,\r\n' +
    '  "prospectAddress" TEXT NOT NULL,\r\n' +
    '  "prospectName" TEXT NOT NULL DEFAULT \'Prospect\',\r\n' +
    '  "prospectCompany" TEXT DEFAULT \'\',\r\n' +
    '  "subject" TEXT,\r\n' +
    '  "status" TEXT NOT NULL DEFAULT \'open\',\r\n' +
    '  "sequenceLocked" INTEGER NOT NULL DEFAULT 0,\r\n' +
    '  "unreadCount" INTEGER NOT NULL DEFAULT 0,\r\n' +
    '  "lastMessageSnippet" TEXT,\r\n' +
    '  "lastMessageAt" TEXT NOT NULL,\r\n' +
    '  "createdAt" TEXT NOT NULL,\r\n' +
    '  "updatedAt" TEXT NOT NULL,\r\n' +
    '  UNIQUE("tenantId", "channel", "externalThreadId")\r\n' +
    ');\r\n\r\n' +
    '-- Table: outreach_messages\r\n' +
    'CREATE TABLE IF NOT EXISTS "outreach_messages" (\r\n' +
    '  "id" TEXT PRIMARY KEY,\r\n' +
    '  "threadId" TEXT NOT NULL,\r\n' +
    '  "tenantId" TEXT NOT NULL,\r\n' +
    '  "direction" TEXT NOT NULL,\r\n' +
    '  "channel" TEXT NOT NULL,\r\n' +
    '  "senderAddress" TEXT NOT NULL,\r\n' +
    '  "recipientAddress" TEXT NOT NULL,\r\n' +
    '  "externalMessageId" TEXT NOT NULL,\r\n' +
    '  "inReplyTo" TEXT,\r\n' +
    '  "referencesHeader" TEXT,\r\n' +
    '  "subject" TEXT,\r\n' +
    '  "bodyRaw" TEXT,\r\n' +
    '  "bodyClean" TEXT,\r\n' +
    '  "intent" TEXT,\r\n' +
    '  "extractedPhone" TEXT,\r\n' +
    '  "createdAt" TEXT NOT NULL,\r\n' +
    '  UNIQUE("tenantId", "channel", "externalMessageId")\r\n' +
    ');\r\n\r\n' +
    '-- Table: fb_accounts\r\n' +
    'CREATE TABLE IF NOT EXISTS "fb_accounts" (\r\n' +
    '  "id" TEXT PRIMARY KEY,\r\n' +
    '  "tenantId" TEXT NOT NULL,\r\n' +
    '  "profileId" TEXT NOT NULL,\r\n' +
    '  "name" TEXT NOT NULL,\r\n' +
    '  "status" TEXT NOT NULL DEFAULT \'valid\',\r\n' +
    '  "dailyLimit" INTEGER NOT NULL DEFAULT 25,\r\n' +
    '  "sentToday" INTEGER NOT NULL DEFAULT 0,\r\n' +
    '  "lastSyncCursor" TEXT,\r\n' +
    '  "updatedAt" TEXT NOT NULL,\r\n' +
    '  UNIQUE("tenantId", "profileId")\r\n' +
    ');\r\n\r\n' +
    '-- Table: fb_task_queue\r\n' +
    'CREATE TABLE IF NOT EXISTS "fb_task_queue" (\r\n' +
    '  "id" TEXT PRIMARY KEY,\r\n' +
    '  "tenantId" TEXT NOT NULL,\r\n' +
    '  "profileId" TEXT NOT NULL,\r\n' +
    '  "taskType" TEXT NOT NULL,\r\n' +
    '  "payload" TEXT NOT NULL,\r\n' +
    '  "status" TEXT NOT NULL DEFAULT \'pending\',\r\n' +
    '  "createdAt" TEXT NOT NULL,\r\n' +
    '  "updatedAt" TEXT NOT NULL\r\n' +
    ');\r\n';
}

fs.writeFileSync(schemaPath, s, 'utf8');
console.log('✅ schema.sql perfectly aligned with all tables and columns.');
