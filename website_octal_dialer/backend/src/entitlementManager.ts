/**
 * ENTITLEMENT & SUBSCRIPTION MANAGER (Phase 7)
 *
 * Centralized service for resolving and enforcing:
 * - Tenant subscriptions
 * - Plan feature flags (octalDialer, googleScraper, autoEmailer, facebookScraper, facebookPoster, analytics, custom_roles, api_keys)
 * - Plan resource limits (maxUsers, maxDevices, maxCampaigns, maxApiKeys, maxLeads)
 * - Real-time server-derived tenant usage
 * - Atomic limit checking
 */

import { Request, Response, NextFunction } from 'express';
import { getDatabase } from './databaseManager';

export interface PlanLimits {
  maxUsers: number;
  maxDevices: number;
  maxCampaigns: number;
  maxApiKeys: number;
  maxLeads: number;
}

export interface TenantEntitlements {
  isValid: boolean;
  subscriptionId: string | null;
  planId: string | null;
  planName: string;
  status: 'active' | 'trialing' | 'past_due' | 'suspended' | 'cancelled' | 'expired' | 'none';
  currentPeriodStart: string | null;
  currentPeriodEnd: string | null;
  features: Record<string, boolean>;
  limits: PlanLimits;
}

export interface TenantUsage {
  users: number;
  devices: number;
  campaigns: number;
  apiKeys: number;
  leads: number;
}

export type LimitKey = keyof PlanLimits;

const DEFAULT_LIMITS: PlanLimits = {
  maxUsers: 5,
  maxDevices: 5,
  maxCampaigns: 50,
  maxApiKeys: 10,
  maxLeads: 50000
};

/**
 * Initialize default catalog plans and plan features if not already seeded
 */
export async function initializeCatalogPlans(): Promise<void> {
  const db = getDatabase();

  const standardPlans = [
    {
      id: 'plan_starter',
      name: 'Starter Plan',
      priceMonthly: 29,
      priceYearly: 290,
      status: 'active',
      limits: { maxUsers: 5, maxDevices: 3, maxCampaigns: 20, maxApiKeys: 5, maxLeads: 10000 },
      features: {
        octalDialer: true,
        googleScraper: true,
        autoEmailer: false,
        facebookScraper: false,
        facebookPoster: false,
        analytics: true,
        custom_roles: false,
        api_keys: true
      }
    },
    {
      id: 'plan_pro',
      name: 'Professional Plan',
      priceMonthly: 79,
      priceYearly: 790,
      status: 'active',
      limits: { maxUsers: 20, maxDevices: 10, maxCampaigns: 100, maxApiKeys: 20, maxLeads: 100000 },
      features: {
        octalDialer: true,
        googleScraper: true,
        autoEmailer: true,
        facebookScraper: true,
        facebookPoster: true,
        analytics: true,
        custom_roles: true,
        api_keys: true
      }
    },
    {
      id: 'plan_enterprise',
      name: 'Enterprise Plan',
      priceMonthly: 199,
      priceYearly: 1990,
      status: 'active',
      limits: { maxUsers: 1000, maxDevices: 500, maxCampaigns: 10000, maxApiKeys: 500, maxLeads: 10000000 },
      features: {
        octalDialer: true,
        googleScraper: true,
        autoEmailer: true,
        facebookScraper: true,
        facebookPoster: true,
        analytics: true,
        custom_roles: true,
        api_keys: true
      }
    },
    {
      id: 'plan_legacy',
      name: 'Legacy Unlimited Plan',
      priceMonthly: 0,
      priceYearly: 0,
      status: 'active',
      limits: { maxUsers: 1000, maxDevices: 500, maxCampaigns: 10000, maxApiKeys: 500, maxLeads: 10000000 },
      features: {
        octalDialer: true,
        googleScraper: true,
        autoEmailer: true,
        facebookScraper: true,
        facebookPoster: true,
        analytics: true,
        custom_roles: true,
        api_keys: true
      }
    }
  ];

  await db.withTransaction(async () => {
    for (const p of standardPlans) {
      await db.execute(`
        INSERT INTO plans (id, name, "priceMonthly", "priceYearly", status, "createdAt", "updatedAt")
        VALUES ($1, $2, $3, $4, $5, now(), now())
        ON CONFLICT ("id") DO NOTHING
      `, [p.id, p.name, p.priceMonthly, p.priceYearly, p.status]);

      for (const [limitKey, val] of Object.entries(p.limits)) {
        await db.execute(`
          INSERT INTO plan_features ("planId", "featureKey", value)
          VALUES ($1, $2, $3)
          ON CONFLICT ("planId", "featureKey") DO UPDATE SET value = EXCLUDED.value
        `, [p.id, limitKey, String(val)]);
      }

      for (const [featKey, val] of Object.entries(p.features)) {
        await db.execute(`
          INSERT INTO plan_features ("planId", "featureKey", value)
          VALUES ($1, $2, $3)
          ON CONFLICT ("planId", "featureKey") DO UPDATE SET value = EXCLUDED.value
        `, [p.id, featKey, val ? 'true' : 'false']);
      }
    }
  });
}

