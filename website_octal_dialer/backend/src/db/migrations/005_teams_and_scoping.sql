-- ============================================================================
-- MIGRATION 005: TEAMS & CAMPAIGN SCOPING
-- Octal Dialer Organizational Hierarchy: Company/Tenant -> Users -> Roles -> Permissions -> Teams/Scoping -> Campaigns
-- ============================================================================

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
  "roleInTeam" TEXT NOT NULL DEFAULT 'member', -- 'leader' | 'member'
  "joinedAt" TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS "idx_team_members_tenant_user" ON "team_members"("tenantId", "userId");
CREATE INDEX IF NOT EXISTS "idx_team_members_tenant_team" ON "team_members"("tenantId", "teamId");

-- Table: campaign_teams (Mapping Campaigns to Teams for Scoping)
CREATE TABLE IF NOT EXISTS "campaign_teams" (
  "id" TEXT PRIMARY KEY,
  "campaignId" TEXT NOT NULL,
  "teamId" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "assignedAt" TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS "idx_campaign_teams_tenant_team" ON "campaign_teams"("tenantId", "teamId");
CREATE INDEX IF NOT EXISTS "idx_campaign_teams_tenant_camp" ON "campaign_teams"("tenantId", "campaignId");
