/**
 * safetyController.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Step 3 of 13 — Safety Controller Gate
 *
 * Every outbound call command MUST pass through `checkCallAllowed()` before
 * reaching an Android device. It enforces three layers in order:
 *
 *   Layer 1 — CAMPAIGN rules  (active? within rate limit? not emergency-stopped?)
 *   Layer 2 — LEAD rules      (not suppressed/DNC? not already calling/completed?)
 *   Layer 3 — DEVICE rules    (phone paired, idle, not mid-call?)
 *
 * If any layer fails → blocked. No call is sent.
 *
 * Also exports:
 *   - Emergency stop (global kill-switch)
 *   - DNC / suppression list management
 *   - Rate-limit tracking (in-memory per-campaign rolling window)
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { db, reserveLead, releaseLeadLock, normalizePhone, LEASE_TTL_MINUTES } from './databaseManager';
import { getSessionById } from './sessionManager';

// ─── Types ────────────────────────────────────────────────────────────────────

export type BlockReason =
  | 'EMERGENCY_STOPPED'
  | 'CAMPAIGN_NOT_FOUND'
  | 'CAMPAIGN_RATE_LIMIT'
  | 'LEAD_NOT_FOUND'
  | 'LEAD_SUPPRESSED'
  | 'LEAD_ALREADY_CALLING'
  | 'LEAD_COMPLETED'
  | 'LEAD_LOCKED'
  | 'DUPLICATE_COMMAND'
  | 'NO_PHONE'
  | 'DEVICE_BUSY'
  | 'UNAUTHORIZED_TENANT';

export interface SafetyResult {
  allowed: boolean;
  reason?: BlockReason;
  message?: string;
  commandId?: string;   // populated when allowed === true
}

// ─── Scoped emergency stop flags ─────────────────────────────────────────────
let globalEmergencyStopped = false;
const emergencyStoppedTenants = new Set<string>();
const emergencyStoppedCampaigns = new Set<string>();

export function isEmergencyStopped(tenantId?: string, campaignId?: string): boolean {
  if (globalEmergencyStopped) return true;
  if (tenantId && emergencyStoppedTenants.has(tenantId)) return true;
  if (campaignId && emergencyStoppedCampaigns.has(campaignId)) return true;
  return false;
}

export function triggerEmergencyStop(tenantId?: string, campaignId?: string): void {
  if (campaignId) {
    emergencyStoppedCampaigns.add(campaignId);
    console.warn(`[SafetyController] ⛔ EMERGENCY STOP ACTIVATED for campaign ${campaignId}`);
  } else if (tenantId) {
    emergencyStoppedTenants.add(tenantId);
    console.warn(`[SafetyController] ⛔ EMERGENCY STOP ACTIVATED for tenant ${tenantId}`);
  } else {
    globalEmergencyStopped = true;
    console.warn('[SafetyController] ⛔ GLOBAL EMERGENCY STOP ACTIVATED — all dialing blocked');
  }
}

export function clearEmergencyStop(tenantId?: string, campaignId?: string): void {
  if (campaignId) {
    emergencyStoppedCampaigns.delete(campaignId);
    console.log(`[SafetyController] ✅ Emergency stop cleared for campaign ${campaignId}`);
  } else if (tenantId) {
    emergencyStoppedTenants.delete(tenantId);
    console.log(`[SafetyController] ✅ Emergency stop cleared for tenant ${tenantId}`);
  } else {
    globalEmergencyStopped = false;
    emergencyStoppedTenants.clear();
    emergencyStoppedCampaigns.clear();
    console.log('[SafetyController] ✅ Emergency stop cleared globally');
  }
}

// ─── Rate limiting (in-memory rolling 60-min window per campaign/tenant) ─────
// Map<scopedKey, timestamps[]>
const rateLimitMap = new Map<string, number[]>();

const DEFAULT_MAX_CALLS_PER_HOUR = 120; // conservative default
export const GLOBAL_DNC_SCOPE = 'system_global';

function checkRateLimit(campaignId: string, tenantId: string, maxPerHour: number = DEFAULT_MAX_CALLS_PER_HOUR): boolean {
  if (!tenantId) return false;
  const now = Date.now();
  const windowMs = 60 * 60 * 1000; // 1 hour
  const key = `${tenantId}_${campaignId}`;

  let timestamps = rateLimitMap.get(key) || [];
  // Drop entries older than 1 hour
  timestamps = timestamps.filter(t => now - t < windowMs);
  rateLimitMap.set(key, timestamps);

  return timestamps.length < maxPerHour;
}

function recordCall(campaignId: string, tenantId: string): void {
  if (!tenantId) return;
  const key = `${tenantId}_${campaignId}`;
  const timestamps = rateLimitMap.get(key) || [];
  timestamps.push(Date.now());
  rateLimitMap.set(key, timestamps);
}

export function getCallsInLastHour(campaignId: string, tenantId: string): number {
  if (!tenantId) return 0;
  const now = Date.now();
  const windowMs = 60 * 60 * 1000;
  const key = `${tenantId}_${campaignId}`;
  const timestamps = rateLimitMap.get(key) || [];
  return timestamps.filter(t => now - t < windowMs).length;
}

export interface CallRequest {
  sessionId: string;
  leadId?: string;   // optional — if provided, lead-level checks run
  phone: string;
  campaignId?: string;
  tenantId?: string;
  allowCompleted?: boolean; // when true, permits redialing completed leads
}

export async function checkCallAllowed(req: CallRequest): Promise<SafetyResult> {
  const tenantId = req.tenantId;
  if (!tenantId) {
    return { allowed: false, reason: 'UNAUTHORIZED_TENANT', message: 'Missing tenant identity for dial request (fail-closed).' };
  }

  // ── Layer 1: Emergency stop checks ─────────────────────────────────────────
  if (isEmergencyStopped(tenantId, req.campaignId)) {
    return { allowed: false, reason: 'EMERGENCY_STOPPED', message: 'Emergency stop is active for your tenant/campaign.' };
  }

  // ── Layer 1: Campaign checks ──────────────────────────────────────────────
  if (req.campaignId) {
    const campaign = await db.queryOne<any>(`SELECT * FROM campaigns WHERE id = $1 AND "tenantId" = $2`, [req.campaignId, tenantId]);
    if (!campaign) {
      return { allowed: false, reason: 'CAMPAIGN_NOT_FOUND', message: 'Campaign not found or not owned by your tenant.' };
    }

    if (!checkRateLimit(req.campaignId, tenantId)) {
      return {
        allowed: false,
        reason: 'CAMPAIGN_RATE_LIMIT',
        message: `Rate limit reached: ${DEFAULT_MAX_CALLS_PER_HOUR} calls/hour for this campaign.`
      };
    }
  }

  // ── Layer 2: Session & Device authorization checks ────────────────────────
  const session = getSessionById(req.sessionId);

  if (!session || !session.phoneSocketId) {
    return { allowed: false, reason: 'NO_PHONE', message: 'No paired phone is connected to this session.' };
  }

  if (session.tenantId && session.tenantId !== tenantId) {
    return { allowed: false, reason: 'UNAUTHORIZED_TENANT', message: 'Session does not belong to your tenant.' };
  }

  if (session.status === 'CALLING') {
    return { allowed: false, reason: 'DEVICE_BUSY', message: 'Device is already mid-call. Wait for it to finish.' };
  }

  // ── Layer 3: Lead/DNC checks ──────────────────────────────────────────────
  const normalizedPhone = normalizePhone(req.phone || '');

  if (normalizedPhone) {
    const suppressed = await db.queryOne<{ id: string }>(`
      SELECT id FROM suppression_list 
      WHERE phone = $1 AND ("tenantId" = $2 OR "tenantId" = '${GLOBAL_DNC_SCOPE}' OR "tenantId" = 'tenant_default') 
      LIMIT 1
    `, [normalizedPhone, tenantId]);
    if (suppressed) {
      return { allowed: false, reason: 'LEAD_SUPPRESSED', message: `Number ${req.phone} (${normalizedPhone}) is on the suppression list (DNC).` };
    }
  }

  if (req.leadId) {
    const lead = await db.queryOne<any>(`SELECT * FROM leads WHERE id = $1 AND "tenantId" = $2`, [req.leadId, tenantId]);
    if (!lead) {
      return { allowed: false, reason: 'LEAD_NOT_FOUND', message: 'Lead record not found in your tenant.' };
    }
    if (req.campaignId && lead.campaignId && lead.campaignId !== req.campaignId) {
      return { allowed: false, reason: 'LEAD_NOT_FOUND', message: 'Lead does not belong to the requested campaign.' };
    }
    if (lead.status === 'CALLING') {
      return { allowed: false, reason: 'LEAD_ALREADY_CALLING', message: 'This lead is already being called.' };
    }
    if (lead.status === 'COMPLETED' && !req.allowCompleted) {
      return { allowed: false, reason: 'LEAD_COMPLETED', message: 'This lead has already been completed.' };
    }

    // ── Layer 3.5: Command ID idempotency check ──────────────────────────────
    const now = new Date().toISOString();
    const existingCmd = await db.queryOne<any>(`SELECT * FROM commands WHERE "leadId" = $1 AND "expiresAt" > $2 LIMIT 1`, [req.leadId, now]);
    if (existingCmd) {
      if (existingCmd.sessionId === req.sessionId) {
        await db.execute(`UPDATE commands SET "expiresAt" = $1 WHERE id = $2`, [now, existingCmd.id]);
        console.log(`[SafetyController] Stale command ${existingCmd.id} automatically expired for lead ${req.leadId}`);
      } else {
        return {
          allowed: false,
          reason: 'DUPLICATE_COMMAND',
          message: `Duplicate call prevented. Lead is already in-flight (command: ${existingCmd.id}). Wait ${COMMAND_TTL_MINUTES} minutes or until the call completes.`
        };
      }
    }

    // ── Layer 3.6: Lead Reservation & Lock Check (Only AFTER all checks succeed) ──
    const reserved = await reserveLead(req.leadId, req.sessionId, tenantId, LEASE_TTL_MINUTES, req.allowCompleted);
    if (!reserved) {
      return {
        allowed: false,
        reason: 'LEAD_LOCKED',
        message: 'Lead is currently locked by another active device or session.'
      };
    }
  }

  // ── All checks passed — issue command ID ─────────────────────────────────
  if (req.campaignId) {
    recordCall(req.campaignId, tenantId);
  }

  const commandId = await issueCommandId(req.leadId || req.phone, req.sessionId, tenantId);

  return { allowed: true, commandId };
}

// ─── Audit log helper ─────────────────────────────────────────────────────────
export async function writeAuditLog(
  action: string,
  entityType: string,
  entityId: string,
  performedBy: string,
  details?: string,
  tenantId?: string
): Promise<void> {
  try {
    await db.execute(`
      INSERT INTO audit_logs (id, action, "entityType", "entityId", "performedBy", details, "tenantId", timestamp)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
    `, [
      'audit_' + Math.random().toString(36).substring(2, 11),
      action,
      entityType,
      entityId,
      performedBy,
      details || null,
      tenantId || null,
      new Date().toISOString()
    ]);
  } catch (err) {
    console.error('[AuditLog] Failed to write:', err);
  }
}

// ─── DNC / Suppression list management ───────────────────────────────────────

export interface SuppressionEntry {
  id: string;
  phone: string;
  reason?: string;
  source?: string;
  addedAt: string;
}

export async function addToSuppressionList(phone: string, reason: string, source: string, addedBy: string, tenantId: string): Promise<boolean> {
  if (!tenantId) return false;
  const normalized = normalizePhone(phone);
  if (!normalized) return false;
  
  const result = await db.execute(`
    INSERT INTO suppression_list (id, phone, reason, source, "tenantId", "addedAt")
    VALUES ($1, $2, $3, $4, $5, $6)
    ON CONFLICT ("id") DO NOTHING
  `, [
    'dnc_' + Math.random().toString(36).substring(2, 11),
    normalized,
    reason || 'Manual DNC',
    source || 'dashboard',
    tenantId,
    new Date().toISOString()
  ]);
  if (result.rowCount > 0) {
    await writeAuditLog('DNC_ADD', 'suppression_list', normalized, addedBy, `Reason: ${reason} (Tenant: ${tenantId})`, tenantId);
    return true;
  }
  return false;
}

export async function bulkAddToSuppressionList(
  entries: { phone: string; reason?: string }[],
  source: string,
  addedBy: string,
  tenantId: string
): Promise<{ added: number; skipped: number }> {
  if (!tenantId) return { added: 0, skipped: entries.length };
  let added = 0;
  let skipped = 0;

  await db.withTransaction(async () => {
    for (const entry of entries) {
      const norm = normalizePhone(entry.phone);
      if (!norm) { skipped++; continue; }
      
      const res = await db.execute(`
        INSERT INTO suppression_list (id, phone, reason, source, "tenantId", "addedAt")
        VALUES ($1, $2, $3, $4, $5, $6)
        ON CONFLICT ("id") DO NOTHING
      `, [
        'dnc_' + Math.random().toString(36).substring(2, 11),
        norm,
        entry.reason || 'Bulk DNC Import',
        source || 'csv_import',
        tenantId,
        new Date().toISOString()
      ]);

      if (res.rowCount > 0) {
        added++;
      } else {
        skipped++;
      }
    }
  });

  await writeAuditLog('DNC_BULK_ADD', 'suppression_list', `${added}_added`, addedBy, `Imported ${added} entries, ${skipped} skipped (Tenant: ${tenantId})`, tenantId);
  return { added, skipped };
}

export async function isPhoneSuppressed(phone: string, tenantId: string): Promise<boolean> {
  if (!tenantId) return true;
  const norm = normalizePhone(phone);
  if (!norm) return false;
  const suppressed = await db.queryOne<{ id: string }>(`
    SELECT id FROM suppression_list 
    WHERE phone = $1 AND ("tenantId" = $2 OR "tenantId" = '${GLOBAL_DNC_SCOPE}' OR "tenantId" = 'tenant_default')
    LIMIT 1
  `, [norm, tenantId]);
  return !!suppressed;
}

export async function removeFromSuppressionList(id: string, removedBy: string, tenantId: string): Promise<boolean> {
  if (!tenantId || !id) return false;
  const result = await db.execute(`DELETE FROM suppression_list WHERE id = $1 AND "tenantId" = $2`, [id, tenantId]);
  if (result.rowCount > 0) {
    await writeAuditLog('DNC_REMOVE', 'suppression_list', id, removedBy, `Tenant: ${tenantId}`, tenantId);
    return true;
  }
  return false;
}

export async function getSuppressionList(tenantId: string): Promise<SuppressionEntry[]> {
  if (!tenantId) return [];
  return await db.queryAll<SuppressionEntry>(`SELECT * FROM suppression_list WHERE "tenantId" = $1 ORDER BY "addedAt" DESC`, [tenantId]);
}

// ─── Command ID & Idempotency Management ─────────────────────────────────────
export const COMMAND_TTL_MINUTES = 5;

export async function issueCommandId(leadId: string, sessionId: string, tenantId?: string): Promise<string> {
  const commandId = 'cmd_' + Math.random().toString(36).substring(2, 11);
  const now = new Date();
  const expiresAt = new Date(now.getTime() + COMMAND_TTL_MINUTES * 60 * 1000).toISOString();

  await db.execute(`
    INSERT INTO commands (id, "leadId", "sessionId", "issuedAt", "expiresAt", "tenantId")
    VALUES ($1, $2, $3, $4, $5, $6)
    ON CONFLICT ("id") DO NOTHING
  `, [commandId, leadId, sessionId, now.toISOString(), expiresAt, tenantId || null]);

  return commandId;
}

export async function expireCommand(commandId: string): Promise<void> {
  const now = new Date().toISOString();
  await db.execute(`UPDATE commands SET "expiresAt" = $1 WHERE id = $2`, [now, commandId]);
}

export async function cleanupExpiredCommands(): Promise<void> {
  const now = new Date().toISOString();
  await db.execute(`DELETE FROM commands WHERE "expiresAt" <= $1`, [now]);
}

export async function getActiveCommands(tenantId?: string): Promise<any[]> {
  const now = new Date().toISOString();
  if (tenantId) {
    return await db.queryAll<any>(`SELECT * FROM commands WHERE "expiresAt" > $1 AND "tenantId" = $2 ORDER BY "issuedAt" DESC`, [now, tenantId]);
  }
  return await db.queryAll<any>(`SELECT * FROM commands WHERE "expiresAt" > $1 ORDER BY "issuedAt" DESC`, [now]);
}

// Run cleanup every 5 minutes
setInterval(() => {
  cleanupExpiredCommands().catch(err => console.error('[SafetyController] cleanupExpiredCommands error:', err));
}, 5 * 60 * 1000);

