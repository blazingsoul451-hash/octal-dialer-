-- Migration 017: Workspace Invitations and Customer Onboarding Foundation
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
