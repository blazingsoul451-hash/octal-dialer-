/**
 * databaseManager.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * PostgreSQL Persistence Layer for Octal Dialer.
 * All database operations are asynchronous and routed through DbAdapter / PostgreSQL pool.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import fs from 'fs';
import path from 'path';
import { checkLimit, initializeCatalogPlans } from './entitlementManager';
import { dbAdapter, DbAdapter } from './db/dbAdapter';
import { isInMemoryDatabase } from './db/pool';

// ─── Open PostgreSQL Database Adapter ─────────────────────────────────────────
const db: DbAdapter = dbAdapter;

// Initialize PostgreSQL Schema and Catalog Plans
dbAdapter.init().then(async () => {
  try {
    await initializeCatalogPlans();
  } catch (err) {
    console.error('[DatabaseManager] Catalog plans initialization error:', err);
  }
}).catch(err => {
  console.error('[DatabaseManager] PostgreSQL initialization notice:', err);
});

// ─── Platform Role Helper ─────────────────────────────────────────────────────
export function isPlatformRole(role?: string | null): boolean {
  if (!role) return false;
  const r = role.toLowerCase().trim();
  return r === 'platform_admin' || r === 'master_admin' || r === 'super_admin';
}

export function isCompanyOwner(userOrRole?: any): boolean {
  if (!userOrRole) return false;
  const role = typeof userOrRole === 'string' ? userOrRole : userOrRole.role;
  return (role || '').toLowerCase().trim() === 'admin';
}

// ─── TypeScript interfaces (unchanged from old implementation) ────────────────
export interface Campaign {
  id: string;
  name: string;
  fileName: string;
  leadCount: number;
  createdAt: string;
  status?: string;
}

export interface Lead {
  id: string;
  campaignId: string;
  name: string;
  phone: string;
  status: 'PENDING' | 'CALLING' | 'COMPLETED';
  outcome?: string;
  duration?: number;
  address?: string;
  listingId?: string;
  assignedTo?: string | null;
  lockedBy?: string | null;
  lockedAt?: string | null;
  tenantId?: string;
}

export interface TenantInfo {
  id: string;
  name: string;
  slug: string;
  status: string;
  createdAt: string;
  updatedAt: string;
  country?: string;
  logoUrl?: string;
  ownerEmail?: string;
  leadPoolMode: 'shared' | 'assigned';
  maxAgents: number;
  tier: string;
  customerType?: 'COMPANY' | 'PERSONAL';
  maxTeamVisibility?: 'OWN' | 'TEAM_READ' | 'TEAM_COLLABORATE';
}

export interface CallLog {
  id: string;
  leadId: string;
  leadName: string;
  leadPhone: string;
  campaignName: string;
  outcome: string;
  duration: number;
  timestamp: string;
  tenantId?: string;
  userId?: string;
  userName?: string;
}

// ─── Exported API (explicit tenantId required - fail closed) ─────────────

export async function getTenantById(tenantId: string): Promise<TenantInfo | undefined> {
  if (!tenantId) return undefined;
  return db.queryOne<TenantInfo>(`SELECT * FROM tenants WHERE id = $1`, [tenantId]);
}

// ─── Workspace Invitations & Seat Usage ─────────────────────────────────────────

export interface WorkspaceInvitation {
  id: string;
  tenantId: string;
  email: string;
  role: 'team_lead' | 'user' | 'agent';
  teamId?: string | null;
  invitedByUserId: string;
  tokenHash: string;
  status: 'PENDING' | 'ACCEPTED' | 'EXPIRED' | 'REVOKED';
  initialModules?: string | null;
  expiresAt: string;
  createdAt: string;
  acceptedAt?: string | null;
  acceptedByUserId?: string | null;
}

export interface TenantSeatUsage {
  maxSeats: number;
  activeSeats: number;
  pendingInvitations: number;
  availableSeats: number;
}

export async function getTenantSeatUsage(tenantId: string): Promise<TenantSeatUsage> {
  const tenant = await getTenantById(tenantId);
  const sub = await db.queryOne<{ planId: string }>(
    `SELECT "planId" FROM subscriptions WHERE "tenantId" = $1 AND status IN ('active', 'trialing') ORDER BY "createdAt" DESC LIMIT 1`,
    [tenantId]
  );
  const platformCeiling = tenant?.maxAgents !== undefined && tenant?.maxAgents !== null ? Number(tenant.maxAgents) : 10;
  let maxSeats = platformCeiling;
  if (sub?.planId) {
    const pf = await db.queryOne<{ value: string }>(
      `SELECT value FROM plan_features WHERE "planId" = $1 AND "featureKey" = 'maxUsers'`,
      [sub.planId]
    );
    if (pf?.value) {
      const parsed = parseInt(pf.value, 10);
      if (!isNaN(parsed) && parsed > 0) {
        // Platform ceiling is the HARD MAXIMUM: subscription plan can reduce, but NEVER raise beyond platform ceiling
        maxSeats = Math.min(platformCeiling, parsed);
      }
    }
  }

  const activeRow = await db.queryOne<{ count: string | number }>(
    `SELECT COUNT(*) as count FROM users WHERE "tenantId" = $1 AND LOWER(role) NOT IN ('superadmin', 'platform_admin', 'master_admin', 'super_admin') AND LOWER(status) = 'active'`,
    [tenantId]
  );
  const activeSeats = parseInt(String(activeRow?.count || '0'), 10);

  const nowIso = new Date().toISOString();
  const pendingRow = await db.queryOne<{ count: string | number }>(
    `SELECT COUNT(*) as count FROM workspace_invitations WHERE "tenantId" = $1 AND status = 'PENDING' AND "expiresAt" > $2`,
    [tenantId, nowIso]
  );
  const pendingInvitations = parseInt(String(pendingRow?.count || '0'), 10);
  const availableSeats = Math.max(0, maxSeats - (activeSeats + pendingInvitations));

  return {
    maxSeats,
    activeSeats,
    pendingInvitations,
    availableSeats
  };
}

export async function getWorkspaceInvitations(tenantId: string): Promise<WorkspaceInvitation[]> {
  if (!tenantId) return [];
  return db.queryAll<WorkspaceInvitation>(
    `SELECT * FROM workspace_invitations WHERE "tenantId" = $1 ORDER BY "createdAt" DESC`,
    [tenantId]
  );
}

export async function getWorkspaceInvitationByTokenHash(tokenHash: string): Promise<WorkspaceInvitation | undefined> {
  if (!tokenHash) return undefined;
  return db.queryOne<WorkspaceInvitation>(
    `SELECT * FROM workspace_invitations WHERE "tokenHash" = $1`,
    [tokenHash]
  );
}

export async function getPendingInvitationForEmail(email: string): Promise<WorkspaceInvitation | undefined> {
  if (!email) return undefined;
  const nowIso = new Date().toISOString();
  return db.queryOne<WorkspaceInvitation>(
    `SELECT * FROM workspace_invitations WHERE LOWER(email) = LOWER($1) AND status = 'PENDING' AND "expiresAt" > $2 ORDER BY "createdAt" DESC LIMIT 1`,
    [email.trim(), nowIso]
  );
}

export async function createWorkspaceInvitation(data: {
  id: string;
  tenantId: string;
  email: string;
  role: 'team_lead' | 'user';
  teamId?: string | null;
  invitedByUserId: string;
  tokenHash: string;
  initialModules?: string | null;
  expiresAt: string;
  createdAt: string;
}): Promise<WorkspaceInvitation> {
  return db.withTransaction(async () => {
  await lockWorkspaceForMembershipChange(data.tenantId);
  if ((await getTenantSeatUsage(data.tenantId)).availableSeats <= 0) throw new Error('Workspace seat limit reached.');
  const duplicate = await db.queryOne(`SELECT id FROM workspace_invitations WHERE "tenantId" = $1 AND LOWER(email) = LOWER($2) AND status = 'PENDING' AND "expiresAt" > $3`, [data.tenantId, data.email, new Date().toISOString()]);
  if (duplicate) throw new Error('A pending invitation already exists in this workspace.');
  if (data.teamId && !(await db.queryOne('SELECT id FROM teams WHERE id = $1 AND "tenantId" = $2', [data.teamId, data.tenantId]))) throw new Error('Team does not belong to this workspace.');
  await db.execute(
    `INSERT INTO workspace_invitations (id, "tenantId", email, role, "teamId", "invitedByUserId", "tokenHash", status, "initialModules", "expiresAt", "createdAt")
     VALUES ($1, $2, $3, $4, $5, $6, $7, 'PENDING', $8, $9, $10)`,
    [
      data.id,
      data.tenantId,
      data.email.toLowerCase().trim(),
      data.role,
      data.teamId || null,
      data.invitedByUserId,
      data.tokenHash,
      data.initialModules || null,
      data.expiresAt,
      data.createdAt
    ]
  );

  return (await db.queryOne<WorkspaceInvitation>(
    `SELECT * FROM workspace_invitations WHERE id = $1`,
    [data.id]
  ))!;
  });
}

/** Serialize capacity checks and membership mutations on the same transaction connection. */
export async function lockWorkspaceForMembershipChange(tenantId: string): Promise<void> {
  const tenant = await db.queryOne<any>('SELECT id, status FROM tenants WHERE id = $1 FOR UPDATE', [tenantId]);
  if (!tenant || (tenant.status !== 'active' && tenant.status !== 'trial')) throw new Error('An active or trial workspace is required.');
}

export async function revokeWorkspaceInvitation(id: string, tenantId: string): Promise<boolean> {
  const res = await db.execute(
    `UPDATE workspace_invitations SET status = 'REVOKED' WHERE id = $1 AND "tenantId" = $2 AND status = 'PENDING'`,
    [id, tenantId]
  );
  return res.rowCount > 0;
}

export async function acceptWorkspaceInvitation(id: string, userId: string): Promise<boolean> {
  const nowIso = new Date().toISOString();
  const res = await db.execute(
    `UPDATE workspace_invitations SET status = 'ACCEPTED', "acceptedAt" = $1, "acceptedByUserId" = $2 WHERE id = $3 AND status = 'PENDING' AND "expiresAt" > $1`,
    [nowIso, userId, id]
  );
  return res.rowCount > 0;
}

export async function getNextPendingLead(campaignId: string, tenantId: string, afterLeadId?: string, userId?: string): Promise<Lead | null> {
  if (!campaignId || !tenantId) return null;

  // Check tenant's leadPoolMode
  const tenant = await getTenantById(tenantId);
  const isAssignedOnly = tenant?.leadPoolMode === 'assigned';

  let querySql = `
    SELECT * FROM leads 
    WHERE "campaignId" = $1 AND "tenantId" = $2 AND status = 'PENDING' AND "lockedBy" IS NULL
  `;
  const params: any[] = [campaignId, tenantId];

  if (isAssignedOnly && userId) {
    querySql += ` AND "assignedTo" = $3`;
    params.push(userId);
  }

  querySql += ` ORDER BY "createdAt" ASC, id ASC LIMIT 1`;

  const row = await db.queryOne<Lead>(querySql, params);
  return row || null;
}

export async function getCampaigns(tenantId: string): Promise<Campaign[]> {
  if (!tenantId) return [];
  return db.queryAll<Campaign>(`SELECT * FROM campaigns WHERE "tenantId" = $1 ORDER BY "createdAt" DESC`, [tenantId]);
}

export async function getCampaignById(id: string, tenantId: string): Promise<Campaign | undefined> {
  if (!id || !tenantId) return undefined;
  return db.queryOne<Campaign>(`SELECT * FROM campaigns WHERE id = $1 AND "tenantId" = $2`, [id, tenantId]);
}

export interface CampaignImportResult {
  campaign: Campaign;
  totalRaw: number;
  dedupedCount: number;
  dncSkippedCount: number;
  finalCount: number;
}

export interface CreateCampaignOptions {
  allowSharedPhoneBranches?: boolean;
  idempotencyKey?: string;
}

export async function createCampaign(
  name: string,
  fileName: string,
  rawLeads: { name: string; phone: string; address?: string; listingId?: string }[],
  tenantId: string,
  options?: CreateCampaignOptions
): Promise<CampaignImportResult> {
  if (!tenantId) throw new Error('Tenant ID is required to create a campaign.');
  return db.withTransaction(async () => {
    // Serialize tenant imports across API processes before checking existing rows
    // or plan limits. The lock is released with the transaction, including rollback.
    if (process.env.DATABASE_URL && !isInMemoryDatabase()) {
      await db.execute("SELECT pg_advisory_xact_lock(hashtext('octal-campaign-import'), hashtext($1))", [tenantId]);
    }
    return createCampaignInTransaction(name, fileName, rawLeads, tenantId, options);
  });
}

async function createCampaignInTransaction(
  name: string,
  fileName: string,
  rawLeads: { name: string; phone: string; address?: string; listingId?: string }[],
  tenantId: string,
  options?: CreateCampaignOptions
): Promise<CampaignImportResult> {
  if (!tenantId) {
    throw new Error('Tenant ID is required to create a campaign (fail-closed).');
  }
  const tId = tenantId;
  const campaignId = 'camp_' + Math.random().toString(36).substring(2, 11);
  const now = new Date().toISOString();

  // Idempotency check: if an identical campaign for this fileName/intent already exists, return it
  if (options?.idempotencyKey) {
    const existingCampaign = await db.queryOne<Campaign>(`
      SELECT * FROM campaigns 
      WHERE "fileName" = $1 AND "tenantId" = $2 AND name = $3
      ORDER BY "createdAt" DESC LIMIT 1
    `, [fileName, tId, name]);

    if (existingCampaign) {
      return {
        campaign: existingCampaign,
        totalRaw: rawLeads.length,
        dedupedCount: rawLeads.length,
        dncSkippedCount: 0,
        finalCount: existingCampaign.leadCount
      };
    }
  }

  // Get current DNC list numbers for fast lookup within this tenant
  const dncRows = await db.queryAll<{ phone: string }>(`SELECT phone FROM suppression_list WHERE "tenantId" = $1`, [tId]);
  const dncSet = new Set<string>(dncRows.map(r => r.phone));

  // Get existing leads across all campaigns in this tenant to avoid cross-campaign duplicates while preserving distinct businesses sharing a phone
  const existingRows = await db.queryAll<{ name: string; phone: string; address?: string; listingId?: string }>(
    `SELECT name, phone, address, "listingId" FROM leads WHERE "tenantId" = $1`,
    [tId]
  );
  const existingSet = new Set<string>(
    existingRows.map(r => {
      if (options?.allowSharedPhoneBranches) {
        const branchId = r.listingId || (r.address && r.address !== 'N/A' ? `${(r.name || '').trim()} [${r.address}]` : (r.name || '').trim());
        return `${branchId.toLowerCase()}:::${r.phone}`;
      }
      return `${(r.name || '').trim().toLowerCase()}:::${r.phone}`;
    })
  );

  let dedupedCount = 0;
  let dncSkippedCount = 0;

  const batchSeen = new Set<string>();
  const validLeads: { name: string; phone: string; address?: string; listingId?: string }[] = [];

  for (const lead of rawLeads) {
    const norm = normalizePhone(lead.phone);
    if (!norm) continue;

    // Check if on DNC suppression list
    if (dncSet.has(norm)) {
      dncSkippedCount++;
      continue;
    }

    const leadName = (lead.name || 'Unknown Lead').trim();
    let leadKey: string;

    if (options?.allowSharedPhoneBranches) {
      // Disambiguate same-name, same-phone branches by listingId or physical address
      const branchId = lead.listingId || (lead.address && lead.address !== 'N/A' ? `${leadName} [${lead.address}]` : leadName);
      leadKey = `${branchId.toLowerCase()}:::${norm}`;
    } else {
      // Default CRM duplicate policy: deduplicate by name + phone
      leadKey = `${leadName.toLowerCase()}:::${norm}`;
    }

    // Check batch duplicate
    if (batchSeen.has(leadKey)) {
      dedupedCount++;
      continue;
    }

    // Enforce cross-campaign deduplication
    if (existingSet.has(leadKey)) {
      dedupedCount++;
      continue;
    }

    batchSeen.add(leadKey);
    validLeads.push({ name: leadName, phone: norm, address: lead.address, listingId: lead.listingId });
  }

  const newCampaign: Campaign & { tenantId: string } = {
    id: campaignId,
    name,
    fileName,
    leadCount: validLeads.length,
    tenantId: tId,
    createdAt: now
  };

  await db.withTransaction(async () => {
    // Limit check for campaigns and leads
    const campaignLimitCheck = await checkLimit(tId, 'maxCampaigns', 1);
    if (!campaignLimitCheck.allowed) {
      throw new Error(campaignLimitCheck.error || `Campaign limit reached for your plan (${campaignLimitCheck.current}/${campaignLimitCheck.limit}).`);
    }

    if (validLeads.length > 0) {
      const leadLimitCheck = await checkLimit(tId, 'maxLeads', validLeads.length);
      if (!leadLimitCheck.allowed) {
        throw new Error(leadLimitCheck.error || `Lead quota exceeded (${leadLimitCheck.current + validLeads.length}/${leadLimitCheck.limit}).`);
      }
    }

    await db.execute(`
      INSERT INTO campaigns (id, name, "fileName", "leadCount", "tenantId", "createdAt")
      VALUES ($1, $2, $3, $4, $5, $6)
    `, [newCampaign.id, newCampaign.name, newCampaign.fileName, newCampaign.leadCount, newCampaign.tenantId, newCampaign.createdAt]);

    for (let i = 0; i < validLeads.length; i++) {
      const leadId = `lead_${campaignId}_${i}_${Math.random().toString(36).substring(2, 6)}`;
      await db.execute(`
        INSERT INTO leads (id, "campaignId", name, phone, status, "tenantId", "createdAt", address, "listingId")
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        ON CONFLICT ("id") DO NOTHING
      `, [leadId, campaignId, validLeads[i].name, validLeads[i].phone, 'PENDING', tId, now, validLeads[i].address || null, validLeads[i].listingId || null]);
    }

    const countRow = await db.queryOne<{ c: string | number }>(`SELECT COUNT(*) as c FROM leads WHERE "campaignId" = $1 AND "tenantId" = $2`, [campaignId, tId]);
    const actualCount = countRow ? Number(countRow.c) : validLeads.length;
    await db.execute(`UPDATE campaigns SET "leadCount" = $1 WHERE id = $2 AND "tenantId" = $3`, [actualCount, campaignId, tId]);
    newCampaign.leadCount = actualCount;
  });

  return {
    campaign: newCampaign,
    totalRaw: rawLeads.length,
    dedupedCount,
    dncSkippedCount,
    finalCount: newCampaign.leadCount
  };
}