/**
 * Resolves current subscription and full entitlement matrix for a tenant
 */
export async function getTenantEntitlements(tenantId: string): Promise<TenantEntitlements> {
  if (!tenantId) {
    return createEmptyEntitlements('none');
  }

  if (tenantId === 'tenant_default') {
    return {
      isValid: true,
      subscriptionId: 'sub_root_default',
      planId: 'plan_enterprise',
      planName: 'Enterprise Unlimited (Root Tenant)',
      status: 'active',
      currentPeriodStart: new Date().toISOString(),
      currentPeriodEnd: new Date(Date.now() + 1000 * 86400 * 3650).toISOString(),
      features: {
        octalDialer: true,
        googleScraper: true,
        autoEmailer: true,
        facebookScraper: true,
        facebookPoster: true,
        analytics: true,
        custom_roles: true,
        api_keys: true
      },
      limits: {
        maxUsers: 1000,
        maxDevices: 500,
        maxCampaigns: 10000,
        maxApiKeys: 500,
        maxLeads: 10000000
      }
    };
  }

  const db = getDatabase();

  const sub = await db.queryOne<any>(`
    SELECT s.id, s."tenantId", s."planId", s.status, s."currentPeriodStart", s."currentPeriodEnd",
           p.name as "planName", p.status as "planStatus"
    FROM subscriptions s
    JOIN plans p ON p.id = s."planId"
    WHERE s."tenantId" = $1
    ORDER BY s."createdAt" DESC
    LIMIT 1
  `, [tenantId]);

  if (!sub) {
    return {
      isValid: true,
      subscriptionId: null,
      planId: 'plan_starter',
      planName: 'Default Starter Trial',
      status: 'trialing',
      currentPeriodStart: new Date().toISOString(),
      currentPeriodEnd: new Date(Date.now() + 1000 * 86400 * 30).toISOString(),
      features: {
        octalDialer: true,
        googleScraper: true,
        autoEmailer: true,
        facebookScraper: true,
        facebookPoster: true,
        analytics: true,
        custom_roles: true,
        api_keys: true
      },
      limits: { ...DEFAULT_LIMITS }
    };
  }

  let effectiveStatus = sub.status as TenantEntitlements['status'];
  if (sub.currentPeriodEnd) {
    const periodEnd = new Date(sub.currentPeriodEnd);
    if (!isNaN(periodEnd.getTime()) && periodEnd < new Date()) {
      effectiveStatus = 'expired';
    }
  }

  const isValid = (effectiveStatus === 'active' || effectiveStatus === 'trialing') && sub.planStatus === 'active';

  if (!isValid) {
    return {
      isValid: false,
      subscriptionId: sub.id,
      planId: sub.planId,
      planName: sub.planName,
      status: effectiveStatus,
      currentPeriodStart: sub.currentPeriodStart,
      currentPeriodEnd: sub.currentPeriodEnd,
      features: {},
      limits: { maxUsers: 0, maxDevices: 0, maxCampaigns: 0, maxApiKeys: 0, maxLeads: 0 }
    };
  }

  const featureRows = await db.queryAll<{ featureKey: string; value: string }>(`
    SELECT "featureKey", value FROM plan_features WHERE "planId" = $1
  `, [sub.planId]);

  const features: Record<string, boolean> = {};
  const limits: PlanLimits = { ...DEFAULT_LIMITS };

  for (const row of featureRows) {
    const k = row.featureKey;
    const v = row.value;

    if (k.startsWith('max')) {
      const numVal = parseInt(v, 10);
      if (!isNaN(numVal)) {
        (limits as any)[k] = numVal;
      }
    } else {
      features[k] = v === 'true' || v === '1';
    }
  }

  return {
    isValid: true,
    subscriptionId: sub.id,
    planId: sub.planId,
    planName: sub.planName,
    status: effectiveStatus,
    currentPeriodStart: sub.currentPeriodStart,
    currentPeriodEnd: sub.currentPeriodEnd,
    features,
    limits
  };
}

function createEmptyEntitlements(status: TenantEntitlements['status']): TenantEntitlements {
  return {
    isValid: false,
    subscriptionId: null,
    planId: null,
    planName: 'No Active Plan',
    status,
    currentPeriodStart: null,
    currentPeriodEnd: null,
    features: {},
    limits: { maxUsers: 0, maxDevices: 0, maxCampaigns: 0, maxApiKeys: 0, maxLeads: 0 }
  };
}

/**
 * Derives current real-time usage for a tenant strictly from database
 */
