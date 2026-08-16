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

import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';
import { checkLimit, initializeCatalogPlans } from './entitlementManager';

// ─── DB file location ────────────────────────────────────────────────────────
const DATA_DIR = path.join(__dirname, '../data');
const DB_FILE  = path.join(DATA_DIR, 'octal_dialer.db');
const LEGACY_JSON = path.join(DATA_DIR, 'db.json');

if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

// ─── Open (or create) the database ───────────────────────────────────────────
const db = new Database(DB_FILE);

// WAL mode: safer for concurrent reads/writes; easier to enable now than later
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// ─── Schema creation ─────────────────────────────────────────────────────────
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

// Safe column migrations for email_templates, custom_roles, and users
try {
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

// ─── Prepared statements ──────────────────────────────────────────────────────
const stmts = {
  getCampaigns:    db.prepare(`SELECT * FROM campaigns WHERE tenantId = @tenantId ORDER BY createdAt DESC`),
  getCampaignById: db.prepare(`SELECT * FROM campaigns WHERE id = @id AND tenantId = @tenantId`),
  insertCampaign:  db.prepare(`INSERT INTO campaigns (id, name, fileName, leadCount, tenantId, createdAt) VALUES (@id, @name, @fileName, @leadCount, @tenantId, @createdAt)`),
  getLeadsByCamp:  db.prepare(`SELECT * FROM leads WHERE campaignId = @campaignId AND tenantId = @tenantId AND status != 'ARCHIVED'`),
  insertLead:      db.prepare(`INSERT INTO leads (id, campaignId, name, phone, status, tenantId, createdAt) VALUES (@id, @campaignId, @name, @phone, @status, @tenantId, @createdAt)`),
  getLead:         db.prepare(`SELECT * FROM leads WHERE id = @id AND tenantId = @tenantId`),
  getLeadByIdOnly: db.prepare(`SELECT * FROM leads WHERE id = @id`),
  updateLeadStatus:db.prepare(`UPDATE leads SET status = @status, outcome = COALESCE(@outcome, outcome), duration = COALESCE(@duration, duration) WHERE id = @id AND tenantId = @tenantId`),
  getLogs:         db.prepare(`SELECT * FROM call_logs WHERE tenantId = @tenantId ORDER BY timestamp DESC`),
  getLogByLeadId:  db.prepare(`SELECT * FROM call_logs WHERE leadId = @leadId AND tenantId = @tenantId LIMIT 1`),
  insertLog:       db.prepare(`INSERT INTO call_logs (id, leadId, leadName, leadPhone, campaignName, outcome, duration, tenantId, timestamp) VALUES (@id, @leadId, @leadName, @leadPhone, @campaignName, @outcome, @duration, @tenantId, @timestamp)`),
  updateLogOutcome:db.prepare(`UPDATE call_logs SET outcome = @outcome WHERE leadId = @leadId AND tenantId = @tenantId`),
};

// ─── Exported API (explicit tenantId required - fail closed) ─────────────

export function getCampaigns(tenantId: string = 'tenant_default'): Campaign[] {
  const tId = tenantId || 'tenant_default';
  return stmts.getCampaigns.all({ tenantId: tId }) as Campaign[];
}

export interface CampaignImportResult {
  campaign: Campaign;
  totalRaw: number;
  dedupedCount: number;
  dncSkippedCount: number;
  finalCount: number;
}

export function createCampaign(
  name: string,
  fileName: string,
  rawLeads: { name: string; phone: string }[],
  tenantId: string = 'tenant_default'
): CampaignImportResult {
  const tId = tenantId || 'tenant_default';
  const campaignId = 'camp_' + Math.random().toString(36).substring(2, 11);
  const now = new Date().toISOString();

  // Get current DNC list numbers for fast lookup within this tenant
  const dncRows = db.prepare(`SELECT phone FROM suppression_list WHERE tenantId = ?`).all(tId) as { phone: string }[];
  const dncSet = new Set<string>(dncRows.map(r => r.phone));

  // Get existing lead phones across all campaigns in this tenant to avoid cross-campaign duplicates
  const existingRows = db.prepare(`SELECT phone FROM leads WHERE tenantId = ?`).all(tId) as { phone: string }[];
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

  const insertLeads = db.transaction(() => {
    // Phase 7 Invariant: Atomic check for campaign and lead limits inside serialized transaction
    const campaignLimitCheck = checkLimit(tId, 'maxCampaigns', 1);
    if (!campaignLimitCheck.allowed) {
      throw new Error(campaignLimitCheck.error || `Campaign limit reached for your plan (${campaignLimitCheck.current}/${campaignLimitCheck.limit}).`);
    }

    if (validLeads.length > 0) {
      const leadLimitCheck = checkLimit(tId, 'maxLeads', validLeads.length);
      if (!leadLimitCheck.allowed) {
        throw new Error(leadLimitCheck.error || `Lead quota exceeded (${leadLimitCheck.current + validLeads.length}/${leadLimitCheck.limit}).`);
      }
    }

    stmts.insertCampaign.run(newCampaign);

    for (let i = 0; i < validLeads.length; i++) {
      stmts.insertLead.run({
        id: `lead_${campaignId}_${i}_${Math.random().toString(36).substring(2, 6)}`,
        campaignId,
        name: validLeads[i].name,
        phone: validLeads[i].phone,
        status: 'PENDING',
        tenantId: tId,
        createdAt: now
      });
    }

    db.prepare(`UPDATE campaigns SET leadCount = @count WHERE id = @id AND tenantId = @tenantId`)
      .run({ count: validLeads.length, id: campaignId, tenantId: tId });
  });

  insertLeads();

  return {
    campaign: newCampaign,
    totalRaw: rawLeads.length,
    dedupedCount,
    dncSkippedCount,
    finalCount: validLeads.length
  };
}

export function getLeads(campaignId: string, tenantId: string = 'tenant_default'): Lead[] {
  const tId = tenantId || 'tenant_default';
  return stmts.getLeadsByCamp.all({ campaignId, tenantId: tId }) as Lead[];
}

export function deleteLead(id: string, tenantId: string = 'tenant_default'): boolean {
  const tId = tenantId || 'tenant_default';
  const lead = stmts.getLead.get({ id, tenantId: tId }) as Lead | undefined;
  if (!lead) return false;
  const campaignId = lead.campaignId;
  const info = db.prepare(`UPDATE leads SET status = 'ARCHIVED' WHERE id = ? AND tenantId = ?`).run(id, tId);
  if (campaignId) {
    db.prepare(`UPDATE campaigns SET leadCount = (SELECT COUNT(*) FROM leads WHERE campaignId = ? AND tenantId = ? AND status != 'ARCHIVED') WHERE id = ? AND tenantId = ?`).run(campaignId, tId, campaignId, tId);
  }
  return info.changes > 0;
}

export function clearAllLeadsInCampaign(campaignId: string, tenantId: string = 'tenant_default'): number {
  const tId = tenantId || 'tenant_default';
  const info = db.prepare(`UPDATE leads SET status = 'ARCHIVED' WHERE campaignId = ? AND tenantId = ? AND status != 'ARCHIVED'`).run(campaignId, tId);
  db.prepare(`UPDATE campaigns SET leadCount = 0 WHERE id = ? AND tenantId = ?`).run(campaignId, tId);
  return info.changes;
}

export function clearFakeQueueLeads(tenantId: string = 'tenant_default'): number {
  const tId = tenantId || 'tenant_default';
  const info = db.prepare(`
    UPDATE leads SET status = 'ARCHIVED' 
    WHERE (name LIKE '%Sample%' OR name LIKE '%Dummy%' OR name LIKE '%Fake%' OR phone LIKE '%0000000%' OR campaignId LIKE '%sample%') AND status != 'ARCHIVED' AND tenantId = ?
  `).run(tId);
  db.prepare(`
    UPDATE campaigns 
    SET leadCount = (SELECT COUNT(*) FROM leads WHERE campaignId = campaigns.id AND tenantId = ? AND status != 'ARCHIVED')
    WHERE tenantId = ?
  `).run(tId, tId);
  return info.changes;
}

export function updateLeadStatus(
  id: string,
  status: 'PENDING' | 'CALLING' | 'COMPLETED',
  outcome?: string,
  duration?: number,
  tenantId: string = 'tenant_default'
) {
  const tId = tenantId || 'tenant_default';
  stmts.updateLeadStatus.run({
    id: id,
    status,
    outcome: outcome ?? null,
    duration: duration ?? null,
    tenantId: tId
  });
}

export function getLogs(tenantId: string = 'tenant_default'): CallLog[] {
  const tId = tenantId || 'tenant_default';
  return stmts.getLogs.all({ tenantId: tId }) as CallLog[];
}

export function createLog(leadId: string, outcome: string, duration: number, tenantId: string = 'tenant_default'): CallLog | null {
  const tId = tenantId || 'tenant_default';
  const lead = (stmts.getLead.get({ id: leadId, tenantId: tId }) || stmts.getLeadByIdOnly.get({ id: leadId })) as Lead | undefined;
  if (!lead) return null;

  const resolvedTenantId = (lead as any).tenantId || tId;
  const campaign = db.prepare(`SELECT * FROM campaigns WHERE id = @campaignId AND tenantId = @tenantId`)
    .get({ campaignId: lead.campaignId, tenantId: resolvedTenantId }) as Campaign | undefined;

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

  const insertAndUpdate = db.transaction(() => {
    stmts.insertLog.run(log);
    stmts.updateLeadStatus.run({
      id: leadId,
      status: 'COMPLETED',
      outcome,
      duration,
      tenantId: resolvedTenantId
    });
  });

  insertAndUpdate();
  return log;
}

export function createManualLog(phone: string, name: string, outcome: string, duration: number, tenantId: string = 'tenant_default'): CallLog {
  const tId = tenantId || 'tenant_default';
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
  stmts.insertLog.run(log);
  return log;
}

// ─── Legacy shim: loadDb / saveDb ─────────────────────────────────────────────
export interface LegacyDb {
  campaigns: Campaign[];
  leads: Lead[];
  logs: CallLog[];
}

export function loadDb(tenantId: string = 'tenant_default'): LegacyDb {
  const tId = tenantId || 'tenant_default';
  return {
    campaigns: getCampaigns(tId),
    leads: db.prepare(`SELECT * FROM leads WHERE tenantId = ?`).all(tId) as Lead[],
    logs: getLogs(tId)
  };
}

export function saveDb(data: LegacyDb) {
  // Only the lead update and log outcome update paths call saveDb.
  // Flush any mutation back to SQLite individually.
  const updateLead = db.prepare(`
    UPDATE leads SET status = @status, outcome = @outcome, duration = @duration WHERE id = @id
  `);
  const updateLogOutcome = db.prepare(`
    UPDATE call_logs SET outcome = @outcome WHERE leadId = @leadId
  `);

  const flush = db.transaction(() => {
    for (const lead of data.leads) {
      updateLead.run({
        id: lead.id,
        status: lead.status,
        outcome: lead.outcome ?? null,
        duration: lead.duration ?? null
      });
    }
    for (const log of data.logs) {
      updateLogOutcome.run({ leadId: log.leadId, outcome: log.outcome });
    }
  });
  flush();
}

// ─── Phone-number normalisation helper ───────────────────────────────────────
// Strips spaces, dashes, dots, parentheses; formats local 03xx numbers to +923xx
export function normalizePhone(raw: string): string {
  if (!raw) return '';
  let stripped = raw.replace(/[\s\-().]/g, '');
  if (!stripped) return '';

  // Handle local Pakistani 03xx format: 03001234567 -> +923001234567
  if (/^03\d{9}$/.test(stripped)) {
    return '+92' + stripped.substring(1);
  }
  // Handle 923xx without +: 923001234567 -> +923001234567
  if (/^92\d{10}$/.test(stripped)) {
    return '+' + stripped;
  }
  // If numeric without leading +, add + if >= 10 digits
  if (/^\d{10,15}$/.test(stripped)) {
    return '+' + stripped;
  }

  return stripped;
}

// ─── Lead Reservation & Locking API ──────────────────────────────────────────
export const LEASE_TTL_MINUTES = 2;

const lockStmts = {
  reserveLead: db.prepare(`
    UPDATE leads 
    SET lockedBy = @sessionId, lockedAt = @now, status = 'CALLING'
    WHERE id = @leadId 
      AND status != 'COMPLETED'
      AND (lockedBy IS NULL OR lockedBy = @sessionId OR lockedAt < @cutoff)
  `),
  releaseLeadLock: db.prepare(`
    UPDATE leads 
    SET lockedBy = NULL, lockedAt = NULL, status = CASE WHEN status = 'CALLING' THEN 'PENDING' ELSE status END 
    WHERE id = @leadId
  `),
  releaseLeadLockOwned: db.prepare(`
    UPDATE leads 
    SET lockedBy = NULL, lockedAt = NULL, status = CASE WHEN status = 'CALLING' THEN 'PENDING' ELSE status END 
    WHERE id = @leadId AND lockedBy = @sessionId
  `),
  unlockSessionLeads: db.prepare(`
    UPDATE leads 
    SET lockedBy = NULL, lockedAt = NULL, status = CASE WHEN status = 'CALLING' THEN 'PENDING' ELSE status END 
    WHERE lockedBy = @sessionId AND status != 'COMPLETED'
  `),
  clearExpiredLeases: db.prepare(`
    UPDATE leads 
    SET lockedBy = NULL, lockedAt = NULL, status = CASE WHEN status = 'CALLING' THEN 'PENDING' ELSE status END 
    WHERE lockedAt < @cutoff AND status != 'COMPLETED' AND lockedBy IS NOT NULL
  `),
  getLockedLeads: db.prepare(`
    SELECT * FROM leads WHERE lockedBy IS NOT NULL AND status != 'COMPLETED'
  `)
};

export function reserveLead(leadId: string, sessionId: string, leaseMinutes: number = LEASE_TTL_MINUTES): boolean {
  const now = new Date();
  const cutoff = new Date(now.getTime() - leaseMinutes * 60 * 1000).toISOString();
  
  const result = lockStmts.reserveLead.run({
    leadId,
    sessionId,
    now: now.toISOString(),
    cutoff
  });

  return result.changes > 0;
}

export function releaseLeadLock(leadId: string, sessionId?: string): void {
  if (sessionId) {
    // Ownership-verified release: only release if this session holds the lock
    const result = lockStmts.releaseLeadLockOwned.run({ leadId, sessionId });
    if (result.changes === 0) {
      console.warn(`[LeadLock] Rejected lock release for lead ${leadId} — not owned by session ${sessionId}`);
    }
  } else {
    // Unverified release (admin/cleanup path)
    lockStmts.releaseLeadLock.run({ leadId });
  }
}

export function unlockLeadsForSession(sessionId: string): void {
  const result = lockStmts.unlockSessionLeads.run({ sessionId });
  if (result.changes > 0) {
    console.log(`[LeadLock] Released ${result.changes} locked lead(s) for disconnected session ${sessionId}`);
  }
}

export function releaseExpiredLeases(leaseMinutes: number = LEASE_TTL_MINUTES): number {
  const now = new Date();
  const cutoff = new Date(now.getTime() - leaseMinutes * 60 * 1000).toISOString();
  const result = lockStmts.clearExpiredLeases.run({ cutoff });
  if (result.changes > 0) {
    console.log(`[LeadLock] Released ${result.changes} expired lead lease(s) (older than ${leaseMinutes} mins)`);
  }
  return result.changes;
}

export function getLockedLeads(): Lead[] {
  return lockStmts.getLockedLeads.all() as Lead[];
}

// Periodically release expired leases every minute
setInterval(() => releaseExpiredLeases(LEASE_TTL_MINUTES), 60 * 1000);

// ─── Online Database Backup & Disaster Recovery (Phase 11) ───────────────────
export async function backupDatabase(targetFileName?: string): Promise<{ success: boolean; backupPath: string; sizeBytes: number; timestamp: string }> {
  const backupsDir = path.join(__dirname, '../data/backups');
  if (!fs.existsSync(backupsDir)) {
    fs.mkdirSync(backupsDir, { recursive: true });
  }

  // Sanitize target filename to prevent directory traversal
  let safeFileName = targetFileName ? path.basename(targetFileName) : `backup_${new Date().toISOString().replace(/[:.]/g, '-')}.db`;
  if (!safeFileName.endsWith('.db')) {
    safeFileName += '.db';
  }

  const backupPath = path.join(backupsDir, safeFileName);

  // SQLite online backup API ensures safe, non-blocking, transactionally consistent snapshot
  await db.backup(backupPath);

  // Validate backup file integrity
  const backupDb = new Database(backupPath);
  const integrity = backupDb.prepare('PRAGMA integrity_check').get() as { integrity_check: string };
  const fkCheck = backupDb.prepare('PRAGMA foreign_key_check').all();
  backupDb.close();

  if (integrity.integrity_check !== 'ok' || fkCheck.length > 0) {
    if (fs.existsSync(backupPath)) fs.unlinkSync(backupPath);
    throw new Error('Backup validation failed: database integrity check or foreign key check failed.');
  }

  const stat = fs.statSync(backupPath);
  return {
    success: true,
    backupPath,
    sizeBytes: stat.size,
    timestamp: new Date().toISOString()
  };
}

// ─── CRM Workspace & Lead Intelligence Helper Functions (Phase E) ─────────────
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

export function createFollowUp(data: {
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
}): FollowUpItem {
  const id = `fu_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
  const now = new Date().toISOString();
  db.prepare(`
    INSERT INTO crm_follow_ups (id, leadId, leadName, leadPhone, campaignId, campaignName, tenantId, userId, assignedAgent, scheduledAt, status, notes, createdAt, updatedAt)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?, ?)
  `).run(
    id, data.leadId, data.leadName || '', data.leadPhone || '', data.campaignId || null,
    data.campaignName || '', data.tenantId, data.userId || null, data.assignedAgent || null,
    data.scheduledAt, data.notes || '', now, now
  );

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

export function getFollowUps(tenantId: string, filter?: { status?: string }): FollowUpItem[] {
  let query = `SELECT * FROM crm_follow_ups WHERE tenantId = ?`;
  const params: any[] = [tenantId];

  if (filter?.status) {
    query += ` AND status = ?`;
    params.push(filter.status);
  }

  query += ` ORDER BY scheduledAt ASC`;
  return db.prepare(query).all(...params) as FollowUpItem[];
}

export function updateFollowUpStatus(id: string, tenantId: string, status: string, notes?: string): boolean {
  let query = `UPDATE crm_follow_ups SET status = ?, updatedAt = datetime('now')`;
  const params: any[] = [status];
  if (notes !== undefined) {
    query += `, notes = ?`;
    params.push(notes);
  }
  query += ` WHERE id = ? AND tenantId = ?`;
  params.push(id, tenantId);

  const res = db.prepare(query).run(...params);
  return res.changes > 0;
}

export function recordLeadActivity(data: {
  leadId: string;
  tenantId: string;
  userId?: string;
  username?: string;
  eventType: string;
  description: string;
  metadata?: any;
}): void {
  const id = `act_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
  const metaStr = data.metadata ? (typeof data.metadata === 'string' ? data.metadata : JSON.stringify(data.metadata)) : null;
  const now = new Date().toISOString();
  db.prepare(`
    INSERT INTO lead_activities (id, leadId, tenantId, userId, username, eventType, description, metadata, createdAt)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(id, data.leadId, data.tenantId, data.userId || null, data.username || null, data.eventType, data.description, metaStr, now);
}

export function getLeadActivities(leadId: string, tenantId: string): LeadActivity[] {
  return db.prepare(`
    SELECT * FROM lead_activities WHERE leadId = ? AND tenantId = ? ORDER BY createdAt DESC, id DESC LIMIT 100
  `).all(leadId, tenantId) as LeadActivity[];
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

export function hasUserModulePermission(userId: string, tenantId: string, moduleId: string): boolean {
  const perm = db.prepare(`SELECT enabled FROM user_permissions WHERE userId = ? AND tenantId = ? AND moduleId = ?`).get(userId, tenantId, moduleId) as { enabled: number } | undefined;
  return perm ? perm.enabled === 1 : false;
}

// ─── Expose the raw db instance for future steps ─────────────────────────────
export function getDatabase(): Database.Database {
  return db;
}
export { db };