export async function appendLeadsToCampaign(
  campaignId: string,
  rawLeads: { name: string; phone: string }[],
  tenantId: string
): Promise<CampaignImportResult> {
  if (!tenantId || !campaignId) {
    throw new Error('Tenant ID and Campaign ID are required (fail-closed).');
  }
  const campaign = await getCampaignById(campaignId, tenantId);
  if (!campaign) {
    throw new Error('Campaign not found in this tenant.');
  }

  const now = new Date().toISOString();
  const dncRows = await db.queryAll<{ phone: string }>(`SELECT phone FROM suppression_list WHERE "tenantId" = $1`, [tenantId]);
  const dncSet = new Set<string>(dncRows.map(r => r.phone));

  const existingRows = await db.queryAll<{ phone: string }>(`SELECT phone FROM leads WHERE "tenantId" = $1`, [tenantId]);
  const existingSet = new Set<string>(existingRows.map(r => r.phone));

  let dedupedCount = 0;
  let dncSkippedCount = 0;
  const batchSeen = new Set<string>();
  const validLeads: { name: string; phone: string }[] = [];

  for (const lead of rawLeads) {
    const norm = normalizePhone(lead.phone);
    if (!norm) continue;

    if (dncSet.has(norm)) {
      dncSkippedCount++;
      continue;
    }

    if (batchSeen.has(norm) || existingSet.has(norm)) {
      dedupedCount++;
      continue;
    }

    batchSeen.add(norm);
    validLeads.push({ name: lead.name || 'Unknown Lead', phone: norm });
  }

  await db.withTransaction(async () => {
    if (validLeads.length > 0) {
      const leadLimitCheck = await checkLimit(tenantId, 'maxLeads', validLeads.length);
      if (!leadLimitCheck.allowed) {
        throw new Error(leadLimitCheck.error || `Lead quota exceeded (${leadLimitCheck.current + validLeads.length}/${leadLimitCheck.limit}).`);
      }
    }

    for (let i = 0; i < validLeads.length; i++) {
      const leadId = `lead_${campaignId}_${Date.now()}_${i}_${Math.random().toString(36).substring(2, 6)}`;
      await db.execute(`
        INSERT INTO leads (id, "campaignId", name, phone, status, "tenantId", "createdAt")
        VALUES ($1, $2, $3, $4, $5, $6, $7)
        ON CONFLICT ("id") DO NOTHING
      `, [leadId, campaignId, validLeads[i].name, validLeads[i].phone, 'PENDING', tenantId, now]);
    }

    const countRow = await db.queryOne<{ c: string | number }>(`SELECT COUNT(*) as c FROM leads WHERE "campaignId" = $1 AND "tenantId" = $2`, [campaignId, tenantId]);
    const actualCount = countRow ? Number(countRow.c) : validLeads.length;
    await db.execute(`UPDATE campaigns SET "leadCount" = $1 WHERE id = $2 AND "tenantId" = $3`, [actualCount, campaignId, tenantId]);
    campaign.leadCount = actualCount;
  });

  return {
    campaign,
    totalRaw: rawLeads.length,
    dedupedCount,
    dncSkippedCount,
    finalCount: validLeads.length
  };
}

export async function getLeads(campaignId: string, tenantId: string): Promise<Lead[]> {
  if (!tenantId || !campaignId) return [];
  return db.queryAll<Lead>(`SELECT * FROM leads WHERE "campaignId" = $1 AND "tenantId" = $2 AND status != 'ARCHIVED'`, [campaignId, tenantId]);
}

export async function getLead(id: string, tenantId: string): Promise<Lead | undefined> {
  if (!id || !tenantId) return undefined;
  return db.queryOne<Lead>(`SELECT * FROM leads WHERE id = $1 AND "tenantId" = $2`, [id, tenantId]);
}

export async function getLeadById(id: string): Promise<Lead | undefined> {
  if (!id) return undefined;
  return db.queryOne<Lead>(`SELECT * FROM leads WHERE id = $1`, [id]);
}

export async function deleteLead(id: string, tenantId: string): Promise<boolean> {
  if (!tenantId || !id) return false;
  const lead = await getLead(id, tenantId);
  if (!lead) return false;
  const campaignId = lead.campaignId;
  const info = await db.execute(`UPDATE leads SET status = 'ARCHIVED' WHERE id = $1 AND "tenantId" = $2`, [id, tenantId]);
  if (campaignId) {
    await db.execute(`
      UPDATE campaigns 
      SET "leadCount" = (SELECT COUNT(*) FROM leads WHERE "campaignId" = $1 AND "tenantId" = $2 AND status != 'ARCHIVED') 
      WHERE id = $3 AND "tenantId" = $4
    `, [campaignId, tenantId, campaignId, tenantId]);
  }
  return info.rowCount > 0;
}

export async function clearAllLeadsInCampaign(campaignId: string, tenantId: string): Promise<number> {
  if (!tenantId || !campaignId) return 0;
  const info = await db.execute(`UPDATE leads SET status = 'ARCHIVED' WHERE "campaignId" = $1 AND "tenantId" = $2 AND status != 'ARCHIVED'`, [campaignId, tenantId]);
  await db.execute(`UPDATE campaigns SET "leadCount" = 0 WHERE id = $1 AND "tenantId" = $2`, [campaignId, tenantId]);
  return info.rowCount;
}

export async function clearFakeQueueLeads(tenantId: string): Promise<number> {
  if (!tenantId) return 0;
  const info = await db.execute(`
    UPDATE leads SET status = 'ARCHIVED' 
    WHERE (name LIKE '%Sample%' OR name LIKE '%Dummy%' OR name LIKE '%Fake%' OR phone LIKE '%0000000%' OR "campaignId" LIKE '%sample%') AND status != 'ARCHIVED' AND "tenantId" = $1
  `, [tenantId]);
  await db.execute(`
    UPDATE campaigns 
    SET "leadCount" = (SELECT COUNT(*) FROM leads WHERE "campaignId" = campaigns.id AND "tenantId" = $1 AND status != 'ARCHIVED')
    WHERE "tenantId" = $2
  `, [tenantId, tenantId]);
  return info.rowCount;
}

export async function updateLeadStatus(
  id: string,
  status: 'PENDING' | 'CALLING' | 'COMPLETED',
  outcome?: string,
  duration?: number,
  tenantId?: string
): Promise<void> {
  if (!id || !tenantId) return;
  await db.execute(`
    UPDATE leads 
    SET status = $1, outcome = COALESCE($2, outcome), duration = COALESCE($3, duration) 
    WHERE id = $4 AND "tenantId" = $5
  `, [status, outcome ?? null, duration ?? null, id, tenantId]);
}

export async function getLogs(tenantId: string): Promise<CallLog[]> {
  if (!tenantId) return [];
  return db.queryAll<CallLog>(`SELECT * FROM call_logs WHERE "tenantId" = $1 ORDER BY timestamp DESC`, [tenantId]);
}

export async function getLogByLeadId(leadId: string, tenantId: string): Promise<CallLog | undefined> {
  if (!leadId || !tenantId) return undefined;
  return db.queryOne<CallLog>(`SELECT * FROM call_logs WHERE "leadId" = $1 AND "tenantId" = $2 LIMIT 1`, [leadId, tenantId]);
}

export async function createLog(leadId: string, outcome: string, duration: number, tenantId: string, userId?: string, userName?: string): Promise<CallLog | null> {
  if (!tenantId || !leadId) return null;
  const lead = await getLead(leadId, tenantId);
  if (!lead) return null;

  const resolvedTenantId = (lead as any).tenantId || tenantId;
  const campaign = await db.queryOne<Campaign>(`SELECT * FROM campaigns WHERE id = $1 AND "tenantId" = $2`, [lead.campaignId, resolvedTenantId]);

  let resolvedUserName = userName;
  if (userId && !resolvedUserName) {
    try {
      const u = await db.queryOne<{ username: string }>(`SELECT username FROM users WHERE id = $1 LIMIT 1`, [userId]);
      if (u?.username) resolvedUserName = u.username;
    } catch {
      // ignore
    }
  }

  const log: CallLog & { tenantId: string } = {
    id: 'log_' + Math.random().toString(36).substring(2, 11),
    leadId,
    leadName: lead.name,
    leadPhone: lead.phone,
    campaignName: campaign ? campaign.name : 'Unknown Campaign',
    outcome,
    duration,
    tenantId: resolvedTenantId,
    userId: userId || undefined,
    userName: resolvedUserName || undefined,
    timestamp: new Date().toISOString()
  };

  await db.withTransaction(async () => {
    await db.execute(`
      INSERT INTO call_logs (id, "leadId", "leadName", "leadPhone", "campaignName", outcome, duration, "tenantId", "userId", "userName", timestamp)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
    `, [log.id, log.leadId, log.leadName, log.leadPhone, log.campaignName, log.outcome, log.duration, log.tenantId, log.userId || null, log.userName || null, log.timestamp]);

    await updateLeadStatus(leadId, 'COMPLETED', outcome, duration, resolvedTenantId);
  });

  return log;
}

export async function createManualLog(phone: string, name: string, outcome: string, duration: number, tenantId: string, userId?: string, userName?: string): Promise<CallLog> {
  const tId = tenantId;
  let resolvedUserName = userName;
  if (userId && !resolvedUserName) {
    try {
      const u = await db.queryOne<{ username: string }>(`SELECT username FROM users WHERE id = $1 LIMIT 1`, [userId]);
      if (u?.username) resolvedUserName = u.username;
    } catch {
      // ignore
    }
  }

  const log: CallLog & { tenantId: string } = {
    id: 'log_' + Math.random().toString(36).substring(2, 11),
    leadId: 'manual_' + Date.now(),
    leadName: name || 'Manual Quick Dial',
    leadPhone: phone,
    campaignName: 'Manual Quick Dial',
    outcome,
    duration,
    tenantId: tId,
    userId: userId || undefined,
    userName: resolvedUserName || undefined,
    timestamp: new Date().toISOString()
  };
  await db.execute(`
    INSERT INTO call_logs (id, "leadId", "leadName", "leadPhone", "campaignName", outcome, duration, "tenantId", "userId", "userName", timestamp)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
  `, [log.id, log.leadId, log.leadName, log.leadPhone, log.campaignName, log.outcome, log.duration, log.tenantId, log.userId || null, log.userName || null, log.timestamp]);
  return log;
}

// ─── Legacy shim: loadDb / saveDb ─────────────────────────────────────────────
// ─── Phone-number normalisation helper ───────────────────────────────────────
export function normalizePhone(raw: string): string {
  if (!raw) return '';
  let stripped = raw.toString().trim().replace(/[\s\-\(\)\.\/\\]/g, '');
  if (!stripped) return '';

  if (/^03\d{9}$/.test(stripped)) {
    return '+92' + stripped.substring(1);
  }
  if (/^923\d{9}$/.test(stripped)) {
    return '+' + stripped;
  }
  if (/^\+923\d{9}$/.test(stripped)) {
    return stripped;
  }
  if (/^00923\d{9}$/.test(stripped)) {
    return '+' + stripped.substring(2);
  }
  if (/^\+\d{10,15}$/.test(stripped)) {
    return stripped;
  }
  if (/^\d{10,15}$/.test(stripped)) {
    return '+' + stripped;
  }

  return stripped;
}

// ─── Lead Reservation & Locking API ──────────────────────────────────────────
export const LEASE_TTL_MINUTES = 2;

export async function reserveLead(leadId: string, sessionId: string, tenantId?: string, leaseMinutes: number = LEASE_TTL_MINUTES, allowCompleted: boolean = false): Promise<boolean> {
  const now = new Date();
  const cutoff = new Date(now.getTime() - leaseMinutes * 60 * 1000).toISOString();
  
  if (tenantId) {
    const res = await db.execute(`
      UPDATE leads 
      SET "lockedBy" = $1, "lockedAt" = $2, status = 'CALLING'
      WHERE id = $3 
        AND "tenantId" = $4
        AND (status != 'COMPLETED' OR $5 = true)
        AND ("lockedBy" IS NULL OR "lockedBy" = $1 OR "lockedAt" < $6)
    `, [sessionId, now.toISOString(), leadId, tenantId, allowCompleted, cutoff]);
    return res.rowCount > 0;
  }

  const result = await db.execute(`
    UPDATE leads 
    SET "lockedBy" = $1, "lockedAt" = $2, status = 'CALLING'
    WHERE id = $3 
      AND (status != 'COMPLETED' OR $4 = true)
      AND ("lockedBy" IS NULL OR "lockedBy" = $1 OR "lockedAt" < $5)
  `, [sessionId, now.toISOString(), leadId, allowCompleted, cutoff]);

  return result.rowCount > 0;
}

export async function resetAllLeadStatusesInCampaign(campaignId: string, tenantId: string): Promise<number> {
  if (!campaignId || !tenantId) return 0;
  const result = await db.execute(`
    UPDATE leads 
    SET status = 'PENDING', outcome = NULL, duration = 0, "lockedBy" = NULL, "lockedAt" = NULL, "dispositionNotes" = NULL
    WHERE "campaignId" = $1 AND "tenantId" = $2
  `, [campaignId, tenantId]);
  return result.rowCount;
}

export async function releaseLeadLock(leadId: string, sessionId?: string, tenantId?: string): Promise<void> {
  if (tenantId && sessionId) {
    const result = await db.execute(`
      UPDATE leads
      SET "lockedBy" = NULL, "lockedAt" = NULL, status = CASE WHEN status = 'CALLING' THEN 'PENDING' ELSE status END
      WHERE id = $1 AND "lockedBy" = $2 AND "tenantId" = $3
    `, [leadId, sessionId, tenantId]);
    if (result.rowCount === 0) {
      console.warn(`[LeadLock] Rejected lock release for lead ${leadId} — not owned by session ${sessionId} or tenant ${tenantId}`);
    }
  } else if (tenantId) {
    await db.execute(`
      UPDATE leads
      SET "lockedBy" = NULL, "lockedAt" = NULL, status = CASE WHEN status = 'CALLING' THEN 'PENDING' ELSE status END
      WHERE id = $1 AND "tenantId" = $2
    `, [leadId, tenantId]);
  } else if (sessionId) {
    const result = await db.execute(`
      UPDATE leads
      SET "lockedBy" = NULL, "lockedAt" = NULL, status = CASE WHEN status = 'CALLING' THEN 'PENDING' ELSE status END
      WHERE id = $1 AND "lockedBy" = $2
    `, [leadId, sessionId]);
    if (result.rowCount === 0) {
      console.warn(`[LeadLock] Rejected lock release for lead ${leadId} — not owned by session ${sessionId}`);
    }
  } else {
    await db.execute(`
      UPDATE leads
      SET "lockedBy" = NULL, "lockedAt" = NULL, status = CASE WHEN status = 'CALLING' THEN 'PENDING' ELSE status END
      WHERE id = $1
    `, [leadId]);
  }
}

export async function releaseLeadLockOwned(leadId: string, sessionId: string): Promise<void> {
  await releaseLeadLock(leadId, sessionId);
}

export async function unlockLeadsForSession(sessionId: string): Promise<void> {
  const result = await db.execute(`
    UPDATE leads
    SET "lockedBy" = NULL, "lockedAt" = NULL, status = CASE WHEN status = 'CALLING' THEN 'PENDING' ELSE status END
    WHERE "lockedBy" = $1 AND status != 'COMPLETED'
  `, [sessionId]);
  if (result.rowCount > 0) {
    console.log(`[LeadLock] Released ${result.rowCount} locked lead(s) for disconnected session ${sessionId}`);
  }
}

export async function releaseExpiredLeases(leaseMinutes: number = LEASE_TTL_MINUTES, tenantId?: string): Promise<number> {
  const now = new Date();
  const cutoff = new Date(now.getTime() - leaseMinutes * 60 * 1000).toISOString();
  let result;
  if (tenantId) {
    result = await db.execute(`
      UPDATE leads
      SET "lockedBy" = NULL, "lockedAt" = NULL, status = CASE WHEN status = 'CALLING' THEN 'PENDING' ELSE status END
      WHERE "lockedAt" < $1 AND status != 'COMPLETED' AND "lockedBy" IS NOT NULL AND "tenantId" = $2
    `, [cutoff, tenantId]);
  } else {
    result = await db.execute(`
      UPDATE leads
      SET "lockedBy" = NULL, "lockedAt" = NULL, status = CASE WHEN status = 'CALLING' THEN 'PENDING' ELSE status END
      WHERE "lockedAt" < $1 AND status != 'COMPLETED' AND "lockedBy" IS NOT NULL
    `, [cutoff]);
  }
  if (result.rowCount > 0) {
    console.log(`[LeadLock] Released ${result.rowCount} expired lead lease(s) (older than ${leaseMinutes} mins)${tenantId ? ` for tenant ${tenantId}` : ''}`);
  }
  return result.rowCount;
}

