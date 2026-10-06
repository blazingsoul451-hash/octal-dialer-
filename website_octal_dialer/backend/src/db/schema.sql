-- ============================================================================
-- OCTAL DIALER — COMPLETE POSTGRESQL PRODUCTION & DEV SCHEMA (34 TABLES)
-- ============================================================================

-- Table: tenants
CREATE TABLE IF NOT EXISTS "tenants" (
  "id" TEXT PRIMARY KEY,
  "name" TEXT NOT NULL,
  "slug" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'active',
  "createdAt" TEXT NOT NULL DEFAULT '',
  "updatedAt" TEXT NOT NULL DEFAULT '',
  "country" TEXT DEFAULT 'US',
  "logoUrl" TEXT,
  "ownerEmail" TEXT,
  "leadPoolMode" TEXT NOT NULL DEFAULT 'shared',
  "maxAgents" INTEGER NOT NULL DEFAULT 10,
  "tier" TEXT NOT NULL DEFAULT 'standard',
  "customerType" TEXT NOT NULL DEFAULT 'COMPANY' CHECK ("customerType" IN ('COMPANY', 'PERSONAL')),
  "maxTeamVisibility" TEXT NOT NULL DEFAULT 'TEAM_COLLABORATE' CHECK ("maxTeamVisibility" IN ('OWN', 'TEAM_READ', 'TEAM_COLLABORATE'))
);

-- Table: plans
CREATE TABLE IF NOT EXISTS "plans" (
  "id" TEXT PRIMARY KEY,
  "name" TEXT NOT NULL,
  "priceMonthly" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "priceYearly" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "status" TEXT NOT NULL DEFAULT 'active',
  "createdAt" TEXT NOT NULL DEFAULT '',
  "updatedAt" TEXT NOT NULL DEFAULT '',
  "isPublic" INTEGER DEFAULT 1,
  "billingInterval" TEXT DEFAULT 'monthly',
  "description" TEXT DEFAULT '',
  "sortOrder" INTEGER DEFAULT 0
);

-- Table: plan_features
CREATE TABLE IF NOT EXISTS "plan_features" (
  "planId" TEXT NOT NULL,
  "featureKey" TEXT NOT NULL,
  "value" TEXT NOT NULL,
  PRIMARY KEY ("planId", "featureKey")
);

-- Table: users
CREATE TABLE IF NOT EXISTS "users" (
  "id" TEXT PRIMARY KEY,
  "username" TEXT NOT NULL,
  "passwordHash" TEXT NOT NULL,
  "role" TEXT NOT NULL DEFAULT 'agent',
  "createdAt" TEXT NOT NULL DEFAULT '',
  "tenantId" TEXT,
  "email" TEXT,
  "googleId" TEXT,
  "authProvider" TEXT DEFAULT 'local',
  "resetToken" TEXT,
  "resetTokenExpires" TEXT,
  "updatedAt" TEXT,
  "emailVerified" INTEGER DEFAULT 0,
  "emailVerifiedAt" TEXT,
  "needsProfileSetup" INTEGER DEFAULT 0,
  "displayName" TEXT,
  "phone" TEXT,
  "status" TEXT NOT NULL DEFAULT 'Active',
  "ipRestrictions" TEXT,
  "avatar_url" TEXT,
  "roleId" TEXT,
  "onboardingStatus" TEXT NOT NULL DEFAULT 'NONE'
);

-- Table: custom_roles
CREATE TABLE IF NOT EXISTS "custom_roles" (
  "id" TEXT PRIMARY KEY,
  "roleName" TEXT NOT NULL,
  "description" TEXT,
  "permissions" TEXT NOT NULL,
  "createdBy" TEXT NOT NULL,
  "createdAt" TEXT NOT NULL DEFAULT '',
  "tenantId" TEXT DEFAULT 'tenant_default',
  "status" TEXT NOT NULL DEFAULT 'Active'
);

-- Table: module_tools
CREATE TABLE IF NOT EXISTS "module_tools" (
  "id" TEXT PRIMARY KEY,
  "moduleId" TEXT NOT NULL,
  "toolKey" TEXT NOT NULL,
  "toolLabel" TEXT NOT NULL,
  "enabledGlobally" INTEGER NOT NULL DEFAULT 1
);

-- Table: user_permissions
CREATE TABLE IF NOT EXISTS "user_permissions" (
  "id" TEXT PRIMARY KEY,
  "userId" TEXT NOT NULL,
  "moduleId" TEXT NOT NULL,
  "enabled" INTEGER NOT NULL DEFAULT 1,
  "grantedBy" TEXT,
  "grantedAt" TEXT NOT NULL DEFAULT '',
  "tenantId" TEXT
);

-- Table: user_tool_permissions
CREATE TABLE IF NOT EXISTS "user_tool_permissions" (
  "id" TEXT PRIMARY KEY,
  "userId" TEXT NOT NULL,
  "toolId" TEXT NOT NULL,
  "enabled" INTEGER NOT NULL DEFAULT 1,
  "tenantId" TEXT
);

-- Table: system_settings
CREATE TABLE IF NOT EXISTS "system_settings" (
  "id" TEXT PRIMARY KEY,
  "category" TEXT NOT NULL,
  "settingKey" TEXT NOT NULL,
  "settingValue" TEXT NOT NULL,
  "dataType" TEXT NOT NULL DEFAULT 'string',
  "description" TEXT,
  "updatedBy" TEXT,
  "updatedAt" TEXT NOT NULL DEFAULT ''
);

