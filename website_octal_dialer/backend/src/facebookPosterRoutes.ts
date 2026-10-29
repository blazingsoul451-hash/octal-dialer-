/**
 * facebookPosterRoutes.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Facebook Auto-Poster API (multi-tenant).
 *
 * PostgreSQL is the source of truth for accounts, cookie jars, campaign and
 * join configuration, group targets, and activity history. The on-disk JSON
 * files are now only a per-run scratch cache: they are materialised from the
 * database immediately before the Playwright worker spawns and ingested back
 * into the database when it exits. That keeps the existing worker contract
 * untouched while making the data durable, backed up with the database, and
 * visible to the Reports suite.
 *
 * Security notes:
 *  - Session cookie jars are encrypted at rest (AES-256-GCM via secretVault)
 *    and the decrypted cookies.json is scrubbed from disk after each run.
 *  - Every filesystem path segment derived from a request is passed through
 *    `sanitizeId`, so no request can traverse out of its own tenant directory.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { Router, Request, Response } from 'express';
import { spawn, ChildProcess } from 'child_process';
import path from 'path';
import fs from 'fs';
import dbAdapter from './db/dbAdapter';
import { encryptSecret, decryptSecret } from './services/secretVault';

export const facebookPosterRouter = Router();

const db = dbAdapter;

// ─── DIRECTORY CONSTANTS & MULTI-TENANT HELPERS ──────────────────────────────

const BASE_DATA_DIR = path.resolve(__dirname, '../data/facebook_poster');
const BASE_PROFILES_DIR = path.resolve(__dirname, '../data/facebook_profiles');

if (!fs.existsSync(BASE_DATA_DIR)) fs.mkdirSync(BASE_DATA_DIR, { recursive: true });
if (!fs.existsSync(BASE_PROFILES_DIR)) fs.mkdirSync(BASE_PROFILES_DIR, { recursive: true });

/**
 * Collapse any value used as a single path segment down to a safe slug.
 * This is the only sanctioned way to turn request data into a path component —
 * `..`, `/`, `\` and every other traversal primitive become `_`.
 */
export function sanitizeId(id: unknown): string {
  if (!id || typeof id !== 'string') return '';
  return id.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 128);
}

function sanitizeTenantId(id: string): string {
  return sanitizeId(id) || 'default';
}

function getTenantId(req: Request): string {
  const user = (req as any).user;
  const raw =
    user?.tenantId ||
    user?.id ||
    (user && typeof user === 'object' && 'workspaceId' in user ? (user as any).workspaceId : null);
  return sanitizeTenantId(raw || 'default');
}

