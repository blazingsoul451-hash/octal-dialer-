/**
 * authManager.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Step 2 of 13 — Authentication layer
 * - Uses Node.js built-in `crypto.scryptSync` — zero new dependencies
 * - Stores users + sessions in SQLite (tables created in Step 1)
 * - Creates a default admin account on first boot and prints credentials
 * - Session tokens are random 32-byte hex strings stored in sessions_store
 * - Token TTL: 24 hours (configurable via SESSION_TTL_HOURS env var)
 *
 * PHASE 1 — JWT BRIDGE:
 * - New logins issue JWT tokens (signed, self-contained)
 * - Legacy session tokens (64-char hex) continue working via sessions_store
 * - validateToken() accepts BOTH JWT and legacy tokens
 * - No breaking changes to existing sessions
 * ─────────────────────────────────────────────────────────────────────────────
 */

import crypto from 'crypto';
import express from 'express';
import * as jwt from 'jsonwebtoken';
import { db } from './databaseManager';

const SESSION_TTL_HOURS = parseInt(process.env.SESSION_TTL_HOURS || '24', 10);

// JWT configuration (validated on first use)
function getJWTSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    console.error('ERROR: JWT_SECRET is not configured in .env file');
    throw new Error('JWT_SECRET is required');
  }
  return secret;
}

// JWT expires in 24 hours (86400 seconds)
const JWT_EXPIRES_IN = 86400;

// ─── Interfaces ───────────────────────────────────────────────────────────────
export interface AuthUser {
  id: string;
  username: string;
  role: string;
  tenantId: string;
}

export interface AuthSession {
  id: string;
  userId: string;
  token: string;
  expiresAt: string;
}

// ─── Password helpers ─────────────────────────────────────────────────────────
export function hashPassword(password: string, salt?: string): { hash: string; salt: string } {
  const s = salt || crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, s, 64).toString('hex');
  return { hash: `${s}:${hash}`, salt: s };
}

function verifyPassword(password: string, stored: string): boolean {
  try {
    const [salt, hash] = stored.split(':');
    const { hash: candidate } = hashPassword(password, salt);
    const candidateHash = candidate.split(':')[1];
    return crypto.timingSafeEqual(
      Buffer.from(hash, 'hex'),
      Buffer.from(candidateHash, 'hex')
    );
  } catch {
    return false;
  }
}

// ─── Prepared statements ──────────────────────────────────────────────────────
const stmts = {
  findUserByUsername: db.prepare(`SELECT * FROM users WHERE username = @username`),
  findUserById:       db.prepare(`SELECT * FROM users WHERE id = @id`),
  insertUser:         db.prepare(`INSERT INTO users (id, username, passwordHash, role, tenantId, createdAt) VALUES (@id, @username, @passwordHash, @role, @tenantId, @createdAt)`),
  countUsers:         db.prepare(`SELECT COUNT(*) as c FROM users`),
  insertSession:      db.prepare(`INSERT INTO sessions_store (id, userId, token, expiresAt, createdAt) VALUES (@id, @userId, @token, @expiresAt, @createdAt)`),
  findSession:        db.prepare(`SELECT * FROM sessions_store WHERE token = @token`),
  deleteSession:      db.prepare(`DELETE FROM sessions_store WHERE token = @token`),
  deleteExpired:      db.prepare(`DELETE FROM sessions_store WHERE expiresAt < @now`),
  updatePassword:     db.prepare(`UPDATE users SET passwordHash = @passwordHash WHERE id = @id`),
};

