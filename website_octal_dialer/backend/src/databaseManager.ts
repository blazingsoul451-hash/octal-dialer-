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
}

// ─── Exported API (explicit tenantId required - fail closed) ─────────────

export async function getNextPendingLead(campaignId: string, tenantId: string, afterLeadId?: string): Promise<Lead | null> {
  if (!campaignId || !tenantId) return null;
  const row = await db.queryOne<Lead>(`
    SELECT * FROM leads 
    WHERE "campaignId" = $1 AND "tenantId" = $2 AND status = 'PENDING' AND "lockedBy" IS NULL
    ORDER BY "createdAt" ASC, id ASC
    LIMIT 1
  `, [campaignId, tenantId]);

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
    await db.execute("SELECT pg_advisory_xact_lock(hashtext('octal-campaign-import'), hashtext($1))", [tenantId]);
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

export async function createLog(leadId: string, outcome: string, duration: number, tenantId: string): Promise<CallLog | null> {
  if (!tenantId || !leadId) return null;
  const lead = await getLead(leadId, tenantId);
  if (!lead) return null;

  const resolvedTenantId = (lead as any).tenantId || tenantId;
  const campaign = await db.queryOne<Campaign>(`SELECT * FROM campaigns WHERE id = $1 AND "tenantId" = $2`, [lead.campaignId, resolvedTenantId]);

  const log: CallLog & { tenantId: string } = {
    id: 'log_' + Math.random().toString(36).substring(2, 11),
    leadId,
    leadName: lead.name,
    leadPhone: lead.phone,
    campaignName: campaign ? campaign.name : 'Unknown Campaign',
    outcome,
    duration,
    tenantId: resolvedTenantId,
    timestamp: new Date().toISOString()
  };

  await db.withTransaction(async () => {
    await db.execute(`
      INSERT INTO call_logs (id, "leadId", "leadName", "leadPhone", "campaignName", outcome, duration, "tenantId", timestamp)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
    `, [log.id, log.leadId, log.leadName, log.leadPhone, log.campaignName, log.outcome, log.duration, log.tenantId, log.timestamp]);

    await updateLeadStatus(leadId, 'COMPLETED', outcome, duration, resolvedTenantId);
  });

  return log;
}

export async function createManualLog(phone: string, name: string, outcome: string, duration: number, tenantId: string): Promise<CallLog> {
  const tId = tenantId;
  const log: CallLog & { tenantId: string } = {
    id: 'log_' + Math.random().toString(36).substring(2, 11),
    leadId: 'manual_' + Date.now(),
    leadName: name || 'Manual Quick Dial',
    leadPhone: phone,
    campaignName: 'Manual Quick Dial',
    outcome,
    duration,
    tenantId: tId,
    timestamp: new Date().toISOString()
  };
  await db.execute(`
    INSERT INTO call_logs (id, "leadId", "leadName", "leadPhone", "campaignName", outcome, duration, "tenantId", timestamp)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
  `, [log.id, log.leadId, log.leadName, log.leadPhone, log.campaignName, log.outcome, log.duration, log.tenantId, log.timestamp]);
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
  'googleScraper',
  'autoEmailer',
  'facebookScraper',
  'facebookPoster'
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
        `UPDATE call_logs SET outcome = $1 WHERE id = $2 AND "tenantId" = $3`,
        [outcome, targetLog.id, tenantId]
      );
    } else {
      await createLog(leadId, outcome, lead.duration || 0, tenantId);
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
    const row = await db.queryOne(`SELECT id FROM "${table}" WHERE id = $1 AND "tenantId" = $2 FOR UPDATE`, [id, tenantId]);
    if (!row) throw new Error('Record not found in your tenant.');
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

// ─── Expose the raw db instance for future steps ─────────────────────────────
export function getDatabase(): DbAdapter {
  return db;
}
export { db };