function getTenantDataDir(tenantId: string): string {
  const dir = path.resolve(BASE_DATA_DIR, sanitizeTenantId(tenantId));
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function getTenantProfilesDir(tenantId: string): string {
  const dir = path.resolve(BASE_PROFILES_DIR, sanitizeTenantId(tenantId));
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return dir;
}

/**
 * Resolve a profile directory for a tenant, refusing anything that would land
 * outside the tenant's own profiles root even if `sanitizeId` were bypassed.
 */
export function resolveProfileDir(tenantId: string, profileId: string): string {
  const root = getTenantProfilesDir(tenantId);
  const safeProfileId = sanitizeId(profileId);
  if (!safeProfileId) throw new Error('Invalid profile id.');
  const dir = path.resolve(root, safeProfileId);
  const rel = path.relative(root, dir);
  if (rel.startsWith('..') || path.isAbsolute(rel)) {
    throw new Error('Invalid profile id.');
  }
  return dir;
}

const nowIso = (): string => new Date().toISOString();
const todayStr = (): string => new Date().toISOString().slice(0, 10);

// ─── ACTIVE JOBS STATE (TENANT ISOLATED) ─────────────────────────────────────

interface ActivePosterJob {
  tenantId: string;
  account: string;
  mode: string;
  process: ChildProcess;
  startTime: string;
  logs: string[];
}

const activeJobs = new Map<string, ActivePosterJob>(); // key: tenantId

function appendJobLog(tenantId: string, message: string): void {
  const job = activeJobs.get(tenantId);
  if (job) {
    const timestamp = new Date().toLocaleTimeString();
    job.logs.push(`[${timestamp}] ${message}`);
    if (job.logs.length > 500) {
      job.logs.splice(0, job.logs.length - 500);
    }
  }
}

function resolvePosterScriptPath(): string {
  const candidates = [
    path.resolve(__dirname, 'facebook_modules', 'facebook_poster.js'),
    path.resolve(__dirname, '../src/facebook_modules', 'facebook_poster.js'),
    path.resolve(process.cwd(), 'src/facebook_modules', 'facebook_poster.js'),
    path.resolve(__dirname, '../../src/facebook_modules', 'facebook_poster.js')
  ];
  for (const c of candidates) {
    if (fs.existsSync(c)) return c;
  }
  return candidates[0];
}

// ─── LEGACY JSON → DATABASE IMPORT (runs once per tenant) ────────────────────

const importedTenants = new Set<string>();
const legacyImportsInFlight = new Map<string, Promise<void>>();

function readJsonFile(file: string): any {
  try {
    if (!fs.existsSync(file)) return null;
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return null;
  }
}

/**
 * Lift any pre-existing on-disk JSON state for this tenant into the database.
 * Idempotent and non-destructive: rows already present in the database win, so
 * running it repeatedly (or after the files go stale) cannot clobber live data.
 */
async function importLegacyTenantData(tenantId: string): Promise<void> {
  if (importedTenants.has(tenantId)) return;

  // Share one in-flight import per tenant: concurrent callers await the same
  // promise instead of racing, and a failed import is NOT remembered, so the
  // next request retries rather than leaving the tenant's data stranded.
  const existing = legacyImportsInFlight.get(tenantId);
  if (existing) return existing;

  const run = (async (): Promise<void> => {
    try {
    const dataDir = getTenantDataDir(tenantId);

    // Accounts (+ cookie jars from each profile folder)
    const legacyAccounts = readJsonFile(path.join(dataDir, 'accounts.json'));
    if (Array.isArray(legacyAccounts)) {
      for (const acc of legacyAccounts) {
        const profileId = sanitizeId(acc?.profileId);
        if (!profileId) continue;

        const existing = await db.queryOne(
          'SELECT id FROM fb_accounts WHERE "tenantId" = $1 AND "profileId" = $2',
          [tenantId, profileId]
        );
        if (existing) continue;

        let cookiesEnc: string | null = null;
        const cookieFile = path.join(resolveProfileDir(tenantId, profileId), 'cookies.json');
        const cookies = readJsonFile(cookieFile);
        if (cookies) cookiesEnc = encryptSecret(JSON.stringify(cookies));

        await db.execute(
          `INSERT INTO fb_accounts (id, "tenantId", "profileId", name, status, "dailyLimit", "sentToday",
                                    "cookiesEnc", note, "createdAt", "updatedAt")
           VALUES ($1, $2, $3, $4, $5, 25, 0, $6, $7, $8, $8)
           ON CONFLICT ("tenantId", "profileId") DO NOTHING`,
          [
            `fba_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
            tenantId,
            profileId,
            String(acc?.name || profileId),
            String(acc?.status || 'valid'),
            cookiesEnc,
            String(acc?.note || ''),
            nowIso()
          ]
        );
      }
    }

    // Campaign + join config collapse into one row
    const legacyConfig = readJsonFile(path.join(dataDir, 'fb_config.json'));
    const legacyJoin = readJsonFile(path.join(dataDir, 'fb_join_config.json'));
    if (legacyConfig || legacyJoin) {
      const existing = await db.queryOne('SELECT "tenantId" FROM fb_campaign_config WHERE "tenantId" = $1', [tenantId]);
      if (!existing) {
        await db.execute(
          `INSERT INTO fb_campaign_config ("tenantId", caption, "postUrls", keywords, "joinsPerSession", "updatedAt")
           VALUES ($1, $2, $3, $4, $5, $6) ON CONFLICT ("tenantId") DO NOTHING`,
          [
            tenantId,
            String(legacyConfig?.caption || ''),
            JSON.stringify(Array.isArray(legacyConfig?.postUrls) ? legacyConfig.postUrls : []),
            JSON.stringify(Array.isArray(legacyJoin?.keywords) ? legacyJoin.keywords : []),
            Number(legacyJoin?.joinsPerSession) || 5,
            nowIso()
          ]
        );
      }
    }

    // Group targets
    const legacyGroups = readJsonFile(path.join(dataDir, 'fb_groups.json'));
    if (Array.isArray(legacyGroups)) {
      for (const g of legacyGroups) {
        if (!g?.url) continue;
        await db.execute(
          `INSERT INTO fb_groups (id, "tenantId", name, url, status, "joinedAt", "createdAt")
           VALUES ($1, $2, $3, $4, $5, $6, $7)
           ON CONFLICT ("tenantId", url) DO NOTHING`,
          [
            `fbg_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
            tenantId,
            String(g.name || 'Facebook Group'),
            String(g.url).trim(),
            String(g.status || 'pending'),
            g.joinedAt || null,
            nowIso()
          ]
        );
      }
    }

    // Activity history
    const legacyActivity = readJsonFile(path.join(dataDir, 'fb_activity_log.json'));
    if (Array.isArray(legacyActivity) && legacyActivity.length) {
      const count = await db.queryOne<{ n: string }>(
        'SELECT COUNT(*)::text AS n FROM fb_activity_log WHERE "tenantId" = $1',
        [tenantId]
      );
      if (!count || Number(count.n) === 0) {
        for (const a of legacyActivity.slice(0, 250)) {
          await db.execute(
            `INSERT INTO fb_activity_log (id, "tenantId", "profileId", type, target, detail, status, "createdAt")
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
            [
              `fbl_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
              tenantId,
              sanitizeId(a?.profileId || a?.profile) || null,
              String(a?.type || 'post'),
              String(a?.target || a?.url || ''),
              String(a?.detail || a?.message || ''),
              String(a?.status || 'success'),
              a?.timestamp || a?.createdAt || nowIso()
            ]
          );
        }
      }
    }
    } catch (err: any) {
      console.warn(`[FB Poster] Legacy import failed for ${tenantId} (will retry): ${err.message}`);
      throw err;
    }
  })();

  legacyImportsInFlight.set(tenantId, run);
  try {
    await run;
    importedTenants.add(tenantId);
  } catch {
    // Already logged. Leave the tenant unmarked so a later request retries.
  } finally {
    legacyImportsInFlight.delete(tenantId);
  }
}

