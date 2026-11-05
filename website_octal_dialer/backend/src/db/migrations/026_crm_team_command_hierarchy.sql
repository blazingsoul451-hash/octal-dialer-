-- migrations/026_crm_team_command_hierarchy.sql
-- Enforces Owner -> Team Lead -> Agent hierarchy and Team Command delegation
BEGIN;

-- 1. Add hierarchy and Team Command delegation columns to users table
ALTER TABLE "users"
  ADD COLUMN IF NOT EXISTS "reportsToUserId" TEXT NULL,
  ADD COLUMN IF NOT EXISTS "teamCommandAccess" TEXT NOT NULL DEFAULT 'none',
  ADD COLUMN IF NOT EXISTS "canReassignWork" BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS "canApproveQuotes" BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS reports_to_user_id TEXT NULL,
  ADD COLUMN IF NOT EXISTS team_command_access TEXT NOT NULL DEFAULT 'none',
  ADD COLUMN IF NOT EXISTS can_reassign_work BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS can_approve_quotes BOOLEAN NOT NULL DEFAULT FALSE;

-- Composite indexes on users
CREATE INDEX IF NOT EXISTS idx_users_hierarchy
  ON "users" ("tenantId", "reportsToUserId");

CREATE INDEX IF NOT EXISTS idx_users_role_command_access
  ON "users" ("tenantId", role, "teamCommandAccess");

-- 2. Tenant members compatibility table
CREATE TABLE IF NOT EXISTS tenant_members (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  tenant_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'agent',
  reports_to_user_id TEXT NULL,
  team_command_access TEXT NOT NULL DEFAULT 'none' CHECK (team_command_access IN ('none', 'view', 'manage')),
  can_reassign_work BOOLEAN NOT NULL DEFAULT FALSE,
  can_approve_quotes BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_tenant_members_hierarchy
  ON tenant_members (tenant_id, reports_to_user_id);

CREATE INDEX IF NOT EXISTS idx_tenant_members_role_access
  ON tenant_members (tenant_id, role, team_command_access);

-- Seed tenant_members from users if empty
INSERT INTO tenant_members (tenant_id, user_id, role, reports_to_user_id, team_command_access, can_reassign_work, can_approve_quotes)
SELECT 
  "tenantId",
  id,
  role,
  "reportsToUserId",
  COALESCE("teamCommandAccess", 'none'),
  COALESCE("canReassignWork", false),
  COALESCE("canApproveQuotes", false)
FROM "users"
WHERE "tenantId" IS NOT NULL
ON CONFLICT DO NOTHING;

-- 3. Audit log for in-place Owner / Team Lead command actions
CREATE TABLE IF NOT EXISTS crm_command_audit_logs (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  tenant_id TEXT NOT NULL,
  actor_user_id TEXT NOT NULL,
  actor_role TEXT NOT NULL,
  target_agent_id TEXT NOT NULL,
  action_type TEXT NOT NULL,
  entity_type TEXT NULL,
  entity_id TEXT NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_crm_command_audit_tenant_created
  ON crm_command_audit_logs (tenant_id, created_at DESC);

COMMIT;
