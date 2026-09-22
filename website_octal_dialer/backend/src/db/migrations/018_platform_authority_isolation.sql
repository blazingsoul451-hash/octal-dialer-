-- ============================================================================
-- 018_platform_authority_isolation.sql
-- Migration 018: Strict Platform Authority and Customer Tenant Isolation
--
-- Enforces the fundamental architectural boundary:
-- 1. Platform Administrators (platform_admin, master_admin, super_admin) are
--    strictly detached from customer workspaces (tenantId = NULL).
-- 2. Platform Admins never consume customer seats.
-- 3. Platform Admins cannot be added to customer teams, campaigns, or lead queues.
-- ============================================================================

-- 1. Detach all platform administrators from customer tenants
UPDATE "users"
SET "tenantId" = NULL
WHERE LOWER("role") IN ('platform_admin', 'master_admin', 'super_admin')
  AND "tenantId" IS NOT NULL;

-- 2. Purge any historical accidental memberships of platform admins in customer teams
DELETE FROM "team_members"
WHERE "userId" IN (
  SELECT id FROM "users" WHERE LOWER("role") IN ('platform_admin', 'master_admin', 'super_admin')
);

-- 3. Unassign any customer leads assigned to platform admins
UPDATE "leads"
SET "assignedTo" = NULL
WHERE "assignedTo" IN (
  SELECT id FROM "users" WHERE LOWER("role") IN ('platform_admin', 'master_admin', 'super_admin')
);

-- 4. Unassign any customer CRM tasks assigned to platform admins
UPDATE "crm_tasks"
SET "assignedUserId" = NULL
WHERE "assignedUserId" IN (
  SELECT id FROM "users" WHERE LOWER("role") IN ('platform_admin', 'master_admin', 'super_admin')
);