-- Table: system_metrics
CREATE TABLE IF NOT EXISTS "system_metrics" (
  "id" TEXT PRIMARY KEY,
  "metricType" TEXT NOT NULL,
  "metricValue" DOUBLE PRECISION NOT NULL,
  "unit" TEXT,
  "timestamp" TEXT NOT NULL DEFAULT ''
);

-- Table: api_keys
CREATE TABLE IF NOT EXISTS "api_keys" (
  "id" TEXT PRIMARY KEY,
  "keyName" TEXT NOT NULL,
  "keyHash" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "scopes" TEXT NOT NULL,
  "expiresAt" TEXT,
  "lastUsedAt" TEXT,
  "createdAt" TEXT NOT NULL DEFAULT '',
  "revokedAt" TEXT,
  "tenantId" TEXT
);

-- Table: sessions_store
CREATE TABLE IF NOT EXISTS "sessions_store" (
  "id" TEXT PRIMARY KEY,
  "userId" TEXT,
  "token" TEXT NOT NULL,
  "expiresAt" TEXT NOT NULL,
  "createdAt" TEXT NOT NULL DEFAULT ''
);

-- Table: subscriptions
CREATE TABLE IF NOT EXISTS "subscriptions" (
  "id" TEXT PRIMARY KEY,
  "tenantId" TEXT NOT NULL,
  "planId" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'active',
  "currentPeriodStart" TEXT NOT NULL DEFAULT '',
  "currentPeriodEnd" TEXT NOT NULL,
  "createdAt" TEXT NOT NULL DEFAULT '',
  "updatedAt" TEXT NOT NULL DEFAULT '',
  "provider" TEXT DEFAULT 'manual',
  "providerCustomerId" TEXT,
  "providerSubscriptionId" TEXT,
  "providerCheckoutId" TEXT,
  "cancelAtPeriodEnd" INTEGER DEFAULT 0,
  "cancelledAt" TEXT,
  "trialStart" TEXT,
  "trialEnd" TEXT,
  "gracePeriodEnd" TEXT
);

-- Table: billing_events
CREATE TABLE IF NOT EXISTS "billing_events" (
  "id" TEXT PRIMARY KEY,
  "provider" TEXT NOT NULL,
  "providerEventId" TEXT NOT NULL,
  "eventType" TEXT NOT NULL,
  "tenantId" TEXT,
  "subscriptionId" TEXT,
  "payload" TEXT,
  "processedAt" TEXT NOT NULL DEFAULT '',
  "createdAt" TEXT NOT NULL DEFAULT '',
  "eventTimestamp" TEXT
);

-- Table: pending_signups
CREATE TABLE IF NOT EXISTS "pending_signups" (
  "id" TEXT PRIMARY KEY,
  "email" TEXT NOT NULL,
  "username" TEXT NOT NULL,
  "passwordHash" TEXT NOT NULL,
  "codeHash" TEXT NOT NULL,
  "attempts" INTEGER DEFAULT 0,
  "resendCount" INTEGER DEFAULT 0,
  "lastSentAt" TEXT NOT NULL,
  "expiresAt" TEXT NOT NULL,
  "verifiedAt" TEXT,
  "ip" TEXT,
  "tenantId" TEXT DEFAULT 'tenant_default',
  "createdAt" TEXT NOT NULL
);

-- Table: campaigns
CREATE TABLE IF NOT EXISTS "campaigns" (
  "id" TEXT PRIMARY KEY,
  "name" TEXT NOT NULL,
  "fileName" TEXT NOT NULL DEFAULT '',
  "leadCount" INTEGER NOT NULL DEFAULT 0,
  "status" TEXT NOT NULL DEFAULT 'ACTIVE',
  "createdAt" TEXT NOT NULL,
  "tenantId" TEXT
);

-- Table: leads
CREATE TABLE IF NOT EXISTS "leads" (
  "id" TEXT PRIMARY KEY,
  "campaignId" TEXT NOT NULL,
  "name" TEXT NOT NULL DEFAULT '',
  "phone" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'PENDING',
  "outcome" TEXT,
  "duration" DOUBLE PRECISION,
  "lockedBy" TEXT,
  "lockedAt" TEXT,
  "createdAt" TEXT NOT NULL DEFAULT '',
  "tenantId" TEXT,
  "address" TEXT,
  "listingId" TEXT,
  "assignedTo" TEXT,
  "crmCompanyId" TEXT,
  "contactId" TEXT,
  "requirement" TEXT,
  "country" TEXT,
  "email" TEXT
);

-- Table: call_attempts
CREATE TABLE IF NOT EXISTS "call_attempts" (
  "id" TEXT PRIMARY KEY,
  "leadId" TEXT NOT NULL,
  "commandId" TEXT,
  "deviceId" TEXT,
  "status" TEXT NOT NULL DEFAULT 'INITIATED',
  "startedAt" TEXT NOT NULL DEFAULT '',
  "endedAt" TEXT,
  "tenantId" TEXT
);

-- Table: call_events
CREATE TABLE IF NOT EXISTS "call_events" (
  "id" TEXT PRIMARY KEY,
  "attemptId" TEXT NOT NULL,
  "event" TEXT NOT NULL,
  "timestamp" TEXT NOT NULL DEFAULT '',
  "tenantId" TEXT
);

