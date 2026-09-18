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
  "ownerEmail" TEXT
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
  "roleId" TEXT
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
  "tenantId" TEXT
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
  "tenantId" TEXT
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
  "username" TEXT NOT NULL,
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


