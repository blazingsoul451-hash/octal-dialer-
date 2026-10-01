/**
 * activityManager.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Comprehensive User Activity Logging & Agent Daily Performance Scorecards.
 *
 * Provides:
 *  - High-performance, non-blocking user action audit logging (logUserActivity)
 *  - Thread-safe, atomic daily agent metrics accumulation (recordAgentCallMetric)
 *  - Scoped query methods for tenant-isolated activity and agent scorecard views
 * ─────────────────────────────────────────────────────────────────────────────
 */

import crypto from 'crypto';
import { getDatabase } from './databaseManager';

export interface UserActivityParams {
  tenantId?: string;
  userId: string;
  username: string;
  action: string;
  resourceType?: string;
  resourceId?: string;
  details?: string | Record<string, any>;
  ipAddress?: string;
  userAgent?: string;
  req?: any;
}

export interface CallMetricInput {
  tenantId: string;
  userId: string;
  username: string;
  outcome: string;
  duration: number; // in seconds
  timestamp?: string;
}

export interface ActivityFilterOptions {
  userId?: string;
  action?: string;
  limit?: number;
  offset?: number;
  page?: number;
}

/**
 * Safely extracts client IP from Express request, handling reverse-proxies
 */
export function extractClientIp(req?: any): string {
  if (!req) return '127.0.0.1';
  const forwarded = req.headers?.['x-forwarded-for'];
  if (forwarded) {
    const list = String(forwarded).split(',');
    return list[0].trim();
  }
  const realIp = req.headers?.['x-real-ip'];
  if (realIp) return String(realIp).trim();
  return req.socket?.remoteAddress || req.ip || '127.0.0.1';
}

/**
 * Safely extracts client User-Agent
 */
export function extractUserAgent(req?: any): string {
  if (!req) return 'Unknown Client';
  return req.headers?.['user-agent'] || 'Unknown Client';
}

/**
 * Records a granular user action into the user_activity_logs table.
 * Fully non-blocking and fail-safe: never throws or interferes with business logic.
 */
export async function logUserActivity(params: UserActivityParams): Promise<void> {
  const db = getDatabase();
  const id = 'act_' + crypto.randomUUID().replace(/-/g, '').slice(0, 16);
  const now = new Date().toISOString();

  const ip = params.ipAddress || (params.req ? extractClientIp(params.req) : '127.0.0.1');
  const ua = params.userAgent || (params.req ? extractUserAgent(params.req) : 'Unknown Client');

  let formattedDetails = '';
  if (typeof params.details === 'object' && params.details !== null) {
    try {
      formattedDetails = JSON.stringify(params.details);
    } catch {
      formattedDetails = String(params.details);
    }
  } else if (params.details) {
    formattedDetails = String(params.details);
  }

  try {
    await db.execute(`
      INSERT INTO user_activity_logs (
        id, "tenantId", "userId", username, action, "resourceType", "resourceId", details, "ipAddress", "userAgent", timestamp
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
    `, [
      id,
      params.tenantId || 'platform',
      params.userId,
      params.username,
      params.action,
      params.resourceType || 'system',
      params.resourceId || null,
      formattedDetails || null,
      ip,
      ua,
      now
    ]);
  } catch (err: any) {
    console.warn(`[ActivityManager] Notice recording activity log (${params.action}):`, err.message);
  }
}

/**
 * Atomically records or increments an agent's daily performance metrics in agent_daily_metrics.
 */