// ─── CONFIG HELPERS ──────────────────────────────────────────────────────────

interface FbConfigRow {
  tenantId: string;
  caption: string;
  postUrls: string;
  keywords: string;
  joinsPerSession: number;
  maxPostsPerDay: number;
  delayMinMinutes: number;
  delayMaxMinutes: number;
}

async function getConfigRow(tenantId: string): Promise<FbConfigRow> {
  const row = await db.queryOne<FbConfigRow>('SELECT * FROM fb_campaign_config WHERE "tenantId" = $1', [tenantId]);
  if (row) return row;
  return {
    tenantId,
    caption: '',
    postUrls: '[]',
    keywords: '[]',
    joinsPerSession: 5,
    maxPostsPerDay: 10,
    delayMinMinutes: 3,
    delayMaxMinutes: 9
  };
}

function parseJsonArray(raw: unknown): any[] {
  try {
    const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function upsertConfig(tenantId: string, patch: Partial<Record<string, any>>): Promise<void> {
  const current = await getConfigRow(tenantId);
  const merged = { ...current, ...patch };
  await db.execute(
    `INSERT INTO fb_campaign_config ("tenantId", caption, "postUrls", keywords, "joinsPerSession",
                                     "maxPostsPerDay", "delayMinMinutes", "delayMaxMinutes", "updatedAt")
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     ON CONFLICT ("tenantId") DO UPDATE SET
       caption = EXCLUDED.caption,
       "postUrls" = EXCLUDED."postUrls",
       keywords = EXCLUDED.keywords,
       "joinsPerSession" = EXCLUDED."joinsPerSession",
       "maxPostsPerDay" = EXCLUDED."maxPostsPerDay",
       "delayMinMinutes" = EXCLUDED."delayMinMinutes",
       "delayMaxMinutes" = EXCLUDED."delayMaxMinutes",
       "updatedAt" = EXCLUDED."updatedAt"`,
    [
      tenantId,
      merged.caption,
      merged.postUrls,
      merged.keywords,
      merged.joinsPerSession,
      merged.maxPostsPerDay,
      merged.delayMinMinutes,
      merged.delayMaxMinutes,
      nowIso()
    ]
  );
}

async function logActivity(
  tenantId: string,
  entry: { profileId?: string | null; type?: string; target?: string; detail?: string; status?: string }
): Promise<void> {
  try {
    await db.execute(
      `INSERT INTO fb_activity_log (id, "tenantId", "profileId", type, target, detail, status, "createdAt")
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        `fbl_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
        tenantId,
        entry.profileId ? sanitizeId(entry.profileId) : null,
        entry.type || 'post',
        entry.target || '',
        entry.detail || '',
        entry.status || 'success',
        nowIso()
      ]
    );
  } catch (err: any) {
    console.warn(`[FB Poster] Activity log write failed: ${err.message}`);
  }
}

// ─── ENDPOINTS: ACCOUNTS ─────────────────────────────────────────────────────

/**
 * GET /accounts - List accounts for tenant (never returns cookie material)
 */
facebookPosterRouter.get('/accounts', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    await importLegacyTenantData(tenantId);

    const rows = await db.queryAll(
      `SELECT id, "profileId", name, status, note, "dailyLimit", "sentToday", "lastRunAt",
              ("cookiesEnc" IS NOT NULL) AS "hasSession"
         FROM fb_accounts WHERE "tenantId" = $1 ORDER BY name ASC`,
      [tenantId]
    );
    res.json(rows || []);
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to list accounts' });
  }
});

/**
 * POST /accounts/add - Validate & store account cookies/profile
 */
