-- Additive Migration: 010_leads_branch_identity.sql
-- Adds persistent branch identity (address, listingId) to leads table for CRM provenance and branch deduplication

ALTER TABLE "leads" ADD COLUMN IF NOT EXISTS "address" TEXT;
ALTER TABLE "leads" ADD COLUMN IF NOT EXISTS "listingId" TEXT;

CREATE INDEX IF NOT EXISTS "idx_leads_tenant_listing" ON "leads"("tenantId", "listingId");
