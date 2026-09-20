-- ============================================================================
-- MIGRATION 013: SAAS STRUCTURE V2 CORRECTIONS & INTEGRITY CONSTRAINTS
-- Enforces:
-- 1. Composite uniqueness on "team_settings"("tenantId", "teamId")
-- 2. CHECK constraint on "tenants"."customerType" ('COMPANY', 'PERSONAL')
-- 3. CHECK constraint on "tenants"."maxTeamVisibility" ('OWN', 'TEAM_READ', 'TEAM_COLLABORATE')
-- 4. CHECK constraint on "team_settings"."leadVisibility" ('OWN', 'TEAM_READ', 'TEAM_COLLABORATE')
-- ============================================================================

-- 1. Ensure composite unique constraint on "team_settings"("tenantId", "teamId")
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'uq_team_settings_tenant_team'
  ) THEN
    -- Check if duplicates exist first
    IF EXISTS (
      SELECT "tenantId", "teamId", COUNT(*) 
      FROM "team_settings" 
      GROUP BY "tenantId", "teamId" 
      HAVING COUNT(*) > 1
    ) THEN
      RAISE EXCEPTION 'Cannot add unique constraint uq_team_settings_tenant_team: duplicate records found in team_settings';
    END IF;

    ALTER TABLE "team_settings" ADD CONSTRAINT "uq_team_settings_tenant_team" UNIQUE ("tenantId", "teamId");
  END IF;
END
$$;

-- 2. Enforce CHECK constraint on "tenants"."customerType"
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_tenants_customer_type'
  ) THEN
    IF EXISTS (
      SELECT 1 FROM "tenants" 
      WHERE "customerType" IS NOT NULL AND "customerType" NOT IN ('COMPANY', 'PERSONAL')
    ) THEN
      RAISE EXCEPTION 'Cannot add check constraint chk_tenants_customer_type: invalid customerType values found in tenants';
    END IF;

    ALTER TABLE "tenants" ADD CONSTRAINT "chk_tenants_customer_type" CHECK ("customerType" IN ('COMPANY', 'PERSONAL'));
  END IF;
END
$$;

-- 3. Enforce CHECK constraint on "tenants"."maxTeamVisibility"
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_tenants_max_team_visibility'
  ) THEN
    IF EXISTS (
      SELECT 1 FROM "tenants" 
      WHERE "maxTeamVisibility" IS NOT NULL AND "maxTeamVisibility" NOT IN ('OWN', 'TEAM_READ', 'TEAM_COLLABORATE')
    ) THEN
      RAISE EXCEPTION 'Cannot add check constraint chk_tenants_max_team_visibility: invalid maxTeamVisibility values found in tenants';
    END IF;

    ALTER TABLE "tenants" ADD CONSTRAINT "chk_tenants_max_team_visibility" CHECK ("maxTeamVisibility" IN ('OWN', 'TEAM_READ', 'TEAM_COLLABORATE'));
  END IF;
END
$$;

-- 4. Enforce CHECK constraint on "team_settings"."leadVisibility"
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_team_settings_lead_visibility'
  ) THEN
    IF EXISTS (
      SELECT 1 FROM "team_settings" 
      WHERE "leadVisibility" IS NOT NULL AND "leadVisibility" NOT IN ('OWN', 'TEAM_READ', 'TEAM_COLLABORATE')
    ) THEN
      RAISE EXCEPTION 'Cannot add check constraint chk_team_settings_lead_visibility: invalid leadVisibility values found in team_settings';
    END IF;

    ALTER TABLE "team_settings" ADD CONSTRAINT "chk_team_settings_lead_visibility" CHECK ("leadVisibility" IN ('OWN', 'TEAM_READ', 'TEAM_COLLABORATE'));
  END IF;
END
$$;
