-- Additive Migration: 009_call_dispatch_journal.sql
-- Immutable durable pre-dispatch call journal for authoritative identity & recovery authorization

CREATE TABLE IF NOT EXISTS "call_dispatch_journal" (
  "callId" TEXT PRIMARY KEY,
  "tenantId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "deviceId" TEXT NOT NULL,
  "sessionId" TEXT,
  "bindingGeneration" BIGINT DEFAULT 1,
  "destination" TEXT NOT NULL,
  "name" TEXT,
  "commandId" TEXT,
  "leadId" TEXT,
  "campaignId" TEXT,
  "simSlot" INTEGER,
  "protocolVersion" TEXT DEFAULT '1.0',
  "dispatchedAt" TEXT NOT NULL,
  "replayExpiresAt" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'DISPATCHED'
);

CREATE INDEX IF NOT EXISTS "idx_call_journal_tenant_call" ON "call_dispatch_journal"("tenantId", "callId");
CREATE INDEX IF NOT EXISTS "idx_call_journal_tenant_cmd" ON "call_dispatch_journal"("tenantId", "commandId");
CREATE INDEX IF NOT EXISTS "idx_call_journal_replay_exp" ON "call_dispatch_journal"("replayExpiresAt");
