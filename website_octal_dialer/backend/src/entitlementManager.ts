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
  maxUsers: 2,
  maxDevices: 1,
  maxCampaigns: 3,
  maxApiKeys: 1,
  maxLeads: 1000
};

/**
 * Initialize default catalog plans and plan features if not already seeded
 */
export function initializeCatalogPlans(): void {
  const db = getDatabase();

  const standardPlans = [
    {
      id: 'plan_starter',
      name: 'Starter Plan',
      priceMonthly: 29,
      priceYearly: 290,
      status: 'active',
      limits: { maxUsers: 2, maxDevices: 1, maxCampaigns: 5, maxApiKeys: 1, maxLeads: 1000 },
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
      limits: { maxUsers: 10, maxDevices: 5, maxCampaigns: 25, maxApiKeys: 5, maxLeads: 25000 },
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
      limits: { maxUsers: 100, maxDevices: 50, maxCampaigns: 1000, maxApiKeys: 50, maxLeads: 500000 },
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
      limits: { maxUsers: 50, maxDevices: 20, maxCampaigns: 100, maxApiKeys: 20, maxLeads: 100000 },
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

  const insertPlan = db.prepare(`
    INSERT OR IGNORE INTO plans (id, name, priceMonthly, priceYearly, status, createdAt, updatedAt)
    VALUES (@id, @name, @priceMonthly, @priceYearly, @status, datetime('now'), datetime('now'))
  `);

  const insertFeature = db.prepare(`
    INSERT OR REPLACE INTO plan_features (planId, featureKey, value)
    VALUES (?, ?, ?)
  `);

  const seedTx = db.transaction(() => {
    for (const p of standardPlans) {
      insertPlan.run({
        id: p.id,
        name: p.name,
        priceMonthly: p.priceMonthly,
        priceYearly: p.priceYearly,
        status: p.status
      });

      // Seed limits as plan_features
      for (const [limitKey, val] of Object.entries(p.limits)) {
        insertFeature.run(p.id, limitKey, String(val));
      }

      // Seed boolean features
      for (const [featKey, val] of Object.entries(p.features)) {
        insertFeature.run(p.id, featKey, val ? 'true' : 'false');
      }
    }
  });

  seedTx();
}

/**
 * Resolves current subscription and full entitlement matrix for a tenant
 */
export function getTenantEntitlements(tenantId: string): TenantEntitlements {
  if (!tenantId) {
    return createEmptyEntitlements('none');
  }

  const db = getDatabase();

  // Find latest subscription for tenant
  const sub = db.prepare(`
    SELECT s.id, s.tenantId, s.planId, s.status, s.currentPeriodStart, s.currentPeriodEnd,
           p.name as planName, p.status as planStatus
    FROM subscriptions s
    JOIN plans p ON p.id = s.planId
    WHERE s.tenantId = ?
    ORDER BY s.createdAt DESC
    LIMIT 1
  `).get(tenantId) as any;

  if (!sub) {
    return createEmptyEntitlements('none');
  }

  // Check expiration if periodEnd is specified
  let effectiveStatus = sub.status as TenantEntitlements['status'];
  if (sub.currentPeriodEnd) {
    const periodEnd = new Date(sub.currentPeriodEnd);
    if (!isNaN(periodEnd.getTime()) && periodEnd < new Date()) {
      effectiveStatus = 'expired';
    }
  }

  const isValid = (effectiveStatus === 'active' || effectiveStatus === 'trialing') && sub.planStatus === 'active';

  // If subscription is not valid (e.g. suspended/expired/cancelled), return blocked entitlements
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

  // Fetch plan_features for the active plan
  const featureRows = db.prepare(`
    SELECT featureKey, value FROM plan_features WHERE planId = ?
  `).all(sub.planId) as Array<{ featureKey: string; value: string }>;

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
export function getTenantUsage(tenantId: string): TenantUsage {
  if (!tenantId) {
    return { users: 0, devices: 0, campaigns: 0, apiKeys: 0, leads: 0 };
  }

  const db = getDatabase();

  const userCount = db.prepare(`SELECT COUNT(*) as c FROM users WHERE tenantId = ?`).get(tenantId) as { c: number };
  const deviceCount = db.prepare(`SELECT COUNT(*) as c FROM devices WHERE tenantId = ?`).get(tenantId) as { c: number };
  const campaignCount = db.prepare(`SELECT COUNT(*) as c FROM campaigns WHERE tenantId = ?`).get(tenantId) as { c: number };
  const apiKeyCount = db.prepare(`SELECT COUNT(*) as c FROM api_keys WHERE tenantId = ? AND revokedAt IS NULL`).get(tenantId) as { c: number };
  const leadCount = db.prepare(`SELECT COUNT(*) as c FROM scraped_leads WHERE tenantId = ?`).get(tenantId) as { c: number };

  return {
    users: userCount?.c || 0,
    devices: deviceCount?.c || 0,
    campaigns: campaignCount?.c || 0,
    apiKeys: apiKeyCount?.c || 0,
    leads: leadCount?.c || 0
  };
}

/**
 * Checks if creating additional resources of a specific type is permitted under the tenant plan
 */
export function checkLimit(
  tenantId: string,
  limitKey: LimitKey,
  increment: number = 1
): { allowed: boolean; current: number; limit: number; error?: string } {
  const entitlements = getTenantEntitlements(tenantId);

  if (!entitlements.isValid) {
    return {
      allowed: false,
      current: 0,
      limit: 0,
      error: `Subscription is inactive or suspended (${entitlements.status}). Please update your subscription to continue.`
    };
  }

  const usage = getTenantUsage(tenantId);

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
export function isFeatureEnabled(tenantId: string, featureKey: string): boolean {
  const entitlements = getTenantEntitlements(tenantId);
  if (!entitlements.isValid) return false;
  return !!entitlements.features[featureKey];
}

/**
 * Express Middleware: Requires an active, valid subscription for the tenant
 */
export function requireActiveSubscription(req: Request, res: Response, next: NextFunction): void {
  const user = (req as any).user;
  if (!user || !user.tenantId) {
    res.status(401).json({ error: 'Authentication required with valid tenant context.' });
    return;
  }

  // Platform admin operating on platform routes bypasses tenant subscription requirement
  if (user.role === 'platform_admin' && req.path.startsWith('/admin/tenants')) {
    next();
    return;
  }

  const entitlements = getTenantEntitlements(user.tenantId);
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
  return (req: Request, res: Response, next: NextFunction): void => {
    const user = (req as any).user;
    if (!user || !user.tenantId) {
      res.status(401).json({ error: 'Authentication required with valid tenant context.' });
      return;
    }

    // Platform admin operating in tenant context inherits access for maintenance
    if (user.role === 'platform_admin') {
      next();
      return;
    }

    const entitlements = getTenantEntitlements(user.tenantId);
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
