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
  if (count > 0) return;

  const defaultPassword = 'octal' + Math.random().toString(36).substring(2, 8).toUpperCase();
  const { hash } = hashPassword(defaultPassword);

  stmts.insertUser.run({
    id: 'user_admin_' + crypto.randomBytes(4).toString('hex'),
    username: 'admin',
    passwordHash: hash,
    role: 'admin',
    tenantId: 'tenant_default',
    createdAt: new Date().toISOString()
  });

  console.log('');
  console.log('╔══════════════════════════════════════════════╗');
  console.log('║       OCTAL DIALER — FIRST BOOT AUTH         ║');
  console.log('╠══════════════════════════════════════════════╣');
  console.log(`║  Username : admin                            ║`);
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

  // ─── PHASE 4: JWT verification with strict tenantId requirement ───
  try {
    const decoded = jwt.verify(token, getJWTSecret()) as any;

    if (decoded.sub && decoded.username && decoded.role && decoded.tenantId) {
      return {
        id: decoded.sub,
        username: decoded.username,
        role: decoded.role,
        tenantId: decoded.tenantId
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

/** Middleware: require admin role */
export function requireAdmin(req: express.Request, res: express.Response, next: express.NextFunction): void {
  const authHeader = req.headers['authorization'] || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
  const user = validateToken(token);

  if (!user) {
    res.status(401).json({ error: 'Unauthorized. Please log in.' });
    return;
  }

  if (user.role !== 'admin') {
    res.status(403).json({ error: 'Forbidden. Admin access required.' });
    return;
  }

  (req as any).user = user;
  next();
}
