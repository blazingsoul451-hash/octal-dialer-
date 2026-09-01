/**
 * databaseManager.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Step 1 of 13 — SQLite persistence layer
 * Replaces the flat db.json file with a real SQLite database.
 * Exported function signatures are IDENTICAL to the old JSON implementation so
 * server.ts requires no structural changes.
 *
 * Tables created:
 *   campaigns, leads, call_logs,
 *   devices, users, sessions_store, call_attempts, call_events,
 *   dispositions, commands, suppression_list, audit_logs, ota_versions
 *
 * WAL journal mode is enabled from the start for safe concurrent writes.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import fs from 'fs';
import path from 'path';
import { checkLimit, initializeCatalogPlans } from './entitlementManager';
import { dbAdapter, DbAdapter, USE_POSTGRES } from './db/dbAdapter';

// ─── DB file location ────────────────────────────────────────────────────────
const DATA_DIR = path.join(__dirname, '../data');
const DB_FILE  = path.join(DATA_DIR, 'octal_dialer.db');
const LEGACY_JSON = path.join(DATA_DIR, 'db.json');

if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

// ─── Open (or create) the database ───────────────────────────────────────────
const db: DbAdapter = dbAdapter;

if (!USE_POSTGRES) {
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
} else {
  dbAdapter.init().catch(err => {
    console.error('[DatabaseManager] PostgreSQL initialization notice:', err);
  });
}

// ─── Schema creation (SQLite legacy only — PostgreSQL uses schema.sql) ───────
if (!USE_POSTGRES) {
db.exec(`
  -- Core campaign & lead tables (replace the old JSON arrays)
  CREATE TABLE IF NOT EXISTS campaigns (
    id          TEXT PRIMARY KEY,
    name        TEXT NOT NULL,
    fileName    TEXT NOT NULL DEFAULT '',
    leadCount   INTEGER NOT NULL DEFAULT 0,
    status      TEXT NOT NULL DEFAULT 'ACTIVE',
    createdAt   TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS leads (
    id          TEXT PRIMARY KEY,
    campaignId  TEXT NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
    name        TEXT NOT NULL DEFAULT 'Unknown Lead',
    phone       TEXT NOT NULL,
    status      TEXT NOT NULL DEFAULT 'PENDING',
    outcome     TEXT,
    duration    REAL,
    lockedBy    TEXT,
    lockedAt    TEXT,
    createdAt   TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS call_logs (
    id            TEXT PRIMARY KEY,
    leadId        TEXT NOT NULL,
    leadName      TEXT NOT NULL DEFAULT '',
    leadPhone     TEXT NOT NULL DEFAULT '',
    campaignName  TEXT NOT NULL DEFAULT '',
    outcome       TEXT NOT NULL DEFAULT 'UNKNOWN',
    duration      REAL NOT NULL DEFAULT 0,
    timestamp     TEXT NOT NULL
  );

  -- Future steps tables (created now, populated later)
  CREATE TABLE IF NOT EXISTS devices (
    id          TEXT PRIMARY KEY,
    name        TEXT NOT NULL,
    btAddress   TEXT,
    osType      TEXT,
    ipAddress   TEXT,
    status      TEXT NOT NULL DEFAULT 'OFFLINE',
    lastSeenAt  TEXT,
    createdAt   TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS users (
    id          TEXT PRIMARY KEY,
    username    TEXT NOT NULL UNIQUE,
    passwordHash TEXT NOT NULL,
    role        TEXT NOT NULL DEFAULT 'agent',
    createdAt   TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS sessions_store (
    id          TEXT PRIMARY KEY,
    userId      TEXT REFERENCES users(id) ON DELETE CASCADE,
    token       TEXT NOT NULL UNIQUE,
    expiresAt   TEXT NOT NULL,
    createdAt   TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS call_attempts (
    id          TEXT PRIMARY KEY,
    leadId      TEXT NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
    commandId   TEXT,
    deviceId    TEXT,
    status      TEXT NOT NULL DEFAULT 'INITIATED',
    startedAt   TEXT NOT NULL DEFAULT (datetime('now')),
    endedAt     TEXT
  );

  CREATE TABLE IF NOT EXISTS call_events (
    id          TEXT PRIMARY KEY,
    attemptId   TEXT NOT NULL REFERENCES call_attempts(id) ON DELETE CASCADE,
    event       TEXT NOT NULL,
    timestamp   TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS dispositions (
    id          TEXT PRIMARY KEY,
    leadId      TEXT NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
    outcome     TEXT NOT NULL,
    notes       TEXT,
    loggedAt    TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS commands (
    id          TEXT PRIMARY KEY,
    leadId      TEXT NOT NULL,
    sessionId   TEXT NOT NULL,
    issuedAt    TEXT NOT NULL DEFAULT (datetime('now')),
    expiresAt   TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS suppression_list (
    id          TEXT PRIMARY KEY,
    phone       TEXT NOT NULL UNIQUE,
    reason      TEXT,
    source      TEXT,
    addedAt     TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS audit_logs (
    id          TEXT PRIMARY KEY,
    action      TEXT NOT NULL,
    entityType  TEXT,
    entityId    TEXT,
    performedBy TEXT,
    details     TEXT,
    timestamp   TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS ota_versions (
    id          TEXT PRIMARY KEY,
    version     TEXT NOT NULL UNIQUE,
    buildNumber INTEGER NOT NULL DEFAULT 0,
    apkHash     TEXT,
    signature   TEXT,
    releaseNotes TEXT,
    isActive    INTEGER NOT NULL DEFAULT 0,
    uploadedAt  TEXT NOT NULL DEFAULT (datetime('now'))
  );

  -- ── Auto-Emailer Module ────────────────────────────────────────────────
  CREATE TABLE IF NOT EXISTS email_leads (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    email       TEXT NOT NULL UNIQUE,
    name        TEXT NOT NULL DEFAULT 'Client',
    company     TEXT NOT NULL DEFAULT '',
    status      TEXT NOT NULL DEFAULT 'pending',
    stage       INTEGER NOT NULL DEFAULT 1,
    lastSentAt  TEXT,
    createdAt   TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS email_accounts (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    email       TEXT NOT NULL UNIQUE,
    password    TEXT NOT NULL,
    senderName  TEXT,
    smtpHost    TEXT NOT NULL DEFAULT 'smtp.office365.com',
    smtpPort    INTEGER NOT NULL DEFAULT 587,
    status      TEXT NOT NULL DEFAULT 'active',
    createdAt   TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS email_templates (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    subject     TEXT NOT NULL,
    body        TEXT NOT NULL,
    stage       INTEGER NOT NULL DEFAULT 1,
    createdAt   TEXT NOT NULL DEFAULT (datetime('now'))
  );

  -- ═══════════════════════════════════════════════════════════════════════════
  -- ADMIN DASHBOARD: Module & Tool Permissions
  -- ═══════════════════════════════════════════════════════════════════════════

  -- User module permissions (5 modules: octalDialer, googleScraper, autoEmailer, facebookScraper, facebookPoster)
  CREATE TABLE IF NOT EXISTS user_permissions (
    id          TEXT PRIMARY KEY,
    userId      TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    moduleId    TEXT NOT NULL,
    enabled     INTEGER NOT NULL DEFAULT 1,
    grantedBy   TEXT,
    grantedAt   TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE(userId, moduleId)
  );
  CREATE INDEX IF NOT EXISTS idx_user_permissions_userId ON user_permissions(userId);
  CREATE INDEX IF NOT EXISTS idx_user_permissions_moduleId ON user_permissions(moduleId);

  -- Tool registry (sub-tools within each module)
  CREATE TABLE IF NOT EXISTS module_tools (
    id              TEXT PRIMARY KEY,
    moduleId        TEXT NOT NULL,
    toolKey         TEXT NOT NULL,
    toolLabel       TEXT NOT NULL,
    enabledGlobally INTEGER NOT NULL DEFAULT 1,
    UNIQUE(moduleId, toolKey)
  );

  -- Per-user tool permissions
  CREATE TABLE IF NOT EXISTS user_tool_permissions (
    id          TEXT PRIMARY KEY,
    userId      TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    toolId      TEXT NOT NULL REFERENCES module_tools(id) ON DELETE CASCADE,
    enabled     INTEGER NOT NULL DEFAULT 1,
    UNIQUE(userId, toolId)
  );

  -- ═══════════════════════════════════════════════════════════════════════════
  -- SCRAPED LEADS STORAGE
  -- ═══════════════════════════════════════════════════════════════════════════

  CREATE TABLE IF NOT EXISTS scraped_leads (
    id              TEXT PRIMARY KEY,
    source          TEXT NOT NULL,
    campaignId      TEXT,
    businessName    TEXT,
    phone           TEXT,
    email           TEXT,
    address         TEXT,
    website         TEXT,
    socialLinks     TEXT,
    rawData         TEXT,
    status          TEXT NOT NULL DEFAULT 'new',
    scrapedBy       TEXT NOT NULL,
    scrapedAt       TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE(source, phone, businessName)
  );
  CREATE INDEX IF NOT EXISTS idx_leads_source ON scraped_leads(source);
  CREATE INDEX IF NOT EXISTS idx_leads_campaign ON scraped_leads(campaignId);
  CREATE INDEX IF NOT EXISTS idx_leads_status ON scraped_leads(status);

  -- ═══════════════════════════════════════════════════════════════════════════
  -- MODULE SETTINGS (admin defaults + per-user overrides)
  -- ═══════════════════════════════════════════════════════════════════════════

  CREATE TABLE IF NOT EXISTS module_settings (
    id            TEXT PRIMARY KEY,
    moduleId      TEXT NOT NULL,
    userId        TEXT,
    settingKey    TEXT NOT NULL,
    settingValue  TEXT NOT NULL,
    updatedAt     TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE(moduleId, userId, settingKey)
  );

  -- ═══════════════════════════════════════════════════════════════════════════
  -- ADMIN PANEL: System Settings
  -- ═══════════════════════════════════════════════════════════════════════════

  CREATE TABLE IF NOT EXISTS system_settings (
    id            TEXT PRIMARY KEY,
    category      TEXT NOT NULL,
    settingKey    TEXT NOT NULL,
    settingValue  TEXT NOT NULL,
    dataType      TEXT NOT NULL DEFAULT 'string',
    description   TEXT,
    updatedBy     TEXT,
    updatedAt     TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE(category, settingKey)
  );
  CREATE INDEX IF NOT EXISTS idx_system_settings_category ON system_settings(category);

  -- ═══════════════════════════════════════════════════════════════════════════
  -- ADMIN PANEL: Custom Roles
  -- ═══════════════════════════════════════════════════════════════════════════

  CREATE TABLE IF NOT EXISTS custom_roles (
    id            TEXT PRIMARY KEY,
    roleName      TEXT NOT NULL UNIQUE,
    description   TEXT,
    permissions   TEXT NOT NULL,
    createdBy     TEXT NOT NULL,
    createdAt     TEXT NOT NULL DEFAULT (datetime('now'))
  );

  -- ═══════════════════════════════════════════════════════════════════════════
  -- ADMIN PANEL: API Keys
  -- ═══════════════════════════════════════════════════════════════════════════

  CREATE TABLE IF NOT EXISTS api_keys (
    id            TEXT PRIMARY KEY,
    keyName       TEXT NOT NULL,
    keyHash       TEXT NOT NULL UNIQUE,
    userId        TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    scopes        TEXT NOT NULL,
    expiresAt     TEXT,
    lastUsedAt    TEXT,
    createdAt     TEXT NOT NULL DEFAULT (datetime('now')),
    revokedAt     TEXT
  );
  CREATE INDEX IF NOT EXISTS idx_apikeys_keyHash ON api_keys(keyHash);
  CREATE INDEX IF NOT EXISTS idx_apikeys_userId ON api_keys(userId);

  -- ═══════════════════════════════════════════════════════════════════════════
  -- ADMIN PANEL: Enhanced Audit Logs
  -- ═══════════════════════════════════════════════════════════════════════════

  CREATE TABLE IF NOT EXISTS audit_logs_admin (
    id            TEXT PRIMARY KEY,
    userId        TEXT REFERENCES users(id) ON DELETE SET NULL,
    username      TEXT NOT NULL,
    action        TEXT NOT NULL,
    targetType    TEXT,
    targetId      TEXT,
    details       TEXT,
    ipAddress     TEXT,
    userAgent     TEXT,
    timestamp     TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE INDEX IF NOT EXISTS idx_audit_userId ON audit_logs_admin(userId);
  CREATE INDEX IF NOT EXISTS idx_audit_action ON audit_logs_admin(action);
  CREATE INDEX IF NOT EXISTS idx_audit_timestamp ON audit_logs_admin(timestamp);

  -- ═══════════════════════════════════════════════════════════════════════════
  -- ADMIN PANEL: System Health Metrics
  -- ═══════════════════════════════════════════════════════════════════════════

  CREATE TABLE IF NOT EXISTS system_metrics (
    id            TEXT PRIMARY KEY,
    metricType    TEXT NOT NULL,
    metricValue   REAL NOT NULL,
    unit          TEXT,
    timestamp     TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE INDEX IF NOT EXISTS idx_metrics_type ON system_metrics(metricType);
  CREATE INDEX IF NOT EXISTS idx_metrics_timestamp ON system_metrics(timestamp);

  -- ═══════════════════════════════════════════════════════════════════════════
  -- PHASE 2: SAAS TENANT FOUNDATION
  -- ═══════════════════════════════════════════════════════════════════════════

  -- Tenants table: represents companies/organizations subscribing to the platform
  CREATE TABLE IF NOT EXISTS tenants (
    id          TEXT PRIMARY KEY,
    name        TEXT NOT NULL,
    slug        TEXT NOT NULL UNIQUE,
    status      TEXT NOT NULL DEFAULT 'active',
    createdAt   TEXT NOT NULL DEFAULT (datetime('now')),
    updatedAt   TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE INDEX IF NOT EXISTS idx_tenants_slug ON tenants(slug);
  CREATE INDEX IF NOT EXISTS idx_tenants_status ON tenants(status);

  -- Plans table: platform subscription plans catalog
  CREATE TABLE IF NOT EXISTS plans (
    id            TEXT PRIMARY KEY,
    name          TEXT NOT NULL,
    priceMonthly  REAL NOT NULL DEFAULT 0,
    priceYearly   REAL NOT NULL DEFAULT 0,
    status        TEXT NOT NULL DEFAULT 'active',
    createdAt     TEXT NOT NULL DEFAULT (datetime('now')),
    updatedAt     TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE INDEX IF NOT EXISTS idx_plans_status ON plans(status);

  -- Plan features: defines capabilities included in each plan
  CREATE TABLE IF NOT EXISTS plan_features (
    planId      TEXT NOT NULL REFERENCES plans(id) ON DELETE CASCADE,
    featureKey  TEXT NOT NULL,
    value       TEXT NOT NULL,
    PRIMARY KEY (planId, featureKey)
  );
  CREATE INDEX IF NOT EXISTS idx_plan_features_planId ON plan_features(planId);

  -- Subscriptions: links tenants to their active plan
  CREATE TABLE IF NOT EXISTS subscriptions (
    id                  TEXT PRIMARY KEY,
    tenantId            TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    planId              TEXT NOT NULL REFERENCES plans(id) ON DELETE RESTRICT,
    status              TEXT NOT NULL DEFAULT 'active',
    currentPeriodStart  TEXT NOT NULL DEFAULT (datetime('now')),
    currentPeriodEnd    TEXT NOT NULL,
    createdAt           TEXT NOT NULL DEFAULT (datetime('now')),
    updatedAt           TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE INDEX IF NOT EXISTS idx_subscriptions_tenantId ON subscriptions(tenantId);
  CREATE INDEX IF NOT EXISTS idx_subscriptions_planId ON subscriptions(planId);
  CREATE INDEX IF NOT EXISTS idx_subscriptions_status ON subscriptions(status);
`);

// Safe column migrations for tenantId, email_templates, custom_roles, and users
try {
  const TENANT_TABLES = [
    'users', 'campaigns', 'leads', 'call_logs', 'scraped_leads',
    'email_leads', 'email_accounts', 'email_templates', 'devices',
    'call_attempts', 'call_events', 'dispositions', 'suppression_list', 'module_settings'
  ];
  for (const tbl of TENANT_TABLES) {
    try {
      const cols = db.prepare(`PRAGMA table_info(${tbl})`).all() as any[];
      if (!cols.some(c => c.name === 'tenantId')) {
        db.prepare(`ALTER TABLE ${tbl} ADD COLUMN tenantId TEXT NOT NULL DEFAULT 'tenant_default'`).run();
      }
    } catch (_) {}
  }

  const emailCols = db.prepare(`PRAGMA table_info(email_templates)`).all() as any[];
  if (!emailCols.some(c => c.name === 'templateType')) {
    db.prepare(`ALTER TABLE email_templates ADD COLUMN templateType TEXT DEFAULT 'campaign'`).run();
  }
  if (!emailCols.some(c => c.name === 'systemTemplate')) {
    db.prepare(`ALTER TABLE email_templates ADD COLUMN systemTemplate INTEGER DEFAULT 0`).run();
  }

  // Email Accounts OAuth migrations
  const emailAccCols = db.prepare(`PRAGMA table_info(email_accounts)`).all() as any[];
  if (!emailAccCols.some(c => c.name === 'authType')) {
    try { db.prepare(`ALTER TABLE email_accounts ADD COLUMN authType TEXT DEFAULT 'password'`).run(); } catch (_) {}
  }
  if (!emailAccCols.some(c => c.name === 'refreshToken')) {
    try { db.prepare(`ALTER TABLE email_accounts ADD COLUMN refreshToken TEXT`).run(); } catch (_) {}
  }
  if (!emailAccCols.some(c => c.name === 'accessToken')) {
    try { db.prepare(`ALTER TABLE email_accounts ADD COLUMN accessToken TEXT`).run(); } catch (_) {}
  }

  const roleCols = db.prepare(`PRAGMA table_info(custom_roles)`).all() as any[];
  if (!roleCols.some(c => c.name === 'tenantId')) {
    db.prepare(`ALTER TABLE custom_roles ADD COLUMN tenantId TEXT DEFAULT 'tenant_default'`).run();
    db.prepare(`CREATE INDEX IF NOT EXISTS idx_custom_roles_tenantId ON custom_roles(tenantId)`).run();
  }

  const userCols = db.prepare(`PRAGMA table_info(users)`).all() as any[];
  const userColNames = new Set(userCols.map(c => c.name));
  
  if (!userColNames.has('email')) {
    try { db.prepare(`ALTER TABLE users ADD COLUMN email TEXT`).run(); } catch (_) {}
    try { db.prepare(`CREATE INDEX IF NOT EXISTS idx_users_email ON users(email)`).run(); } catch (_) {}
  }
  if (!userColNames.has('googleId')) {
    try { db.prepare(`ALTER TABLE users ADD COLUMN googleId TEXT`).run(); } catch (_) {}
    try { db.prepare(`CREATE INDEX IF NOT EXISTS idx_users_googleId ON users(googleId)`).run(); } catch (_) {}
  }
  if (!userColNames.has('authProvider')) {
    try { db.prepare(`ALTER TABLE users ADD COLUMN authProvider TEXT DEFAULT 'local'`).run(); } catch (_) {}
  }
  if (!userColNames.has('resetToken')) {
    try { db.prepare(`ALTER TABLE users ADD COLUMN resetToken TEXT`).run(); } catch (_) {}
  }
  if (!userColNames.has('resetTokenExpires')) {
    try { db.prepare(`ALTER TABLE users ADD COLUMN resetTokenExpires TEXT`).run(); } catch (_) {}
  }
  if (!userColNames.has('updatedAt')) {
    try { db.prepare(`ALTER TABLE users ADD COLUMN updatedAt TEXT`).run(); } catch (_) {}
  }
  if (!userColNames.has('emailVerified')) {
    try { 
      db.prepare(`ALTER TABLE users ADD COLUMN emailVerified INTEGER DEFAULT 0`).run();
      // Ensure all existing accounts prior to this migration are marked verified
      db.prepare(`UPDATE users SET emailVerified = 1, emailVerifiedAt = datetime('now') WHERE emailVerified IS NULL OR emailVerified = 0`).run();
    } catch (_) {}
  }
  if (!userColNames.has('emailVerifiedAt')) {
    try { db.prepare(`ALTER TABLE users ADD COLUMN emailVerifiedAt TEXT`).run(); } catch (_) {}
  }
  if (!userColNames.has('needsProfileSetup')) {
    try { db.prepare(`ALTER TABLE users ADD COLUMN needsProfileSetup INTEGER DEFAULT 0`).run(); } catch (_) {}
  }
  if (!userColNames.has('displayName')) {
    try { db.prepare(`ALTER TABLE users ADD COLUMN displayName TEXT`).run(); } catch (_) {}
  }

  const tenantCols = db.prepare(`PRAGMA table_info(tenants)`).all() as any[];
  const tenantColNames = new Set(tenantCols.map(c => c.name));
  if (!tenantColNames.has('country')) {
    try { db.prepare(`ALTER TABLE tenants ADD COLUMN country TEXT DEFAULT 'US'`).run(); } catch (_) {}
  }
  if (!tenantColNames.has('logoUrl')) {
    try { db.prepare(`ALTER TABLE tenants ADD COLUMN logoUrl TEXT`).run(); } catch (_) {}
  }
  if (!tenantColNames.has('ownerEmail')) {
    try { db.prepare(`ALTER TABLE tenants ADD COLUMN ownerEmail TEXT`).run(); } catch (_) {}
  }

  // Pending Signups table for secure OTP email verification
  db.prepare(`
    CREATE TABLE IF NOT EXISTS pending_signups (
      id TEXT PRIMARY KEY,
      email TEXT NOT NULL,
      username TEXT NOT NULL,
      passwordHash TEXT NOT NULL,
      codeHash TEXT NOT NULL,
      attempts INTEGER DEFAULT 0,
      resendCount INTEGER DEFAULT 0,
      lastSentAt TEXT NOT NULL,
      expiresAt TEXT NOT NULL,
      verifiedAt TEXT,
      ip TEXT,
      tenantId TEXT DEFAULT 'tenant_default',
      createdAt TEXT NOT NULL
    )
  `).run();
  db.prepare(`CREATE INDEX IF NOT EXISTS idx_pending_signups_email ON pending_signups(email)`).run();
  db.prepare(`CREATE INDEX IF NOT EXISTS idx_pending_signups_expiresAt ON pending_signups(expiresAt)`).run();
} catch (e) {
  console.error('[DB] Migration block warning:', e);
}

// Initialize standard catalog plans & features (Phase 7)
try {
  initializeCatalogPlans();
} catch (e) {
  console.error('[Entitlements] Catalog plans init error:', e);
}

// Phase 8 Billing schema migrations
try {
  const subCols = db.prepare(`PRAGMA table_info(subscriptions)`).all() as any[];
  if (!subCols.some(c => c.name === 'provider')) {
    db.prepare(`ALTER TABLE subscriptions ADD COLUMN provider TEXT DEFAULT 'manual'`).run();
  }
  if (!subCols.some(c => c.name === 'providerCustomerId')) {
    db.prepare(`ALTER TABLE subscriptions ADD COLUMN providerCustomerId TEXT`).run();
  }
  if (!subCols.some(c => c.name === 'providerSubscriptionId')) {
    db.prepare(`ALTER TABLE subscriptions ADD COLUMN providerSubscriptionId TEXT`).run();
  }
  if (!subCols.some(c => c.name === 'providerCheckoutId')) {
    db.prepare(`ALTER TABLE subscriptions ADD COLUMN providerCheckoutId TEXT`).run();
  }
  if (!subCols.some(c => c.name === 'cancelAtPeriodEnd')) {
    db.prepare(`ALTER TABLE subscriptions ADD COLUMN cancelAtPeriodEnd INTEGER DEFAULT 0`).run();
  }
  if (!subCols.some(c => c.name === 'cancelledAt')) {
    db.prepare(`ALTER TABLE subscriptions ADD COLUMN cancelledAt TEXT`).run();
  }
  if (!subCols.some(c => c.name === 'trialStart')) {
    db.prepare(`ALTER TABLE subscriptions ADD COLUMN trialStart TEXT`).run();
  }
  if (!subCols.some(c => c.name === 'trialEnd')) {
    db.prepare(`ALTER TABLE subscriptions ADD COLUMN trialEnd TEXT`).run();
  }
  if (!subCols.some(c => c.name === 'gracePeriodEnd')) {
    db.prepare(`ALTER TABLE subscriptions ADD COLUMN gracePeriodEnd TEXT`).run();
  }

  db.prepare(`CREATE INDEX IF NOT EXISTS idx_subscriptions_providerCustId ON subscriptions(providerCustomerId)`).run();
  db.prepare(`CREATE INDEX IF NOT EXISTS idx_subscriptions_providerSubId ON subscriptions(providerSubscriptionId)`).run();

  db.exec(`
    CREATE TABLE IF NOT EXISTS billing_events (
      id              TEXT PRIMARY KEY,
      provider        TEXT NOT NULL,
      providerEventId TEXT NOT NULL,
      eventType       TEXT NOT NULL,
      tenantId        TEXT,
      subscriptionId  TEXT,
      payload         TEXT,
      eventTimestamp  TEXT,
      processedAt     TEXT NOT NULL DEFAULT (datetime('now')),
      createdAt       TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(provider, providerEventId)
    );
    CREATE INDEX IF NOT EXISTS idx_billing_events_tenantId ON billing_events(tenantId);
    CREATE INDEX IF NOT EXISTS idx_billing_events_provider ON billing_events(provider, providerEventId);
  `);

  const eventCols = db.prepare(`PRAGMA table_info(billing_events)`).all() as any[];
  if (!eventCols.some(c => c.name === 'eventTimestamp')) {
    db.prepare(`ALTER TABLE billing_events ADD COLUMN eventTimestamp TEXT`).run();
  }

  const planCols = db.prepare(`PRAGMA table_info(plans)`).all() as any[];
  if (!planCols.some(c => c.name === 'isPublic')) {
    db.prepare(`ALTER TABLE plans ADD COLUMN isPublic INTEGER DEFAULT 1`).run();
    db.prepare(`UPDATE plans SET isPublic = 0 WHERE id = 'plan_legacy'`).run();
  }
  if (!planCols.some(c => c.name === 'billingInterval')) {
    db.prepare(`ALTER TABLE plans ADD COLUMN billingInterval TEXT DEFAULT 'monthly'`).run();
  }
  if (!planCols.some(c => c.name === 'description')) {
    db.prepare(`ALTER TABLE plans ADD COLUMN description TEXT DEFAULT ''`).run();
  }
  if (!planCols.some(c => c.name === 'sortOrder')) {
    db.prepare(`ALTER TABLE plans ADD COLUMN sortOrder INTEGER DEFAULT 0`).run();
  }
} catch (e) {
  console.error('[Billing] Phase 8 migrations error:', e);
}

// ─── Phase E: CRM & Lead Intelligence Tables ─────────────────────────────────
try {
  db.prepare(`
    CREATE TABLE IF NOT EXISTS crm_follow_ups (
      id            TEXT PRIMARY KEY,
      leadId        TEXT NOT NULL,
      leadName      TEXT NOT NULL DEFAULT '',
      leadPhone     TEXT NOT NULL DEFAULT '',
      campaignId    TEXT,
      campaignName  TEXT NOT NULL DEFAULT '',
      tenantId      TEXT NOT NULL,
      userId        TEXT,
      assignedAgent TEXT,
      scheduledAt   TEXT NOT NULL,
      status        TEXT NOT NULL DEFAULT 'pending',
      notes         TEXT,
      createdAt     TEXT NOT NULL DEFAULT (datetime('now')),
      updatedAt     TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `).run();
  db.prepare(`CREATE INDEX IF NOT EXISTS idx_crm_follow_ups_tenant ON crm_follow_ups(tenantId)`).run();
  db.prepare(`CREATE INDEX IF NOT EXISTS idx_crm_follow_ups_scheduled ON crm_follow_ups(scheduledAt)`).run();
  db.prepare(`CREATE INDEX IF NOT EXISTS idx_crm_follow_ups_status ON crm_follow_ups(status)`).run();

  db.prepare(`
    CREATE TABLE IF NOT EXISTS lead_activities (
      id          TEXT PRIMARY KEY,
      leadId      TEXT NOT NULL,
      tenantId    TEXT NOT NULL,
      userId      TEXT,
      username    TEXT,
      eventType   TEXT NOT NULL,
      description TEXT NOT NULL,
      metadata    TEXT,
      createdAt   TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `).run();
  db.prepare(`CREATE INDEX IF NOT EXISTS idx_lead_activities_lead ON lead_activities(leadId)`).run();
  db.prepare(`CREATE INDEX IF NOT EXISTS idx_lead_activities_tenant ON lead_activities(tenantId)`).run();
  db.prepare(`CREATE INDEX IF NOT EXISTS idx_lead_activities_created ON lead_activities(createdAt)`).run();
} catch (e) {
  console.error('[CRM] Phase E table creation error:', e);
}

// ─── Authenticated Devices Schema Migrations ─────────────────────────────────
try {
  const devCols = db.prepare(`PRAGMA table_info(devices)`).all() as any[];
  const devColNames = new Set(devCols.map(c => c.name));

  if (!devColNames.has('userId')) {
    try { db.prepare(`ALTER TABLE devices ADD COLUMN userId TEXT REFERENCES users(id) ON DELETE SET NULL`).run(); } catch (_) {}
    try { db.prepare(`CREATE INDEX IF NOT EXISTS idx_devices_userId ON devices(userId)`).run(); } catch (_) {}
  }
  if (!devColNames.has('tenantId')) {
    try { db.prepare(`ALTER TABLE devices ADD COLUMN tenantId TEXT DEFAULT 'tenant_default'`).run(); } catch (_) {}
    try { db.prepare(`CREATE INDEX IF NOT EXISTS idx_devices_tenantId ON devices(tenantId)`).run(); } catch (_) {}
  }
  if (!devColNames.has('platform')) {
    try { db.prepare(`ALTER TABLE devices ADD COLUMN platform TEXT DEFAULT 'android'`).run(); } catch (_) {}
  }
  if (!devColNames.has('appVersion')) {
    try { db.prepare(`ALTER TABLE devices ADD COLUMN appVersion TEXT DEFAULT '1.0.0'`).run(); } catch (_) {}
  }
  if (!devColNames.has('deviceUid')) {
    try { db.prepare(`ALTER TABLE devices ADD COLUMN deviceUid TEXT`).run(); } catch (_) {}
    try { db.prepare(`CREATE INDEX IF NOT EXISTS idx_devices_deviceUid ON devices(deviceUid)`).run(); } catch (_) {}
  }
  if (!devColNames.has('isRevoked')) {
    try { db.prepare(`ALTER TABLE devices ADD COLUMN isRevoked INTEGER DEFAULT 0`).run(); } catch (_) {}
  }
  if (!devColNames.has('updatedAt')) {
    try { db.prepare(`ALTER TABLE devices ADD COLUMN updatedAt TEXT`).run(); } catch (_) {}
  }
} catch (e) {
  console.error('[Devices] Migration block error:', e);
}

// ─── Performance Indexes for Auto-Dialer & Multi-Tenant Queries ──────────────
try {
  db.prepare(`CREATE INDEX IF NOT EXISTS idx_leads_tenant_camp_status ON leads(tenantId, campaignId, status)`).run();
  db.prepare(`CREATE INDEX IF NOT EXISTS idx_leads_locked ON leads(tenantId, lockedBy)`).run();
  db.prepare(`CREATE INDEX IF NOT EXISTS idx_call_logs_tenant_ts ON call_logs(tenantId, timestamp)`).run();
  // Enforce database-level uniqueness: same normalized phone cannot exist twice in same campaign/tenant
  db.prepare(`CREATE UNIQUE INDEX IF NOT EXISTS idx_leads_tenant_camp_phone ON leads(tenantId, campaignId, phone)`).run();
} catch (e) {
  console.error('[DB] Performance index creation error:', e);
}

console.log('[SQLite] Database initialised at:', DB_FILE);

// ─── One-time migration from legacy db.json ──────────────────────────────────
function migrateFromJson() {
  if (!fs.existsSync(LEGACY_JSON)) return;

  const alreadyMigrated = db.prepare(`SELECT COUNT(*) as c FROM campaigns`).get() as { c: number };
  if (alreadyMigrated.c > 0) {
    console.log('[SQLite] Migration skipped — data already present in SQLite.');
    return;
  }

  try {
    const raw = fs.readFileSync(LEGACY_JSON, 'utf-8');
    const json = JSON.parse(raw) as {
      campaigns?: LegacyCampaign[];
      leads?: LegacyLead[];
      logs?: LegacyLog[];
    };

    const insertCampaign = db.prepare(`
      INSERT OR IGNORE INTO campaigns (id, name, fileName, leadCount, createdAt)
      VALUES (@id, @name, @fileName, @leadCount, @createdAt)
    `);
    const insertLead = db.prepare(`
      INSERT OR IGNORE INTO leads (id, campaignId, name, phone, status, outcome, duration)
      VALUES (@id, @campaignId, @name, @phone, @status, @outcome, @duration)
    `);
    const insertLog = db.prepare(`
      INSERT OR IGNORE INTO call_logs (id, leadId, leadName, leadPhone, campaignName, outcome, duration, timestamp)
      VALUES (@id, @leadId, @leadName, @leadPhone, @campaignName, @outcome, @duration, @timestamp)
    `);

    const migrate = db.transaction(() => {
      for (const c of json.campaigns || []) {
        insertCampaign.run({
          id: c.id,
          name: c.name,
          fileName: c.fileName || '',
          leadCount: c.leadCount || 0,
          createdAt: c.createdAt || new Date().toISOString()
        });
      }
      for (const l of json.leads || []) {
        insertLead.run({
          id: l.id,
          campaignId: l.campaignId,
          name: l.name || 'Unknown Lead',
          phone: l.phone,
          status: l.status || 'PENDING',
          outcome: l.outcome || null,
          duration: l.duration ?? null
        });
      }
      for (const log of json.logs || []) {
        insertLog.run({
          id: log.id,
          leadId: log.leadId,
          leadName: log.leadName || '',
          leadPhone: log.leadPhone || '',
          campaignName: log.campaignName || '',
          outcome: log.outcome || 'UNKNOWN',
          duration: log.duration ?? 0,
          timestamp: log.timestamp || new Date().toISOString()
        });
      }
    });

    migrate();

    const migrated = {
      campaigns: (json.campaigns || []).length,
      leads: (json.leads || []).length,
      logs: (json.logs || []).length
    };
    console.log(`[SQLite] Migration complete — campaigns: ${migrated.campaigns}, leads: ${migrated.leads}, logs: ${migrated.logs}`);

    // Rename the old file as backup
    fs.renameSync(LEGACY_JSON, LEGACY_JSON + '.migrated_backup');
    console.log('[SQLite] Legacy db.json renamed to db.json.migrated_backup');
  } catch (err) {
    console.error('[SQLite] Migration failed:', err);
  }
}

migrateFromJson();
} else {
  console.log('[PostgreSQL] Database pool initialised and active.');
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

// Legacy types used only during migration
interface LegacyCampaign { id: string; name: string; fileName: string; leadCount: number; createdAt: string; }
interface LegacyLead     { id: string; campaignId: string; name: string; phone: string; status: string; outcome?: string; duration?: number; }
interface LegacyLog      { id: string; leadId: string; leadName: string; leadPhone: string; campaignName: string; outcome: string; duration: number; timestamp: string; }

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

export async function createCampaign(
  name: string,
  fileName: string,
  rawLeads: { name: string; phone: string }[],
  tenantId: string
): Promise<CampaignImportResult> {
  if (!tenantId) {
    throw new Error('Tenant ID is required to create a campaign (fail-closed).');
  }
  const tId = tenantId;
  const campaignId = 'camp_' + Math.random().toString(36).substring(2, 11);
  const now = new Date().toISOString();

  // Get current DNC list numbers for fast lookup within this tenant
  const dncRows = await db.queryAll<{ phone: string }>(`SELECT phone FROM suppression_list WHERE "tenantId" = $1`, [tId]);
  const dncSet = new Set<string>(dncRows.map(r => r.phone));

  // Get existing lead phones across all campaigns in this tenant to avoid cross-campaign duplicates
  const existingRows = await db.queryAll<{ phone: string }>(`SELECT phone FROM leads WHERE "tenantId" = $1`, [tId]);
  const existingSet = new Set<string>(existingRows.map(r => r.phone));

  let dedupedCount = 0;
  let dncSkippedCount = 0;

  const batchSeen = new Set<string>();
  const validLeads: { name: string; phone: string }[] = [];

  for (const lead of rawLeads) {
    const norm = normalizePhone(lead.phone);
    if (!norm) continue;

    // Check if on DNC suppression list
    if (dncSet.has(norm)) {
      dncSkippedCount++;
      continue;
    }

    // Check batch or global duplicate
    if (batchSeen.has(norm) || existingSet.has(norm)) {
      dedupedCount++;
      continue;
    }

    batchSeen.add(norm);
    validLeads.push({ name: lead.name || 'Unknown Lead', phone: norm });
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
        INSERT INTO leads (id, "campaignId", name, phone, status, "tenantId", "createdAt")
        VALUES ($1, $2, $3, $4, $5, $6, $7)
        ON CONFLICT ("id") DO NOTHING
      `, [leadId, campaignId, validLeads[i].name, validLeads[i].phone, 'PENDING', tId, now]);
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
  const lead = (await getLead(leadId, tenantId)) || (await getLeadById(leadId));
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
export interface LegacyDb {
  campaigns: Campaign[];
  leads: Lead[];
  logs: CallLog[];
}

export async function loadDb(tenantId: string): Promise<LegacyDb> {
  if (!tenantId) return { campaigns: [], leads: [], logs: [] };
  const campaigns = await getCampaigns(tenantId);
  const leads = await db.queryAll<Lead>(`SELECT * FROM leads WHERE "tenantId" = $1`, [tenantId]);
  const logs = await getLogs(tenantId);
  return { campaigns, leads, logs };
}

export async function saveDb(data: LegacyDb): Promise<void> {
  await db.withTransaction(async () => {
    for (const lead of data.leads) {
      await db.execute(`
        UPDATE leads SET status = $1, outcome = $2, duration = $3 WHERE id = $4
      `, [lead.status, lead.outcome ?? null, lead.duration ?? null, lead.id]);
    }
    for (const log of data.logs) {
      await db.execute(`
        UPDATE call_logs SET outcome = $1 WHERE "leadId" = $2
      `, [log.outcome, log.leadId]);
    }
  });
}

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

export async function reserveLead(leadId: string, sessionId: string, tenantId?: string, leaseMinutes: number = LEASE_TTL_MINUTES): Promise<boolean> {
  const now = new Date();
  const cutoff = new Date(now.getTime() - leaseMinutes * 60 * 1000).toISOString();
  
  if (tenantId) {
    const res = await db.execute(`
      UPDATE leads 
      SET "lockedBy" = $1, "lockedAt" = $2, status = 'CALLING'
      WHERE id = $3 
        AND "tenantId" = $4
        AND status != 'COMPLETED'
        AND ("lockedBy" IS NULL OR "lockedBy" = $1 OR "lockedAt" < $5)
    `, [sessionId, now.toISOString(), leadId, tenantId, cutoff]);
    return res.rowCount > 0;
  }

  const result = await db.execute(`
    UPDATE leads 
    SET "lockedBy" = $1, "lockedAt" = $2, status = 'CALLING'
    WHERE id = $3 
      AND status != 'COMPLETED'
      AND ("lockedBy" IS NULL OR "lockedBy" = $1 OR "lockedAt" < $4)
  `, [sessionId, now.toISOString(), leadId, cutoff]);

  return result.rowCount > 0;
}

export async function releaseLeadLock(leadId: string, sessionId?: string): Promise<void> {
  if (sessionId) {
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

export async function releaseExpiredLeases(leaseMinutes: number = LEASE_TTL_MINUTES): Promise<number> {
  const now = new Date();
  const cutoff = new Date(now.getTime() - leaseMinutes * 60 * 1000).toISOString();
  const result = await db.execute(`
    UPDATE leads
    SET "lockedBy" = NULL, "lockedAt" = NULL, status = CASE WHEN status = 'CALLING' THEN 'PENDING' ELSE status END
    WHERE "lockedAt" < $1 AND status != 'COMPLETED' AND "lockedBy" IS NOT NULL
  `, [cutoff]);
  if (result.rowCount > 0) {
    console.log(`[LeadLock] Released ${result.rowCount} expired lead lease(s) (older than ${leaseMinutes} mins)`);
  }
  return result.rowCount;
}

export async function getLockedLeads(): Promise<Lead[]> {
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
  let query = `UPDATE crm_follow_ups SET status = $1, "updatedAt" = now()`;
  const params: any[] = [status];
  if (notes !== undefined) {
    query += `, notes = $2`;
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
}): Promise<boolean> {
  const { leadId, outcome, notes, tenantId, userId, username } = data;
  if (!leadId || !tenantId) return false;

  const lead = await getLead(leadId, tenantId);
  if (!lead) return false;

  const now = new Date().toISOString();
  await db.withTransaction(async () => {
    // 1. Update Lead status and outcome
    await updateLeadStatus(leadId, 'COMPLETED', outcome, lead.duration || 0, tenantId);

    // 2. Update existing call log or create disposition log
    const existingLog = await getLogByLeadId(leadId, tenantId);
    if (existingLog) {
      await db.execute(`UPDATE call_logs SET outcome = $1 WHERE "leadId" = $2 AND "tenantId" = $3`, [outcome, leadId, tenantId]);
    } else {
      await createLog(leadId, outcome, lead.duration || 0, tenantId);
    }

    // 3. Record in dispositions table
    const dispId = 'disp_' + Math.random().toString(36).substring(2, 11);
    await db.execute(`
      INSERT INTO dispositions (id, "leadId", outcome, notes, "loggedAt")
      VALUES ($1, $2, $3, $4, $5)
    `, [dispId, leadId, outcome, notes || '', now]);

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
  let query = `UPDATE devices SET "isRevoked" = 1, status = 'OFFLINE', "updatedAt" = now() WHERE id = $1 AND "tenantId" = $2`;
  const params: any[] = [id, tenantId];
  if (!isAdmin) {
    query += ` AND "userId" = $3`;
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

// ─── Expose the raw db instance for future steps ─────────────────────────────
export function getDatabase(): DbAdapter {
  return db;
}
export { db };


