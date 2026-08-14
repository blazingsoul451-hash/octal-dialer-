/**
 * authManager.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Step 2 of 13 — Authentication layer
 * - Uses Node.js built-in `crypto.scryptSync` — zero new dependencies
 * - Stores users + sessions in SQLite (tables created in Step 1)
 * - Creates a default admin account on first boot and prints credentials
 * - Session tokens are random 32-byte hex strings stored in sessions_store
 * - Token TTL: 24 hours (configurable via SESSION_TTL_HOURS env var)
 * ─────────────────────────────────────────────────────────────────────────────
 */

import crypto from 'crypto';
import express from 'express';
import { db } from './databaseManager';

const SESSION_TTL_HOURS = parseInt(process.env.SESSION_TTL_HOURS || '24', 10);

// ─── Interfaces ───────────────────────────────────────────────────────────────
export interface AuthUser {
  id: string;
  username: string;
  role: string;
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
  insertUser:         db.prepare(`INSERT INTO users (id, username, passwordHash, role, createdAt) VALUES (@id, @username, @passwordHash, @role, @createdAt)`),
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

/** Validate credentials → return session token or null */
export function login(username: string, password: string): string | null {
  const user = stmts.findUserByUsername.get({ username }) as any;
  if (!user) return null;
  if (!verifyPassword(password, user.passwordHash)) return null;

  // Clean up expired sessions
  stmts.deleteExpired.run({ now: new Date().toISOString() });

  const token = crypto.randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + SESSION_TTL_HOURS * 3600 * 1000).toISOString();

  stmts.insertSession.run({
    id: 'sess_auth_' + crypto.randomBytes(4).toString('hex'),
    userId: user.id,
    token,
    expiresAt,
    createdAt: new Date().toISOString()
  });

  return token;
}

/** Validate a token → return user or null */
export function validateToken(token: string): AuthUser | null {
  if (!token) return null;

  const session = stmts.findSession.get({ token }) as any;
  if (!session) return null;

  // Check expiry
  if (new Date(session.expiresAt) < new Date()) {
    stmts.deleteSession.run({ token });
    return null;
  }

  const user = stmts.findUserById.get({ id: session.userId }) as any;
  if (!user) return null;

  return { id: user.id, username: user.username, role: user.role };
}

/** Destroy a session (logout) */
export function logout(token: string): void {
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
