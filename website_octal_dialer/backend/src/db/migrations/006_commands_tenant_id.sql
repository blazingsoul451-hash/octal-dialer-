-- ============================================================================
-- 006_commands_tenant_id.sql
-- Multi-Tenant Scoping for Telephony Commands
-- 1. Add tenantId column to commands table if not exists
-- 2. Create index on (tenantId, expiresAt) for fast active-command queries
-- 3. Create index on (leadId) for fast idempotency lookups
-- ============================================================================

ALTER TABLE "commands" ADD COLUMN IF NOT EXISTS "tenantId" TEXT;

CREATE INDEX IF NOT EXISTS "idx_commands_tenant_expires" ON "commands"("tenantId", "expiresAt");
CREATE INDEX IF NOT EXISTS "idx_commands_lead" ON "commands"("leadId");
