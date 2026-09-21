-- ============================================================================
-- MIGRATION 014: ACCESS ENTITLEMENTS HIERARCHY
-- Platform Owner -> Company Entitlement Ceiling -> User Assignment -> Effective Access
-- ============================================================================

-- 1. Tenant module entitlements table (Platform Owner sets the maximum module ceiling per company)
CREATE TABLE IF NOT EXISTS "tenant_module_entitlements" (
  "id" TEXT PRIMARY KEY,
  "tenantId" TEXT NOT NULL,
  "moduleId" TEXT NOT NULL,
  "enabled" INTEGER NOT NULL DEFAULT 1,
  "updatedBy" TEXT NOT NULL DEFAULT 'system',
  "updatedAt" TEXT NOT NULL DEFAULT '',
  CONSTRAINT "uq_tenant_module_entitlements_tenant_module" UNIQUE ("tenantId", "moduleId")
);

CREATE INDEX IF NOT EXISTS "idx_tenant_module_entitlements_tenant" ON "tenant_module_entitlements"("tenantId");
CREATE INDEX IF NOT EXISTS "idx_tenant_module_entitlements_module" ON "tenant_module_entitlements"("tenantId", "moduleId");

-- 2. Seed initial canonical module entitlements for all existing tenants if not present
INSERT INTO "tenant_module_entitlements" ("id", "tenantId", "moduleId", "enabled", "updatedBy", "updatedAt")
SELECT 
  'tme_' || md5(t.id || '_' || m.module_id),
  t.id,
  m.module_id,
  1,
  'system_bootstrap',
  to_char(CURRENT_TIMESTAMP, 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
FROM "tenants" t
CROSS JOIN (
  VALUES 
    ('crm'),
    ('campaigns'),
    ('leads'),
    ('dialer'),
    ('reports'),
    ('google_scraper'),
    ('auto_emailer'),
    ('facebook_scraper'),
    ('facebook_poster')
) AS m(module_id)
ON CONFLICT ("tenantId", "moduleId") DO NOTHING;
