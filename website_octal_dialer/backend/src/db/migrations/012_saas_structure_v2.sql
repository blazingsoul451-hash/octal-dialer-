-- ============================================================================
-- MIGRATION 012: SAAS STRUCTURE V2
-- Multi-Tenant Hierarchy: Platform Owner -> Company Owner -> Team Lead -> Member
-- Customer Classification: PERSONAL vs COMPANY
-- Team Visibility Policies: OWN | TEAM_READ | TEAM_COLLABORATE
-- ============================================================================

-- 1. Tenant customer classification & Company Maximum Policy
ALTER TABLE "tenants" ADD COLUMN IF NOT EXISTS "customerType" TEXT NOT NULL DEFAULT 'COMPANY';
ALTER TABLE "tenants" ADD COLUMN IF NOT EXISTS "maxTeamVisibility" TEXT NOT NULL DEFAULT 'TEAM_COLLABORATE';

-- 2. Team Settings for granular team-level visibility control
CREATE TABLE IF NOT EXISTS "team_settings" (
  "id" TEXT PRIMARY KEY,
  "tenantId" TEXT NOT NULL,
  "teamId" TEXT NOT NULL,
  "leadVisibility" TEXT NOT NULL DEFAULT 'OWN', -- 'OWN' | 'TEAM_READ' | 'TEAM_COLLABORATE'
  "createdAt" TEXT NOT NULL DEFAULT '',
  "updatedAt" TEXT NOT NULL DEFAULT '',
  CONSTRAINT "uq_team_settings_tenant_team" UNIQUE ("tenantId", "teamId")
);

CREATE INDEX IF NOT EXISTS "idx_team_settings_tenant_team" ON "team_settings"("tenantId", "teamId");
CREATE INDEX IF NOT EXISTS "idx_crm_follow_ups_tenant_assigned" ON "crm_follow_ups"("tenantId", "assignedTo");
CREATE INDEX IF NOT EXISTS "idx_team_members_user_team" ON "team_members"("userId", "teamId");
CREATE INDEX IF NOT EXISTS "idx_leads_tenant_assigned" ON "leads"("tenantId", "assignedTo");
