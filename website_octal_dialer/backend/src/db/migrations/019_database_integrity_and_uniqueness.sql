-- ============================================================================
-- Migration 019: Database Integrity, Foreign Key Constraints & Identity Uniqueness
-- Phase 2 Release Gate: Strict Tenant Consistency & Global Identity Uniqueness
-- ============================================================================

-- 1. Reconcile duplicate platform admin identities if present
-- Safely archive admin_legacy, set status to Disabled, and invalidate any existing sessions
UPDATE users 
SET username = 'admin_legacy',
    email = 'admin_legacy@octaldialer.local',
    status = 'Disabled',
    "updatedAt" = NOW()
WHERE id = 'user_admin_106675d9';

DELETE FROM sessions_store WHERE "userId" = 'user_admin_106675d9';

-- 2. Add server-controlled onboardingStatus column
ALTER TABLE users ADD COLUMN IF NOT EXISTS "onboardingStatus" TEXT NOT NULL DEFAULT 'NONE';

-- Existing users with active workspaces are marked COMPLETED
UPDATE users SET "onboardingStatus" = 'COMPLETED' WHERE "tenantId" IS NOT NULL;

-- Platform roles are marked INELIGIBLE
UPDATE users SET "onboardingStatus" = 'INELIGIBLE' WHERE LOWER(role) IN ('platform_admin', 'master_admin', 'super_admin');

-- Clean orphaned tenantId references (users pointing to non-existent tenants) and quarantine them
UPDATE users 
SET "tenantId" = NULL, 
    status = 'Disabled', 
    "onboardingStatus" = 'INELIGIBLE', 
    "updatedAt" = NOW()
WHERE "tenantId" IS NOT NULL 
  AND "tenantId" NOT IN (SELECT id FROM tenants);

-- Quarantine any detached member accounts left over without workspace
UPDATE users
SET status = 'Disabled',
    "onboardingStatus" = 'INELIGIBLE',
    "updatedAt" = NOW()
WHERE "tenantId" IS NULL 
  AND LOWER(role) IN ('user', 'agent', 'team_lead')
  AND id NOT IN ('user_admin_de06b12c');

-- 3. Case-Insensitive Global Identity Uniqueness
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_lower_username 
ON users (LOWER(username));

CREATE UNIQUE INDEX IF NOT EXISTS idx_users_lower_email 
ON users (LOWER(email)) 
WHERE email IS NOT NULL AND email <> '';

-- 4. Single-Permission-Row Enforcement per (userId, moduleId)
-- Deduplicate any legacy multiple rows before creating constraint
DELETE FROM user_permissions a USING user_permissions b
WHERE a.id > b.id 
  AND a."userId" = b."userId" 
  AND a."moduleId" = b."moduleId";

CREATE UNIQUE INDEX IF NOT EXISTS idx_user_permissions_user_module_unique 
ON user_permissions ("userId", "moduleId");

-- 5. Foreign Key Integrity on Tenant & Membership Relations
DO $$
BEGIN
  -- Foreign key on users.tenantId -> tenants(id)
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints 
    WHERE constraint_name = 'fk_users_tenant' AND table_name = 'users'
  ) THEN
    ALTER TABLE users 
    ADD CONSTRAINT fk_users_tenant 
    FOREIGN KEY ("tenantId") REFERENCES tenants(id) ON DELETE SET NULL;
  END IF;

  -- Foreign key on teams.tenantId -> tenants(id)
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints 
    WHERE constraint_name = 'fk_teams_tenant' AND table_name = 'teams'
  ) THEN
    ALTER TABLE teams 
    ADD CONSTRAINT fk_teams_tenant 
    FOREIGN KEY ("tenantId") REFERENCES tenants(id) ON DELETE CASCADE;
  END IF;

  -- Foreign key on workspace_invitations.tenantId -> tenants(id)
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints 
    WHERE constraint_name = 'fk_invitations_tenant' AND table_name = 'workspace_invitations'
  ) THEN
    ALTER TABLE workspace_invitations 
    ADD CONSTRAINT fk_invitations_tenant 
    FOREIGN KEY ("tenantId") REFERENCES tenants(id) ON DELETE CASCADE;
  END IF;
END $$;
