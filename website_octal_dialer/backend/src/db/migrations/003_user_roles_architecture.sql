-- ============================================================================
-- 003_user_roles_architecture.sql
-- Clean PostgreSQL Migration: Connect Users to Custom Roles with Referential
-- Integrity, Tenant Scoping, and Zero Duplicate Authorization Tables.
-- ============================================================================

-- 1. Add "roleId" to "users" table if not already present
ALTER TABLE users ADD COLUMN IF NOT EXISTS "roleId" TEXT;

-- 2. Add foreign key constraint linking users.roleId -> custom_roles.id
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'fk_users_role_id'
  ) THEN
    ALTER TABLE users
      ADD CONSTRAINT fk_users_role_id
      FOREIGN KEY ("roleId") REFERENCES custom_roles(id)
      ON DELETE SET NULL;
  END IF;
END $$;

-- 3. Create index for fast lookups on users.roleId
CREATE INDEX IF NOT EXISTS idx_users_roleId ON users("roleId");

-- 4. Add unique constraint on (tenantId, roleName) in custom_roles
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'uq_custom_roles_tenant_name'
  ) THEN
    ALTER TABLE custom_roles
      ADD CONSTRAINT uq_custom_roles_tenant_name
      UNIQUE ("tenantId", "roleName");
  END IF;
END $$;

-- 5. Backfill existing users roleId based on matching roleName if unlinked
UPDATE users u
SET "roleId" = cr.id
FROM custom_roles cr
WHERE u."roleId" IS NULL
  AND (
    (LOWER(u.role) = 'admin' AND LOWER(cr."roleName") = 'administrator' AND (cr."tenantId" = u."tenantId" OR cr."tenantId" = 'tenant_default'))
    OR
    (LOWER(u.role) IN ('agent', 'user') AND LOWER(cr."roleName") = 'agent' AND (cr."tenantId" = u."tenantId" OR cr."tenantId" = 'tenant_default'))
    OR
    (LOWER(u.role) = LOWER(cr."roleName") AND (cr."tenantId" = u."tenantId" OR cr."tenantId" = 'tenant_default'))
  );