export async function recordAgentCallMetric(input: CallMetricInput): Promise<void> {
  if (!input.tenantId || !input.userId) return;

  const db = getDatabase();
  const now = new Date();
  const callTs = input.timestamp ? new Date(input.timestamp) : now;
  const dateStr = callTs.toISOString().slice(0, 10); // YYYY-MM-DD
  const nowIso = now.toISOString();

  const outcomeClean = (input.outcome || '').toUpperCase();
  const durationSec = Math.max(0, Math.round(Number(input.duration) || 0));

  const isAnswered = outcomeClean.includes('ANSWER') || outcomeClean.includes('CONNECTED') || outcomeClean.includes('COMPLETED');
  const isBusy = outcomeClean.includes('BUSY');
  const isNoAnswer = outcomeClean.includes('NO ANSWER') || outcomeClean.includes('NOANSWER') || outcomeClean.includes('TIMEOUT');
  const isFailed = outcomeClean.includes('FAIL') || outcomeClean.includes('REJECT');

  const answeredVal = isAnswered ? 1 : 0;
  const busyVal = isBusy ? 1 : 0;
  const noAnswerVal = isNoAnswer ? 1 : 0;
  const failedVal = isFailed ? 1 : 0;
  const talkSec = isAnswered ? durationSec : 0;

  const metricId = 'adm_' + crypto.randomUUID().replace(/-/g, '').slice(0, 16);

  try {
    await db.execute(`
      INSERT INTO agent_daily_metrics (
        id, "tenantId", "userId", username, date,
        "totalCalls", "answeredCalls", "failedCalls", "busyCalls", "noAnswerCalls",
        "totalTalkSeconds", "avgTalkSeconds", "firstCallAt", "lastCallAt", "updatedAt"
      ) VALUES (
        $1, $2, $3, $4, $5,
        1, $6, $7, $8, $9,
        $10, $10, $11, $11, $11
      )
      ON CONFLICT ("tenantId", "userId", date) DO UPDATE SET
        username = EXCLUDED.username,
        "totalCalls" = agent_daily_metrics."totalCalls" + 1,
        "answeredCalls" = agent_daily_metrics."answeredCalls" + EXCLUDED."answeredCalls",
        "failedCalls" = agent_daily_metrics."failedCalls" + EXCLUDED."failedCalls",
        "busyCalls" = agent_daily_metrics."busyCalls" + EXCLUDED."busyCalls",
        "noAnswerCalls" = agent_daily_metrics."noAnswerCalls" + EXCLUDED."noAnswerCalls",
        "totalTalkSeconds" = agent_daily_metrics."totalTalkSeconds" + EXCLUDED."totalTalkSeconds",
        "avgTalkSeconds" = CASE
          WHEN (agent_daily_metrics."answeredCalls" + EXCLUDED."answeredCalls") > 0
          THEN (agent_daily_metrics."totalTalkSeconds" + EXCLUDED."totalTalkSeconds") / (agent_daily_metrics."answeredCalls" + EXCLUDED."answeredCalls")
          ELSE 0
        END,
        "lastCallAt" = EXCLUDED."lastCallAt",
        "updatedAt" = EXCLUDED."updatedAt"
    `, [
      metricId,
      input.tenantId,
      input.userId,
      input.username || 'agent',
      dateStr,
      answeredVal,
      failedVal,
      busyVal,
      noAnswerVal,
      talkSec,
      nowIso
    ]);
  } catch (err: any) {
    console.warn('[ActivityManager] Notice updating agent daily metrics:', err.message);
  }
}

/**
 * Retrieves paginated user activity logs for a tenant workspace
 */
export async function getUserActivityLogs(
  tenantId: string,
  options: ActivityFilterOptions = {}
): Promise<{ logs: any[]; total: number; page: number; totalPages: number }> {
  const db = getDatabase();
  const page = Math.max(1, Number(options.page) || 1);
  const limit = Math.max(1, Math.min(100, Number(options.limit) || 30));
  const offset = (page - 1) * limit;

  let where = 'WHERE "tenantId" = $1';
  const params: any[] = [tenantId];

  if (options.userId && options.userId !== 'all') {
    params.push(options.userId);
    where += ` AND "userId" = $${params.length}`;
  }

  if (options.action && options.action !== 'all') {
    params.push(options.action);
    where += ` AND "action" = $${params.length}`;
  }

  const countRow = await db.queryOne<{ c: string | number }>(
    `SELECT COUNT(*) as c FROM user_activity_logs ${where}`,
    params
  );
  const total = Number(countRow?.c || 0);
  const totalPages = Math.ceil(total / limit) || 1;

  params.push(limit, offset);
  const logs = await db.queryAll<any>(`
    SELECT id, "tenantId", "userId", username, action, "resourceType", "resourceId", details, "ipAddress", "userAgent", timestamp
    FROM user_activity_logs
    ${where}
    ORDER BY timestamp DESC
    LIMIT $${params.length - 1} OFFSET $${params.length}
  `, params);

  return { logs, total, page, totalPages };
}

/**
 * Retrieves agent daily metrics for a tenant workspace
 */
export async function getAgentDailyMetrics(
  tenantId: string,
  options: { userId?: string; date?: string; limit?: number } = {}
): Promise<any[]> {
  const db = getDatabase();
  let where = 'WHERE "tenantId" = $1';
  const params: any[] = [tenantId];

  if (options.userId && options.userId !== 'all') {
    params.push(options.userId);
    where += ` AND "userId" = $${params.length}`;
  }

  if (options.date) {
    params.push(options.date);
    where += ` AND date = $${params.length}`;
  }

  const limit = Math.max(1, Math.min(100, Number(options.limit) || 30));
  params.push(limit);

  return db.queryAll<any>(`
    SELECT *
    FROM agent_daily_metrics
    ${where}
    ORDER BY date DESC, "totalCalls" DESC
    LIMIT $${params.length}
  `, params);
}
