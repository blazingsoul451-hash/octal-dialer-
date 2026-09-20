-- Additive Migration: 011_tenant_lead_routing_policy.sql
-- 1. Adds leadPoolMode and maxAgents to tenants table
-- 2. Adds assignedTo to leads table for agent-assigned leads mode

ALTER TABLE tenants ADD COLUMN IF NOT EXISTS leadPoolMode TEXT NOT NULL DEFAULT 'shared';
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS maxAgents INTEGER NOT NULL DEFAULT 10;
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS tier TEXT NOT NULL DEFAULT 'standard';

ALTER TABLE leads ADD COLUMN IF NOT EXISTS assignedTo TEXT;

CREATE INDEX IF NOT EXISTS idx_leads_tenant_assigned ON leads(tenantId, assignedTo);
CREATE INDEX IF NOT EXISTS idx_tenants_status ON tenants(status);
