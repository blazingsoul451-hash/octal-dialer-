-- ============================================================================
-- MIGRATION 015: CRM CORE SCHEMA (COMPANIES, CONTACTS, TASKS, NOTES)
-- ============================================================================

-- 1. CRM Companies (Client / Account / Prospect Businesses per Tenant)
CREATE TABLE IF NOT EXISTS crm_companies (
  id TEXT PRIMARY KEY,
  tenantId TEXT NOT NULL,
  name TEXT NOT NULL,
  industry TEXT,
  country TEXT,
  phone TEXT,
  email TEXT,
  website TEXT,
  address TEXT,
  status TEXT NOT NULL DEFAULT 'Active',
  paymentStatus TEXT NOT NULL DEFAULT 'Trial',
  assignedUserId TEXT,
  assignedTeamId TEXT,
  metadata TEXT,
  createdAt TEXT NOT NULL DEFAULT '',
  updatedAt TEXT NOT NULL DEFAULT ''
);

CREATE INDEX IF NOT EXISTS idx_crm_companies_tenant ON crm_companies("tenantId");
CREATE INDEX IF NOT EXISTS idx_crm_companies_status ON crm_companies("tenantId", status);
CREATE INDEX IF NOT EXISTS idx_crm_companies_assigned_user ON crm_companies("tenantId", "assignedUserId");

-- 2. CRM Contacts (Individual People at Client Companies)
CREATE TABLE IF NOT EXISTS crm_contacts (
  id TEXT PRIMARY KEY,
  "tenantId" TEXT NOT NULL,
  "crmCompanyId" TEXT,
  name TEXT NOT NULL,
  email TEXT,
  phone TEXT,
  "roleTitle" TEXT,
  notes TEXT,
  "assignedUserId" TEXT,
  "createdAt" TEXT NOT NULL DEFAULT '',
  "updatedAt" TEXT NOT NULL DEFAULT ''
);

CREATE INDEX IF NOT EXISTS idx_crm_contacts_tenant ON crm_contacts("tenantId");
CREATE INDEX IF NOT EXISTS idx_crm_contacts_company ON crm_contacts("tenantId", "crmCompanyId");
CREATE INDEX IF NOT EXISTS idx_crm_contacts_assigned_user ON crm_contacts("tenantId", "assignedUserId");

-- 3. Additive columns on canonical leads
ALTER TABLE leads ADD COLUMN IF NOT EXISTS "crmCompanyId" TEXT;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS "contactId" TEXT;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS requirement TEXT;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS country TEXT;

CREATE INDEX IF NOT EXISTS idx_leads_crm_company ON leads("tenantId", "crmCompanyId");
CREATE INDEX IF NOT EXISTS idx_leads_contact ON leads("tenantId", "contactId");

-- 4. CRM Tasks (Actionable to-dos, calls, meetings, follow-ups)
CREATE TABLE IF NOT EXISTS crm_tasks (
  id TEXT PRIMARY KEY,
  "tenantId" TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  "taskType" TEXT NOT NULL DEFAULT 'call',
  status TEXT NOT NULL DEFAULT 'open',
  priority TEXT NOT NULL DEFAULT 'medium',
  "dueAt" TEXT NOT NULL,
  "completedAt" TEXT,
  "crmCompanyId" TEXT,
  "contactId" TEXT,
  "leadId" TEXT,
  "assignedUserId" TEXT,
  "assignedTeamId" TEXT,
  outcome TEXT,
  "outcomeRemarks" TEXT,
  "cancellationReason" TEXT,
  "createdByUserId" TEXT NOT NULL,
  "createdAt" TEXT NOT NULL DEFAULT '',
  "updatedAt" TEXT NOT NULL DEFAULT ''
);

CREATE INDEX IF NOT EXISTS idx_crm_tasks_tenant ON crm_tasks("tenantId");
CREATE INDEX IF NOT EXISTS idx_crm_tasks_status ON crm_tasks("tenantId", status);
CREATE INDEX IF NOT EXISTS idx_crm_tasks_assigned_user ON crm_tasks("tenantId", "assignedUserId");
CREATE INDEX IF NOT EXISTS idx_crm_tasks_lead ON crm_tasks("tenantId", "leadId");
CREATE INDEX IF NOT EXISTS idx_crm_tasks_dueAt ON crm_tasks("tenantId", "dueAt");

-- 5. CRM Cross-Entity Notes
CREATE TABLE IF NOT EXISTS crm_notes (
  id TEXT PRIMARY KEY,
  "tenantId" TEXT NOT NULL,
  "entityType" TEXT NOT NULL,
  "entityId" TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'general',
  body TEXT NOT NULL,
  "createdByUserId" TEXT NOT NULL,
  "createdByName" TEXT NOT NULL DEFAULT '',
  "createdAt" TEXT NOT NULL DEFAULT ''
);

CREATE INDEX IF NOT EXISTS idx_crm_notes_entity ON crm_notes("tenantId", "entityType", "entityId");
CREATE INDEX IF NOT EXISTS idx_crm_notes_created ON crm_notes("tenantId", "createdAt");