facebookPosterRouter.post('/accounts/add', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    await importLegacyTenantData(tenantId);

    const { profileId, name = '', cookiesStr = '', note = '', dailyLimit } = req.body;

    if (!profileId || typeof profileId !== 'string') {
      return res.status(400).json({ error: 'Valid profileId is required.' });
    }
    const safeProfileId = sanitizeId(profileId);
    if (!safeProfileId) {
      return res.status(400).json({ error: 'Profile ID must contain letters, numbers, dashes or underscores.' });
    }
    if (!cookiesStr || typeof cookiesStr !== 'string') {
      return res.status(400).json({ error: 'Cookies JSON string is required.' });
    }

    let parsedCookies: any;
    try {
      parsedCookies = JSON.parse(cookiesStr.trim());
      if (!Array.isArray(parsedCookies)) {
        if (typeof parsedCookies === 'object' && parsedCookies !== null) {
          parsedCookies = [parsedCookies];
        } else {
          throw new Error('Cookies must be a JSON array or cookie object.');
        }
      }
    } catch (e: any) {
      return res.status(400).json({ error: `Invalid cookies JSON: ${e.message}` });
    }

    // Health heuristic: presence of c_user or xs means a usable session
    const hasCUser = parsedCookies.some((c: any) => c && (c.name === 'c_user' || c.name === 'xs'));
    const initialStatus = hasCUser ? 'valid' : 'checking';

    const limit = Math.max(1, Math.min(500, parseInt(String(dailyLimit ?? 25), 10) || 25));
    const stamp = nowIso();

    await db.execute(
      `INSERT INTO fb_accounts (id, "tenantId", "profileId", name, status, "dailyLimit", "sentToday",
                                "cookiesEnc", note, "createdAt", "updatedAt")
       VALUES ($1, $2, $3, $4, $5, $6, 0, $7, $8, $9, $9)
       ON CONFLICT ("tenantId", "profileId") DO UPDATE SET
         name = EXCLUDED.name,
         status = EXCLUDED.status,
         "cookiesEnc" = EXCLUDED."cookiesEnc",
         note = EXCLUDED.note,
         "dailyLimit" = EXCLUDED."dailyLimit",
         "updatedAt" = EXCLUDED."updatedAt"`,
      [
        `fba_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        tenantId,
        safeProfileId,
        String(name).trim() || safeProfileId,
        initialStatus,
        limit,
        encryptSecret(JSON.stringify(parsedCookies)),
        String(note).trim(),
        stamp
      ]
    );

    await logActivity(tenantId, {
      profileId: safeProfileId,
      type: 'session',
      detail: `Session linked (${parsedCookies.length} cookies)`,
      status: hasCUser ? 'success' : 'warning'
    });

    res.json({
      success: true,
      message: hasCUser
        ? `Session linked for ${safeProfileId}.`
        : `Session stored for ${safeProfileId}, but no c_user/xs cookie was found — it may not authenticate.`,
      profileId: safeProfileId,
      status: initialStatus
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to add account' });
  }
});

/**
 * DELETE /accounts/:id & POST /accounts/delete - Delete account
 */
const handleDeleteAccount = async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const targetId = (req.params.id || req.body?.profileId || '').trim();
    if (!targetId) {
      return res.status(400).json({ error: 'Profile ID is required for deletion.' });
    }
    const safeProfileId = sanitizeId(targetId);
    if (!safeProfileId) {
      return res.status(400).json({ error: 'Invalid profile id.' });
    }

    const result = await db.execute(
      'DELETE FROM fb_accounts WHERE "tenantId" = $1 AND "profileId" = $2',
      [tenantId, safeProfileId]
    );

    // Clean the on-disk Playwright profile cache
    try {
      const profileDir = resolveProfileDir(tenantId, safeProfileId);
      if (fs.existsSync(profileDir)) fs.rmSync(profileDir, { recursive: true, force: true });
    } catch { /* cache cleanup is best-effort */ }

    if (!result.rowCount) {
      return res.status(404).json({ error: `Profile ${safeProfileId} not found.` });
    }

    await logActivity(tenantId, { profileId: safeProfileId, type: 'session', detail: 'Profile deleted', status: 'success' });
    res.json({ success: true, message: `Profile ${safeProfileId} deleted successfully.` });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to delete account' });
  }
};

facebookPosterRouter.delete('/accounts/:id', handleDeleteAccount);
facebookPosterRouter.post('/accounts/delete', handleDeleteAccount);

/**
 * POST /accounts/:id/limit - Adjust an account's daily posting ceiling
 */
facebookPosterRouter.post('/accounts/:id/limit', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const safeProfileId = sanitizeId(req.params.id);
    if (!safeProfileId) return res.status(400).json({ error: 'Invalid profile id.' });

    const limit = Math.max(1, Math.min(500, parseInt(String(req.body?.dailyLimit), 10) || 25));
    const result = await db.execute(
      'UPDATE fb_accounts SET "dailyLimit" = $1, "updatedAt" = $2 WHERE "tenantId" = $3 AND "profileId" = $4',
      [limit, nowIso(), tenantId, safeProfileId]
    );
    if (!result.rowCount) return res.status(404).json({ error: 'Profile not found.' });

    res.json({ success: true, dailyLimit: limit });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to update daily limit' });
  }
});

/**
 * POST /accounts/:id/reset-counter - Clear today's send counter for an account
 */
facebookPosterRouter.post('/accounts/:id/reset-counter', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const safeProfileId = sanitizeId(req.params.id);
    if (!safeProfileId) return res.status(400).json({ error: 'Invalid profile id.' });

    const result = await db.execute(
      'UPDATE fb_accounts SET "sentToday" = 0, "lastResetDate" = $1, "updatedAt" = $2 WHERE "tenantId" = $3 AND "profileId" = $4',
      [todayStr(), nowIso(), tenantId, safeProfileId]
    );
    if (!result.rowCount) return res.status(404).json({ error: 'Profile not found.' });

    await logActivity(tenantId, { profileId: safeProfileId, type: 'session', detail: 'Daily counter reset', status: 'success' });
    res.json({ success: true, sentToday: 0 });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to reset counter' });
  }
});

/**
 * POST /accounts/:id/verify - Re-check the stored cookie jar for a live session
 */
facebookPosterRouter.post('/accounts/:id/verify', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const safeProfileId = sanitizeId(req.params.id);
    if (!safeProfileId) return res.status(400).json({ error: 'Invalid profile id.' });

    const account = await db.queryOne<{ cookiesEnc: string | null }>(
      'SELECT "cookiesEnc" FROM fb_accounts WHERE "tenantId" = $1 AND "profileId" = $2',
      [tenantId, safeProfileId]
    );
    if (!account) return res.status(404).json({ error: 'Profile not found.' });

    let status = 'invalid';
    let detail = 'No session cookies stored.';
    if (account.cookiesEnc) {
      const cookies = parseJsonArray(decryptSecret(account.cookiesEnc));
      const hasAuth = cookies.some((c: any) => c && (c.name === 'c_user' || c.name === 'xs'));
      const expired = cookies.some(
        (c: any) => c && (c.name === 'c_user' || c.name === 'xs') && c.expires && Number(c.expires) > 0 && Number(c.expires) * 1000 < Date.now()
      );
      if (hasAuth && !expired) {
        status = 'valid';
        detail = `Session looks healthy (${cookies.length} cookies).`;
      } else if (expired) {
        status = 'expired';
        detail = 'Auth cookies are past their expiry — re-link the session.';
      } else {
        status = 'checking';
        detail = 'No c_user/xs cookie present in the stored jar.';
      }
    }

    await db.execute(
      'UPDATE fb_accounts SET status = $1, "updatedAt" = $2 WHERE "tenantId" = $3 AND "profileId" = $4',
      [status, nowIso(), tenantId, safeProfileId]
    );
    res.json({ success: true, status, detail });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to verify session' });
  }
});

// ─── ENDPOINTS: CAMPAIGN CONFIG ──────────────────────────────────────────────

facebookPosterRouter.get('/config', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    await importLegacyTenantData(tenantId);
    const row = await getConfigRow(tenantId);
    res.json({
      caption: row.caption || '',
      postUrls: parseJsonArray(row.postUrls),
      maxPostsPerDay: row.maxPostsPerDay ?? 10,
      delayMinMinutes: row.delayMinMinutes ?? 3,
      delayMaxMinutes: row.delayMaxMinutes ?? 9
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to load campaign config' });
  }
});

facebookPosterRouter.post('/config', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const { caption = '', postUrls = [], maxPostsPerDay, delayMinMinutes, delayMaxMinutes } = req.body;

    const minDelay = Math.max(0, Math.min(720, parseInt(String(delayMinMinutes ?? 3), 10) || 3));
    const maxDelay = Math.max(minDelay, Math.min(1440, parseInt(String(delayMaxMinutes ?? 9), 10) || 9));

    await upsertConfig(tenantId, {
      caption: typeof caption === 'string' ? caption.trim() : '',
      postUrls: JSON.stringify(
        Array.isArray(postUrls) ? postUrls.map((u: any) => String(u).trim()).filter(Boolean) : []
      ),
      maxPostsPerDay: Math.max(1, Math.min(200, parseInt(String(maxPostsPerDay ?? 10), 10) || 10)),
      delayMinMinutes: minDelay,
      delayMaxMinutes: maxDelay
    });

    res.json({ success: true, message: 'Campaign configuration saved.' });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to save campaign config' });
  }
});

facebookPosterRouter.get('/join-config', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    await importLegacyTenantData(tenantId);
    const row = await getConfigRow(tenantId);
    res.json({ keywords: parseJsonArray(row.keywords), joinsPerSession: row.joinsPerSession ?? 5 });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to load join config' });
  }
});

facebookPosterRouter.post('/join-config', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const { keywords = [], joinsPerSession = 5 } = req.body;
    await upsertConfig(tenantId, {
      keywords: JSON.stringify(
        Array.isArray(keywords) ? keywords.map((k: any) => String(k).trim()).filter(Boolean) : []
      ),
      joinsPerSession: Math.max(1, Math.min(20, parseInt(String(joinsPerSession), 10) || 5))
    });
    res.json({ success: true, message: 'Join configuration saved.' });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to save join config' });
  }
});

// ─── ENDPOINTS: GROUPS ───────────────────────────────────────────────────────

facebookPosterRouter.get('/groups', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    await importLegacyTenantData(tenantId);
    const rows = await db.queryAll(
      'SELECT id, name, url, status, "profileId", "joinedAt" FROM fb_groups WHERE "tenantId" = $1 ORDER BY "createdAt" DESC',
      [tenantId]
    );
    res.json(rows || []);
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to load groups' });
  }
});

facebookPosterRouter.post('/groups', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const { name, url, status = 'pending' } = req.body;
    if (!url || typeof url !== 'string' || !url.trim()) {
      return res.status(400).json({ error: 'Group url is required.' });
    }

    const cleanUrl = url.trim();
    if (!/^https?:\/\//i.test(cleanUrl)) {
      return res.status(400).json({ error: 'Group url must start with http:// or https://' });
    }

    await db.execute(
      `INSERT INTO fb_groups (id, "tenantId", name, url, status, "createdAt")
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT ("tenantId", url) DO UPDATE SET name = EXCLUDED.name, status = EXCLUDED.status`,
      [
        `fbg_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        tenantId,
        name ? String(name).trim() : 'Facebook Group',
        cleanUrl,
        String(status).trim() || 'pending',
        nowIso()
      ]
    );
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to update groups' });
  }
});