-- Table: call_logs
CREATE TABLE IF NOT EXISTS "call_logs" (
  "id" TEXT PRIMARY KEY,
  "leadId" TEXT NOT NULL,
  "leadName" TEXT NOT NULL DEFAULT '',
  "leadPhone" TEXT NOT NULL DEFAULT '',
  "campaignName" TEXT NOT NULL DEFAULT '',
  "outcome" TEXT NOT NULL DEFAULT '',
  "duration" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "timestamp" TEXT NOT NULL,
  "tenantId" TEXT
);

-- Table: dispositions
CREATE TABLE IF NOT EXISTS "dispositions" (
  "id" TEXT PRIMARY KEY,
  "leadId" TEXT NOT NULL,
  "outcome" TEXT NOT NULL,
  "notes" TEXT,
  "loggedAt" TEXT NOT NULL DEFAULT '',
  "tenantId" TEXT
);

-- Table: devices
CREATE TABLE IF NOT EXISTS "devices" (
  "id" TEXT PRIMARY KEY,
  "name" TEXT NOT NULL,
  "btAddress" TEXT,
  "osType" TEXT,
  "ipAddress" TEXT,
  "status" TEXT NOT NULL DEFAULT 'OFFLINE',
  "lastSeenAt" TEXT,
  "createdAt" TEXT NOT NULL DEFAULT '',
  "tenantId" TEXT,
  "userId" TEXT,
  "platform" TEXT DEFAULT 'android',
  "appVersion" TEXT DEFAULT '1.0.0',
  "deviceUid" TEXT,
  "isRevoked" INTEGER DEFAULT 0,
  "updatedAt" TEXT
);

-- Table: commands
CREATE TABLE IF NOT EXISTS "commands" (
  "id" TEXT PRIMARY KEY,
  "leadId" TEXT NOT NULL,
  "sessionId" TEXT NOT NULL,
  "issuedAt" TEXT NOT NULL DEFAULT '',
  "expiresAt" TEXT NOT NULL,
  "tenantId" TEXT,
  "callId" TEXT,
  "deviceId" TEXT,
  "userId" TEXT,
  "phone" TEXT,
  "name" TEXT
);

-- Table: suppression_list
CREATE TABLE IF NOT EXISTS "suppression_list" (
  "id" TEXT PRIMARY KEY,
  "phone" TEXT NOT NULL,
  "reason" TEXT,
  "source" TEXT,
  "addedAt" TEXT NOT NULL DEFAULT '',
  "tenantId" TEXT
);

-- Table: audit_logs
CREATE TABLE IF NOT EXISTS "audit_logs" (
  "id" TEXT PRIMARY KEY,
  "action" TEXT NOT NULL,
  "entityType" TEXT,
  "entityId" TEXT,
  "performedBy" TEXT,
  "details" TEXT,
  "timestamp" TEXT NOT NULL DEFAULT '',
  "tenantId" TEXT
);

-- Table: audit_logs_admin
CREATE TABLE IF NOT EXISTS "audit_logs_admin" (
  "id" TEXT PRIMARY KEY,
  "userId" TEXT,
  "username" TEXT NOT NULL DEFAULT 'system',
  "action" TEXT NOT NULL,
  "targetType" TEXT,
  "targetId" TEXT,
  "details" TEXT,
  "ipAddress" TEXT,
  "userAgent" TEXT,
  "timestamp" TEXT NOT NULL DEFAULT '',
  "tenantId" TEXT
);

-- Table: ota_versions
CREATE TABLE IF NOT EXISTS "ota_versions" (
  "id" TEXT PRIMARY KEY,
  "version" TEXT NOT NULL,
  "buildNumber" INTEGER NOT NULL DEFAULT 0,
  "apkHash" TEXT,
  "signature" TEXT,
  "releaseNotes" TEXT,
  "isActive" INTEGER NOT NULL DEFAULT 0,
  "uploadedAt" TEXT NOT NULL DEFAULT ''
);
CREATE UNIQUE INDEX IF NOT EXISTS "idx_ota_versions_version" ON "ota_versions" ("version");

-- Table: email_leads
CREATE TABLE IF NOT EXISTS "email_leads" (
  "id" INTEGER PRIMARY KEY,
  "email" TEXT NOT NULL,
  "name" TEXT NOT NULL DEFAULT 'Client',
  "company" TEXT NOT NULL DEFAULT '',
  "status" TEXT NOT NULL DEFAULT 'pending',
  "stage" INTEGER NOT NULL DEFAULT 1,
  "lastSentAt" TEXT,
  "createdAt" TEXT NOT NULL DEFAULT '',
  "tenantId" TEXT
);

-- Table: email_accounts
CREATE TABLE IF NOT EXISTS "email_accounts" (
  "id" INTEGER PRIMARY KEY,
  "email" TEXT NOT NULL,
  "password" TEXT NOT NULL,
  "senderName" TEXT,
  "smtpHost" TEXT NOT NULL DEFAULT 'smtp.office365.com',
  "smtpPort" INTEGER NOT NULL DEFAULT 587,
  "status" TEXT NOT NULL DEFAULT 'active',
  "createdAt" TEXT NOT NULL DEFAULT '',
  "tenantId" TEXT,
  "authType" TEXT DEFAULT 'password',
  "refreshToken" TEXT,
  "accessToken" TEXT
);

