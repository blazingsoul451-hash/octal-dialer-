-- Migration 007: Durable Call Outcomes Ledger & Deduplication
CREATE TABLE IF NOT EXISTS "call_outcomes" (
  "id" TEXT PRIMARY KEY,
  "tenantId" TEXT NOT NULL,
  "callId" TEXT NOT NULL,
  "commandId" TEXT,
  "leadId" TEXT,
  "phone" TEXT NOT NULL,
  "name" TEXT,
  "reason" TEXT NOT NULL,
  "duration" INTEGER NOT NULL DEFAULT 0,
  "answered" INTEGER NOT NULL DEFAULT 0,
  "finalizedAt" TEXT NOT NULL,
  "phoneDeviceId" TEXT,
  "userId" TEXT,
  UNIQUE("tenantId", "callId")
);

CREATE INDEX IF NOT EXISTS "idx_call_outcomes_tenant_call" ON "call_outcomes"("tenantId", "callId");
CREATE INDEX IF NOT EXISTS "idx_call_outcomes_tenant_cmd" ON "call_outcomes"("tenantId", "commandId");