/**
 * DELETE /groups/:id - Drop a single group target
 */
facebookPosterRouter.delete('/groups/:id', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const groupId = String(req.params.id || '').trim();
    if (!groupId) return res.status(400).json({ error: 'Group id is required.' });

    const result = await db.execute('DELETE FROM fb_groups WHERE "tenantId" = $1 AND id = $2', [tenantId, groupId]);
    if (!result.rowCount) return res.status(404).json({ error: 'Group not found.' });
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to delete group' });
  }
});

/**
 * POST /groups/clear - Drop every group target for the tenant
 */
facebookPosterRouter.post('/groups/clear', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const result = await db.execute('DELETE FROM fb_groups WHERE "tenantId" = $1', [tenantId]);
    res.json({ success: true, removed: result.rowCount || 0 });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to clear groups' });
  }
});

// ─── ENDPOINTS: ACTIVITY ─────────────────────────────────────────────────────

const handleGetActivity = async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    await importLegacyTenantData(tenantId);
    const limit = Math.min(Math.max(parseInt(String(req.query.limit), 10) || 250, 1), 1000);
    const rows = await db.queryAll(
      `SELECT id, "profileId", type, target, detail, status, "createdAt"
         FROM fb_activity_log WHERE "tenantId" = $1 ORDER BY "createdAt" DESC LIMIT $2`,
      [tenantId, limit]
    );
    res.json(rows || []);
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to load activity logs' });
  }
};