-- Table: email_templates
CREATE TABLE IF NOT EXISTS "email_templates" (
  "id" INTEGER PRIMARY KEY,
  "subject" TEXT NOT NULL,
  "body" TEXT NOT NULL,
  "stage" INTEGER NOT NULL DEFAULT 1,
  "createdAt" TEXT NOT NULL DEFAULT '',
  "templateType" TEXT DEFAULT 'campaign',
  "systemTemplate" INTEGER DEFAULT 0,
  "tenantId" TEXT
);

-- Table: scraped_leads
CREATE TABLE IF NOT EXISTS "scraped_leads" (
  "id" TEXT PRIMARY KEY,
  "source" TEXT NOT NULL,
  "campaignId" TEXT,
  "businessName" TEXT,
  "phone" TEXT,
  "email" TEXT,
  "address" TEXT,
  "website" TEXT,
  "socialLinks" TEXT,
  "rawData" TEXT,
  "status" TEXT NOT NULL DEFAULT 'new',
  "scrapedBy" TEXT NOT NULL,
  "scrapedAt" TEXT NOT NULL DEFAULT '',
  "tenantId" TEXT
);

-- Table: module_settings
CREATE TABLE IF NOT EXISTS "module_settings" (
  "id" TEXT PRIMARY KEY,
  "moduleId" TEXT NOT NULL,
  "userId" TEXT,
  "settingKey" TEXT NOT NULL,
  "settingValue" TEXT NOT NULL,
  "updatedAt" TEXT NOT NULL DEFAULT '',
  "tenantId" TEXT
);

-- Table: crm_follow_ups
CREATE TABLE IF NOT EXISTS "crm_follow_ups" (
  "id" TEXT PRIMARY KEY,
  "leadId" TEXT NOT NULL,
  "leadName" TEXT NOT NULL DEFAULT '',
  "leadPhone" TEXT NOT NULL DEFAULT '',
  "campaignId" TEXT,
  "campaignName" TEXT NOT NULL DEFAULT '',
  "tenantId" TEXT NOT NULL,
  "userId" TEXT,
  "assignedAgent" TEXT,
  "assignedTo" TEXT,
  "scheduledAt" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'pending',
  "notes" TEXT,
  "createdAt" TEXT NOT NULL DEFAULT '',
  "updatedAt" TEXT NOT NULL DEFAULT ''
);

-- Table: lead_activities
CREATE TABLE IF NOT EXISTS "lead_activities" (
  "id" TEXT PRIMARY KEY,
  "leadId" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "userId" TEXT,
  "username" TEXT,
  "eventType" TEXT NOT NULL,
  "description" TEXT NOT NULL,
  "metadata" TEXT,
  "createdAt" TEXT NOT NULL DEFAULT ''
);

-- Table: daily_campaign_activity
CREATE TABLE IF NOT EXISTS "daily_campaign_activity" (
  "id" TEXT PRIMARY KEY,
  "tenantId" TEXT NOT NULL,
  "campaignId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "activityDate" TEXT NOT NULL,
  "workingSeconds" INTEGER NOT NULL DEFAULT 0,
  "talkSeconds" INTEGER NOT NULL DEFAULT 0,
  "callsPlaced" INTEGER NOT NULL DEFAULT 0,
  "callsAnswered" INTEGER NOT NULL DEFAULT 0,
  "lastState" TEXT NOT NULL DEFAULT 'PAUSED',
  "lastHeartbeat" TEXT NOT NULL,
  UNIQUE("tenantId", "campaignId", "userId", "activityDate")
);

-- Performance & Multi-Tenant Indexes
CREATE INDEX IF NOT EXISTS "idx_leads_tenant_camp_status" ON "leads"("tenantId", "campaignId", "status");
CREATE INDEX IF NOT EXISTS "idx_leads_locked" ON "leads"("tenantId", "lockedBy");
CREATE INDEX IF NOT EXISTS "idx_call_logs_tenant_ts" ON "call_logs"("tenantId", "timestamp");
CREATE INDEX IF NOT EXISTS "idx_campaigns_tenant" ON "campaigns"("tenantId");
CREATE INDEX IF NOT EXISTS "idx_devices_tenant" ON "devices"("tenantId");
CREATE INDEX IF NOT EXISTS "idx_users_tenant" ON "users"("tenantId");
CREATE INDEX IF NOT EXISTS "idx_users_email" ON "users"("email");
CREATE INDEX IF NOT EXISTS "idx_users_googleId" ON "users"("googleId");
CREATE INDEX IF NOT EXISTS "idx_suppression_tenant_phone" ON "suppression_list"("tenantId", "phone");
CREATE INDEX IF NOT EXISTS "idx_crm_follow_ups_tenant" ON "crm_follow_ups"("tenantId");
CREATE INDEX IF NOT EXISTS "idx_lead_activities_lead" ON "lead_activities"("leadId");
CREATE INDEX IF NOT EXISTS "idx_lead_activities_tenant_lead" ON "lead_activities"("tenantId", "leadId");
CREATE INDEX IF NOT EXISTS "idx_daily_campaign_act" ON "daily_campaign_activity"("tenantId", "userId", "activityDate");
CREATE INDEX IF NOT EXISTS "idx_dispositions_tenant_lead" ON "dispositions"("tenantId", "leadId");
CREATE INDEX IF NOT EXISTS "idx_audit_logs_tenant_ts" ON "audit_logs"("tenantId", "timestamp");
CREATE INDEX IF NOT EXISTS "idx_email_leads_tenant_status" ON "email_leads"("tenantId", "status");
CREATE INDEX IF NOT EXISTS "idx_email_accounts_tenant" ON "email_accounts"("tenantId");
CREATE INDEX IF NOT EXISTS "idx_email_templates_tenant" ON "email_templates"("tenantId");
CREATE INDEX IF NOT EXISTS "idx_scraped_leads_tenant" ON "scraped_leads"("tenantId");
CREATE INDEX IF NOT EXISTS "idx_subscriptions_tenant" ON "subscriptions"("tenantId");
CREATE INDEX IF NOT EXISTS "idx_user_permissions_tenant_user" ON "user_permissions"("tenantId", "userId");