export async function getLockedLeads(tenantId?: string): Promise<Lead[]> {
  if (tenantId) {
    return db.queryAll<Lead>(`SELECT * FROM leads WHERE "lockedBy" IS NOT NULL AND status != 'COMPLETED' AND "tenantId" = $1`, [tenantId]);
  }
  return db.queryAll<Lead>(`SELECT * FROM leads WHERE "lockedBy" IS NOT NULL AND status != 'COMPLETED'`);
}

// Periodically release expired leases every minute
setInterval(() => {
  releaseExpiredLeases(LEASE_TTL_MINUTES).catch(err => console.error('[LeadLock Interval Error]:', err));
}, 60 * 1000);

// ─── Database Backup & Disaster Recovery ───────────────────
export async function backupDatabase(targetFileName?: string): Promise<{ success: boolean; backupPath: string; sizeBytes: number; timestamp: string }> {
  const backupsDir = path.join(__dirname, '../data/backups');
  if (!fs.existsSync(backupsDir)) {
    fs.mkdirSync(backupsDir, { recursive: true });
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  let safeFileName = targetFileName ? path.basename(targetFileName) : `backup_${timestamp}.json`;
  if (!safeFileName.endsWith('.json') && !safeFileName.endsWith('.db')) {
    safeFileName += '.json';
  }

  const backupPath = path.join(backupsDir, safeFileName);

  const tables = [
    'tenants', 'plans', 'plan_features', 'users', 'custom_roles', 'module_tools',
    'user_permissions', 'user_tool_permissions', 'system_settings', 'system_metrics',
    'api_keys', 'sessions_store', 'subscriptions', 'billing_events', 'pending_signups',
    'campaigns', 'leads', 'call_attempts', 'call_events', 'call_logs', 'dispositions',
    'devices', 'commands', 'suppression_list', 'audit_logs', 'audit_logs_admin',
    'ota_versions', 'email_leads', 'email_accounts', 'email_templates', 'scraped_leads',
    'module_settings', 'crm_follow_ups', 'lead_activities'
  ];

  const backupData: Record<string, any[]> = {};
  for (const table of tables) {
    try {
      const res = await db.query(`SELECT * FROM "${table}"`);
      backupData[table] = res.rows || [];
    } catch {
      backupData[table] = [];
    }
  }

  fs.writeFileSync(backupPath, JSON.stringify(backupData, null, 2), 'utf-8');
  const stat = fs.statSync(backupPath);
  return {
    success: true,
    backupPath,
    sizeBytes: stat.size,
    timestamp: new Date().toISOString()
  };
}

// ─── CRM Workspace & Lead Intelligence Helper Functions ─────────────
export interface FollowUpItem {
  id: string;
  leadId: string;
  leadName: string;
  leadPhone: string;
  campaignId?: string;
  campaignName?: string;
  tenantId: string;
  userId?: string;
  assignedAgent?: string;
  scheduledAt: string;
  status: 'pending' | 'completed' | 'cancelled' | 'rescheduled';
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export interface LeadActivity {
  id: string;
  leadId: string;
  tenantId: string;
  userId?: string;
  username?: string;
  eventType: string;
  description: string;
  metadata?: string;
  createdAt: string;
}

export async function createFollowUp(data: {
  leadId: string;
  leadName?: string;
  leadPhone?: string;
  campaignId?: string;
  campaignName?: string;
  tenantId: string;
  userId?: string;
  assignedAgent?: string;
  scheduledAt: string;
  notes?: string;
}): Promise<FollowUpItem> {
  const id = `fu_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
  const now = new Date().toISOString();
  await db.execute(`
    INSERT INTO crm_follow_ups (id, "leadId", "leadName", "leadPhone", "campaignId", "campaignName", "tenantId", "userId", "assignedAgent", "scheduledAt", status, notes, "createdAt", "updatedAt")
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'pending', $11, $12, $13)
  `, [
    id, data.leadId, data.leadName || '', data.leadPhone || '', data.campaignId || null,
    data.campaignName || '', data.tenantId, data.userId || null, data.assignedAgent || null,
    data.scheduledAt, data.notes || '', now, now
  ]);

  return {
    id,
    leadId: data.leadId,
    leadName: data.leadName || '',
    leadPhone: data.leadPhone || '',
    campaignId: data.campaignId,
    campaignName: data.campaignName,
    tenantId: data.tenantId,
    userId: data.userId,
    assignedAgent: data.assignedAgent,
    scheduledAt: data.scheduledAt,
    status: 'pending',
    notes: data.notes,
    createdAt: now,
    updatedAt: now
  };
}

export async function getFollowUps(tenantId: string, filter?: { status?: string }): Promise<FollowUpItem[]> {
  let query = `SELECT * FROM crm_follow_ups WHERE "tenantId" = $1`;
  const params: any[] = [tenantId];

  if (filter?.status) {
    query += ` AND status = $2`;
    params.push(filter.status);
  }

  query += ` ORDER BY "scheduledAt" ASC`;
  return db.queryAll<FollowUpItem>(query, params);
}

export async function updateFollowUpStatus(id: string, tenantId: string, status: string, notes?: string): Promise<boolean> {
  const now = new Date().toISOString();
  let query = `UPDATE crm_follow_ups SET status = $1, "updatedAt" = $2`;
  const params: any[] = [status, now];
  if (notes !== undefined) {
    query += `, notes = $3`;
    params.push(notes);
  }
  const idIdx = params.length + 1;
  const tenantIdx = params.length + 2;
  query += ` WHERE id = $${idIdx} AND "tenantId" = $${tenantIdx}`;
  params.push(id, tenantId);

  const res = await db.execute(query, params);
  return res.rowCount > 0;
}

export async function recordLeadActivity(data: {
  leadId: string;
  tenantId: string;
  userId?: string;
  username?: string;
  eventType: string;
  description: string;
  metadata?: any;
}): Promise<void> {
  const id = `act_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
  const metaStr = data.metadata ? (typeof data.metadata === 'string' ? data.metadata : JSON.stringify(data.metadata)) : null;
  const now = new Date().toISOString();
  await db.execute(`
    INSERT INTO lead_activities (id, "leadId", "tenantId", "userId", username, "eventType", description, metadata, "createdAt")
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
  `, [id, data.leadId, data.tenantId, data.userId || null, data.username || null, data.eventType, data.description, metaStr, now]);
}

export async function getLeadActivities(leadId: string, tenantId: string): Promise<LeadActivity[]> {
  return db.queryAll<LeadActivity>(`
    SELECT * FROM lead_activities WHERE "leadId" = $1 AND "tenantId" = $2 ORDER BY "createdAt" DESC, id DESC LIMIT 100
  `, [leadId, tenantId]);
}

export const ALL_BUSINESS_MODULES = [
  'crm',
  'campaigns',
  'octalDialer',
  'leads',
  'reports',
  'autoEmailer',
  'facebookPoster'
] as const;

export const LEGACY_BUSINESS_MODULES = [
  'googleScraper',
  'facebookScraper'
] as const;

export async function hasUserModulePermission(userId: string, tenantId: string, moduleId: string): Promise<boolean> {
  const perm = await db.queryOne<{ enabled: number | boolean }>(`
    SELECT enabled FROM user_permissions WHERE "userId" = $1 AND "tenantId" = $2 AND "moduleId" = $3
  `, [userId, tenantId, moduleId]);
  return perm ? (perm.enabled === 1 || perm.enabled === true) : false;
}

export async function getUserPermissions(userId: string, tenantId: string): Promise<Record<string, boolean>> {
  const rows = await db.queryAll<{ moduleId: string; enabled: number | boolean }>(`
    SELECT "moduleId", enabled FROM user_permissions WHERE "userId" = $1 AND "tenantId" = $2
  `, [userId, tenantId]);
  const permissions: Record<string, boolean> = {};
  for (const row of rows) {
    permissions[row.moduleId] = row.enabled === 1 || row.enabled === true;
  }
  return permissions;
}

export async function updateLogDisposition(data: {
  leadId: string;
  outcome: string;
  notes?: string;
  tenantId: string;
  userId?: string;
  username?: string;
  logId?: string;
}): Promise<boolean> {
  const { leadId, outcome, notes, tenantId, userId, username, logId } = data;
  if (!leadId || !tenantId) return false;

  const lead = await getLead(leadId, tenantId);
  if (!lead) return false;

  const now = new Date().toISOString();
  await db.withTransaction(async () => {
    // 1. Update Lead status and outcome
    await updateLeadStatus(leadId, 'COMPLETED', outcome, lead.duration || 0, tenantId);

    // 2. Update specific call log attempt or create disposition log
    // Preserves per-attempt history: never overwrites prior call attempts on redial
    let targetLog: CallLog | undefined;
    if (logId) {
      targetLog = await db.queryOne<CallLog>(
        `SELECT * FROM call_logs WHERE id = $1 AND "tenantId" = $2 LIMIT 1`,
        [logId, tenantId]
      );
    }
    if (!targetLog) {
      targetLog = await db.queryOne<CallLog>(
        `SELECT * FROM call_logs WHERE "leadId" = $1 AND "tenantId" = $2 ORDER BY timestamp DESC, id DESC LIMIT 1`,
        [leadId, tenantId]
      );
    }

    if (targetLog) {
      // UPDATE ONLY the specific target log by its unique primary key id
      await db.execute(
        `UPDATE call_logs SET outcome = $1, "userId" = COALESCE(call_logs."userId", $4), "userName" = COALESCE(call_logs."userName", $5) WHERE id = $2 AND "tenantId" = $3`,
        [outcome, targetLog.id, tenantId, userId || null, username || null]
      );
    } else {
      await createLog(leadId, outcome, lead.duration || 0, tenantId, userId, username);
    }

    // 3. Record in dispositions table
    const dispId = 'disp_' + Math.random().toString(36).substring(2, 11);
    await db.execute(`
      INSERT INTO dispositions (id, "leadId", outcome, notes, "loggedAt", "tenantId")
      VALUES ($1, $2, $3, $4, $5, $6)
    `, [dispId, leadId, outcome, notes || '', now, tenantId]);

    // 4. Record in lead activities
    await recordLeadActivity({
      leadId,
      tenantId,
      userId,
      username,
      eventType: 'DISPOSITION_SAVED',
      description: `Call disposition marked as "${outcome}"${notes ? ': ' + notes : ''}`,
      metadata: { outcome, notes, dispId }
    });
  });

  return true;
}

export interface DeviceRecord {
  id: string;
  name: string;
  btAddress?: string | null;
  osType?: string | null;
  ipAddress?: string | null;
  status: string;
  userId?: string | null;
  tenantId?: string;
  platform?: string;
  appVersion?: string;
  deviceUid?: string | null;
  isRevoked?: number;
  lastSeenAt?: string | null;
  createdAt: string;
  updatedAt?: string;
}

export async function registerOrUpdateDevice(data: {
  id?: string;
  name: string;
  userId: string;
  tenantId: string;
  btAddress?: string;
  osType?: string;
  ipAddress?: string;
  platform?: string;
  appVersion?: string;
  deviceUid?: string;
}): Promise<DeviceRecord> {
  const now = new Date().toISOString();
  let deviceId = data.id;
  if (!deviceId && data.deviceUid) {
    const existing = await db.queryOne<{ id: string }>(`SELECT id FROM devices WHERE "deviceUid" = $1 AND "tenantId" = $2`, [data.deviceUid, data.tenantId]);
    if (existing) {
      deviceId = existing.id;
    }
  }
  if (!deviceId) {
    deviceId = 'dev_' + (data.deviceUid ? data.deviceUid.replace(/[^a-zA-Z0-9_-]/g, '_') : Math.random().toString(36).substring(2, 11));
  }

  const existingDevice = await db.queryOne<DeviceRecord>(`SELECT * FROM devices WHERE id = $1`, [deviceId]);

  if (existingDevice) {
    if (existingDevice.tenantId && existingDevice.tenantId !== data.tenantId) {
      throw new Error(`Device belongs to another tenant.`);
    }

    await db.execute(`
      UPDATE devices
      SET name = $1,
          "userId" = $2,
          "tenantId" = $3,
          "btAddress" = COALESCE($4, "btAddress"),
          "osType" = COALESCE($5, "osType"),
          "ipAddress" = COALESCE($6, "ipAddress"),
          platform = COALESCE($7, platform),
          "appVersion" = COALESCE($8, "appVersion"),
          "deviceUid" = COALESCE($9, "deviceUid"),
          status = 'ONLINE',
          "isRevoked" = 0,
          "lastSeenAt" = $10,
          "updatedAt" = $10
      WHERE id = $11
    `, [
      data.name || 'Android Device',
      data.userId,
      data.tenantId,
      data.btAddress || null,
      data.osType || 'Android',
      data.ipAddress || '127.0.0.1',
      data.platform || 'android',
      data.appVersion || '1.2.0',
      data.deviceUid || null,
      now,
      deviceId
    ]);
  } else {
    await db.execute(`
      INSERT INTO devices (id, name, "btAddress", "osType", "ipAddress", status, "userId", "tenantId", platform, "appVersion", "deviceUid", "isRevoked", "lastSeenAt", "createdAt", "updatedAt")
      VALUES ($1, $2, $3, $4, $5, 'ONLINE', $6, $7, $8, $9, $10, 0, $11, $11, $11)
      ON CONFLICT ("id") DO UPDATE SET
        name = EXCLUDED.name,
        "userId" = EXCLUDED."userId",
        "tenantId" = EXCLUDED."tenantId",
        status = 'ONLINE',
        "isRevoked" = 0,
        "lastSeenAt" = EXCLUDED."lastSeenAt",
        "updatedAt" = EXCLUDED."updatedAt"
    `, [
      deviceId,
      data.name || 'Android Device',
      data.btAddress || null,
      data.osType || 'Android',
      data.ipAddress || '127.0.0.1',
      data.userId,
      data.tenantId,
      data.platform || 'android',
      data.appVersion || '1.2.0',
      data.deviceUid || null,
      now
    ]);
  }

  const result = await db.queryOne<DeviceRecord>(`SELECT * FROM devices WHERE id = $1`, [deviceId]);
  return result!;
}

export async function getDevicesForUser(userId: string, tenantId: string): Promise<DeviceRecord[]> {
  return db.queryAll<DeviceRecord>(`
    SELECT * FROM devices 
    WHERE "tenantId" = $1 AND ("userId" = $2 OR "userId" IS NULL) AND "isRevoked" = 0
    ORDER BY "lastSeenAt" DESC, "createdAt" DESC
  `, [tenantId, userId]);
}

export async function getDeviceById(id: string, tenantId?: string): Promise<DeviceRecord | undefined> {
  if (tenantId) {
    return db.queryOne<DeviceRecord>(`SELECT * FROM devices WHERE id = $1 AND "tenantId" = $2`, [id, tenantId]);
  }
  return db.queryOne<DeviceRecord>(`SELECT * FROM devices WHERE id = $1`, [id]);
}

export async function revokeDevice(id: string, userId: string, tenantId: string, isAdmin: boolean = false): Promise<boolean> {
  const now = new Date().toISOString();
  let query = `UPDATE devices SET "isRevoked" = 1, status = 'OFFLINE', "updatedAt" = $1 WHERE id = $2 AND "tenantId" = $3`;
  const params: any[] = [now, id, tenantId];
  if (!isAdmin) {
    query += ` AND "userId" = $4`;
    params.push(userId);
  }
  const result = await db.execute(query, params);
  return result.rowCount > 0;
}

export async function updateDeviceStatus(id: string, status: string, lastSeenAt?: string): Promise<boolean> {
  const now = lastSeenAt || new Date().toISOString();
  const result = await db.execute(`UPDATE devices SET status = $1, "lastSeenAt" = $2, "updatedAt" = $3 WHERE id = $4`, [status, now, now, id]);
  return result.rowCount > 0;
}

// ─── Teams & Scoping Module Database Helpers ───────────────────────────────

export interface TeamRecord {
  id: string;
  name: string;
  description?: string;
  leaderId?: string;
  leaderName?: string;
  tenantId: string;
  status: string;
  createdAt: string;
  updatedAt: string;
  memberCount?: number;
  campaignCount?: number;
}

export interface TeamMemberRecord {
  teamId: string;
  userId: string;
  username?: string;
  displayName?: string;
  email?: string;
  role?: string;
  roleInTeam: string;
  joinedAt: string;
  tenantId: string;
}

export async function getTeams(tenantId: string): Promise<TeamRecord[]> {
  const teams = await db.queryAll<TeamRecord>(`
    SELECT t.id, t.name, t.description, t."leaderId", t."tenantId", t.status, t."createdAt", t."updatedAt",
           u."displayName" as "leaderName"
    FROM teams t
    LEFT JOIN users u ON u.id = t."leaderId"
    WHERE t."tenantId" = $1
    ORDER BY t."createdAt" DESC
  `, [tenantId]);

  for (const t of teams) {
    const memCount = await db.queryOne<{ count: number | string }>(
      `SELECT COUNT(*)::int AS count FROM team_members WHERE "teamId" = $1 AND "tenantId" = $2`,
      [t.id, tenantId]
    );
    const campCount = await db.queryOne<{ count: number | string }>(
      `SELECT COUNT(*)::int AS count FROM campaign_teams WHERE "teamId" = $1 AND "tenantId" = $2`,
      [t.id, tenantId]
    );
    t.memberCount = Number(memCount?.count || 0);
    t.campaignCount = Number(campCount?.count || 0);
  }

  return teams;
}

export async function getTeamById(id: string, tenantId: string): Promise<TeamRecord | null> {
  const team = await db.queryOne<TeamRecord>(`
    SELECT t.id, t.name, t.description, t."leaderId", t."tenantId", t.status, t."createdAt", t."updatedAt",
           u."displayName" as "leaderName"
    FROM teams t
    LEFT JOIN users u ON u.id = t."leaderId"
    WHERE t.id = $1 AND t."tenantId" = $2
  `, [id, tenantId]);

  if (!team) return null;

  const memCount = await db.queryOne<{ count: number | string }>(
    `SELECT COUNT(*)::int AS count FROM team_members WHERE "teamId" = $1 AND "tenantId" = $2`,
    [team.id, tenantId]
  );
  const campCount = await db.queryOne<{ count: number | string }>(
    `SELECT COUNT(*)::int AS count FROM campaign_teams WHERE "teamId" = $1 AND "tenantId" = $2`,
    [team.id, tenantId]
  );
  team.memberCount = Number(memCount?.count || 0);
  team.campaignCount = Number(campCount?.count || 0);

  return team;
}

export async function createTeam(data: {
  id?: string;
  name: string;
  description?: string;
  leaderId?: string;
  tenantId: string;
  status?: string;
}): Promise<TeamRecord> {
  return db.withTransaction(async () => {
    if (data.leaderId) await assertTenantRecords('users', [data.leaderId], data.tenantId);

  const id = data.id || `team_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
  const now = new Date().toISOString();
  await db.execute(`
    INSERT INTO teams (id, name, description, "leaderId", "tenantId", status, "createdAt", "updatedAt")
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
  `, [
    id,
    data.name.trim(),
    data.description || '',
    data.leaderId || null,
    data.tenantId,
    data.status || 'Active',
    now,
    now
  ]);

  if (data.leaderId) {
    const existing = await db.queryOne(`SELECT id FROM team_members WHERE "teamId" = $1 AND "userId" = $2`, [id, data.leaderId]);
    if (existing) {
      await db.execute(`UPDATE team_members SET "roleInTeam" = 'leader' WHERE id = $1`, [(existing as any).id]);
    } else {
      const leadMemId = 'tm_' + Math.random().toString(36).substring(2, 11);
      await db.execute(`
        INSERT INTO team_members (id, "teamId", "userId", "tenantId", "roleInTeam", "joinedAt")
        VALUES ($1, $2, $3, $4, 'leader', $5)
      `, [leadMemId, id, data.leaderId, data.tenantId, now]);
    }
  }

  const team = await getTeamById(id, data.tenantId);
  return team!;
  });
}

export async function updateTeam(
  id: string,
  tenantId: string,
  data: { name?: string; description?: string; leaderId?: string; status?: string }
): Promise<boolean> {
  return db.withTransaction(async () => {
    await assertTenantRecords('teams', [id], tenantId);
    if (data.leaderId) await assertTenantRecords('users', [data.leaderId], tenantId);

  const updates: string[] = [];
  const params: any[] = [];
  let idx = 1;

  if (data.name !== undefined) {
    updates.push(`name = $${idx++}`);
    params.push(data.name.trim());
  }
  if (data.description !== undefined) {
    updates.push(`description = $${idx++}`);
    params.push(data.description);
  }
  if (data.leaderId !== undefined) {
    updates.push(`"leaderId" = $${idx++}`);
    params.push(data.leaderId || null);
  }
  if (data.status !== undefined) {
    updates.push(`status = $${idx++}`);
    params.push(data.status);
  }

  if (updates.length === 0) return true;

  const now = new Date().toISOString();
  updates.push(`"updatedAt" = $${idx++}`);
  params.push(now);

  params.push(id);
  params.push(tenantId);

  const query = `UPDATE teams SET ${updates.join(', ')} WHERE id = $${idx++} AND "tenantId" = $${idx++}`;
  const result = await db.execute(query, params);

  if (data.leaderId) {
    const existing = await db.queryOne(`SELECT id FROM team_members WHERE "teamId" = $1 AND "userId" = $2`, [id, data.leaderId]);
    if (existing) {
      await db.execute(`UPDATE team_members SET "roleInTeam" = 'leader' WHERE id = $1`, [(existing as any).id]);
    } else {
      const leadMemId = 'tm_' + Math.random().toString(36).substring(2, 11);
      await db.execute(`
        INSERT INTO team_members (id, "teamId", "userId", "tenantId", "roleInTeam", "joinedAt")
        VALUES ($1, $2, $3, $4, 'leader', $5)
      `, [leadMemId, id, data.leaderId, tenantId, now]);
    }
  }

  return result.rowCount > 0;
  });
}

export async function deleteTeam(id: string, tenantId: string): Promise<boolean> {
  return db.withTransaction(async () => {
    await assertTenantRecords('teams', [id], tenantId);

  await db.execute(`DELETE FROM team_members WHERE "teamId" = $1 AND "tenantId" = $2`, [id, tenantId]);
  await db.execute(`DELETE FROM campaign_teams WHERE "teamId" = $1 AND "tenantId" = $2`, [id, tenantId]);
  const result = await db.execute(`DELETE FROM teams WHERE id = $1 AND "tenantId" = $2`, [id, tenantId]);
  return result.rowCount > 0;
  });
}

async function assertTenantRecords(table: 'teams' | 'users' | 'campaigns', ids: string[], tenantId: string): Promise<void> {
  if (!tenantId) throw new Error('Tenant identity is required.');
  for (const id of new Set(ids)) {
    if (typeof id !== 'string' || !id) throw new Error('Invalid record ID.');
    const query = table === 'users'
      ? `SELECT id FROM "users" WHERE id = $1 AND "tenantId" = $2 AND LOWER(role) NOT IN ('superadmin', 'platform_admin', 'master_admin', 'super_admin') FOR UPDATE`
      : `SELECT id FROM "${table}" WHERE id = $1 AND "tenantId" = $2 FOR UPDATE`;
    const row = await db.queryOne(query, [id, tenantId]);
    if (!row) throw new Error(`Record not found in your tenant${table === 'users' ? ' (platform administrators cannot be assigned to customer teams)' : ''}.`);
  }
}

export async function getTeamMembers(teamId: string, tenantId: string): Promise<TeamMemberRecord[]> {
  return db.queryAll<TeamMemberRecord>(`
    SELECT tm."teamId", tm."userId", tm."roleInTeam", tm."joinedAt", tm."tenantId",
           u.username, u."displayName", u.email, u.role
    FROM team_members tm
    JOIN users u ON u.id = tm."userId" AND u."tenantId" = tm."tenantId"
    JOIN teams t ON t.id = tm."teamId" AND t."tenantId" = tm."tenantId"
    WHERE tm."teamId" = $1 AND tm."tenantId" = $2
    ORDER BY CASE WHEN tm."roleInTeam" = 'leader' THEN 0 ELSE 1 END, u.username ASC
  `, [teamId, tenantId]);
}

export async function setTeamMembers(teamId: string, tenantId: string, userIds: string[], leaderId?: string): Promise<void> {
  return db.withTransaction(async () => {
    await assertTenantRecords('teams', [teamId], tenantId);
    await assertTenantRecords('users', [...userIds, ...(leaderId ? [leaderId] : [])], tenantId);

  const now = new Date().toISOString();
  await db.execute(`DELETE FROM team_members WHERE "teamId" = $1 AND "tenantId" = $2`, [teamId, tenantId]);

  const uniqueUsers = Array.from(new Set(userIds));
  for (const uid of uniqueUsers) {
    const role = (leaderId && uid === leaderId) ? 'leader' : 'member';
    const memId = 'tm_' + Math.random().toString(36).substring(2, 11);
    await db.execute(`
      INSERT INTO team_members (id, "teamId", "userId", "tenantId", "roleInTeam", "joinedAt")
      VALUES ($1, $2, $3, $4, $5, $6)
    `, [memId, teamId, uid, tenantId, role, now]);
  }

  if (leaderId && !uniqueUsers.includes(leaderId)) {
    const leadMemId = 'tm_' + Math.random().toString(36).substring(2, 11);
    await db.execute(`
      INSERT INTO team_members (id, "teamId", "userId", "tenantId", "roleInTeam", "joinedAt")
      VALUES ($1, $2, $3, $4, 'leader', $5)
    `, [leadMemId, teamId, leaderId, tenantId, now]);
  }
  });
}

export async function getTeamCampaigns(teamId: string, tenantId: string): Promise<any[]> {
  return db.queryAll(`
    SELECT c.id, c.name, c.status, c."fileName", c."leadCount", ct."assignedAt"
    FROM campaign_teams ct
    JOIN campaigns c ON c.id = ct."campaignId" AND c."tenantId" = ct."tenantId"
    JOIN teams t ON t.id = ct."teamId" AND t."tenantId" = ct."tenantId"
    WHERE ct."teamId" = $1 AND ct."tenantId" = $2
    ORDER BY c."createdAt" DESC
  `, [teamId, tenantId]);
}

export async function setTeamCampaigns(teamId: string, tenantId: string, campaignIds: string[]): Promise<void> {
  return db.withTransaction(async () => {
    await assertTenantRecords('teams', [teamId], tenantId);
    await assertTenantRecords('campaigns', campaignIds, tenantId);

  const now = new Date().toISOString();
  await db.execute(`DELETE FROM campaign_teams WHERE "teamId" = $1 AND "tenantId" = $2`, [teamId, tenantId]);

  const uniqueCamps = Array.from(new Set(campaignIds));
  for (const cid of uniqueCamps) {
    const ctId = 'ct_' + Math.random().toString(36).substring(2, 11);
    await db.execute(`
      INSERT INTO campaign_teams (id, "campaignId", "teamId", "tenantId", "assignedAt")
      VALUES ($1, $2, $3, $4, $5)
    `, [ctId, cid, teamId, tenantId, now]);
  }
  });
}

export async function getUserTeamIds(userId: string, tenantId: string): Promise<string[]> {
  const rows = await db.queryAll<{ teamId: string }>(`
    SELECT "teamId" FROM team_members WHERE "userId" = $1 AND "tenantId" = $2
  `, [userId, tenantId]);
  return rows.map(r => r.teamId);
}

export async function getUserScopedCampaignIds(userId: string, tenantId: string): Promise<string[]> {
  const rows = await db.queryAll<{ campaignId: string }>(`
    SELECT DISTINCT ct."campaignId"
    FROM campaign_teams ct
    JOIN team_members tm ON tm."teamId" = ct."teamId"
    WHERE tm."userId" = $1 AND tm."tenantId" = $2
  `, [userId, tenantId]);
  return rows.map(r => r.campaignId);
}

export async function getTeamsLedByUser(userId: string, tenantId: string): Promise<TeamRecord[]> {
  const teams = await db.queryAll<TeamRecord>(`
    SELECT DISTINCT t.id, t.name, t.description, t."leaderId", t."tenantId", t.status, t."createdAt", t."updatedAt",
           u."displayName" as "leaderName"
    FROM teams t
    LEFT JOIN users u ON u.id = t."leaderId"
    LEFT JOIN team_members tm ON tm."teamId" = t.id AND tm."userId" = $2 AND tm."roleInTeam" = 'leader'
    WHERE t."tenantId" = $1 AND (
      t."leaderId" = $2 OR tm.id IS NOT NULL
    )
    ORDER BY t."createdAt" DESC
  `, [tenantId, userId]);

  for (const t of teams) {
    const memCount = await db.queryOne<{ count: number | string }>(
      `SELECT COUNT(*)::int AS count FROM team_members WHERE "teamId" = $1 AND "tenantId" = $2`,
      [t.id, tenantId]
    );
    const campCount = await db.queryOne<{ count: number | string }>(
      `SELECT COUNT(*)::int AS count FROM campaign_teams WHERE "teamId" = $1 AND "tenantId" = $2`,
      [t.id, tenantId]
    );
    t.memberCount = Number(memCount?.count || 0);
    t.campaignCount = Number(campCount?.count || 0);
  }

  return teams;
}

export async function getTeamMemberUserIds(teamId: string, tenantId: string): Promise<string[]> {
  const rows = await db.queryAll<{ userId: string }>(`
    SELECT "userId" FROM team_members WHERE "teamId" = $1 AND "tenantId" = $2
  `, [teamId, tenantId]);
  return rows.map(r => r.userId);
}

export async function isTeamLeader(userId: string, teamId: string, tenantId: string): Promise<boolean> {
  const team = await db.queryOne<{ leaderId: string }>(`
    SELECT "leaderId" FROM teams WHERE id = $1 AND "tenantId" = $2
  `, [teamId, tenantId]);
  if (team?.leaderId === userId) return true;

  const member = await db.queryOne<{ roleInTeam: string }>(`
    SELECT "roleInTeam" FROM team_members WHERE "teamId" = $1 AND "userId" = $2 AND "tenantId" = $3
  `, [teamId, userId, tenantId]);
  return member?.roleInTeam === 'leader';
}

export async function canAccessTeam(actor: any, teamId: string, tenantId: string): Promise<boolean> {
  if (!actor || !teamId || !tenantId) return false;
  if (isPlatformRole(actor.role)) return true;
  if (actor.tenantId !== tenantId) return false;
  if (isCompanyOwner(actor)) return true;
  if (actor.role === 'team_lead') {
    return await isTeamLeader(actor.id, teamId, tenantId);
  }
  const member = await db.queryOne(`
    SELECT id FROM team_members WHERE "teamId" = $1 AND "userId" = $2 AND "tenantId" = $3
  `, [teamId, actor.id, tenantId]);
  return !!member;
}

export async function canAccessUser(actor: any, targetUserId: string, tenantId: string): Promise<boolean> {
  if (!actor || !targetUserId || !tenantId) return false;
  if (isPlatformRole(actor.role)) return true;
  if (actor.tenantId !== tenantId) return false;
  if (isCompanyOwner(actor)) return true;
  if (actor.id === targetUserId) return true;
  if (actor.role === 'team_lead') {
    const ledTeams = await getTeamsLedByUser(actor.id, tenantId);
    for (const t of ledTeams) {
      const memberIds = await getTeamMemberUserIds(t.id, tenantId);
      if (memberIds.includes(targetUserId)) return true;
    }
  }
  return false;
}

export async function getLedTeamIds(userId: string, tenantId: string): Promise<string[]> {
  const teams = await getTeamsLedByUser(userId, tenantId);
  return teams.map(t => t.id);
}

export async function getCampaignIdsForLedTeams(userId: string, tenantId: string): Promise<string[]> {
  const ledTeamIds = await getLedTeamIds(userId, tenantId);
  if (ledTeamIds.length === 0) return [];
  const placeholders = ledTeamIds.map((_, i) => `$${i + 2}`).join(', ');
  const rows = await db.queryAll<{ campaignId: string }>(`
    SELECT DISTINCT "campaignId" FROM campaign_teams WHERE "tenantId" = $1 AND "teamId" IN (${placeholders})
  `, [tenantId, ...ledTeamIds]);
  return rows.map(r => r.campaignId);
}

export async function getTeamLeadScopedUserIds(userId: string, tenantId: string): Promise<string[]> {
  const ledTeams = await getTeamsLedByUser(userId, tenantId);
  const userIds = new Set<string>([userId]);
  for (const t of ledTeams) {
    const memberIds = await getTeamMemberUserIds(t.id, tenantId);
    for (const mid of memberIds) userIds.add(mid);
  }
  return Array.from(userIds);
}

export interface UserTeamVisibilitySets {
  readablePeerUserIds: string[];
  editablePeerUserIds: string[];
}

/**
 * Computes visibility sets PER TEAM so a permissive policy in one team does not leak to an OWN team.
 */
export async function getUserTeamPeerVisibilitySets(userId: string, tenantId: string): Promise<UserTeamVisibilitySets> {
  const userTeamIds = await getUserTeamIds(userId, tenantId);
  const readableSet = new Set<string>();
  const editableSet = new Set<string>();

  for (const tid of userTeamIds) {
    const effVis = await getTeamEffectiveVisibility(tenantId, tid);
    if (effVis === 'TEAM_READ') {
      const memberIds = await getTeamMemberUserIds(tid, tenantId);
      for (const mid of memberIds) {
        if (mid !== userId) readableSet.add(mid);
      }
    } else if (effVis === 'TEAM_COLLABORATE') {
      const memberIds = await getTeamMemberUserIds(tid, tenantId);
      for (const mid of memberIds) {
        if (mid !== userId) {
          readableSet.add(mid);
          editableSet.add(mid);
        }
      }
    }
    // If OWN: add no peer users
  }

  return {
    readablePeerUserIds: Array.from(readableSet),
    editablePeerUserIds: Array.from(editableSet)
  };
}

export interface TeamSettingsRecord {
  id: string;
  tenantId: string;
  teamId: string;
  leadVisibility: 'OWN' | 'TEAM_READ' | 'TEAM_COLLABORATE';
  createdAt: string;
  updatedAt: string;
}

export async function getTeamSettings(teamId: string, tenantId: string): Promise<TeamSettingsRecord> {
  const existing = await db.queryOne<TeamSettingsRecord>(`
    SELECT * FROM team_settings WHERE "teamId" = $1 AND "tenantId" = $2
  `, [teamId, tenantId]);

  if (existing) return existing;

  // Default record
  return {
    id: `ts_${teamId}`,
    tenantId,
    teamId,
    leadVisibility: 'OWN',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
}

export async function upsertTeamSettings(
  teamId: string,
  tenantId: string,
  leadVisibility: 'OWN' | 'TEAM_READ' | 'TEAM_COLLABORATE'
): Promise<TeamSettingsRecord> {
  // Validate team exists and belongs to tenant
  const team = await db.queryOne<{ id: string }>(`
    SELECT id FROM teams WHERE id = $1 AND "tenantId" = $2
  `, [teamId, tenantId]);
  if (!team) {
    throw new Error('Team not found or does not belong to your organization.');
  }

  const now = new Date().toISOString();
  const existing = await db.queryOne<{ id: string }>(`
    SELECT id FROM team_settings WHERE "teamId" = $1 AND "tenantId" = $2
  `, [teamId, tenantId]);

  if (existing) {
    await db.execute(`
      UPDATE team_settings 
      SET "leadVisibility" = $1, "updatedAt" = $2
      WHERE id = $3 AND "tenantId" = $4
    `, [leadVisibility, now, existing.id, tenantId]);
    return { id: existing.id, tenantId, teamId, leadVisibility, createdAt: '', updatedAt: now };
  } else {
    const id = 'ts_' + Math.random().toString(36).substring(2, 11);
    await db.execute(`
      INSERT INTO team_settings (id, "tenantId", "teamId", "leadVisibility", "createdAt", "updatedAt")
      VALUES ($1, $2, $3, $4, $5, $6)
    `, [id, tenantId, teamId, leadVisibility, now, now]);
    return { id, tenantId, teamId, leadVisibility, createdAt: now, updatedAt: now };
  }
}

/**
 * Resolves the effective team visibility policy.
 * COMPANY MAXIMUM POLICY:
 * Company Owner sets tenants.maxTeamVisibility.
 * Team Lead sets team_settings.leadVisibility.
 * Effective is the minimum of the two (lower levels can restrict, never escalate).
 */
export async function getTeamEffectiveVisibility(tenantId: string, teamId: string): Promise<'OWN' | 'TEAM_READ' | 'TEAM_COLLABORATE'> {
  const tenant = await db.queryOne<{ maxTeamVisibility?: string }>(`
    SELECT "maxTeamVisibility" FROM tenants WHERE id = $1
  `, [tenantId]);

  const teamSettings = await getTeamSettings(teamId, tenantId);

  const rank = (val: string | undefined): number => {
    switch (val) {
      case 'TEAM_COLLABORATE': return 3;
      case 'TEAM_READ': return 2;
      case 'OWN':
      default: return 1;
    }
  };

  const toVisibility = (r: number): 'OWN' | 'TEAM_READ' | 'TEAM_COLLABORATE' => {
    if (r >= 3) return 'TEAM_COLLABORATE';
    if (r === 2) return 'TEAM_READ';
    return 'OWN';
  };

  const companyRank = rank(tenant?.maxTeamVisibility || 'TEAM_COLLABORATE');
  const teamRank = rank(teamSettings.leadVisibility);

  // Lower levels may restrict, never escalate
  const effectiveRank = Math.min(companyRank, teamRank);
  return toVisibility(effectiveRank);
}

/**
 * Resolves whether an actor has permission to perform an action ('read' | 'edit' | 'delete') on a lead.
 * Follows strict SaaS structure:
 * - platform_admin / master_admin: allowed
 * - admin: allowed tenant-wide (lead must belong to caller's tenant)
 * - team_lead:
 *     - 'delete': denied (deletion is strictly restricted to company owners and platform admins)
 *     - 'read' / 'edit': targetLead.assignedTo must be the Team Lead OR a member of a team they lead.
 *       Unassigned leads fail closed (unless explicit dialer pool workflow).
 * - user / member:
 *     - 'delete': denied
 *     - 'read': targetLead.assignedTo === actor.id OR targetLead.assignedTo in readablePeerUserIds
 *     - 'edit': targetLead.assignedTo === actor.id OR targetLead.assignedTo in editablePeerUserIds
 *     - Unassigned leads fail closed.
 */
export async function canAccessLead(
  actor: any,
  leadOrId: string | { id?: string; assignedTo?: string | null; tenantId?: string },
  action: 'read' | 'edit' | 'delete',
  tenantId: string
): Promise<boolean> {
  if (!actor || !tenantId) return false;
  const isPlatform = isPlatformRole(actor?.role);
  if (!isPlatform && actor.tenantId !== tenantId) return false;

  let lead: { id?: string; assignedTo?: string | null; tenantId?: string } | null | undefined = null;
  if (typeof leadOrId === 'string') {
    lead = await db.queryOne<{ id: string; assignedTo: string | null; tenantId: string }>(
      `SELECT id, "assignedTo", "tenantId" FROM leads WHERE id = $1 AND "tenantId" = $2`,
      [leadOrId, tenantId]
    );
  } else {
    lead = leadOrId;
  }

  if (!lead) return false;
  if (lead.tenantId && lead.tenantId !== tenantId) return false;

  if (isPlatform) return true;
  if (actor.role === 'admin') return true;

  // Deletion is strictly restricted to company owners and platform admins
  if (action === 'delete') return false;

  if (actor.role === 'team_lead') {
    // Unassigned leads fail closed
    if (!lead.assignedTo) return false;
    if (lead.assignedTo === actor.id) return true;
    const scopedUserIds = await getTeamLeadScopedUserIds(actor.id, tenantId);
    return scopedUserIds.includes(lead.assignedTo);
  }

  // Standard member / user / agent
  if (!lead.assignedTo) return false;
  if (lead.assignedTo === actor.id) return true;

  const { readablePeerUserIds, editablePeerUserIds } = await getUserTeamPeerVisibilitySets(actor.id, tenantId);
  if (action === 'read') {
    return readablePeerUserIds.includes(lead.assignedTo);
  }
  if (action === 'edit') {
    return editablePeerUserIds.includes(lead.assignedTo);
  }

  return false;
}

export async function canReadLead(actor: any, leadOrId: string | any, tenantId: string): Promise<boolean> {
  return canAccessLead(actor, leadOrId, 'read', tenantId);
}

export async function canEditLead(actor: any, leadOrId: string | any, tenantId: string): Promise<boolean> {
  return canAccessLead(actor, leadOrId, 'edit', tenantId);
}

export async function canDeleteLead(actor: any, leadOrId: string | any, tenantId: string): Promise<boolean> {
  return canAccessLead(actor, leadOrId, 'delete', tenantId);
}

/**
 * Builds a SQL WHERE clause fragment and params to scope lead queries by actor:
 * - admin / platform: no extra filter (all tenant leads)
 * - team_lead: AND {alias}."assignedTo" IN ($1, $2...) (all members of led teams + self)
 * - user / member: AND {alias}."assignedTo" IN ($1, $2...) (self + readable peers)
 * Unassigned leads are excluded for non-admins (fail closed).
 */
export async function getScopedLeadFilterSql(
  actor: any,
  tenantId: string,
  tableAlias: string = 'l',
  startParamIndex: number = 1
): Promise<{ sql: string; params: any[] }> {
  const isPlatform = isPlatformRole(actor?.role);
  if (isPlatform || actor?.role === 'admin') {
    return { sql: '', params: [] };
  }

  const prefix = tableAlias ? `"${tableAlias}".` : '';

  if (actor?.role === 'team_lead') {
    const scopedUserIds = await getTeamLeadScopedUserIds(actor.id, tenantId);
    if (scopedUserIds.length === 0) {
      return { sql: ` AND 1=0`, params: [] };
    }
    const phs = scopedUserIds.map((_, i) => `$${startParamIndex + i}`).join(', ');
    return {
      sql: ` AND ${prefix}"assignedTo" IN (${phs})`,
      params: scopedUserIds
    };
  }

  // Standard member
  const { readablePeerUserIds } = await getUserTeamPeerVisibilitySets(actor.id, tenantId);
  const visibleUserIds = [actor.id, ...readablePeerUserIds];
  const phs = visibleUserIds.map((_, i) => `$${startParamIndex + i}`).join(', ');
  return {
    sql: ` AND ${prefix}"assignedTo" IN (${phs})`,
    params: visibleUserIds
  };
}

/**
 * Scopes call log visibility per actor role:
 * - Platform Admin / Company Owner: all tenant call logs.
 * - Team Lead: logs for leads assigned to self or members of teams they lead.
 * - Standard Member: logs for leads assigned to self or readable peers.
 */
export async function getScopedLogs(actor: any, tenantId: string): Promise<CallLog[]> {
  if (!tenantId) return [];
  const isPlatform = isPlatformRole(actor?.role);
  const isCompanyAdmin = actor?.role === 'admin';

  if (isPlatform || isCompanyAdmin) {
    return getLogs(tenantId);
  }

  let allowedUserIds: string[] = [];
  if (actor?.role === 'team_lead') {
    const scopedUserIds = await getTeamLeadScopedUserIds(actor.id, tenantId);
    allowedUserIds = scopedUserIds;
  } else {
    // Standard member / user
    const { readablePeerUserIds } = await getUserTeamPeerVisibilitySets(actor.id, tenantId);
    allowedUserIds = [actor.id, ...readablePeerUserIds];
  }

  if (allowedUserIds.length === 0) {
    return [];
  }

  const placeholders = allowedUserIds.map((_, i) => `$${i + 2}`).join(', ');
  return db.queryAll<CallLog>(`
    SELECT cl.*
    FROM call_logs cl
    LEFT JOIN leads l ON l.id = cl."leadId" AND l."tenantId" = cl."tenantId"
    WHERE cl."tenantId" = $1 AND (cl."userId" IN (${placeholders}) OR l."assignedTo" IN (${placeholders}))
    ORDER BY cl.timestamp DESC
  `, [tenantId, ...allowedUserIds]);
}

/**
 * Authorizes a user to disposition a lead.
 * Allows disposition when EITHER:
 * A. canEditLead(caller, lead, tenantId) is true (Company Owner, or Member assigned/collaborating)
 * OR
 * B. Authoritative call/session/lead-lock/journal state proves this authenticated user is the user
 *    currently handling that exact lead/call (e.g. legitimate shared-pool caller handling unassigned lead).
 */
export async function canDispositionLead(caller: any, lead: any, tenantId: string): Promise<boolean> {
  if (!caller || !lead || !tenantId) return false;

  // A. Structural edit permission
  if (await canEditLead(caller, lead, tenantId)) {
    return true;
  }

  const userId = caller.id;

  // B. Authoritative call/session/lead-lock/journal state
  // 1. Check if the lead is currently locked by a session owned by this user
  if (lead.lockedBy) {
    if (lead.lockedBy === userId) return true;
    try {
      const { getSessionById } = require('./sessionManager');
      const session = getSessionById(lead.lockedBy);
      if (session && session.userId === userId && (!session.tenantId || session.tenantId === tenantId)) {
        return true;
      }
    } catch (_) {}
  }

  // 2. Historical call evidence ONLY applies to unassigned leads in a shared pool.
  // If the lead is explicitly assigned to another user, historical callers MUST NOT disposition it.
  if (lead.assignedTo && lead.assignedTo !== userId) {
    return false;
  }

  // 3. Check call dispatch journal for pre-dispatch record
  try {
    const journalEntry = await db.queryOne<{ callId: string }>(
      `SELECT "callId" FROM call_dispatch_journal WHERE "leadId" = $1 AND "tenantId" = $2 AND "userId" = $3 LIMIT 1`,
      [lead.id, tenantId, userId]
    );
    if (journalEntry) return true;
  } catch (_) {}

  // 4. Check call outcomes for completed call outcome record
  try {
    const outcomeEntry = await db.queryOne<{ id: string }>(
      `SELECT id FROM call_outcomes WHERE "leadId" = $1 AND "tenantId" = $2 AND "userId" = $3 LIMIT 1`,
      [lead.id, tenantId, userId]
    );
    if (outcomeEntry) return true;
  } catch (_) {}

  return false;
}

/**
 * Scopes locked leads visibility per actor role:
 * - Platform Admin / Company Owner: all tenant locked leads.
 * - Team Lead: locked leads belonging to self or members of teams they lead.
 * - Member: only their own authorized locked lead(s).
 */
export async function getScopedLockedLeads(actor: any, tenantId?: string): Promise<Lead[]> {
  if (!tenantId) return [];
  const isPlatform = isPlatformRole(actor?.role);
  const isCompanyAdmin = actor?.role === 'admin';

  const allLocked = await getLockedLeads(tenantId);
  if (isPlatform || isCompanyAdmin) {
    return allLocked;
  }

  let allowedUserIds: string[] = [];
  if (actor?.role === 'team_lead') {
    const teamUserIds = await getTeamLeadScopedUserIds(actor.id, tenantId);
    allowedUserIds = [actor.id, ...teamUserIds];
  } else {
    allowedUserIds = [actor.id];
  }

  const allowedSet = new Set(allowedUserIds);

  let getSessionById: any = null;
  try {
    getSessionById = require('./sessionManager').getSessionById;
  } catch (_) {}

  return allLocked.filter(lead => {
    // Check assignedTo
    if (lead.assignedTo && allowedSet.has(lead.assignedTo)) {
      return true;
    }
    // Check lockedBy directly (if lockedBy stores userId)
    if (lead.lockedBy && allowedSet.has(lead.lockedBy)) {
      return true;
    }
    // Check session corresponding to lockedBy
    if (lead.lockedBy && getSessionById) {
      try {
        const sess = getSessionById(lead.lockedBy);
        if (sess && sess.userId && allowedSet.has(sess.userId)) {
          return true;
        }
      } catch (_) {}
    }
    return false;
  });
}



// ─── Super Admin Cross-Tenant Management APIs ────────────────────────────────

export interface SuperAdminTenantSummary {
  id: string;
  name: string;
  slug: string;
  status: string;
  ownerEmail: string;
  leadPoolMode: 'shared' | 'assigned';
  maxAgents: number;
  tier: string;
  customerType: 'COMPANY' | 'PERSONAL';
  maxTeamVisibility: 'OWN' | 'TEAM_READ' | 'TEAM_COLLABORATE';
  createdAt: string;
  totalUsers: number;
  totalLeads: number;
  totalCampaigns: number;
}

export async function getAllTenantsSummary(): Promise<SuperAdminTenantSummary[]> {
  const tenants = await db.queryAll<any>(`
    SELECT 
      t.id, 
      t.name, 
      t.slug, 
      t.status, 
      t."ownerEmail", 
      COALESCE(t."leadPoolMode", 'shared') as "leadPoolMode",
      COALESCE(t."maxAgents", 10) as "maxAgents",
      COALESCE(t.tier, 'standard') as tier,
      COALESCE(t."customerType", 'COMPANY') as "customerType",
      COALESCE(t."maxTeamVisibility", 'TEAM_COLLABORATE') as "maxTeamVisibility",
      t."createdAt"
    FROM tenants t
    ORDER BY t."createdAt" DESC
  `);

  let userCountMap: Record<string, number> = {};
  let leadCountMap: Record<string, number> = {};
  let campCountMap: Record<string, number> = {};

  try {
    const userCounts = await db.queryAll<any>(`SELECT "tenantId", COUNT(*) as cnt FROM users GROUP BY "tenantId"`);
    userCounts.forEach((r: any) => { if (r.tenantId) userCountMap[r.tenantId] = Number(r.cnt) || 0; });
  } catch {}

  try {
    const leadCounts = await db.queryAll<any>(`SELECT "tenantId", COUNT(*) as cnt FROM leads GROUP BY "tenantId"`);
    leadCounts.forEach((r: any) => { if (r.tenantId) leadCountMap[r.tenantId] = Number(r.cnt) || 0; });
  } catch {}

  try {
    const campCounts = await db.queryAll<any>(`SELECT "tenantId", COUNT(*) as cnt FROM campaigns GROUP BY "tenantId"`);
    campCounts.forEach((r: any) => { if (r.tenantId) campCountMap[r.tenantId] = Number(r.cnt) || 0; });
  } catch {}

  return tenants.map(t => ({
    id: t.id,
    name: t.name,
    slug: t.slug,
    status: t.status,
    ownerEmail: t.ownerEmail,
    leadPoolMode: (t.leadPoolMode === 'assigned' ? 'assigned' : 'shared'),
    maxAgents: Number(t.maxAgents) || 10,
    tier: t.tier || 'standard',
    customerType: (t.customerType === 'PERSONAL' ? 'PERSONAL' : 'COMPANY'),
    maxTeamVisibility: (t.maxTeamVisibility || 'TEAM_COLLABORATE'),
    createdAt: t.createdAt,
    totalUsers: userCountMap[t.id] || 0,
    totalLeads: leadCountMap[t.id] || 0,
    totalCampaigns: campCountMap[t.id] || 0
  }));
}

export async function updateTenantLeadPoolMode(tenantId: string, leadPoolMode: 'shared' | 'assigned'): Promise<void> {
  const now = new Date().toISOString();
  await db.execute(`
    UPDATE tenants
    SET "leadPoolMode" = $1, "updatedAt" = $2
    WHERE id = $3
  `, [leadPoolMode, now, tenantId]);
}

export async function updateTenantStatus(tenantId: string, status: 'active' | 'suspended'): Promise<void> {
  const now = new Date().toISOString();
  await db.execute(`
    UPDATE tenants
    SET status = $1, "updatedAt" = $2
    WHERE id = $3
  `, [status, now, tenantId]);
}

export async function updateTenantSeatLimit(tenantId: string, seatLimit: number, updatedBy: string): Promise<{ success: boolean; activeUsers: number; previousLimit: number }> {
  const now = new Date().toISOString();
  const currentTenant = await db.queryOne<any>(`SELECT "maxAgents" FROM tenants WHERE id = $1`, [tenantId]);
  const activeUsersCount = await db.queryOne<{ c: string | number }>(`
    SELECT COUNT(*) as c FROM users WHERE "tenantId" = $1 AND LOWER(role) NOT IN ('superadmin', 'platform_admin', 'master_admin', 'super_admin')
  `, [tenantId]);
  const activeUsers = Number(activeUsersCount?.c || 0);
  const previousLimit = Number(currentTenant?.maxAgents || 10);

  await db.execute(`
    UPDATE tenants
    SET "maxAgents" = $1, "updatedAt" = $2
    WHERE id = $3
  `, [seatLimit, now, tenantId]);

  try {
    await db.execute(`
      INSERT INTO audit_logs_admin (id, username, action, "targetType", "targetId", details, timestamp, "tenantId")
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
    `, [
      'audit_' + crypto.randomUUID(),
      updatedBy || 'platform_admin',
      'TENANT_SEAT_LIMIT_CHANGED',
      'tenant',
      tenantId,
      JSON.stringify({ previousLimit, newLimit: seatLimit, activeUsers, updatedBy }),
      now,
      tenantId
    ]);
  } catch (auditErr) {
    console.warn('[updateTenantSeatLimit] Failed writing audit log:', auditErr);
  }

  return { success: true, activeUsers, previousLimit };
}

export async function getGlobalCustomerUsers(options: {
  search?: string;
  role?: string;
  status?: string;
  tenantId?: string;
} = {}): Promise<any[]> {
  let query = `
    SELECT 
      u.id, 
      u.username, 
      u."displayName", 
      u.email, 
      u.role, 
      u.status, 
      u."tenantId", 
      t.name as "tenantName", 
      t.slug as "tenantSlug", 
      COALESCE(t."customerType", 'COMPANY') as "customerType",
      u."createdAt", 
      u."updatedAt"
    FROM users u
    LEFT JOIN tenants t ON t.id = u."tenantId"
    WHERE LOWER(u.role) NOT IN ('superadmin', 'platform_admin', 'master_admin', 'super_admin')
  `;
  const params: any[] = [];

  if (options.search && options.search.trim()) {
    const s = `%${options.search.trim().toLowerCase()}%`;
    params.push(s);
    query += ` AND (LOWER(u.username) LIKE $${params.length} OR LOWER(COALESCE(u."displayName", '')) LIKE $${params.length} OR LOWER(COALESCE(u.email, '')) LIKE $${params.length} OR LOWER(COALESCE(t.name, '')) LIKE $${params.length})`;
  }

  if (options.role && options.role !== 'all') {
    params.push(options.role);
    query += ` AND u.role = $${params.length}`;
  }

  if (options.status && options.status !== 'all') {
    params.push(options.status);
    query += ` AND u.status = $${params.length}`;
  }

  if (options.tenantId && options.tenantId !== 'all') {
    params.push(options.tenantId);
    query += ` AND u."tenantId" = $${params.length}`;
  }

  query += ` ORDER BY u."createdAt" DESC LIMIT 200`;

  const users = await db.queryAll<any>(query, params);

  const teamMap = new Map<string, string[]>();
  const permMap = new Map<string, string[]>();

  if (users.length > 0) {
    try {
      const teamMembers = await db.queryAll<any>(`
        SELECT tm."userId", t.name as "teamName"
        FROM team_members tm
        JOIN teams t ON t.id = tm."teamId"
      `);
      teamMembers.forEach(tm => {
        if (!teamMap.has(tm.userId)) teamMap.set(tm.userId, []);
        teamMap.get(tm.userId)!.push(tm.teamName);
      });

      const perms = await db.queryAll<any>(`
        SELECT "userId", "moduleId"
        FROM user_permissions
        WHERE enabled = 1
      `);
      perms.forEach(p => {
        if (!permMap.has(p.userId)) permMap.set(p.userId, []);
        permMap.get(p.userId)!.push(p.moduleId);
      });
    } catch {
      // ignore
    }
  }

  return users.map(u => {
    const isOwner = u.role === 'admin';
    const isTeamLead = u.role === 'team_lead';
    const roleDisplay = isOwner ? 'Company Owner' : (isTeamLead ? 'Team Lead' : 'Member');
    const teams = teamMap.get(u.id) || [];
    const teamDisplay = isOwner ? 'Entire Company' : (teams.length > 0 ? teams.join(', ') : 'Unassigned');
    const assignedModules = isOwner ? ['crm', 'octalDialer', 'autoEmailer', 'facebookPoster'] : (permMap.get(u.id) || ['crm']);

    return {
      id: u.id,
      username: u.username,
      displayName: u.displayName || u.username,
      email: u.email || '—',
      role: u.role,
      roleDisplay,
      status: u.status || 'Active',
      tenantId: u.tenantId,
      tenantName: u.tenantName || 'Unassigned',
      tenantSlug: u.tenantSlug || '',
      customerType: u.customerType || 'COMPANY',
      teamDisplay,
      teams,
      modules: assignedModules,
      createdAt: u.createdAt
    };
  });
}

export async function getGlobalSuperAdminMetrics(): Promise<{
  totalTenants: number;
  totalUsers: number;
  totalLeads: number;
  activeCampaigns: number;
}> {
  const tenantsCount = await db.queryOne<{ c: string | number }>(`SELECT COUNT(*) as c FROM tenants`);
  const usersCount = await db.queryOne<{ c: string | number }>(`SELECT COUNT(*) as c FROM users`);
  const leadsCount = await db.queryOne<{ c: string | number }>(`SELECT COUNT(*) as c FROM leads`);
  const campsCount = await db.queryOne<{ c: string | number }>(`SELECT COUNT(*) as c FROM campaigns`);

  return {
    totalTenants: Number(tenantsCount?.c || 0),
    totalUsers: Number(usersCount?.c || 0),
    totalLeads: Number(leadsCount?.c || 0),
    activeCampaigns: Number(campsCount?.c || 0)
  };
}

// ─── PLATFORM OWNER LIVE OBSERVABILITY & SYNC DATA LAYER ──────────────────────

export interface GlobalPlatformOverview {
  // Tenants
  totalTenants: number;
  activeTenants: number;
  companyTenants: number;
  personalTenants: number;
  suspendedTenants: number;
  trialTenants: number;
  pastDueTenants: number;
  // Users
  totalUsers: number;
  companyOwners: number;
  teamLeads: number;
  members: number;
  platformAdmins: number;
  // Leads & Campaigns
  totalLeads: number;
  newLeadsToday: number;
  activeCampaigns: number;
  totalCampaigns: number;
  // Calls
  callsToday: number;
  connectedCallsToday: number;
  // Devices
  connectedMobileDevices: number;
  offlineDevices: number;
  totalDevices: number;
  // Commercial
  activeSubscriptions: number;
  trialAccounts: number;
  pastDueAccounts: number;
  canceledAccounts: number;
  // Metadata & Timestamps
  lastPlatformActivity: string | null;
  serverTimestamp: string;
  dataUnavailable?: boolean;
}

export async function getGlobalPlatformOverview(): Promise<GlobalPlatformOverview> {
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();

  let totalTenants = 0;
  let activeTenants = 0;
  let companyTenants = 0;
  let personalTenants = 0;
  let suspendedTenants = 0;
  let trialTenants = 0;
  let pastDueTenants = 0;

  try {
    const tenantRows = await db.queryAll<any>(`
      SELECT status, COALESCE("customerType", 'COMPANY') as ctype, COUNT(*) as cnt 
      FROM tenants 
      GROUP BY status, "customerType"
    `);
    tenantRows.forEach(r => {
      const c = Number(r.cnt) || 0;
      totalTenants += c;
      if (r.status === 'active') activeTenants += c;
      if (r.status === 'suspended') suspendedTenants += c;
      if (r.status === 'trial') trialTenants += c;
      if (r.status === 'past_due') pastDueTenants += c;
      if (r.ctype === 'PERSONAL') personalTenants += c;
      else companyTenants += c;
    });
  } catch (err) {
    console.error('[Observability] Tenants query error:', err);
  }

  let totalUsers = 0;
  let companyOwners = 0;
  let teamLeads = 0;
  let members = 0;
  let platformAdmins = 0;

  try {
    const userRows = await db.queryAll<any>(`SELECT role, COUNT(*) as cnt FROM users GROUP BY role`);
    userRows.forEach(r => {
      const c = Number(r.cnt) || 0;
      if (r.role === 'admin') companyOwners += c;
      else if (r.role === 'team_lead') teamLeads += c;
      else if (isPlatformRole(r.role)) platformAdmins += c;
      else members += c;
    });
    // Customer total users excludes platform administrators
    totalUsers = companyOwners + teamLeads + members;
  } catch (err) {
    console.error('[Observability] Users query error:', err);
  }

  let totalLeads = 0;
  let newLeadsToday = 0;
  try {
    const leadsCount = await db.queryOne<{ c: string | number }>(`SELECT COUNT(*) as c FROM leads`);
    totalLeads = Number(leadsCount?.c || 0);
    const leadsTodayCount = await db.queryOne<{ c: string | number }>(`SELECT COUNT(*) as c FROM leads WHERE "createdAt" >= $1`, [todayStart]);
    newLeadsToday = Number(leadsTodayCount?.c || 0);
  } catch (err) {
    console.error('[Observability] Leads query error:', err);
  }

  let totalCampaigns = 0;
  let activeCampaigns = 0;
  try {
    const campRows = await db.queryAll<any>(`SELECT status, COUNT(*) as cnt FROM campaigns GROUP BY status`);
    campRows.forEach(r => {
      const c = Number(r.cnt) || 0;
      totalCampaigns += c;
      if (r.status === 'ACTIVE' || r.status === 'active') activeCampaigns += c;
    });
  } catch (err) {
    console.error('[Observability] Campaigns query error:', err);
  }

  let callsToday = 0;
  let connectedCallsToday = 0;
  try {
    const callsCount = await db.queryOne<{ c: string | number }>(`SELECT COUNT(*) as c FROM call_logs WHERE timestamp >= $1`, [todayStart]);
    callsToday = Number(callsCount?.c || 0);
    const connectedCount = await db.queryOne<{ c: string | number }>(`
      SELECT COUNT(*) as c FROM call_logs 
      WHERE timestamp >= $1 AND (duration > 0 OR outcome IN ('ANSWERED', 'COMPLETED', 'CONNECTED'))
    `, [todayStart]);
    connectedCallsToday = Number(connectedCount?.c || 0);
  } catch (err) {
    console.error('[Observability] Calls query error:', err);
  }

  let connectedMobileDevices = 0;
  let offlineDevices = 0;
  let totalDevices = 0;
  try {
    const devRows = await db.queryAll<any>(`SELECT status, COUNT(*) as cnt FROM devices GROUP BY status`);
    devRows.forEach(r => {
      const c = Number(r.cnt) || 0;
      totalDevices += c;
      if (r.status === 'ONLINE' || r.status === 'online') connectedMobileDevices += c;
      else offlineDevices += c;
    });
  } catch (err) {
    console.error('[Observability] Devices query error:', err);
  }

  let activeSubscriptions = 0;
  let trialAccounts = 0;
  let pastDueAccounts = 0;
  let canceledAccounts = 0;
  try {
    const subRows = await db.queryAll<any>(`SELECT status, COUNT(*) as cnt FROM subscriptions GROUP BY status`);
    subRows.forEach(r => {
      const c = Number(r.cnt) || 0;
      if (r.status === 'active') activeSubscriptions += c;
      else if (r.status === 'trial') trialAccounts += c;
      else if (r.status === 'past_due') pastDueAccounts += c;
      else if (r.status === 'canceled' || r.status === 'cancelled') canceledAccounts += c;
    });
  } catch (err) {
    console.error('[Observability] Subscriptions query error:', err);
  }

  let lastPlatformActivity: string | null = null;
  try {
    const latestCall = await db.queryOne<any>(`SELECT timestamp FROM call_logs ORDER BY timestamp DESC LIMIT 1`);
    const latestAudit = await db.queryOne<any>(`SELECT timestamp FROM audit_logs_admin ORDER BY timestamp DESC LIMIT 1`);
    const candidates = [latestCall?.timestamp, latestAudit?.timestamp, now.toISOString()].filter(Boolean);
    candidates.sort().reverse();
    lastPlatformActivity = candidates[0] || null;
  } catch {}

  return {
    totalTenants,
    activeTenants,
    companyTenants,
    personalTenants,
    suspendedTenants,
    trialTenants,
    pastDueTenants,
    totalUsers,
    companyOwners,
    teamLeads,
    members,
    platformAdmins,
    totalLeads,
    newLeadsToday,
    activeCampaigns,
    totalCampaigns,
    callsToday,
    connectedCallsToday,
    connectedMobileDevices,
    offlineDevices,
    totalDevices,
    activeSubscriptions,
    trialAccounts,
    pastDueAccounts,
    canceledAccounts,
    lastPlatformActivity,
    serverTimestamp: now.toISOString()
  };
}

export interface DetailedTenantRecord {
  id: string;
  name: string;
  slug: string;
  customerType: 'COMPANY' | 'PERSONAL';
  status: 'active' | 'suspended' | 'trial' | 'past_due';
  isTrial?: boolean;
  trialEndsAt?: string | null;
  primaryOwner: {
    username: string;
    email: string | null;
    displayName?: string;
  };
  plan: string;
  tier?: string;
  subscriptionStatus: string;
  moduleEntitlements: string[];
  createdAt: string;
  lastActivityAt: string | null;
  userCount: number;
  teamCount: number;
  teamLeadCount: number;
  memberCount: number;
  leadCount: number;
  campaignCount: number;
  callsToday: number;
  callsThisMonth: number;
  connectedDevices: number;
  offlineDevices: number;
  activeSockets: number;
  runningJobs: { scraper: number; emailer: number; facebook: number };
  errorCount: number;
  leadPoolMode: 'shared' | 'assigned';
  healthStatus: 'HEALTHY' | 'WARNING' | 'DEGRADED' | 'OFFLINE';
  healthReasons: string[];
}

// ============================================================================
// CANONICAL MODULE CATALOG & ENTITLEMENT HIERARCHY
// ============================================================================

export interface CanonicalModule {
  id: string;
  key: string;
  label: string;
  icon: string;
  desc: string;
  aliases?: string[];
}

export const CANONICAL_MODULES: CanonicalModule[] = [
  { id: 'crm', key: 'crm', label: 'CRM Workspace', icon: '👥', desc: 'Contacts & customer intelligence' },
  { id: 'campaigns', key: 'campaigns', label: 'Campaigns', icon: '📂', desc: 'Campaign pipelines & dialing queues' },
  { id: 'leads', key: 'leads', label: 'Leads Database', icon: '🗄️', desc: 'Contact explorer & imports' },
  { id: 'octalDialer', key: 'octalDialer', aliases: ['dialer'], label: 'OCTAL Dialer', icon: '📞', desc: 'GSM auto-dialer & telephony' },
  { id: 'reports', key: 'reports', aliases: ['analytics'], label: 'Reports & Analytics', icon: '📊', desc: 'Call metrics & performance exports' },
  { id: 'autoEmailer', key: 'autoEmailer', aliases: ['auto_emailer'], label: 'Email Manager', icon: '✉️', desc: 'Cold email sequences & SMTP' },
  { id: 'facebookPoster', key: 'facebookPoster', aliases: ['facebook_poster'], label: 'FB Auto Poster', icon: '📤', desc: 'Scheduled Facebook postings' }
];

export const LEGACY_SCRAPER_MODULES: CanonicalModule[] = [
  { id: 'googleScraper', key: 'googleScraper', aliases: ['google_scraper'], label: 'Google Scraper', icon: '🔍', desc: 'Google Maps B2B lead extractor (Lead-Gen)' },
  { id: 'facebookScraper', key: 'facebookScraper', aliases: ['facebook_scraper'], label: 'Facebook Scraper', icon: '📘', desc: 'Facebook group member extractor (Lead-Gen)' }
];

export const ALL_CANONICAL_MODULES: CanonicalModule[] = [
  ...CANONICAL_MODULES,
  ...LEGACY_SCRAPER_MODULES
];

export function normalizeModuleKey(rawKey: string): string {
  const clean = typeof rawKey === 'string' ? rawKey.trim() : '';
  for (const mod of ALL_CANONICAL_MODULES) {
    if (mod.id === clean || mod.key === clean) return mod.id;
    if (mod.aliases && mod.aliases.includes(clean)) return mod.id;
  }
  return clean;
}

export async function getTenantModuleEntitlements(tenantId: string): Promise<Record<string, boolean>> {
  const result: Record<string, boolean> = {};

  // All canonical business modules default to TRUE (included in all company plans unless explicitly turned off)
  CANONICAL_MODULES.forEach(m => {
    result[m.id] = true;
    if (m.aliases) {
      m.aliases.forEach(a => { result[a] = true; });
    }
  });

  // Legacy scrapers default to FALSE (independent add-ons)
  LEGACY_SCRAPER_MODULES.forEach(m => {
    result[m.id] = false;
    if (m.aliases) {
      m.aliases.forEach(a => { result[a] = false; });
    }
  });

  if (!tenantId) return result;

  try {
    const rows = await db.queryAll<{ moduleId: string; enabled: number }>(`
      SELECT "moduleId", enabled FROM tenant_module_entitlements WHERE "tenantId" = $1
    `, [tenantId]);

    const existingCanonicalKeys = new Set<string>();

    for (const r of rows) {
      const canonical = normalizeModuleKey(r.moduleId);
      existingCanonicalKeys.add(canonical);
      // Explicit 1 = enabled, explicit 0 = disabled by Master Admin
      const isEnabled = Number(r.enabled) === 1;
      result[canonical] = isEnabled;
      const modDef = ALL_CANONICAL_MODULES.find(m => m.id === canonical);
      if (modDef?.aliases) {
        modDef.aliases.forEach(a => { result[a] = isEnabled; });
      }
    }

    // Auto-seed missing canonical modules into tenant_module_entitlements table
    // so PostgreSQL records are permanently created and explicitly stored with enabled = 1
    const missingCanonical = CANONICAL_MODULES.filter(m => !existingCanonicalKeys.has(m.id));
    if (missingCanonical.length > 0) {
      const now = new Date().toISOString();
      for (const missing of missingCanonical) {
        try {
          await db.execute(`
            INSERT INTO tenant_module_entitlements (id, "tenantId", "moduleId", enabled, "updatedBy", "updatedAt")
            VALUES ($1, $2, $3, 1, 'system_auto_seed', $4)
            ON CONFLICT ("tenantId", "moduleId") DO NOTHING
          `, ['tme_' + crypto.randomUUID(), tenantId, missing.id, now]);
        } catch {
          // ignore concurrent collision
        }
      }
    }
  } catch (err) {
    console.error(`[getTenantModuleEntitlements] Error querying entitlements for ${tenantId}:`, err);
  }

  return result;
}

export async function setTenantModuleEntitlement(
  tenantId: string,
  moduleId: string,
  enabled: boolean,
  updatedBy: string
): Promise<void> {
  const canonicalId = normalizeModuleKey(moduleId);
  if (!ALL_CANONICAL_MODULES.some(m => m.id === canonicalId) || typeof enabled !== 'boolean') {
    throw new Error('A known module ID and boolean enabled value are required.');
  }
  const enabledInt = enabled ? 1 : 0;
  const now = new Date().toISOString();
  const id = 'tme_' + crypto.randomUUID();

  await db.execute(`
    INSERT INTO tenant_module_entitlements (id, "tenantId", "moduleId", enabled, "updatedBy", "updatedAt")
    VALUES ($1, $2, $3, $4, $5, $6)
    ON CONFLICT ("tenantId", "moduleId")
    DO UPDATE SET enabled = EXCLUDED.enabled, "updatedBy" = EXCLUDED."updatedBy", "updatedAt" = EXCLUDED."updatedAt"
  `, [id, tenantId, canonicalId, enabledInt, updatedBy || 'platform_admin', now]);

  try {
    await db.execute(`
      INSERT INTO audit_logs_admin (id, username, action, "targetType", "targetId", details, timestamp, "tenantId")
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
    `, [
      'audit_' + crypto.randomUUID(),
      updatedBy || 'system',
      'TENANT_MODULE_ENTITLEMENT_CHANGED',
      'tenant',
      tenantId,
      JSON.stringify({ moduleId: canonicalId, enabled, updatedBy }),
      now,
      tenantId
    ]);
  } catch (auditErr) {
    console.warn('[setTenantModuleEntitlement] Failed writing audit log:', auditErr);
  }
}

export async function getTenantAccessMatrix(tenantId: string): Promise<any[]> {
  const entitlements = await getTenantModuleEntitlements(tenantId);
  const enabledCompanyModules = CANONICAL_MODULES.filter(m => entitlements[m.id]);
  const companyCeilingSummary = `${enabledCompanyModules.length}/${CANONICAL_MODULES.length} company modules`;

  const users = await db.queryAll<any>(`
    SELECT id, username, "displayName", email, role, "roleId", "tenantId", status, "createdAt"
    FROM users
    WHERE "tenantId" = $1 AND LOWER(role) NOT IN ('superadmin', 'platform_admin', 'master_admin', 'super_admin')
    ORDER BY CASE WHEN role = 'admin' THEN 1 WHEN role = 'team_lead' THEN 2 ELSE 3 END, "createdAt" ASC
  `, [tenantId]);

  const teamMembers = await db.queryAll<any>(`
    SELECT tm."userId", t.name as "teamName"
    FROM team_members tm
    JOIN teams t ON t.id = tm."teamId"
    WHERE t."tenantId" = $1
  `, [tenantId]);
  const userTeamsMap = new Map<string, string[]>();
  teamMembers.forEach(tm => {
    if (!userTeamsMap.has(tm.userId)) userTeamsMap.set(tm.userId, []);
    userTeamsMap.get(tm.userId)!.push(tm.teamName);
  });

  const permissions = await db.queryAll<any>(`
    SELECT "userId", "moduleId", enabled
    FROM user_permissions
    WHERE "tenantId" = $1
  `, [tenantId]);
  const userPermMap = new Map<string, Set<string>>();
  permissions.forEach(p => {
    if (Number(p.enabled) === 1) {
      if (!userPermMap.has(p.userId)) userPermMap.set(p.userId, new Set());
      userPermMap.get(p.userId)!.add(normalizeModuleKey(p.moduleId));
    }
  });

  const { getUserModuleAccess } = await import('./authManager');
  return Promise.all(users.map(async u => {
    const isOwner = u.role === 'admin';
    const isTeamLead = u.role === 'team_lead';
    const assignedSet = userPermMap.get(u.id) || new Set<string>();

    let assignedList: string[];
    if (isOwner) {
      assignedList = enabledCompanyModules.map(m => m.id);
    } else {
      assignedList = Array.from(assignedSet);
    }

    const access = await getUserModuleAccess(u, entitlements);
    assignedList = access.assignedModules;
    const effectiveList = access.effectiveModules;
    const userTeams = userTeamsMap.get(u.id) || [];
    const teamDisplay = isOwner 
      ? 'Entire Company' 
      : (userTeams.length > 0 ? userTeams.join(', ') : 'Unassigned');

    const roleDisplay = isOwner ? 'Company Owner' : (isTeamLead ? 'Team Lead' : 'Member');

    return {
      userId: u.id,
      username: u.username,
      displayName: u.displayName || u.username,
      email: u.email,
      role: u.role,
      roleDisplay,
      teamDisplay,
      companyCeiling: companyCeilingSummary,
      assignedCount: assignedList.length,
      assignedSummary: isOwner ? companyCeilingSummary : `${assignedList.length}/${enabledCompanyModules.length} assigned`,
      effectiveCount: effectiveList.length,
      effectiveSummary: `${effectiveList.length} effective`,
      assignedModules: assignedList,
      effectiveModules: effectiveList,
      companyEntitlements: enabledCompanyModules.map(m => m.id),
      status: u.status || 'Active'
    };
  }));
}

export interface DetailedTenantsListResult {
  tenants: DetailedTenantRecord[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export async function getDetailedTenantsList(options: {
  page?: number;
  limit?: number;
  search?: string;
  type?: string;
  status?: string;
  health?: string;
} = {}): Promise<DetailedTenantsListResult> {
  const page = Math.max(1, Number(options.page) || 1);
  const limit = Math.max(1, Math.min(100, Number(options.limit) || 20));
  const offset = (page - 1) * limit;

  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();

  // 1. Fetch all tenants matching filter & search
  let query = `
    SELECT 
      t.id, 
      t.name, 
      t.slug, 
      t.status, 
      t."ownerEmail", 
      COALESCE(t."leadPoolMode", 'shared') as "leadPoolMode",
      COALESCE(t."maxAgents", 10) as "maxAgents",
      COALESCE(t.tier, 'standard') as tier,
      COALESCE(t."customerType", 'COMPANY') as "customerType",
      COALESCE(t."maxTeamVisibility", 'TEAM_COLLABORATE') as "maxTeamVisibility",
      t."createdAt",
      t."updatedAt"
    FROM tenants t
    WHERE 1=1
  `;
  const params: any[] = [];

  if (options.search && options.search.trim()) {
    const s = `%${options.search.trim().toLowerCase()}%`;
    params.push(s);
    query += ` AND (LOWER(t.name) LIKE $${params.length} OR LOWER(t.slug) LIKE $${params.length} OR LOWER(t.id) LIKE $${params.length} OR LOWER(COALESCE(t."ownerEmail", '')) LIKE $${params.length})`;
  }

  if (options.type && options.type !== 'all') {
    params.push(options.type);
    query += ` AND t."customerType" = $${params.length}`;
  }

  if (options.status && options.status !== 'all') {
    params.push(options.status);
    query += ` AND t.status = $${params.length}`;
  }

  query += ` ORDER BY t."createdAt" DESC`;

  const allMatchingTenants = await db.queryAll<any>(query, params);
  const total = allMatchingTenants.length;
  const totalPages = Math.ceil(total / limit) || 1;
  const paginatedTenants = allMatchingTenants.slice(offset, offset + limit);

  if (paginatedTenants.length === 0) {
    return { tenants: [], total, page, limit, totalPages };
  }

  // 2. Fetch Grouped Metrics across these tenants (No N+1)
  const tenantIds = paginatedTenants.map(t => t.id);

  // Users breakdown
  const userStatsMap: Record<string, { total: number; owners: number; teamLeads: number; members: number; primaryOwner: any }> = {};
  tenantIds.forEach(id => {
    userStatsMap[id] = { total: 0, owners: 0, teamLeads: 0, members: 0, primaryOwner: null };
  });

  try {
    const userRows = await db.queryAll<any>(`
      SELECT id, username, email, "displayName", role, "tenantId", "createdAt" 
      FROM users 
      ORDER BY "createdAt" ASC
    `);
    userRows.forEach(u => {
      if (u.tenantId && userStatsMap[u.tenantId]) {
        if (isPlatformRole(u.role)) {
          // Strictly exclude platform administrators from customer organization metrics
          return;
        }
        const s = userStatsMap[u.tenantId];
        s.total++;
        if (u.role === 'admin') {
          s.owners++;
          if (!s.primaryOwner) s.primaryOwner = { username: u.username, email: u.email, displayName: u.displayName };
        } else if (u.role === 'team_lead') {
          s.teamLeads++;
        } else {
          s.members++;
        }
        if (!s.primaryOwner) {
          s.primaryOwner = { username: u.username, email: u.email, displayName: u.displayName };
        }
      }
    });
  } catch (err) {
    console.error('[Observability] User stats mapping error:', err);
  }

  // Module entitlements breakdown across page
  const tenantModulesMap: Record<string, string[]> = {};
  const tenantsConfigured = new Set<string>();
  tenantIds.forEach(id => { tenantModulesMap[id] = []; });
  try {
    const tmeRows = await db.queryAll<any>(`
      SELECT "tenantId", "moduleId", enabled FROM tenant_module_entitlements
    `);
    tmeRows.forEach(r => {
      if (r.tenantId && tenantModulesMap[r.tenantId] !== undefined) {
        tenantsConfigured.add(r.tenantId);
        if (Number(r.enabled) === 1) {
          tenantModulesMap[r.tenantId].push(normalizeModuleKey(r.moduleId));
        }
      }
    });
  } catch {}

  // Teams breakdown
  const teamCountMap: Record<string, number> = {};
  try {
    const teamRows = await db.queryAll<any>(`SELECT "tenantId", COUNT(*) as cnt FROM teams GROUP BY "tenantId"`);
    teamRows.forEach(r => { if (r.tenantId) teamCountMap[r.tenantId] = Number(r.cnt) || 0; });
  } catch {}

  // Leads breakdown
  const leadCountMap: Record<string, number> = {};
  try {
    const leadRows = await db.queryAll<any>(`SELECT "tenantId", COUNT(*) as cnt FROM leads GROUP BY "tenantId"`);
    leadRows.forEach(r => { if (r.tenantId) leadCountMap[r.tenantId] = Number(r.cnt) || 0; });
  } catch {}

  // Campaigns breakdown
  const campCountMap: Record<string, number> = {};
  try {
    const campRows = await db.queryAll<any>(`SELECT "tenantId", COUNT(*) as cnt FROM campaigns GROUP BY "tenantId"`);
    campRows.forEach(r => { if (r.tenantId) campCountMap[r.tenantId] = Number(r.cnt) || 0; });
  } catch {}

  // Calls today & this month
  const callsTodayMap: Record<string, number> = {};
  const callsMonthMap: Record<string, number> = {};
  const lastCallMap: Record<string, string> = {};
  try {
    const callsTodayRows = await db.queryAll<any>(`
      SELECT "tenantId", COUNT(*) as cnt, MAX(timestamp) as last_ts 
      FROM call_logs 
      WHERE timestamp >= $1 
      GROUP BY "tenantId"
    `, [todayStart]);
    callsTodayRows.forEach(r => {
      if (r.tenantId) {
        callsTodayMap[r.tenantId] = Number(r.cnt) || 0;
        if (r.last_ts) lastCallMap[r.tenantId] = r.last_ts;
      }
    });

    const callsMonthRows = await db.queryAll<any>(`
      SELECT "tenantId", COUNT(*) as cnt, MAX(timestamp) as last_ts 
      FROM call_logs 
      WHERE timestamp >= $1 
      GROUP BY "tenantId"
    `, [monthStart]);
    callsMonthRows.forEach(r => {
      if (r.tenantId) {
        callsMonthMap[r.tenantId] = Number(r.cnt) || 0;
        if (r.last_ts && !lastCallMap[r.tenantId]) lastCallMap[r.tenantId] = r.last_ts;
      }
    });
  } catch (err) {
    console.error('[Observability] Call stats mapping error:', err);
  }

  // Devices online/offline
  const deviceOnlineMap: Record<string, number> = {};
  const deviceOfflineMap: Record<string, number> = {};
  try {
    const devRows = await db.queryAll<any>(`SELECT "tenantId", status, COUNT(*) as cnt FROM devices GROUP BY "tenantId", status`);
    devRows.forEach(r => {
      if (r.tenantId) {
        const c = Number(r.cnt) || 0;
        if (r.status === 'ONLINE' || r.status === 'online') deviceOnlineMap[r.tenantId] = (deviceOnlineMap[r.tenantId] || 0) + c;
        else deviceOfflineMap[r.tenantId] = (deviceOfflineMap[r.tenantId] || 0) + c;
      }
    });
  } catch {}

  // Subscriptions
  const subMap: Record<string, { planId: string; status: string; currentPeriodEnd: string | null; trialEnd: string | null }> = {};
  try {
    const subRows = await db.queryAll<any>(`
      SELECT "tenantId", "planId", status, "currentPeriodEnd", "trialEnd", "createdAt" 
      FROM subscriptions 
      ORDER BY "createdAt" ASC
    `);
    subRows.forEach(r => {
      if (r.tenantId) subMap[r.tenantId] = {
        planId: r.planId || 'starter',
        status: r.status || 'active',
        currentPeriodEnd: r.currentPeriodEnd || null,
        trialEnd: r.trialEnd || null
      };
    });
  } catch {}

  // 3. Assemble detailed records with calculated Health Status
  const records: DetailedTenantRecord[] = paginatedTenants.map(t => {
    const uStats = userStatsMap[t.id] || { total: 0, owners: 0, teamLeads: 0, members: 0, primaryOwner: null };
    const leadCount = leadCountMap[t.id] || 0;
    const campaignCount = campCountMap[t.id] || 0;
    const teamCount = teamCountMap[t.id] || 0;
    const callsToday = callsTodayMap[t.id] || 0;
    const callsThisMonth = callsMonthMap[t.id] || 0;
    const connectedDevices = deviceOnlineMap[t.id] || 0;
    const offlineDevices = deviceOfflineMap[t.id] || 0;
    const totalRegisteredDevices = connectedDevices + offlineDevices;

    const sub = subMap[t.id] || { planId: t.tier || 'starter', status: t.status === 'suspended' ? 'suspended' : (t.status === 'trial' ? 'trialing' : 'active'), currentPeriodEnd: null, trialEnd: null };
    
    // Clean and normalize plan & tier representation
    const rawPlan = sub.planId || t.tier || 'starter';
    const cleanPlan = rawPlan.toLowerCase().replace(/^plan_/, '').trim() || 'starter';
    const effectivePlan = cleanPlan === 'standard' ? 'starter' : cleanPlan;

    // Authoritative trial detection
    const isTrial = t.status === 'trial' || sub.status === 'trialing';
    let effectiveStatus: 'active' | 'suspended' | 'trial' | 'past_due' = 'active';
    if (t.status === 'suspended') {
      effectiveStatus = 'suspended';
    } else if (sub.status === 'past_due') {
      effectiveStatus = 'past_due';
    } else if (isTrial) {
      effectiveStatus = 'trial';
    } else {
      effectiveStatus = (t.status === 'trial' ? 'trial' : 'active');
    }

    const createdTime = t.createdAt ? new Date(t.createdAt).getTime() : NaN;
    const defaultTrialEnd = new Date((!isNaN(createdTime) ? createdTime : Date.now()) + 14 * 86400000).toISOString();
    const trialEndsAt = isTrial ? (sub.currentPeriodEnd || sub.trialEnd || defaultTrialEnd) : null;

    // Concrete Health Status computation (Section 4)
    let healthStatus: 'HEALTHY' | 'WARNING' | 'DEGRADED' | 'OFFLINE' = 'HEALTHY';
    const healthReasons: string[] = [];

    if (t.status === 'suspended') {
      healthStatus = 'OFFLINE';
      healthReasons.push('Workspace suspended by administrator');
    } else if (uStats.total === 0) {
      healthStatus = 'OFFLINE';
      healthReasons.push('No provisioned user accounts');
    }

    if (sub.status === 'past_due') {
      if (healthStatus !== 'OFFLINE') healthStatus = 'DEGRADED';
      healthReasons.push('Subscription billing past due');
    }

    if (totalRegisteredDevices > 0 && connectedDevices === 0) {
      if (healthStatus === 'HEALTHY') healthStatus = 'WARNING';
      healthReasons.push(`${offlineDevices} registered device(s) currently offline`);
    }

    if (healthReasons.length === 0) {
      healthReasons.push('All systems operational');
    }

    return {
      id: t.id,
      name: t.name,
      slug: t.slug,
      customerType: (t.customerType === 'PERSONAL' ? 'PERSONAL' : 'COMPANY'),
      status: effectiveStatus,
      isTrial,
      trialEndsAt,
      primaryOwner: uStats.primaryOwner || { username: 'unassigned', email: t.ownerEmail || null },
      plan: effectivePlan,
      tier: effectivePlan,
      subscriptionStatus: isTrial ? 'trialing' : sub.status,
      moduleEntitlements: tenantsConfigured.has(t.id)
        ? Array.from(new Set(tenantModulesMap[t.id]))
        : CANONICAL_MODULES.map(m => m.id),
      createdAt: t.createdAt,
      lastActivityAt: lastCallMap[t.id] || t.updatedAt || t.createdAt,
      userCount: uStats.total,
      teamCount,
      teamLeadCount: uStats.teamLeads,
      memberCount: uStats.members,
      leadCount,
      campaignCount,
      callsToday,
      callsThisMonth,
      connectedDevices,
      offlineDevices,
      activeSockets: connectedDevices,
      runningJobs: { scraper: 0, emailer: 0, facebook: 0 },
      errorCount: healthStatus === 'DEGRADED' ? 1 : 0,
      leadPoolMode: (t.leadPoolMode === 'assigned' ? 'assigned' : 'shared'),
      healthStatus,
      healthReasons
    };
  });

  // Filter by health if specified
  let finalTenants = records;
  if (options.health && options.health !== 'all') {
    finalTenants = records.filter(r => r.healthStatus === options.health);
  }

  return {
    tenants: finalTenants,
    total,
    page,
    limit,
    totalPages
  };
}

export async function getTenantDetail(tenantId: string): Promise<any> {
  const tenant = await getTenantById(tenantId);
  if (!tenant) return null;

  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();

  // Users in tenant (strictly sanitized, NO passwords/secrets, strictly excluding platform admins)
  const users = await db.queryAll<any>(`
    SELECT id, username, email, "displayName", role, status, "createdAt", "updatedAt"
    FROM users
    WHERE "tenantId" = $1 AND LOWER(role) NOT IN ('superadmin', 'platform_admin', 'master_admin', 'super_admin')
    ORDER BY CASE WHEN role = 'admin' THEN 1 WHEN role = 'team_lead' THEN 2 ELSE 3 END, "createdAt" ASC
  `, [tenantId]);

  const moduleEntitlements = await getTenantModuleEntitlements(tenantId);
  const accessMatrix = await getTenantAccessMatrix(tenantId);
  const enabledModulesList = CANONICAL_MODULES.filter(m => moduleEntitlements[m.id]).map(m => m.id);

  // Teams in tenant
  const teams = await db.queryAll<any>(`
    SELECT id, name, description, "leaderId", status, "createdAt"
    FROM teams
    WHERE "tenantId" = $1
    ORDER BY "createdAt" ASC
  `, [tenantId]);

  // Campaigns in tenant
  const campaigns = await db.queryAll<any>(`
    SELECT id, name, "leadCount", status, "createdAt"
    FROM campaigns
    WHERE "tenantId" = $1
    ORDER BY "createdAt" DESC
    LIMIT 20
  `, [tenantId]);

  // Lead totals & outcomes
  const leadsCount = await db.queryOne<{ c: string | number }>(`SELECT COUNT(*) as c FROM leads WHERE "tenantId" = $1`, [tenantId]);
  const leadStatuses = await db.queryAll<any>(`
    SELECT status, COUNT(*) as cnt 
    FROM leads 
    WHERE "tenantId" = $1 
    GROUP BY status
  `, [tenantId]);

  // Calls
  const callsTodayCount = await db.queryOne<{ c: string | number }>(`
    SELECT COUNT(*) as c FROM call_logs WHERE "tenantId" = $1 AND timestamp >= $2
  `, [tenantId, todayStart]);
  const callsMonthCount = await db.queryOne<{ c: string | number }>(`
    SELECT COUNT(*) as c FROM call_logs WHERE "tenantId" = $1 AND timestamp >= $2
  `, [tenantId, monthStart]);

  // Devices
  const devices = await db.queryAll<any>(`
    SELECT id, name, status, platform, "osType", "appVersion", "lastSeenAt", "createdAt"
    FROM devices
    WHERE "tenantId" = $1
    ORDER BY "lastSeenAt" DESC NULLS LAST
  `, [tenantId]);

  // Subscription
  const subscription = await db.queryOne<any>(`
    SELECT id, "planId", status, "currentPeriodStart", "currentPeriodEnd", "trialEnd", provider
    FROM subscriptions
    WHERE "tenantId" = $1
    ORDER BY "createdAt" DESC
    LIMIT 1
  `, [tenantId]);

  // Recent audit logs
  const auditLogs = await db.queryAll<any>(`
    SELECT id, action, "targetType", "targetId", details, timestamp
    FROM audit_logs_admin
    WHERE "tenantId" = $1
    ORDER BY timestamp DESC
    LIMIT 10
  `, [tenantId]);

  // Health signals
  const healthReasons: string[] = [];
  let healthStatus: 'HEALTHY' | 'WARNING' | 'DEGRADED' | 'OFFLINE' = 'HEALTHY';
  if (tenant.status === 'suspended') {
    healthStatus = 'OFFLINE';
    healthReasons.push('Workspace suspended by administrator');
  } else if (users.length === 0) {
    healthStatus = 'OFFLINE';
    healthReasons.push('No provisioned user accounts');
  }
  const offlineDevCount = devices.filter(d => d.status !== 'ONLINE' && d.status !== 'online').length;
  if (devices.length > 0 && offlineDevCount === devices.length) {
    if (healthStatus === 'HEALTHY') healthStatus = 'WARNING';
    healthReasons.push(`${devices.length} registered device(s) currently offline`);
  }
  if (healthReasons.length === 0) healthReasons.push('All systems operational');

  const rawTier = (subscription?.planId ? subscription.planId.replace(/^plan_/, '') : (tenant.tier || 'starter')).toLowerCase().trim();
  const cleanTier = rawTier === 'standard' ? 'starter' : (rawTier || 'starter');
  const isTrial = tenant.status === 'trial' || subscription?.status === 'trialing';
  let effectiveStatus = tenant.status;
  if (tenant.status === 'suspended') {
    effectiveStatus = 'suspended';
  } else if (subscription?.status === 'past_due') {
    effectiveStatus = 'past_due';
  } else if (isTrial) {
    effectiveStatus = 'trial';
  } else {
    effectiveStatus = (tenant.status === 'trial' ? 'trial' : 'active');
  }

  const createdTime = tenant.createdAt ? new Date(tenant.createdAt).getTime() : NaN;
  const defaultTrialEnd = new Date((!isNaN(createdTime) ? createdTime : Date.now()) + 14 * 86400000).toISOString();
  const trialEndsAt = isTrial ? (subscription?.currentPeriodEnd || subscription?.trialEnd || defaultTrialEnd) : null;

  return {
    overview: {
      id: tenant.id,
      name: tenant.name,
      slug: tenant.slug,
      status: effectiveStatus,
      isTrial,
      trialEndsAt,
      customerType: tenant.customerType || 'COMPANY',
      ownerEmail: tenant.ownerEmail,
      leadPoolMode: tenant.leadPoolMode || 'shared',
      tier: cleanTier,
      plan: cleanTier,
      createdAt: tenant.createdAt,
      updatedAt: tenant.updatedAt
    },
    organization: {
      totalUsers: users.length,
      users,
      totalTeams: teams.length,
      teams
    },
    salesOperations: {
      totalLeads: Number(leadsCount?.c || 0),
      leadStatusBreakdown: leadStatuses,
      totalCampaigns: campaigns.length,
      campaigns,
      callsToday: Number(callsTodayCount?.c || 0),
      callsThisMonth: Number(callsMonthCount?.c || 0)
    },
    connectedDevices: {
      total: devices.length,
      online: devices.filter(d => d.status === 'ONLINE' || d.status === 'online').length,
      offline: offlineDevCount,
      devices
    },
    automationJobs: {
      scraper: { running: 0, completed: 0, failed: 0 },
      emailer: { running: 0, completed: 0, failed: 0 },
      facebook: { running: 0, completed: 0, failed: 0 }
    },
    modules: enabledModulesList,
    moduleEntitlements,
    accessMatrix,
    subscription: subscription ? {
      ...subscription,
      planId: subscription.planId || ('plan_' + cleanTier),
      trialEndsAt: isTrial ? trialEndsAt : null
    } : {
      planId: 'plan_' + cleanTier,
      status: isTrial ? 'trialing' : (tenant.status === 'suspended' ? 'suspended' : 'active'),
      currentPeriodEnd: trialEndsAt,
      trialEndsAt: trialEndsAt
    },
    health: {
      status: healthStatus,
      reasons: healthReasons
    },
    auditLogs
  };
}

export async function getGlobalDevicesList(): Promise<any[]> {
  try {
    const rows = await db.queryAll<any>(`
      SELECT 
        d.id, 
        d.name, 
        d.status, 
        d.platform, 
        d."osType", 
        d."ipAddress", 
        d."lastSeenAt", 
        d."createdAt", 
        d."tenantId", 
        t.name as "tenantName",
        u.username as "assignedUser"
      FROM devices d
      LEFT JOIN tenants t ON d."tenantId" = t.id
      LEFT JOIN users u ON d."userId" = u.id
      ORDER BY d."lastSeenAt" DESC NULLS LAST
    `);
    return rows;
  } catch (err) {
    console.error('[Observability] Global devices query error:', err);
    return [];
  }
}

export async function getGlobalRecentActivity(limit = 40): Promise<any[]> {
  try {
    const adminLogs = await db.queryAll<any>(`
      SELECT 
        a.id, 
        a.action, 
        a."targetType", 
        a."targetId", 
        a.username as "performedBy", 
        a.details, 
        a.timestamp, 
        a."tenantId", 
        t.name as "tenantName"
      FROM audit_logs_admin a
      LEFT JOIN tenants t ON a."tenantId" = t.id
      ORDER BY a.timestamp DESC
      LIMIT $1
    `, [limit]);

    if (adminLogs.length > 0) {
      return adminLogs;
    }

    // Fallback to call logs and tenant activity if audit logs are empty
    const callLogs = await db.queryAll<any>(`
      SELECT 
        c.id, 
        'CALL_COMPLETED' as action, 
        'call' as "targetType", 
        c.id as "targetId", 
        c."leadName" as "performedBy", 
        'Call recorded: ' || c.outcome || ' (Duration: ' || c.duration || 's)' as details, 
        c.timestamp, 
        c."tenantId", 
        t.name as "tenantName"
      FROM call_logs c
      LEFT JOIN tenants t ON c."tenantId" = t.id
      ORDER BY c.timestamp DESC
      LIMIT $1
    `, [limit]);

    return callLogs;
  } catch (err) {
    console.error('[Observability] Global activity query error:', err);
    return [];
  }
}

export async function provisionWorkspaceOrganization(data: {
  name: string;
  username: string;
  email?: string;
  passwordHash: string;
  customerType?: 'COMPANY' | 'PERSONAL';
  maxAgents?: number;
  planId?: string;
}): Promise<{ success: boolean; tenantId: string; username: string }> {
  const now = new Date().toISOString();
  const rawSlug = data.name.toLowerCase().replace(/[^a-z0-9]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '') || 'workspace';
  const tenantId = 'tenant_' + crypto.randomUUID().replace(/-/g, '').substring(0, 10);
  const slug = `${rawSlug}-${tenantId.substring(7)}`;

  const rawPlanId = data.planId || 'plan_starter';
  const cleanTier = rawPlanId.toLowerCase().replace(/^plan_/, '').trim() || 'starter';
  const effectiveTier = cleanTier === 'standard' ? 'starter' : cleanTier;
  const seatLimit = data.maxAgents || (effectiveTier === 'starter' ? 5 : (effectiveTier === 'pro' ? 20 : 1000));
  const trialEndIso = new Date(Date.now() + 14 * 86400000).toISOString();

  // Insert tenant
  await db.execute(`
    INSERT INTO tenants (id, name, slug, status, "createdAt", "updatedAt", "customerType", "maxTeamVisibility", "leadPoolMode", "maxAgents", tier)
    VALUES ($1, $2, $3, 'trial', $4, $4, $5, 'TEAM_COLLABORATE', 'shared', $6, $7)
  `, [tenantId, data.name, slug, now, data.customerType || 'COMPANY', seatLimit, effectiveTier]);

  // Insert primary owner user
  const userId = 'user_' + crypto.randomUUID();
  await db.execute(`
    INSERT INTO users (id, username, email, "passwordHash", role, "tenantId", "authProvider", "emailVerified", "createdAt", "updatedAt")
    VALUES ($1, $2, $3, $4, 'admin', $5, 'local', 1, $6, $6)
  `, [userId, data.username.trim().toLowerCase(), data.email ? data.email.trim().toLowerCase() : null, data.passwordHash, tenantId, now]);

  // Insert trial subscription record
  const subId = 'sub_' + crypto.randomUUID().replace(/-/g, '').slice(0, 16);
  await db.execute(`
    INSERT INTO subscriptions (id, "tenantId", "planId", status, "currentPeriodStart", "currentPeriodEnd", "trialStart", "trialEnd", "createdAt", "updatedAt", provider)
    VALUES ($1, $2, $3, 'trialing', $4, $5, $4, $5, $4, $4, 'manual')
  `, [subId, tenantId, rawPlanId, now, trialEndIso]);

  // Seed Authoritative Tenant Module Entitlements
  const defaultProvisionModules = [
    { id: 'crm', enabled: 1 },
    { id: 'octalDialer', enabled: 1 },
    { id: 'reports', enabled: 1 },
    { id: 'leads', enabled: 1 },
    { id: 'campaigns', enabled: 1 },
    { id: 'autoEmailer', enabled: 1 },
    { id: 'facebookPoster', enabled: 1 },
    { id: 'googleScraper', enabled: 0 },
    { id: 'facebookScraper', enabled: 0 }
  ];

  for (const mod of defaultProvisionModules) {
    await db.execute(`
      INSERT INTO tenant_module_entitlements (id, "tenantId", "moduleId", enabled, "updatedBy", "updatedAt")
      VALUES ($1, $2, $3, $4, 'provisioning_system', $5)
      ON CONFLICT ("tenantId", "moduleId") DO UPDATE SET enabled = $4, "updatedAt" = $5
    `, [`tme_${tenantId}_${mod.id}`, tenantId, mod.id, mod.enabled, now]);

    if (mod.enabled === 1) {
      await db.execute(`
        INSERT INTO user_permissions (id, "userId", "moduleId", enabled, "grantedBy", "tenantId", "grantedAt")
        VALUES ($1, $2, $3, 1, 'PROVISIONING', $4, $5)
        ON CONFLICT ("id") DO UPDATE SET enabled = 1
      `, [`perm_${userId}_${mod.id}`, userId, mod.id, tenantId, now]);
    }
  }

  // Insert default audit log
  try {
    await db.execute(`
      INSERT INTO audit_logs_admin (id, "userId", username, action, "targetType", "targetId", details, timestamp, "tenantId")
      VALUES ($1, $2, $3, 'TENANT_PROVISIONED', 'tenant', $4, $5, $6, $4)
    `, ['audit_' + crypto.randomUUID(), userId, data.username, tenantId, `Provisioned workspace organization: ${data.name}`, now]);
  } catch {}

  return { success: true, tenantId, username: data.username };
}

// ─── CRM Domain Interfaces & Scoping Helpers ─────────────────────────────────

export interface CrmCompany {
  id: string;
  tenantId: string;
  name: string;
  industry?: string;
  country?: string;
  phone?: string;
  email?: string;
  website?: string;
  address?: string;
  status: 'Active' | 'Inactive';
  paymentStatus: 'Trial' | 'Paid' | 'Invoice' | 'Leaver' | 'Licence Shifted';
  assignedUserId?: string;
  assignedTeamId?: string;
  metadata?: string;
  createdAt: string;
  updatedAt: string;
}

export interface CrmContact {
  id: string;
  tenantId: string;
  crmCompanyId?: string;
  name: string;
  email?: string;
  phone?: string;
  roleTitle?: string;
  notes?: string;
  assignedUserId?: string;
  createdAt: string;
  updatedAt: string;
}

export interface CrmTask {
  id: string;
  tenantId: string;
  title: string;
  description?: string;
  taskType: 'call' | 'email' | 'online_meeting' | 'meeting' | 'sms' | 'whatsapp' | 'payment' | 'follow_up' | 'general';
  status: 'open' | 'completed' | 'rescheduled' | 'cancelled';
  priority: 'low' | 'medium' | 'high' | 'urgent';
  dueAt: string;
  completedAt?: string;
  crmCompanyId?: string;
  contactId?: string;
  leadId?: string;
  assignedUserId?: string;
  assignedTeamId?: string;
  outcome?: string;
  outcomeRemarks?: string;
  cancellationReason?: string;
  createdByUserId: string;
  createdAt: string;
  updatedAt: string;
}

export interface CrmNote {
  id: string;
  tenantId: string;
  entityType: 'lead' | 'contact' | 'crm_company' | 'task';
  entityId: string;
  category: 'general' | 'sales' | 'support' | 'meeting' | 'call' | 'billing' | 'follow_up' | 'task';
  body: string;
  createdByUserId: string;
  createdByName: string;
  createdAt: string;
}

export async function getScopedCrmUserIds(actor: any, tenantId: string): Promise<string[] | null> {
  const isPlatform = isPlatformRole(actor?.role);
  if (isPlatform || actor?.role === 'admin') {
    return null; // Null means unrestricted access to all tenant records
  }
  if (actor?.role === 'team_lead') {
    const scoped = await getTeamLeadScopedUserIds(actor.id, tenantId);
    return scoped.length > 0 ? scoped : [actor.id];
  }
  const { readablePeerUserIds } = await getUserTeamPeerVisibilitySets(actor.id, tenantId);
  return [actor.id, ...readablePeerUserIds];
}

export async function recordCrmNote(data: {
  tenantId: string;
  entityType: 'lead' | 'contact' | 'crm_company' | 'task';
  entityId: string;
  category?: 'general' | 'sales' | 'support' | 'meeting' | 'call' | 'billing' | 'follow_up' | 'task';
  body: string;
  createdByUserId: string;
  createdByName?: string;
}): Promise<CrmNote> {
  const id = `note_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
  const now = new Date().toISOString();
  const cat = data.category || 'general';
  const name = data.createdByName || 'System';

  await db.execute(`
    INSERT INTO crm_notes (id, "tenantId", "entityType", "entityId", category, body, "createdByUserId", "createdByName", "createdAt")
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
  `, [id, data.tenantId, data.entityType, data.entityId, cat, data.body, data.createdByUserId, name, now]);

  return {
    id,
    tenantId: data.tenantId,
    entityType: data.entityType,
    entityId: data.entityId,
    category: cat,
    body: data.body,
    createdByUserId: data.createdByUserId,
    createdByName: name,
    createdAt: now
  };
}

// ─── Expose the raw db instance for future steps ─────────────────────────────
export function getDatabase(): DbAdapter {
  return db;
}
export { db };