// ─── Default admin bootstrap ──────────────────────────────────────────────────
export function ensureDefaultAdmin(): void {
  const count = (stmts.countUsers.get() as { c: number }).c;
  if (count > 0) {
    // If the default admin in tenant_default exists with role 'admin', upgrade to 'platform_admin'
    const defaultAdmin = db.prepare(`SELECT * FROM users WHERE username = 'admin' AND tenantId = 'tenant_default'`).get() as any;
    if (defaultAdmin && defaultAdmin.role === 'admin') {
      db.prepare(`UPDATE users SET role = 'platform_admin' WHERE id = ?`).run(defaultAdmin.id);
      console.log('[Auth] Root default admin promoted to platform_admin');
    }
    return;
  }

  const defaultPassword = 'octal' + Math.random().toString(36).substring(2, 8).toUpperCase();
  const { hash } = hashPassword(defaultPassword);

  stmts.insertUser.run({
    id: 'user_admin_' + crypto.randomBytes(4).toString('hex'),
    username: 'admin',
    passwordHash: hash,
    role: 'platform_admin',
    tenantId: 'tenant_default',
    createdAt: new Date().toISOString()
  });

  console.log('');
  console.log('╔══════════════════════════════════════════════╗');
  console.log('║       OCTAL DIALER — FIRST BOOT AUTH         ║');
  console.log('╠══════════════════════════════════════════════╣');
  console.log(`║  Username : admin                            ║`);
  console.log(`║  Role     : platform_admin                   ║`);
  console.log(`║  Password : ${defaultPassword.padEnd(32)} ║`);
  console.log('║  Change this after first login!              ║');
  console.log('╚══════════════════════════════════════════════╝');
  console.log('');
}

// ─── Auth operations ──────────────────────────────────────────────────────────

/** Validate credentials → return JWT token (Phase 4: with strict tenantId) or null */
export function login(username: string, password: string): string | null {
  const user = stmts.findUserByUsername.get({ username }) as any;
  if (!user) return null;
  if (!verifyPassword(password, user.passwordHash)) return null;

  // Strict check: User must belong to a valid tenant (fail-closed)
  if (!user.tenantId) {
    console.error(`[Auth] User ${username} has no associated tenantId. Login rejected.`);
    return null;
  }

  // Clean up expired legacy sessions (maintenance)
  stmts.deleteExpired.run({ now: new Date().toISOString() });

  // PHASE 4: Include trusted tenant context in JWT token
  const payload = {
    sub: user.id,
    username: user.username,
    role: user.role,
    tenantId: user.tenantId
  };

  const token = jwt.sign(payload, getJWTSecret(), { expiresIn: JWT_EXPIRES_IN });

  return token;
}

/** Validate a token → return user or null (Strict Fail-Closed: requires valid tenantId) */
export function validateToken(token: string): AuthUser | null {
  if (!token) return null;

  // ─── PHASE 4 & 6: JWT verification with DB tenant & role consistency check ───
  try {
    const decoded = jwt.verify(token, getJWTSecret()) as any;

    if (decoded.sub && decoded.username && decoded.role && decoded.tenantId) {
      // Re-verify against database to prevent stale token usage upon tenant move, role change, or user deletion
      const dbUser = stmts.findUserById.get({ id: decoded.sub }) as any;
      if (!dbUser || !dbUser.tenantId || dbUser.tenantId !== decoded.tenantId) {
        // User no longer exists, tenant membership changed, or user disabled -> Fail closed!
        return null;
      }

      return {
        id: dbUser.id,
        username: dbUser.username,
        role: dbUser.role, // Use authoritative current database role
        tenantId: dbUser.tenantId // Use authoritative current database tenant
      };
    }
    // If tenantId is missing from JWT payload, fail closed
    if (decoded.sub && !decoded.tenantId) {
      console.warn('[Auth] Rejected JWT token missing tenantId claim.');
      return null;
    }
  } catch (err) {
    // Not a valid JWT or expired — fall through to legacy validation
  }

  // ─── LEGACY: sessions_store lookup for 64-char hex tokens ───
  const session = stmts.findSession.get({ token }) as any;
  if (!session) return null;

  // Check expiry
  if (new Date(session.expiresAt) < new Date()) {
    stmts.deleteSession.run({ token });
    return null;
  }

  const user = stmts.findUserById.get({ id: session.userId }) as any;
  if (!user || !user.tenantId) {
    // Missing user or unassigned tenant -> fail closed
    return null;
  }

  return {
    id: user.id,
    username: user.username,
    role: user.role,
    tenantId: user.tenantId
  };
}

/** Destroy a session (logout)
 * NOTE: JWT tokens cannot be server-side invalidated without a blacklist.
 * Client must discard the token. This only affects legacy sessions_store tokens.
 */
