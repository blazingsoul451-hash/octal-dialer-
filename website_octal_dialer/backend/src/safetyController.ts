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

import { db, reserveLead, releaseLeadLock, normalizePhone } from './databaseManager';
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

// ─── Prepared statements ──────────────────────────────────────────────────────
const stmts = {
  getCampaign:      db.prepare(`SELECT * FROM campaigns WHERE id = @id AND tenantId = @tenantId`),
  getLead:          db.prepare(`SELECT * FROM leads WHERE id = @id AND tenantId = @tenantId`),
  getLeadByPhone:   db.prepare(`SELECT * FROM leads WHERE phone = @phone AND tenantId = @tenantId LIMIT 1`),
  isSuppressed:     db.prepare(`SELECT id FROM suppression_list WHERE phone = @phone AND (tenantId = @tenantId OR tenantId = '${GLOBAL_DNC_SCOPE}' OR tenantId = 'tenant_default') LIMIT 1`),
  addSuppressed:    db.prepare(`INSERT OR IGNORE INTO suppression_list (id, phone, reason, source, tenantId, addedAt) VALUES (@id, @phone, @reason, @source, @tenantId, @addedAt)`),
  removeSuppressed: db.prepare(`DELETE FROM suppression_list WHERE id = @id AND tenantId = @tenantId`),
  listSuppressed:   db.prepare(`SELECT * FROM suppression_list WHERE tenantId = @tenantId ORDER BY addedAt DESC`),
  logAudit:         db.prepare(`INSERT INTO audit_logs (id, action, entityType, entityId, performedBy, details, timestamp) VALUES (@id, @action, @entityType, @entityId, @performedBy, @details, @timestamp)`),
  // Command ID idempotency
  insertCommand:       db.prepare(`INSERT OR IGNORE INTO commands (id, leadId, sessionId, issuedAt, expiresAt) VALUES (@id, @leadId, @sessionId, @issuedAt, @expiresAt)`),
  findActiveCommand:   db.prepare(`SELECT * FROM commands WHERE leadId = @leadId AND expiresAt > @now LIMIT 1`),
  markCommandExpired:  db.prepare(`UPDATE commands SET expiresAt = @now WHERE id = @id`),
  deleteExpiredCmds:   db.prepare(`DELETE FROM commands WHERE expiresAt <= @now`),
  listActiveCommands:  db.prepare(`SELECT * FROM commands WHERE expiresAt > @now ORDER BY issuedAt DESC`),
};

// ─── Core gate function ───────────────────────────────────────────────────────

export interface CallRequest {
  sessionId: string;
  leadId?: string;   // optional — if provided, lead-level checks run
  phone: string;
  campaignId?: string;
  tenantId?: string;
}