facebookPosterRouter.get('/activity', handleGetActivity);
facebookPosterRouter.get('/activity-log', handleGetActivity);

/**
 * POST /activity/clear - Purge the tenant's activity history
 */
facebookPosterRouter.post('/activity/clear', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const result = await db.execute('DELETE FROM fb_activity_log WHERE "tenantId" = $1', [tenantId]);
    res.json({ success: true, removed: result.rowCount || 0 });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to clear activity log' });
  }
});

// ─── RUN MATERIALISATION & INGEST ────────────────────────────────────────────

/**
 * Write the database state out to the JSON layout the Playwright worker expects,
 * including a decrypted cookies.json inside the (sanitised) profile directory.
 */
async function materialiseRunState(tenantId: string, profileId: string): Promise<{ profileDir: string; dataDir: string }> {
  const dataDir = getTenantDataDir(tenantId);
  const profileDir = resolveProfileDir(tenantId, profileId);
  if (!fs.existsSync(profileDir)) fs.mkdirSync(profileDir, { recursive: true });

  const accounts = await db.queryAll<any>(
    'SELECT "profileId", name, status, note, "cookiesEnc" FROM fb_accounts WHERE "tenantId" = $1',
    [tenantId]
  );

  fs.writeFileSync(
    path.join(dataDir, 'accounts.json'),
    JSON.stringify(
      accounts.map((a) => ({ profileId: a.profileId, name: a.name, status: a.status, note: a.note || '' })),
      null,
      2
    ),
    'utf8'
  );

  const target = accounts.find((a) => a.profileId === sanitizeId(profileId));
  if (target?.cookiesEnc) {
    const cookies = decryptSecret(target.cookiesEnc);
    fs.writeFileSync(path.join(profileDir, 'cookies.json'), cookies || '[]', 'utf8');
  }

  const cfg = await getConfigRow(tenantId);
  fs.writeFileSync(
    path.join(dataDir, 'fb_config.json'),
    JSON.stringify(
      {
        caption: cfg.caption || '',
        postUrls: parseJsonArray(cfg.postUrls),
        maxPostsPerDay: cfg.maxPostsPerDay ?? 10,
        delayMin: cfg.delayMinMinutes ?? 3,
        delayMax: cfg.delayMaxMinutes ?? 9
      },
      null,
      2
    ),
    'utf8'
  );

  fs.writeFileSync(
    path.join(dataDir, 'fb_join_config.json'),
    JSON.stringify({ keywords: parseJsonArray(cfg.keywords), joinsPerSession: cfg.joinsPerSession ?? 5 }, null, 2),
    'utf8'
  );

  const groups = await db.queryAll<any>(
    'SELECT name, url, status, "joinedAt" FROM fb_groups WHERE "tenantId" = $1',
    [tenantId]
  );
  fs.writeFileSync(path.join(dataDir, 'fb_groups.json'), JSON.stringify(groups, null, 2), 'utf8');

  // Start each run with an empty activity file so the ingest only sees this run.
  fs.writeFileSync(path.join(dataDir, 'fb_activity_log.json'), '[]', 'utf8');

  return { profileDir, dataDir };
}

/**
 * Pull everything the worker wrote back into the database and scrub the
 * decrypted cookie jar from disk.
 */