export function logout(token: string): void {
  // Try to delete from sessions_store (legacy tokens)
  // Will silently do nothing if token is JWT
  stmts.deleteSession.run({ token });
}

/** Change password for a user */
export function changePassword(userId: string, newPassword: string): void {
  const { hash } = hashPassword(newPassword);
  stmts.updatePassword.run({ id: userId, passwordHash: hash });
}

/** Middleware: require platform admin role (Super Admin) */
export function requirePlatformAdmin(req: express.Request, res: express.Response, next: express.NextFunction): void {
  const authHeader = req.headers['authorization'] || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
  const user = validateToken(token);

  if (!user) {
    res.status(401).json({ error: 'Unauthorized. Please log in.' });
    return;
  }

  if (user.role !== 'platform_admin') {
    res.status(403).json({ error: 'Forbidden. Platform Admin access required.' });
    return;
  }

  (req as any).user = user;
  next();
}

/** Middleware: require tenant admin role (Tenant Admin or Platform Admin) */
export function requireTenantAdmin(req: express.Request, res: express.Response, next: express.NextFunction): void {
  const authHeader = req.headers['authorization'] || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
  const user = validateToken(token);

  if (!user) {
    res.status(401).json({ error: 'Unauthorized. Please log in.' });
    return;
  }

  if (user.role !== 'admin' && user.role !== 'platform_admin') {
    res.status(403).json({ error: 'Forbidden. Tenant Admin access required.' });
    return;
  }

  (req as any).user = user;
  next();
}

/** Backward compatibility alias for tenant admin routes */
export const requireAdmin = requireTenantAdmin;

// ─── PHASE 5: SaaS Signup & Tenant Onboarding ────────────────────────────────

export interface SignupInput {
  companyName: string;
  username: string;
  password: string;
  email?: string;
}

export interface SignupResult {
  token: string;
  user: {
    id: string;
    username: string;
    role: string;
    tenantId: string;
  };
  tenant: {
    id: string;
    name: string;
    slug: string;
  };
}

/** Helper to generate a collision-safe URL slug */
function generateTenantSlug(companyName: string): string {
  let baseSlug = companyName
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

  if (!baseSlug || baseSlug.length < 2) {
    baseSlug = 'company';
  }

  // Check if slug already exists in tenants table
  const checkSlug = db.prepare(`SELECT id FROM tenants WHERE slug = ?`);
  const existing = checkSlug.get(baseSlug);

  if (!existing) {
    return baseSlug;
  }

  // Collision resolution: append a unique hex suffix
  let candidateSlug = `${baseSlug}-${crypto.randomBytes(2).toString('hex')}`;
  let attempts = 0;
  while (checkSlug.get(candidateSlug) && attempts < 10) {
    candidateSlug = `${baseSlug}-${crypto.randomBytes(3).toString('hex')}`;
    attempts++;
  }
  return candidateSlug;
}

/**
 * signupTenant
 * ─────────────────────────────────────────────────────────────────────────────
 * Atomic Signup & Onboarding:
 * 1. Validates input fields
 * 2. Generates unique tenant and collision-safe slug
 * 3. Creates tenant record
 * 4. Creates first admin user with secure scrypt password hash
 * 5. Provisions default module permissions (all 5 core modules enabled)
 * 6. Assigns active starter subscription linking to catalog plan
 * 7. Issues signed JWT with trusted tenantId
 * 8. Rolls back entire transaction if any step fails
 * ─────────────────────────────────────────────────────────────────────────────
 */