export function checkCallAllowed(req: CallRequest): SafetyResult {
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
    const campaign = stmts.getCampaign.get({ id: req.campaignId, tenantId }) as any;
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
    const suppressed = stmts.isSuppressed.get({ phone: normalizedPhone, tenantId }) as any;
    if (suppressed) {
      return { allowed: false, reason: 'LEAD_SUPPRESSED', message: `Number ${req.phone} (${normalizedPhone}) is on the suppression list (DNC).` };
    }
  }

  if (req.leadId) {
    const lead = stmts.getLead.get({ id: req.leadId, tenantId }) as any;
    if (!lead) {
      return { allowed: false, reason: 'LEAD_NOT_FOUND', message: 'Lead record not found in your tenant.' };
    }
    if (req.campaignId && lead.campaignId && lead.campaignId !== req.campaignId) {
      return { allowed: false, reason: 'LEAD_NOT_FOUND', message: 'Lead does not belong to the requested campaign.' };
    }
    if (lead.status === 'CALLING') {
      return { allowed: false, reason: 'LEAD_ALREADY_CALLING', message: 'This lead is already being called.' };
    }
    if (lead.status === 'COMPLETED') {
      return { allowed: false, reason: 'LEAD_COMPLETED', message: 'This lead has already been completed.' };
    }

    // ── Layer 3.5: Command ID idempotency check ──────────────────────────────
    const now = new Date().toISOString();
    const existingCmd = stmts.findActiveCommand.get({ leadId: req.leadId, now }) as any;
    if (existingCmd) {
      // If the command is from the same session (which is idle) or stale, expire it automatically
      if (existingCmd.sessionId === req.sessionId) {
        stmts.markCommandExpired.run({ id: existingCmd.id, now });
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
    const reserved = reserveLead(req.leadId, req.sessionId, tenantId);
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

  const commandId = issueCommandId(req.leadId || req.phone, req.sessionId);

  return { allowed: true, commandId };
}

// ─── Audit log helper ─────────────────────────────────────────────────────────
export function writeAuditLog(
  action: string,
  entityType: string,
  entityId: string,
  performedBy: string,
  details?: string
): void {
  try {
    stmts.logAudit.run({
      id: 'audit_' + Math.random().toString(36).substring(2, 11),
      action,
      entityType,
      entityId,
      performedBy,
      details: details || null,
      timestamp: new Date().toISOString()
    });
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

export function addToSuppressionList(phone: string, reason: string, source: string, addedBy: string, tenantId: string): boolean {
  if (!tenantId) return false;
  const normalized = normalizePhone(phone);
  if (!normalized) return false;
  
  const result = stmts.addSuppressed.run({
    id: 'dnc_' + Math.random().toString(36).substring(2, 11),
    phone: normalized,
    reason: reason || 'Manual DNC',
    source: source || 'dashboard',
    tenantId,
    addedAt: new Date().toISOString()
  });
  if (result.changes > 0) {
    writeAuditLog('DNC_ADD', 'suppression_list', normalized, addedBy, `Reason: ${reason} (Tenant: ${tenantId})`);
    return true;
  }
  return false;
}

export function bulkAddToSuppressionList(
  entries: { phone: string; reason?: string }[],
  source: string,
  addedBy: string,
  tenantId: string
): { added: number; skipped: number } {
  if (!tenantId) return { added: 0, skipped: entries.length };
  let added = 0;
  let skipped = 0;

  const insertTx = db.transaction(() => {
    for (const entry of entries) {
      const norm = normalizePhone(entry.phone);
      if (!norm) { skipped++; continue; }
      
      const res = stmts.addSuppressed.run({
        id: 'dnc_' + Math.random().toString(36).substring(2, 11),
        phone: norm,
        reason: entry.reason || 'Bulk DNC Import',
        source: source || 'csv_import',
        tenantId,
        addedAt: new Date().toISOString()
      });

      if (res.changes > 0) {
        added++;
      } else {
        skipped++;
      }
    }
  });

  insertTx();
  writeAuditLog('DNC_BULK_ADD', 'suppression_list', `${added}_added`, addedBy, `Imported ${added} entries, ${skipped} skipped (Tenant: ${tenantId})`);
  return { added, skipped };
}

export function isPhoneSuppressed(phone: string, tenantId: string): boolean {
  if (!tenantId) return true; // fail-closed on missing tenant
  const norm = normalizePhone(phone);
  if (!norm) return false;
  const suppressed = stmts.isSuppressed.get({ phone: norm, tenantId }) as any;
  return !!suppressed;
}

export function removeFromSuppressionList(id: string, removedBy: string, tenantId: string): boolean {
  if (!tenantId || !id) return false;
  const result = stmts.removeSuppressed.run({ id, tenantId });
  if (result.changes > 0) {
    writeAuditLog('DNC_REMOVE', 'suppression_list', id, removedBy, `Tenant: ${tenantId}`);
    return true;
  }
  return false;
}

export function getSuppressionList(tenantId: string): SuppressionEntry[] {
  if (!tenantId) return [];
  return stmts.listSuppressed.all({ tenantId }) as SuppressionEntry[];
}

// ─── Command ID & Idempotency Management ─────────────────────────────────────
export const COMMAND_TTL_MINUTES = 5;

export function issueCommandId(leadId: string, sessionId: string): string {
  const commandId = 'cmd_' + Math.random().toString(36).substring(2, 11);
  const now = new Date();
  const expiresAt = new Date(now.getTime() + COMMAND_TTL_MINUTES * 60 * 1000).toISOString();

  stmts.insertCommand.run({
    id: commandId,
    leadId,
    sessionId,
    issuedAt: now.toISOString(),
    expiresAt
  });

  return commandId;
}

export function expireCommand(commandId: string): void {
  const now = new Date().toISOString();
  stmts.markCommandExpired.run({ id: commandId, now });
}

export function cleanupExpiredCommands(): void {
  const now = new Date().toISOString();
  stmts.deleteExpiredCmds.run({ now });
}

export function getActiveCommands(): any[] {
  const now = new Date().toISOString();
  return stmts.listActiveCommands.all({ now });
}

// Run cleanup every 5 minutes
setInterval(cleanupExpiredCommands, 5 * 60 * 1000);

