-- ============================================================================
-- 008_commands_call_ownership.sql
-- Durable Call & Command Ownership Evidence for Reconnect Recovery
-- ============================================================================

ALTER TABLE "commands" ADD COLUMN IF NOT EXISTS "callId" TEXT;
ALTER TABLE "commands" ADD COLUMN IF NOT EXISTS "deviceId" TEXT;
ALTER TABLE "commands" ADD COLUMN IF NOT EXISTS "userId" TEXT;
ALTER TABLE "commands" ADD COLUMN IF NOT EXISTS "phone" TEXT;
ALTER TABLE "commands" ADD COLUMN IF NOT EXISTS "name" TEXT;

CREATE INDEX IF NOT EXISTS "idx_commands_call_id" ON "commands"("callId");
CREATE INDEX IF NOT EXISTS "idx_commands_tenant_call" ON "commands"("tenantId", "callId");