export function signupTenant(input: SignupInput): SignupResult {
  const companyName = (input.companyName || '').trim();
  const username = (input.username || '').trim().toLowerCase();
  const password = input.password || '';

  // 1. Validation
  if (!companyName || companyName.length < 2) {
    throw new Error('Company name must be at least 2 characters long.');
  }
  if (companyName.length > 100) {
    throw new Error('Company name cannot exceed 100 characters.');
  }
  if (!username || username.length < 3) {
    throw new Error('Username must be at least 3 characters long.');
  }
  if (!/^[a-z0-9_.\-]+$/.test(username)) {
    throw new Error('Username may only contain lowercase letters, numbers, underscores, dashes, and dots.');
  }
  if (!password || password.length < 6) {
    throw new Error('Password must be at least 6 characters long.');
  }

  // 2. Pre-check: Username uniqueness (fail fast)
  const existingUser = stmts.findUserByUsername.get({ username });
  if (existingUser) {
    throw new Error(`Username "${username}" is already taken.`);
  }

  const now = new Date().toISOString();
  const tenantId = 'tenant_' + crypto.randomBytes(8).toString('hex');
  const slug = generateTenantSlug(companyName);
  const userId = 'user_admin_' + crypto.randomBytes(6).toString('hex');
  const { hash } = hashPassword(password);

  // 3. Execute atomic onboarding transaction
  const executeSignupTransaction = db.transaction(() => {
    // 3a. Insert Tenant
    db.prepare(`
      INSERT INTO tenants (id, name, slug, status, createdAt, updatedAt)
      VALUES (@id, @name, @slug, 'active', @createdAt, @updatedAt)
    `).run({
      id: tenantId,
      name: companyName,
      slug: slug,
      createdAt: now,
      updatedAt: now
    });

    // 3b. Insert First Admin User
    stmts.insertUser.run({
      id: userId,
      username: username,
      passwordHash: hash,
      role: 'admin',
      tenantId: tenantId,
      createdAt: now
    });

    // 3c. Provision Default User Module Permissions (all 5 core modules enabled for admin)
    const modules = ['octalDialer', 'googleScraper', 'autoEmailer', 'facebookScraper', 'facebookPoster'];
    const insertPerm = db.prepare(`
      INSERT INTO user_permissions (id, userId, moduleId, enabled, grantedBy, tenantId, grantedAt)
      VALUES (?, ?, ?, 1, ?, ?, ?)
    `);

    for (const moduleId of modules) {
      insertPerm.run(
        `perm_${userId}_${moduleId}`,
        userId,
        moduleId,
        'SYSTEM_ONBOARDING',
        tenantId,
        now
      );
    }

    // 3d. Find or ensure the default Public Starter Plan (Never plan_legacy)
    let plan = db.prepare(`SELECT id FROM plans WHERE id = 'plan_starter' AND status = 'active'`).get() as { id: string } | undefined;
    if (!plan) {
      plan = db.prepare(`SELECT id FROM plans WHERE id != 'plan_legacy' AND status = 'active' ORDER BY priceMonthly ASC LIMIT 1`).get() as { id: string } | undefined;
    }
    if (!plan) {
      const defaultPlanId = 'plan_starter';
      db.prepare(`
        INSERT INTO plans (id, name, priceMonthly, priceYearly, status, createdAt, updatedAt)
        VALUES (?, 'Starter Plan', 29, 290, 'active', ?, ?)
      `).run(defaultPlanId, now, now);
      plan = { id: defaultPlanId };
    }

    // 3e. Assign Subscription (Active for 1 year)
    const subId = 'sub_' + crypto.randomBytes(8).toString('hex');
    const periodEnd = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString();

    db.prepare(`
      INSERT INTO subscriptions (id, tenantId, planId, status, currentPeriodStart, currentPeriodEnd, createdAt, updatedAt)
      VALUES (@id, @tenantId, @planId, 'active', @currentPeriodStart, @currentPeriodEnd, @createdAt, @updatedAt)
    `).run({
      id: subId,
      tenantId: tenantId,
      planId: plan.id,
      currentPeriodStart: now,
      currentPeriodEnd: periodEnd,
      createdAt: now,
      updatedAt: now
    });
  });

  // Run the atomic transaction
  executeSignupTransaction();

  // 4. Issue JWT with trusted tenant context
  const payload = {
    sub: userId,
    username: username,
    role: 'admin',
    tenantId: tenantId
  };

  const token = jwt.sign(payload, getJWTSecret(), { expiresIn: JWT_EXPIRES_IN });

  return {
    token,
    user: {
      id: userId,
      username: username,
      role: 'admin',
      tenantId: tenantId
    },
    tenant: {
      id: tenantId,
      name: companyName,
      slug: slug
    }
  };
}