-- Table: teams
CREATE TABLE IF NOT EXISTS "teams" (
  "id" TEXT PRIMARY KEY,
  "name" TEXT NOT NULL,
  "description" TEXT DEFAULT '',
  "leaderId" TEXT,
  "tenantId" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'Active',
  "createdAt" TEXT NOT NULL,
  "updatedAt" TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS "idx_teams_tenant" ON "teams"("tenantId");
CREATE INDEX IF NOT EXISTS "idx_teams_leader" ON "teams"("leaderId");

-- Table: team_members
CREATE TABLE IF NOT EXISTS "team_members" (
  "id" TEXT PRIMARY KEY,
  "teamId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "roleInTeam" TEXT NOT NULL DEFAULT 'member',
  "joinedAt" TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS "idx_team_members_tenant_user" ON "team_members"("tenantId", "userId");
CREATE INDEX IF NOT EXISTS "idx_team_members_tenant_team" ON "team_members"("tenantId", "teamId");

-- Table: campaign_teams
CREATE TABLE IF NOT EXISTS "campaign_teams" (
  "id" TEXT PRIMARY KEY,
  "campaignId" TEXT NOT NULL,
  "teamId" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "assignedAt" TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS "idx_campaign_teams_tenant_team" ON "campaign_teams"("tenantId", "teamId");
CREATE INDEX IF NOT EXISTS "idx_campaign_teams_tenant_camp" ON "campaign_teams"("tenantId", "campaignId");

-- Table: revoked_tokens (Cryptographic token revocation for stateless JWTs)
CREATE TABLE IF NOT EXISTS "revoked_tokens" (
  "token" TEXT PRIMARY KEY,
  "revokedAt" TEXT NOT NULL,
  "expiresAt" TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS "idx_revoked_tokens_expiresAt" ON "revoked_tokens"("expiresAt");

-- Table: call_outcomes (Durable terminal call outcome ledger & deduplication)
CREATE TABLE IF NOT EXISTS "call_outcomes" (
  "id" TEXT PRIMARY KEY,
  "tenantId" TEXT NOT NULL,
  "callId" TEXT NOT NULL,
  "commandId" TEXT,
  "leadId" TEXT,
  "phone" TEXT NOT NULL,
  "name" TEXT,
  "reason" TEXT NOT NULL,
  "duration" INTEGER NOT NULL DEFAULT 0,
  "answered" INTEGER NOT NULL DEFAULT 0,
  "finalizedAt" TEXT NOT NULL,
  "phoneDeviceId" TEXT,
  "userId" TEXT,
  UNIQUE("tenantId", "callId")
);
CREATE INDEX IF NOT EXISTS "idx_call_outcomes_tenant_call" ON "call_outcomes"("tenantId", "callId");
CREATE INDEX IF NOT EXISTS "idx_call_outcomes_tenant_cmd" ON "call_outcomes"("tenantId", "commandId");

-- Table: call_dispatch_journal (Immutable pre-dispatch call journal for authoritative identity & recovery authorization)
CREATE TABLE IF NOT EXISTS "call_dispatch_journal" (
  "callId" TEXT PRIMARY KEY,
  "tenantId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "deviceId" TEXT NOT NULL,
  "sessionId" TEXT,
  "bindingGeneration" BIGINT DEFAULT 1,
  "destination" TEXT NOT NULL,
  "name" TEXT,
  "commandId" TEXT,
  "leadId" TEXT,
  "campaignId" TEXT,
  "simSlot" INTEGER,
  "protocolVersion" TEXT DEFAULT '1.0',
  "dispatchedAt" TEXT NOT NULL,
  "replayExpiresAt" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'DISPATCHED'
);
CREATE INDEX IF NOT EXISTS "idx_call_journal_tenant_call" ON "call_dispatch_journal"("tenantId", "callId");
CREATE INDEX IF NOT EXISTS "idx_call_journal_tenant_cmd" ON "call_dispatch_journal"("tenantId", "commandId");
CREATE INDEX IF NOT EXISTS "idx_call_journal_replay_exp" ON "call_dispatch_journal"("replayExpiresAt");

-- Table: teams
CREATE TABLE IF NOT EXISTS "teams" (
  "id" TEXT PRIMARY KEY,
  "name" TEXT NOT NULL,
  "description" TEXT DEFAULT '',
  "leaderId" TEXT,
  "tenantId" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'active',
  "createdAt" TEXT NOT NULL,
  "updatedAt" TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS "idx_teams_tenant" ON "teams"("tenantId");
CREATE INDEX IF NOT EXISTS "idx_teams_leader" ON "teams"("leaderId");

-- Table: team_members
CREATE TABLE IF NOT EXISTS "team_members" (
  "id" TEXT PRIMARY KEY,
  "teamId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "roleInTeam" TEXT NOT NULL DEFAULT 'member',
  "joinedAt" TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS "idx_team_members_tenant_user" ON "team_members"("tenantId", "userId");
CREATE INDEX IF NOT EXISTS "idx_team_members_tenant_team" ON "team_members"("tenantId", "teamId");

-- Table: campaign_teams
CREATE TABLE IF NOT EXISTS "campaign_teams" (
  "id" TEXT PRIMARY KEY,
  "campaignId" TEXT NOT NULL,
  "teamId" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "assignedAt" TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS "idx_campaign_teams_tenant_team" ON "campaign_teams"("tenantId", "teamId");
CREATE INDEX IF NOT EXISTS "idx_campaign_teams_tenant_camp" ON "campaign_teams"("tenantId", "campaignId");

-- Table: team_settings
CREATE TABLE IF NOT EXISTS "team_settings" (
  "id" TEXT PRIMARY KEY,
  "tenantId" TEXT NOT NULL,
  "teamId" TEXT NOT NULL,
  "leadVisibility" TEXT NOT NULL DEFAULT 'OWN' CHECK ("leadVisibility" IN ('OWN', 'TEAM_READ', 'TEAM_COLLABORATE')),
  "createdAt" TEXT NOT NULL DEFAULT '',
  "updatedAt" TEXT NOT NULL DEFAULT '',
  CONSTRAINT "uq_team_settings_tenant_team" UNIQUE ("tenantId", "teamId")
);
CREATE INDEX IF NOT EXISTS "idx_team_settings_tenant_team" ON "team_settings"("tenantId", "teamId");
CREATE INDEX IF NOT EXISTS "idx_leads_tenant_assigned" ON "leads"("tenantId", "assignedTo");

-- Table: tenant_module_entitlements (Platform Owner module ceiling per tenant)
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

-- ============================================================================
-- CRM MODULE SCHEMAS
-- ============================================================================

-- Table: crm_companies
CREATE TABLE IF NOT EXISTS "crm_companies" (
  "id" TEXT PRIMARY KEY,
  "tenantId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "industry" TEXT,
  "country" TEXT,
  "phone" TEXT,
  "email" TEXT,
  "website" TEXT,
  "address" TEXT,
  "status" TEXT NOT NULL DEFAULT 'Active',
  "paymentStatus" TEXT NOT NULL DEFAULT 'Trial',
  "assignedUserId" TEXT,
  "assignedTeamId" TEXT,
  "metadata" TEXT,
  "createdAt" TEXT NOT NULL DEFAULT '',
  "updatedAt" TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS "idx_crm_companies_tenant" ON "crm_companies"("tenantId");
CREATE INDEX IF NOT EXISTS "idx_crm_companies_status" ON "crm_companies"("tenantId", "status");
CREATE INDEX IF NOT EXISTS "idx_crm_companies_assigned_user" ON "crm_companies"("tenantId", "assignedUserId");

-- Table: crm_contacts
CREATE TABLE IF NOT EXISTS "crm_contacts" (
  "id" TEXT PRIMARY KEY,
  "tenantId" TEXT NOT NULL,
  "crmCompanyId" TEXT,
  "name" TEXT NOT NULL,
  "email" TEXT,
  "phone" TEXT,
  "roleTitle" TEXT,
  "notes" TEXT,
  "assignedUserId" TEXT,
  "createdAt" TEXT NOT NULL DEFAULT '',
  "updatedAt" TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS "idx_crm_contacts_tenant" ON "crm_contacts"("tenantId");
CREATE INDEX IF NOT EXISTS "idx_crm_contacts_company" ON "crm_contacts"("tenantId", "crmCompanyId");
CREATE INDEX IF NOT EXISTS "idx_crm_contacts_assigned_user" ON "crm_contacts"("tenantId", "assignedUserId");

-- Table: crm_tasks
CREATE TABLE IF NOT EXISTS "crm_tasks" (
  "id" TEXT PRIMARY KEY,
  "tenantId" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "description" TEXT,
  "taskType" TEXT NOT NULL DEFAULT 'call',
  "status" TEXT NOT NULL DEFAULT 'open',
  "priority" TEXT NOT NULL DEFAULT 'medium',
  "dueAt" TEXT NOT NULL,
  "completedAt" TEXT,
  "crmCompanyId" TEXT,
  "contactId" TEXT,
  "leadId" TEXT,
  "assignedUserId" TEXT,
  "assignedTeamId" TEXT,
  "outcome" TEXT,
  "outcomeRemarks" TEXT,
  "cancellationReason" TEXT,
  "createdByUserId" TEXT NOT NULL,
  "createdAt" TEXT NOT NULL DEFAULT '',
  "updatedAt" TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS "idx_crm_tasks_tenant" ON "crm_tasks"("tenantId");
CREATE INDEX IF NOT EXISTS "idx_crm_tasks_status" ON "crm_tasks"("tenantId", "status");
CREATE INDEX IF NOT EXISTS "idx_crm_tasks_assigned_user" ON "crm_tasks"("tenantId", "assignedUserId");
CREATE INDEX IF NOT EXISTS "idx_crm_tasks_lead" ON "crm_tasks"("tenantId", "leadId");
CREATE INDEX IF NOT EXISTS "idx_crm_tasks_dueAt" ON "crm_tasks"("tenantId", "dueAt");

-- Table: crm_notes
CREATE TABLE IF NOT EXISTS "crm_notes" (
  "id" TEXT PRIMARY KEY,
  "tenantId" TEXT NOT NULL,
  "entityType" TEXT NOT NULL,
  "entityId" TEXT NOT NULL,
  "category" TEXT NOT NULL DEFAULT 'general',
  "body" TEXT NOT NULL,
  "createdByUserId" TEXT NOT NULL,
  "createdByName" TEXT NOT NULL DEFAULT '',
  "createdAt" TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS "idx_crm_notes_entity" ON "crm_notes"("tenantId", "entityType", "entityId");
CREATE INDEX IF NOT EXISTS "idx_crm_notes_created" ON "crm_notes"("tenantId", "createdAt");

-- Table: crm_work_items (Deliverables, Tickets, Onboarding & Projects)
CREATE TABLE IF NOT EXISTS "crm_work_items" (
  "id" TEXT PRIMARY KEY,
  "tenantId" TEXT NOT NULL,
  "crmCompanyId" TEXT,
  "contactId" TEXT,
  "leadId" TEXT,
  "title" TEXT NOT NULL,
  "description" TEXT,
  "category" TEXT NOT NULL DEFAULT 'General',
  "subcategory" TEXT,
  "assignedTeamId" TEXT,
  "assignedUserId" TEXT,
  "priority" TEXT NOT NULL DEFAULT 'normal',
  "status" TEXT NOT NULL DEFAULT 'TODO',
  "dueAt" TEXT,
  "completedAt" TEXT,
  "createdByUserId" TEXT,
  "createdAt" TEXT NOT NULL DEFAULT '',
  "updatedAt" TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS "idx_crm_work_items_tenant" ON "crm_work_items"("tenantId");
CREATE INDEX IF NOT EXISTS "idx_crm_work_items_company" ON "crm_work_items"("tenantId", "crmCompanyId");
CREATE INDEX IF NOT EXISTS "idx_crm_work_items_user" ON "crm_work_items"("tenantId", "assignedUserId");
CREATE INDEX IF NOT EXISTS "idx_crm_work_items_status" ON "crm_work_items"("tenantId", "status");

-- Table: crm_pricing_rules (Configured by Company Owner per Tenant)
CREATE TABLE IF NOT EXISTS "crm_pricing_rules" (
  "id" TEXT PRIMARY KEY,
  "tenantId" TEXT NOT NULL UNIQUE,
  "currency" TEXT NOT NULL DEFAULT 'USD',
  "taxRate" NUMERIC(5,2) NOT NULL DEFAULT 0,
  "agentMaxDiscountPct" NUMERIC(5,2) NOT NULL DEFAULT 10,
  "teamLeadMaxDiscountPct" NUMERIC(5,2) NOT NULL DEFAULT 25,
  "packagesJson" TEXT NOT NULL,
  "addonsJson" TEXT NOT NULL,
  "perUserPriceMonthly" NUMERIC(10,2) NOT NULL DEFAULT 15.00,
  "perUserPriceAnnual" NUMERIC(10,2) NOT NULL DEFAULT 144.00,
  "updatedByUserId" TEXT,
  "createdAt" TEXT NOT NULL DEFAULT '',
  "updatedAt" TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS "idx_crm_pricing_rules_tenant" ON "crm_pricing_rules"("tenantId");

-- Table: crm_quotes (Commercial quotes generated by agents)
CREATE TABLE IF NOT EXISTS "crm_quotes" (
  "id" TEXT PRIMARY KEY,
  "tenantId" TEXT NOT NULL,
  "quoteNumber" TEXT NOT NULL,
  "crmCompanyId" TEXT,
  "contactId" TEXT,
  "leadId" TEXT,
  "packageId" TEXT,
  "packageName" TEXT,
  "userCount" INTEGER NOT NULL DEFAULT 1,
  "billingCycle" TEXT NOT NULL DEFAULT 'monthly',
  "currency" TEXT NOT NULL DEFAULT 'USD',
  "subtotal" NUMERIC(12,2) NOT NULL DEFAULT 0,
  "discountPct" NUMERIC(5,2) NOT NULL DEFAULT 0,
  "discountAmount" NUMERIC(12,2) NOT NULL DEFAULT 0,
  "taxAmount" NUMERIC(12,2) NOT NULL DEFAULT 0,
  "totalAmount" NUMERIC(12,2) NOT NULL DEFAULT 0,
  "status" TEXT NOT NULL DEFAULT 'DRAFT',
  "notes" TEXT,
  "validUntil" TEXT,
  "assignedUserId" TEXT,
  "createdByUserId" TEXT,
  "createdAt" TEXT NOT NULL DEFAULT '',
  "updatedAt" TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS "idx_crm_quotes_tenant" ON "crm_quotes"("tenantId");
CREATE INDEX IF NOT EXISTS "idx_crm_quotes_company" ON "crm_quotes"("tenantId", "crmCompanyId");
CREATE INDEX IF NOT EXISTS "idx_crm_quotes_lead" ON "crm_quotes"("tenantId", "leadId");
CREATE INDEX IF NOT EXISTS "idx_crm_quotes_status" ON "crm_quotes"("tenantId", "status");

-- Table: crm_quote_items (Snapshot line items)
CREATE TABLE IF NOT EXISTS "crm_quote_items" (
  "id" TEXT PRIMARY KEY,
  "tenantId" TEXT NOT NULL,
  "quoteId" TEXT NOT NULL,
  "itemType" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "quantity" INTEGER NOT NULL DEFAULT 1,
  "unitPrice" NUMERIC(12,2) NOT NULL DEFAULT 0,
  "lineTotal" NUMERIC(12,2) NOT NULL DEFAULT 0,
  "createdAt" TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS "idx_crm_quote_items_quote" ON "crm_quote_items"("tenantId", "quoteId");

-- Table: workspace_invitations (Pending and accepted tenant invitations)
CREATE TABLE IF NOT EXISTS "workspace_invitations" (
  "id" TEXT PRIMARY KEY,
  "tenantId" TEXT NOT NULL,
  "email" TEXT NOT NULL,
  "role" TEXT NOT NULL DEFAULT 'user' CHECK ("role" IN ('team_lead', 'user', 'agent')),
  "teamId" TEXT,
  "invitedByUserId" TEXT NOT NULL,
  "tokenHash" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'PENDING' CHECK ("status" IN ('PENDING', 'ACCEPTED', 'EXPIRED', 'REVOKED')),
  "initialModules" TEXT,
  "expiresAt" TEXT NOT NULL,
  "createdAt" TEXT NOT NULL,
  "acceptedAt" TEXT,
  "acceptedByUserId" TEXT
);
CREATE INDEX IF NOT EXISTS "idx_workspace_invitations_tenant" ON "workspace_invitations"("tenantId");
CREATE INDEX IF NOT EXISTS "idx_workspace_invitations_email" ON "workspace_invitations"("email");
CREATE INDEX IF NOT EXISTS "idx_workspace_invitations_tokenHash" ON "workspace_invitations"("tokenHash");
CREATE INDEX IF NOT EXISTS "idx_workspace_invitations_status" ON "workspace_invitations"("status");

-- Table: user_activity_logs (Granular audit trail for all workspace user & agent activities)
CREATE TABLE IF NOT EXISTS "user_activity_logs" (
  "id" TEXT PRIMARY KEY,
  "tenantId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "username" TEXT NOT NULL,
  "action" TEXT NOT NULL,
  "resourceType" TEXT NOT NULL DEFAULT 'system',
  "resourceId" TEXT,
  "details" TEXT,
  "ipAddress" TEXT,
  "userAgent" TEXT,
  "timestamp" TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS "idx_user_activity_logs_tenant" ON "user_activity_logs"("tenantId");
CREATE INDEX IF NOT EXISTS "idx_user_activity_logs_user" ON "user_activity_logs"("tenantId", "userId");
CREATE INDEX IF NOT EXISTS "idx_user_activity_logs_action" ON "user_activity_logs"("tenantId", "action");
CREATE INDEX IF NOT EXISTS "idx_user_activity_logs_time" ON "user_activity_logs"("tenantId", "timestamp" DESC);

-- Table: agent_daily_metrics (Pre-aggregated daily performance scoreboard for agents)
CREATE TABLE IF NOT EXISTS "agent_daily_metrics" (
  "id" TEXT PRIMARY KEY,
  "tenantId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "username" TEXT NOT NULL DEFAULT '',
  "date" TEXT NOT NULL,
  "totalCalls" INTEGER NOT NULL DEFAULT 0,
  "answeredCalls" INTEGER NOT NULL DEFAULT 0,
  "failedCalls" INTEGER NOT NULL DEFAULT 0,
  "busyCalls" INTEGER NOT NULL DEFAULT 0,
  "noAnswerCalls" INTEGER NOT NULL DEFAULT 0,
  "totalTalkSeconds" INTEGER NOT NULL DEFAULT 0,
  "avgTalkSeconds" INTEGER NOT NULL DEFAULT 0,
  "firstCallAt" TEXT,
  "lastCallAt" TEXT,
  "updatedAt" TEXT NOT NULL,
  CONSTRAINT "uq_agent_daily_metrics" UNIQUE ("tenantId", "userId", "date")
);
CREATE INDEX IF NOT EXISTS "idx_agent_daily_metrics_tenant_date" ON "agent_daily_metrics"("tenantId", "date" DESC);
CREATE INDEX IF NOT EXISTS "idx_agent_daily_metrics_user_date" ON "agent_daily_metrics"("tenantId", "userId", "date" DESC);

-- Table: company_messages (Direct administrative messages & support chat stream)
CREATE TABLE IF NOT EXISTS "company_messages" (
  "id" TEXT PRIMARY KEY,
  "tenantId" TEXT NOT NULL,
  "senderRole" TEXT NOT NULL DEFAULT 'super_admin',
  "senderId" TEXT,
  "senderName" TEXT NOT NULL DEFAULT 'Platform Administrator',
  "senderEmail" TEXT,
  "recipientEmail" TEXT NOT NULL,
  "recipientName" TEXT,
  "subject" TEXT NOT NULL,
  "message" TEXT NOT NULL,
  "channel" TEXT NOT NULL DEFAULT 'email',
  "deliveryStatus" TEXT NOT NULL DEFAULT 'sent',
  "deliveryError" TEXT,
  "metadata" TEXT,
  "createdAt" TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS "idx_company_messages_tenant" ON "company_messages"("tenantId");
CREATE INDEX IF NOT EXISTS "idx_company_messages_tenant_time" ON "company_messages"("tenantId", "createdAt" ASC);
CREATE INDEX IF NOT EXISTS "idx_company_messages_recipient" ON "company_messages"("recipientEmail");

