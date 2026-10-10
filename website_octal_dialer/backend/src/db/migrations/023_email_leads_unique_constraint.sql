-- ============================================================================
-- 023_email_leads_unique_constraint.sql
-- Add Unique Constraint on ("tenantId", email) in email_leads for genuine deduplication
-- ============================================================================

-- 1. Safely deduplicate any existing duplicate emails per tenant before adding unique constraint
DELETE FROM email_leads a
USING email_leads b
WHERE a.ctid < b.ctid
  AND COALESCE(a."tenantId", '') = COALESCE(b."tenantId", '')
  AND LOWER(a.email) = LOWER(b.email);

-- 2. Drop legacy non-unique index if present
DROP INDEX IF EXISTS idx_email_leads_tenant_email;

-- 3. Add UNIQUE constraint on ("tenantId", email)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'uq_email_leads_tenant_email'
  ) THEN
    ALTER TABLE email_leads ADD CONSTRAINT uq_email_leads_tenant_email UNIQUE ("tenantId", email);
  END IF;
END $$;

-- 4. Re-grant privileges to octal_admin
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO octal_admin;