async function ingestRunResults(tenantId: string, profileId: string, dataDir: string, profileDir: string): Promise<void> {
  const safeProfileId = sanitizeId(profileId);

  // 1. Newly discovered / joined groups
  const groups = readJsonFile(path.join(dataDir, 'fb_groups.json'));
  if (Array.isArray(groups)) {
    for (const g of groups) {
      if (!g?.url) continue;
      await db.execute(
        `INSERT INTO fb_groups (id, "tenantId", name, url, status, "profileId", "joinedAt", "createdAt")
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         ON CONFLICT ("tenantId", url) DO UPDATE SET
           status = EXCLUDED.status,
           "joinedAt" = COALESCE(EXCLUDED."joinedAt", fb_groups."joinedAt")`,
        [
          `fbg_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
          tenantId,
          String(g.name || 'Facebook Group'),
          String(g.url).trim(),
          String(g.status || 'pending'),
          safeProfileId || null,
          g.joinedAt || null,
          nowIso()
        ]
      ).catch(() => {});
    }
  }

  // 2. Activity entries produced by this run
  const activity = readJsonFile(path.join(dataDir, 'fb_activity_log.json'));
  let successfulPosts = 0;
  if (Array.isArray(activity)) {
    for (const a of activity) {
      const status = String(a?.status || 'success');
      if (status === 'success' && String(a?.type || 'post') === 'post') successfulPosts++;
      await logActivity(tenantId, {
        profileId: sanitizeId(a?.profileId || safeProfileId) || null,
        type: String(a?.type || 'post'),
        target: String(a?.target || a?.url || ''),
        detail: String(a?.detail || a?.message || ''),
        status
      });
    }
  }

  // 3. Account status + daily counter. The increment is done in SQL so that
  //    concurrent runs can never overwrite each other's tally.
  const accounts = readJsonFile(path.join(dataDir, 'accounts.json'));
  if (Array.isArray(accounts) && safeProfileId) {
    const updated = accounts.find((a: any) => a?.profileId === safeProfileId);
    if (updated?.status) {
      await db.execute(
        'UPDATE fb_accounts SET status = $1, "updatedAt" = $2 WHERE "tenantId" = $3 AND "profileId" = $4',
        [String(updated.status), nowIso(), tenantId, safeProfileId]
      ).catch(() => {});
    }
  }

  if (safeProfileId) {
    await db.execute(
      `UPDATE fb_accounts
          SET "sentToday" = CASE WHEN "lastResetDate" = $1 THEN "sentToday" + $2 ELSE $2 END,
              "lastResetDate" = $1,
              "lastRunAt" = $3,
              "updatedAt" = $3
        WHERE "tenantId" = $4 AND "profileId" = $5`,
      [todayStr(), successfulPosts, nowIso(), tenantId, safeProfileId]
    ).catch(() => {});
  }

  // 4. Scrub the decrypted session from disk — the database holds the sealed copy.
  scrubDecryptedCookies(profileDir);
}

/** Remove the decrypted cookie jar; the database holds the sealed copy. */
function scrubDecryptedCookies(profileDir: string): void {
  try {
    const cookieFile = path.join(profileDir, 'cookies.json');
    if (fs.existsSync(cookieFile)) fs.rmSync(cookieFile, { force: true });
  } catch { /* best-effort */ }
}

function spawnPosterJob(tenantId: string, mode: string, account: string, profileDir: string, dataDir: string): void {
  const posterScript = resolvePosterScriptPath();
  const safeAccount = sanitizeId(account);

  const child = spawn(process.execPath, [
    posterScript,
    '--mode', mode,
    '--profile', safeAccount,
    '--tenant', sanitizeTenantId(tenantId),
    '--profileDir', profileDir,
    '--dataDir', dataDir
  ], {
    cwd: path.dirname(posterScript),
    env: { ...process.env },
    stdio: ['ignore', 'pipe', 'pipe']
  });

  const jobRecord: ActivePosterJob = {
    tenantId,
    account: safeAccount,
    mode,
    process: child,
    startTime: nowIso(),
    logs: [`🚀 Initialized Facebook Auto-Poster [${mode.toUpperCase()}] on profile ${safeAccount}`]
  };

  activeJobs.set(tenantId, jobRecord);

  child.stdout?.on('data', (chunk: Buffer) => {
    const lines = chunk.toString('utf8').split(/\r?\n/).filter(Boolean);
    for (const l of lines) appendJobLog(tenantId, l);
  });

  child.stderr?.on('data', (chunk: Buffer) => {
    const lines = chunk.toString('utf8').split(/\r?\n/).filter(Boolean);
    for (const l of lines) appendJobLog(tenantId, `[STDERR] ${l}`);
  });

  // Without this listener a failed spawn emits an unhandled 'error' event,
  // which Node rethrows as an uncaught exception and takes the API down.
  child.on('error', (err: Error) => {
    appendJobLog(tenantId, `❌ Could not start the Facebook worker: ${err.message}`);
    console.error('[FB Poster] Worker spawn failed:', err);
    scrubDecryptedCookies(profileDir);
    if (activeJobs.get(tenantId)?.process === child) {
      activeJobs.delete(tenantId);
    }
  });

  child.on('close', (code: number | null) => {
    appendJobLog(tenantId, `🏁 Job finished with exit code: ${code ?? 0}`);
    ingestRunResults(tenantId, safeAccount, dataDir, profileDir)
      .then(() => appendJobLog(tenantId, '💾 Run results persisted to database.'))
      .catch((err) => appendJobLog(tenantId, `⚠️ Failed to persist run results: ${err.message}`))
      .finally(() => {
        if (activeJobs.get(tenantId)?.process === child) {
          activeJobs.delete(tenantId);
        }
      });
  });
}

function terminatePosterJob(tenantId: string): boolean {
  const job = activeJobs.get(tenantId);
  if (!job) return false;
  try {
    job.process.kill('SIGTERM');
  } catch { /* already gone */ }
  activeJobs.delete(tenantId);
  return true;
}

/**
 * Shared guard for /run and /toggle: resolves the account from the database,
 * enforces tenant ownership and the daily ceiling, and materialises run state.
 */
async function prepareRun(
  tenantId: string,
  rawAccount: string
): Promise<{ ok: true; profileId: string; profileDir: string; dataDir: string } | { ok: false; code: number; error: string }> {
  const profileId = sanitizeId(rawAccount);
  if (!profileId) return { ok: false, code: 400, error: 'Target account profile is required.' };

  const account = await db.queryOne<{ profileId: string; dailyLimit: number; sentToday: number; lastResetDate: string | null; cookiesEnc: string | null }>(
    'SELECT "profileId", "dailyLimit", "sentToday", "lastResetDate", "cookiesEnc" FROM fb_accounts WHERE "tenantId" = $1 AND "profileId" = $2',
    [tenantId, profileId]
  );

  // Ownership is proven by the row existing under this tenantId — a profile
  // belonging to another workspace simply is not found here.
  if (!account) {
    return { ok: false, code: 404, error: `Profile "${profileId}" is not linked to this workspace.` };
  }
  if (!account.cookiesEnc) {
    return { ok: false, code: 400, error: `Profile "${profileId}" has no stored session. Link cookies first.` };
  }

  const sentToday = account.lastResetDate === todayStr() ? Number(account.sentToday) || 0 : 0;
  if (sentToday >= (Number(account.dailyLimit) || 25)) {
    return {
      ok: false,
      code: 429,
      error: `Daily limit reached for "${profileId}" (${sentToday}/${account.dailyLimit}). Raise the limit or reset the counter.`
    };
  }

  const { profileDir, dataDir } = await materialiseRunState(tenantId, profileId);
  return { ok: true, profileId, profileDir, dataDir };
}

facebookPosterRouter.post('/run', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    await importLegacyTenantData(tenantId);

    const { mode = 'share', account = '', profileId = '' } = req.body;
    const targetAccount = String(account || profileId || '').trim();

    if (activeJobs.has(tenantId)) {
      return res.status(409).json({ error: 'A Facebook poster job is already running for this workspace.' });
    }

    const prepared = await prepareRun(tenantId, targetAccount);
    if (!prepared.ok) return res.status(prepared.code).json({ error: prepared.error });

    spawnPosterJob(tenantId, mode === 'join' ? 'join' : 'share', prepared.profileId, prepared.profileDir, prepared.dataDir);
    res.json({ status: 'running', message: 'Facebook poster job started.' });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to start poster job' });
  }
});

facebookPosterRouter.post('/stop', (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    terminatePosterJob(tenantId);
    res.json({ status: 'stopped', message: 'Facebook poster job stopped.' });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to stop poster job' });
  }
});

facebookPosterRouter.post('/toggle', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    await importLegacyTenantData(tenantId);

    const { mode = 'share', account = '' } = req.body;

    if (activeJobs.has(tenantId)) {
      terminatePosterJob(tenantId);
      return res.json({ status: 'stopped', message: 'Facebook poster job stopped.' });
    }

    const targetAccount = String(account || '').trim();
    if (!targetAccount) {
      return res.status(400).json({ error: 'Please select an account to run the campaign.' });
    }

    const prepared = await prepareRun(tenantId, targetAccount);
    if (!prepared.ok) return res.status(prepared.code).json({ error: prepared.error });

    spawnPosterJob(tenantId, mode === 'join' ? 'join' : 'share', prepared.profileId, prepared.profileDir, prepared.dataDir);
    res.json({ status: 'running', message: 'Facebook poster job started.' });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to toggle poster job' });
  }
});

/**
 * GET /status & GET /logs - Live job streaming/poll
 */
const handleGetStatus = (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const job = activeJobs.get(tenantId);
    if (!job) {
      return res.json({ status: 'idle', logs: [] });
    }
    res.json({
      status: 'running',
      account: job.account,
      mode: job.mode,
      startTime: job.startTime,
      logs: job.logs.slice(-200)
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to read job status' });
  }
};

facebookPosterRouter.get('/status', handleGetStatus);
facebookPosterRouter.get('/logs', handleGetStatus);

export default facebookPosterRouter;
