-- Migration 021: Company Direct Messaging and Support Audit Trail
CREATE TABLE IF NOT EXISTS "company_messages" (
  "id" TEXT PRIMARY KEY,
  "tenantId" TEXT NOT NULL,
  "senderRole" TEXT NOT NULL DEFAULT 'super_admin',
  "senderId" TEXT,
  "senderName" TEXT NOT NULL DEFAULT 'Platform Administrator',
  "senderEmail" TEXT,
  "recipientEmail" TEXT NOT NULL,
  "recipientName" TEXT,
  "subject" TEXT NOT NULL,
  "message" TEXT NOT NULL,
  "channel" TEXT NOT NULL DEFAULT 'email',
  "deliveryStatus" TEXT NOT NULL DEFAULT 'sent',
  "deliveryError" TEXT,
  "metadata" TEXT,
  "createdAt" TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS "idx_company_messages_tenant" ON "company_messages"("tenantId");
CREATE INDEX IF NOT EXISTS "idx_company_messages_tenant_time" ON "company_messages"("tenantId", "createdAt" ASC);
CREATE INDEX IF NOT EXISTS "idx_company_messages_recipient" ON "company_messages"("recipientEmail");