export async function getTenantUsage(tenantId: string): Promise<TenantUsage> {
  if (!tenantId) {
    return { users: 0, devices: 0, campaigns: 0, apiKeys: 0, leads: 0 };
  }

  const db = getDatabase();

  const userCount = await db.queryOne<{ c: string | number }>(`SELECT COUNT(*) as c FROM users WHERE "tenantId" = $1`, [tenantId]);
  const deviceCount = await db.queryOne<{ c: string | number }>(`SELECT COUNT(*) as c FROM devices WHERE "tenantId" = $1 AND "isRevoked" = 0`, [tenantId]);
  const campaignCount = await db.queryOne<{ c: string | number }>(`SELECT COUNT(*) as c FROM campaigns WHERE "tenantId" = $1`, [tenantId]);
  const apiKeyCount = await db.queryOne<{ c: string | number }>(`SELECT COUNT(*) as c FROM api_keys WHERE "tenantId" = $1 AND "revokedAt" IS NULL`, [tenantId]);
  const leadCount = await db.queryOne<{ c: string | number }>(`SELECT COUNT(*) as c FROM scraped_leads WHERE "tenantId" = $1`, [tenantId]);

  return {
    users: Number(userCount?.c || 0),
    devices: Number(deviceCount?.c || 0),
    campaigns: Number(campaignCount?.c || 0),
    apiKeys: Number(apiKeyCount?.c || 0),
    leads: Number(leadCount?.c || 0)
  };
}

/**
 * Checks if creating additional resources of a specific type is permitted under the tenant plan
 */
export async function checkLimit(
  tenantId: string,
  limitKey: LimitKey,
  increment: number = 1
): Promise<{ allowed: boolean; current: number; limit: number; error?: string }> {
  const entitlements = await getTenantEntitlements(tenantId);

  if (!entitlements.isValid) {
    return {
      allowed: false,
      current: 0,
      limit: 0,
      error: `Subscription is inactive or suspended (${entitlements.status}). Please update your subscription to continue.`
    };
  }

  const usage = await getTenantUsage(tenantId);

  let current = 0;
  switch (limitKey) {
    case 'maxUsers':
      current = usage.users;
      break;
    case 'maxDevices':
      current = usage.devices;
      break;
    case 'maxCampaigns':
      current = usage.campaigns;
      break;
    case 'maxApiKeys':
      current = usage.apiKeys;
      break;
    case 'maxLeads':
      current = usage.leads;
      break;
  }

  const limit = entitlements.limits[limitKey] ?? 0;

  if (current + increment > limit) {
    return {
      allowed: false,
      current,
      limit,
      error: `Plan limit reached for ${limitKey} (${current}/${limit}). Please upgrade your subscription plan to increase quota.`
    };
  }

  return { allowed: true, current, limit };
}

/**
 * Checks if a specific feature is enabled for a tenant
 */
export async function isFeatureEnabled(tenantId: string, featureKey: string): Promise<boolean> {
  const entitlements = await getTenantEntitlements(tenantId);
  if (!entitlements.isValid) return false;
  return !!entitlements.features[featureKey];
}

/**
 * Express Middleware: Requires an active, valid subscription for the tenant
 */
export async function requireActiveSubscription(req: Request, res: Response, next: NextFunction): Promise<void> {
  const user = (req as any).user;
  if (!user || !user.tenantId) {
    res.status(401).json({ error: 'Authentication required with valid tenant context.' });
    return;
  }

  if (user.role === 'platform_admin' && req.path.startsWith('/admin/tenants')) {
    next();
    return;
  }

  const entitlements = await getTenantEntitlements(user.tenantId);
  if (!entitlements.isValid) {
    res.status(402).json({
      error: `Active subscription required. Current status: ${entitlements.status}.`,
      status: entitlements.status,
      planName: entitlements.planName
    });
    return;
  }

  next();
}

/**
 * Express Middleware: Requires a specific plan feature to be enabled for the tenant
 */
export function requireFeature(featureKey: string) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const user = (req as any).user;
    if (!user || !user.tenantId) {
      res.status(401).json({ error: 'Authentication required with valid tenant context.' });
      return;
    }

    if (user.role === 'platform_admin') {
      next();
      return;
    }

    const entitlements = await getTenantEntitlements(user.tenantId);
    if (!entitlements.isValid) {
      res.status(402).json({
        error: `Active subscription required. Current status: ${entitlements.status}.`,
        status: entitlements.status
      });
      return;
    }

    if (!entitlements.features[featureKey]) {
      res.status(403).json({
        error: `Feature '${featureKey}' is not included in your current plan (${entitlements.planName}). Please upgrade to access this feature.`,
        feature: featureKey,
        currentPlan: entitlements.planName
      });
      return;
    }

    next();
  };
}
