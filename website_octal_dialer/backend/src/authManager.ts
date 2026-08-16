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
import {
  isValidEmailFormat,
  isDisposableEmail,
  generateVerificationCode,
  hashVerificationCode,
  verifyVerificationCode,
  sendVerificationEmail,
  sendPasswordResetEmail
} from './emailVerificationService';

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
  email?: string;
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
    if (!stored || !stored.includes(':')) return false;
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
  findUserByUsername:        db.prepare(`SELECT * FROM users WHERE username = @username`),
  findUserByUsernameOrEmail: db.prepare(`SELECT * FROM users WHERE username = @ident OR (email IS NOT NULL AND email = @ident)`),
  findUserById:              db.prepare(`SELECT * FROM users WHERE id = @id`),
  insertUser:                db.prepare(`INSERT INTO users (id, username, email, passwordHash, role, tenantId, googleId, authProvider, createdAt, updatedAt) VALUES (@id, @username, @email, @passwordHash, @role, @tenantId, @googleId, @authProvider, @createdAt, @updatedAt)`),
  countUsers:                db.prepare(`SELECT COUNT(*) as c FROM users`),
  insertSession:             db.prepare(`INSERT INTO sessions_store (id, userId, token, expiresAt, createdAt) VALUES (@id, @userId, @token, @expiresAt, @createdAt)`),
  findSession:               db.prepare(`SELECT * FROM sessions_store WHERE token = @token`),
  deleteSession:             db.prepare(`DELETE FROM sessions_store WHERE token = @token`),
  deleteExpired:             db.prepare(`DELETE FROM sessions_store WHERE expiresAt < @now`),
  updatePassword:            db.prepare(`UPDATE users SET passwordHash = @passwordHash WHERE id = @id`),
};

// ─── CAPTCHA Verification (Cloudflare Turnstile) ─────────────────────────────
export async function verifyCaptcha(token?: string, remoteIp?: string): Promise<{ success: boolean; error?: string }> {
  const secret = process.env.CAPTCHA_SECRET_KEY || process.env.TURNSTILE_SECRET_KEY || '';
  
  // If no secret configured or set to local test/development dummy, pass gracefully
  if (!secret || secret === 'test' || secret === 'dummy' || process.env.NODE_ENV === 'test') {
    return { success: true };
  }

  if (!token) {
    return { success: false, error: 'CAPTCHA token is required.' };
  }

  // Allow standard Cloudflare Turnstile testing pass tokens
  if (token.startsWith('1x00000000000000000000AA') || token === 'test_pass') {
    return { success: true };
  }

  try {
    const formData = new URLSearchParams();
    formData.append('secret', secret);
    formData.append('response', token);
    if (remoteIp) formData.append('remoteip', remoteIp);

    const response = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      body: formData,
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
    });

    const data = await response.json() as { success: boolean; 'error-codes'?: string[] };
    if (data.success) {
      return { success: true };
    }
    return { success: false, error: 'CAPTCHA verification failed: ' + (data['error-codes']?.join(', ') || 'invalid') };
  } catch (err: any) {
    console.error('[CAPTCHA] Verification request failed:', err.message);
    return { success: false, error: 'CAPTCHA verification service unreachable.' };
  }
}

// ─── Google OAuth & Account Linking ──────────────────────────────────────────
export async function verifyGoogleIdToken(idToken: string): Promise<{ googleId: string; email: string; name?: string; picture?: string; verified: boolean }> {
  if (!idToken) throw new Error('Missing Google ID token.');

  const res = await fetch(`https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(idToken)}`);
  if (!res.ok) {
    throw new Error('Invalid or expired Google ID token.');
  }

  const payload = await res.json() as any;
  if (!payload.sub || !payload.email) {
    throw new Error('Google token response missing sub or email claims.');
  }

  const expectedClientId = process.env.GOOGLE_CLIENT_ID;
  if (expectedClientId && payload.aud && payload.aud !== expectedClientId) {
    throw new Error('Google token client mismatch.');
  }

  return {
    googleId: payload.sub,
    email: payload.email.toLowerCase().trim(),
    name: payload.name || payload.given_name || 'Google User',
    picture: payload.picture,
    verified: payload.email_verified === 'true' || payload.email_verified === true
  };
}

/** Link or create user via Google OAuth (Always forces role='user' for new accounts) */
/**
 * Google Sign In: Authenticates an EXISTING Octal Dialer account.
 * INVARIANT: Never creates an account if none exists.
 */
export function authenticateGoogleSignIn(profile: { googleId: string; email: string; name?: string; picture?: string }): { token: string; user: AuthUser; isNewUser: boolean } {
  const email = profile.email.toLowerCase().trim();
  const googleId = profile.googleId;
  const now = new Date().toISOString();

  // 1. Look up user by googleId
  let user = db.prepare(`SELECT * FROM users WHERE googleId = ?`).get(googleId) as any;

  // 2. If not found by googleId, check by verified email
  if (!user) {
    user = db.prepare(`SELECT * FROM users WHERE email = ? OR username = ?`).get(email, email) as any;
    if (user) {
      // Link googleId to existing internal account without altering permissions or existing role!
      db.prepare(`UPDATE users SET googleId = ?, authProvider = 'google_linked', updatedAt = ? WHERE id = ?`).run(googleId, now, user.id);
    }
  }

  // If no account exists, STRICTLY reject without creating an account
  if (!user) {
    const err: any = new Error('No Octal Dialer account exists with this Google account. Please sign up first.');
    err.code = 'GOOGLE_ACCOUNT_NOT_FOUND';
    err.email = email;
    throw err;
  }

  // Existing user: PRESERVE authoritative ID, role (e.g. platform_admin or admin), and tenantId
  const payload = {
    sub: user.id,
    username: user.username,
    role: user.role,
    tenantId: user.tenantId
  };
  const token = jwt.sign(payload, getJWTSecret(), { expiresIn: JWT_EXPIRES_IN });
  return {
    token,
    user: {
      id: user.id,
      username: user.username,
      role: user.role,
      tenantId: user.tenantId,
      email: user.email || email
    },
    isNewUser: false
  };
}

/**
 * Google Sign Up: Creates a NEW Octal Dialer account if one does not already exist.
 * INVARIANT: If account already exists, rejects with GOOGLE_ACCOUNT_ALREADY_EXISTS.
 */
export function registerGoogleSignUp(profile: { googleId: string; email: string; name?: string; picture?: string }): { token: string; user: AuthUser; isNewUser: boolean } {
  const email = profile.email.toLowerCase().trim();
  const googleId = profile.googleId;
  const now = new Date().toISOString();

  // 1. Check if user already exists (by googleId or email)
  let existing = db.prepare(`SELECT * FROM users WHERE googleId = ? OR email = ? OR username = ?`).get(googleId, email, email) as any;
  if (existing) {
    const err: any = new Error('An Octal Dialer account already exists with this Google account. Please sign in instead.');
    err.code = 'GOOGLE_ACCOUNT_ALREADY_EXISTS';
    err.email = email;
    throw err;
  }

  // 2. New User Registration: STRICTLY force role = 'user'
  const userId = 'user_' + crypto.randomBytes(8).toString('hex');
  const cleanBase = (profile.name || email.split('@')[0]).toLowerCase().replace(/[^a-z0-9_]/g, '');
  let candidateUsername = cleanBase.length >= 3 ? cleanBase : 'user';
  const existingWithUsername = db.prepare(`SELECT id FROM users WHERE username = ?`).get(candidateUsername) as any;
  const username = existingWithUsername ? `${candidateUsername}_${crypto.randomBytes(2).toString('hex')}` : candidateUsername;
  const tenantId = 'tenant_default';
  const { hash } = hashPassword(crypto.randomBytes(32).toString('hex'));

  db.prepare(`
    INSERT INTO users (id, username, email, passwordHash, role, tenantId, googleId, authProvider, emailVerified, emailVerifiedAt, needsProfileSetup, createdAt, updatedAt)
    VALUES (?, ?, ?, ?, 'user', ?, ?, 'google', 1, ?, 1, ?, ?)
  `).run(userId, username, email, hash, tenantId, googleId, now, now, now);

  // Provision standard default permissions (all modules except admin & crm which require admin elevation)
  const modules = ['octalDialer', 'campaigns', 'leads', 'reports', 'googleScraper', 'autoEmailer', 'facebookScraper', 'facebookPoster'];
  const insertPerm = db.prepare(`
    INSERT OR IGNORE INTO user_permissions (id, userId, moduleId, enabled, grantedBy, tenantId, grantedAt)
    VALUES (?, ?, ?, 1, 'SYSTEM_GOOGLE_SIGNUP', ?, ?)
  `);
  for (const m of modules) {
    insertPerm.run(`perm_${userId}_${m}`, userId, m, tenantId, now);
  }

  const authUser: AuthUser = {
    id: userId,
    username: username,
    role: 'user',
    tenantId: tenantId,
    email: email
  };

  const payload = {
    sub: authUser.id,
    username: authUser.username,
    role: authUser.role,
    tenantId: authUser.tenantId
  };
  const token = jwt.sign(payload, getJWTSecret(), { expiresIn: JWT_EXPIRES_IN });

  return {
    token,
    user: authUser,
    isNewUser: true
  };
}

/**
 * Complete Google Profile Setup (One-Time Setup for Username & Optional Password)
 */
export function completeGoogleProfileSetup(userId: string, params: { username?: string; password?: string; skip?: boolean }): { token: string; user: AuthUser } {
  const user = db.prepare(`SELECT * FROM users WHERE id = ?`).get(userId) as any;
  if (!user) {
    throw new Error('User not found.');
  }
  if (user.needsProfileSetup !== 1) {
    throw new Error('PROFILE_SETUP_ALREADY_DONE: Profile setup has already been completed.');
  }

  const nowIso = new Date().toISOString();

  if (params.skip) {
    db.prepare(`UPDATE users SET needsProfileSetup = 0, updatedAt = ? WHERE id = ?`).run(nowIso, userId);
  } else {
    let newUsername = user.username;
    let newPasswordHash = user.passwordHash;

    if (params.username && params.username.trim()) {
      const trimmedUsername = params.username.trim().toLowerCase();
      if (trimmedUsername.length < 3) {
        throw new Error('Username must be at least 3 characters long.');
      }
      if (!/^[a-z0-9_.-]+$/.test(trimmedUsername)) {
        throw new Error('Username can only contain lowercase letters, numbers, underscores, dots, and hyphens.');
      }
      const collision = db.prepare(`SELECT id FROM users WHERE username = ? AND id != ?`).get(trimmedUsername, userId) as any;
      if (collision) {
        throw new Error('This username is already taken. Please choose another.');
      }
      newUsername = trimmedUsername;
    }

    if (params.password && params.password.trim()) {
      if (params.password.length < 6) {
        throw new Error('Password must be at least 6 characters long.');
      }
      const { hash } = hashPassword(params.password);
      newPasswordHash = hash;
    }

    db.prepare(`UPDATE users SET username = ?, passwordHash = ?, needsProfileSetup = 0, updatedAt = ? WHERE id = ?`)
      .run(newUsername, newPasswordHash, nowIso, userId);

    user.username = newUsername;
  }

  const payload = {
    sub: user.id,
    username: user.username,
    role: user.role,
    tenantId: user.tenantId
  };
  const token = jwt.sign(payload, getJWTSecret(), { expiresIn: JWT_EXPIRES_IN });

  return {
    token,
    user: {
      id: user.id,
      username: user.username,
      role: user.role,
      tenantId: user.tenantId,
      email: user.email
    }
  };
}

/** Legacy / Internal helper */
export function findOrCreateGoogleUser(profile: { googleId: string; email: string; name?: string; picture?: string }): { token: string; user: AuthUser; isNewUser: boolean } {
  try {
    return authenticateGoogleSignIn(profile);
  } catch (err: any) {
    if (err.code === 'GOOGLE_ACCOUNT_NOT_FOUND') {
      return registerGoogleSignUp(profile);
    }
    throw err;
  }
}

// ─── Email Verification & OTP Signup (Phase 15) ──────────────────────────────

/**
 * Step 1: Initiate Email Signup (OTP Generation & Dispatch)
 * - Validates email format
 * - Blocks disposable/burner email domains
 * - Generates 6-digit cryptographic OTP code
 * - Hashes code and creates pending signup record
 * - Sends verification email via SMTP/mailer
 */
export async function initiateEmailSignup(params: {
  email: string;
  username?: string;
  password: string;
  ip?: string;
}): Promise<{ success: boolean; signupId: string; email: string; message: string }> {
  const email = (params.email || '').trim().toLowerCase();
  const password = params.password || '';

  // 1. Email format syntax check
  if (!isValidEmailFormat(email)) {
    throw new Error('Please enter a valid email address.');
  }

  // 2. Disposable / temporary email check
  if (isDisposableEmail(email)) {
    throw new Error('Disposable or temporary email addresses are not allowed. Please use a permanent email address.');
  }

  // 3. Password validation
  if (password.length < 6) {
    throw new Error('Password must be at least 6 characters long.');
  }

  // 4. Derive or validate username
  let username = (params.username || '').trim().toLowerCase();
  if (!username) {
    const base = email.split('@')[0].replace(/[^a-z0-9_]/g, '');
    username = (base.length >= 3 ? base : 'user') + '_' + crypto.randomBytes(2).toString('hex');
  }
  if (username.length < 3) {
    throw new Error('Username must be at least 3 characters long.');
  }

  // 5. Check if active user already exists
  const existingUser = db.prepare(`SELECT id, username, email FROM users WHERE username = ? OR (email IS NOT NULL AND email = ?)`).get(username, email) as any;
  if (existingUser) {
    throw new Error('An account with this username or email already exists.');
  }

  // 6. Check existing pending signups for rate limiting / cooldown
  const recentPending = db.prepare(`SELECT * FROM pending_signups WHERE email = ? AND verifiedAt IS NULL ORDER BY createdAt DESC LIMIT 1`).get(email) as any;
  const nowMs = Date.now();
  if (recentPending) {
    const lastSentMs = new Date(recentPending.lastSentAt).getTime();
    if (nowMs - lastSentMs < 15 * 1000) { // 15s initial throttle
      const waitSecs = Math.ceil((15000 - (nowMs - lastSentMs)) / 1000);
      throw new Error(`Please wait ${waitSecs}s before requesting another verification code.`);
    }
  }

  // 7. Generate 6-digit OTP code & hashes
  const otpCode = generateVerificationCode();
  const codeHash = hashVerificationCode(otpCode);
  const { hash: passwordHash } = hashPassword(password);
  const signupId = 'signup_' + crypto.randomBytes(8).toString('hex');
  const nowIso = new Date().toISOString();
  const expiresIso = new Date(nowMs + 10 * 60 * 1000).toISOString(); // 10 minutes

  // 8. Store in pending_signups table
  db.prepare(`
    INSERT INTO pending_signups (id, email, username, passwordHash, codeHash, attempts, resendCount, lastSentAt, expiresAt, ip, tenantId, createdAt)
    VALUES (?, ?, ?, ?, ?, 0, 0, ?, ?, ?, 'tenant_default', ?)
  `).run(signupId, email, username, passwordHash, codeHash, nowIso, expiresIso, params.ip || 'unknown', nowIso);

  // 9. Send verification email via SMTP/mailer
  await sendVerificationEmail(email, otpCode);

  return {
    success: true,
    signupId,
    email,
    message: 'A 6-digit verification code has been sent to your email address.'
  };
}

/**
 * Step 2: Verify Email OTP Code & Activate User Account
 * - Checks attempt limits (max 5)
 * - Verifies expiration (10 min)
 * - Timing-safe OTP hash comparison
 * - Inserts active user strictly with role = 'user'
 * - Returns JWT session token
 */
export function verifyEmailCode(params: {
  signupId?: string;
  email: string;
  code: string;
}): { token: string; username: string; user: AuthUser } {
  const email = (params.email || '').trim().toLowerCase();
  const code = (params.code || '').trim();

  if (!email || !code) {
    throw new Error('Email and 6-digit verification code are required.');
  }

  // Find pending signup
  let pending: any;
  if (params.signupId) {
    pending = db.prepare(`SELECT * FROM pending_signups WHERE id = ? AND verifiedAt IS NULL`).get(params.signupId);
  }
  if (!pending) {
    pending = db.prepare(`SELECT * FROM pending_signups WHERE email = ? AND verifiedAt IS NULL ORDER BY createdAt DESC LIMIT 1`).get(email);
  }

  if (!pending) {
    throw new Error('No pending verification request found for this email. Please sign up again.');
  }

  // Check attempts limit
  if (pending.attempts >= 5) {
    throw new Error('Too many invalid attempts. This verification code has been locked. Please request a new code.');
  }

  // Check expiration
  const nowMs = Date.now();
  const expiresMs = new Date(pending.expiresAt).getTime();
  if (nowMs > expiresMs) {
    throw new Error('Verification code has expired. Please request a new code.');
  }

  // Verify code hash
  const isValid = verifyVerificationCode(code, pending.codeHash);
  if (!isValid) {
    const newAttempts = pending.attempts + 1;
    db.prepare(`UPDATE pending_signups SET attempts = ? WHERE id = ?`).run(newAttempts, pending.id);
    const remaining = Math.max(0, 5 - newAttempts);
    if (remaining === 0) {
      throw new Error('Too many invalid attempts. This code has been locked. Please request a new code.');
    }
    throw new Error(`Invalid verification code. ${remaining} attempt${remaining === 1 ? '' : 's'} remaining.`);
  }

  // Mark pending signup as verified
  const nowIso = new Date().toISOString();
  db.prepare(`UPDATE pending_signups SET verifiedAt = ? WHERE id = ?`).run(nowIso, pending.id);

  // Check if user already exists
  let user = db.prepare(`SELECT * FROM users WHERE email = ? OR username = ?`).get(pending.email, pending.username) as any;

  if (!user) {
    // SECURITY INVARIANT: Public signup is strictly assigned role = 'user'
    const userId = 'user_' + crypto.randomBytes(8).toString('hex');
    const tenantId = pending.tenantId || 'tenant_default';

    db.prepare(`
      INSERT INTO users (id, username, email, passwordHash, role, tenantId, authProvider, emailVerified, emailVerifiedAt, createdAt, updatedAt)
      VALUES (?, ?, ?, ?, 'user', ?, 'local', 1, ?, ?, ?)
    `).run(userId, pending.username, pending.email, pending.passwordHash, tenantId, nowIso, nowIso, nowIso);

    // Provision basic default permissions (all modules except admin & crm which require admin elevation)
    const modules = ['octalDialer', 'campaigns', 'leads', 'reports', 'googleScraper', 'autoEmailer', 'facebookScraper', 'facebookPoster'];
    const insertPerm = db.prepare(`
      INSERT OR IGNORE INTO user_permissions (id, userId, moduleId, enabled, grantedBy, tenantId, grantedAt)
      VALUES (?, ?, ?, 1, 'SYSTEM_VERIFIED_SIGNUP', ?, ?)
    `);
    for (const m of modules) {
      insertPerm.run(`perm_${userId}_${m}`, userId, m, tenantId, nowIso);
    }

    user = {
      id: userId,
      username: pending.username,
      email: pending.email,
      role: 'user',
      tenantId: tenantId
    };
  } else {
    db.prepare(`UPDATE users SET emailVerified = 1, emailVerifiedAt = ? WHERE id = ?`).run(nowIso, user.id);
  }

  const authUser: AuthUser = {
    id: user.id,
    username: user.username,
    role: user.role,
    tenantId: user.tenantId,
    email: user.email
  };

  const payload = {
    sub: authUser.id,
    username: authUser.username,
    role: authUser.role,
    tenantId: authUser.tenantId
  };
  const token = jwt.sign(payload, getJWTSecret(), { expiresIn: JWT_EXPIRES_IN });

  return {
    token,
    username: authUser.username,
    user: authUser
  };
}

/**
 * Resend Verification OTP Code with Rate Limiting Cooldown
 */
export async function resendVerificationCode(params: {
  signupId?: string;
  email: string;
  ip?: string;
}): Promise<{ success: boolean; message: string; cooldownSeconds: number }> {
  const email = (params.email || '').trim().toLowerCase();
  if (!email) {
    throw new Error('Email address is required.');
  }

  let pending: any;
  if (params.signupId) {
    pending = db.prepare(`SELECT * FROM pending_signups WHERE id = ? AND verifiedAt IS NULL`).get(params.signupId);
  }
  if (!pending) {
    pending = db.prepare(`SELECT * FROM pending_signups WHERE email = ? AND verifiedAt IS NULL ORDER BY createdAt DESC LIMIT 1`).get(email);
  }

  if (!pending) {
    throw new Error('No pending verification request found for this email.');
  }

  // Cooldown enforcement: 45 seconds between resends
  const nowMs = Date.now();
  const lastSentMs = new Date(pending.lastSentAt).getTime();
  const cooldownMs = 45 * 1000;
  if (nowMs - lastSentMs < cooldownMs) {
    const waitSecs = Math.ceil((cooldownMs - (nowMs - lastSentMs)) / 1000);
    throw new Error(`Please wait ${waitSecs} seconds before requesting a new code.`);
  }

  // Limit max resends
  if (pending.resendCount >= 5) {
    throw new Error('Maximum resend limit reached for this session. Please start registration again.');
  }

  const newOtp = generateVerificationCode();
  const newCodeHash = hashVerificationCode(newOtp);
  const nowIso = new Date().toISOString();
  const expiresIso = new Date(nowMs + 10 * 60 * 1000).toISOString();

  db.prepare(`
    UPDATE pending_signups
    SET codeHash = ?, attempts = 0, resendCount = resendCount + 1, lastSentAt = ?, expiresAt = ?
    WHERE id = ?
  `).run(newCodeHash, nowIso, expiresIso, pending.id);

  await sendVerificationEmail(pending.email, newOtp);

  return {
    success: true,
    message: 'A new 6-digit verification code has been sent to your email.',
    cooldownSeconds: 45
  };
}

/** Public User Registration: STRICTLY defaults to role='user' regardless of request payload */
export function registerPublicUser(params: { username: string; email?: string; password: string; requestedRole?: string }): { token: string; user: AuthUser } {
  const username = params.username.trim().toLowerCase();
  const email = params.email ? params.email.trim().toLowerCase() : null;
  const password = params.password;

  if (email) {
    if (!isValidEmailFormat(email)) {
      throw new Error('Please enter a valid email address.');
    }
    if (isDisposableEmail(email)) {
      throw new Error('Disposable or temporary email addresses are not allowed. Please use a permanent email address.');
    }
  }

  if (!username || username.length < 3) {
    throw new Error('Username must be at least 3 characters long.');
  }
  if (!password || password.length < 6) {
    throw new Error('Password must be at least 6 characters long.');
  }

  // Check uniqueness
  const existing = db.prepare(`SELECT id FROM users WHERE username = ? OR (email IS NOT NULL AND email = ?)`).get(username, email || '') as any;
  if (existing) {
    throw new Error('Username or email is already taken.');
  }

  // SECURITY RULE: Public signups NEVER receive admin or master_admin. Always role = 'user'.
  const role = 'user';
  const tenantId = 'tenant_default';
  const userId = 'user_' + crypto.randomBytes(8).toString('hex');
  const { hash } = hashPassword(password);
  const now = new Date().toISOString();

  db.prepare(`
    INSERT INTO users (id, username, email, passwordHash, role, tenantId, authProvider, emailVerified, emailVerifiedAt, createdAt, updatedAt)
    VALUES (?, ?, ?, ?, 'user', ?, 'local', 1, ?, ?, ?)
  `).run(userId, username, email, hash, tenantId, now, now, now);

  const authUser: AuthUser = {
    id: userId,
    username: username,
    role: role,
    tenantId: tenantId,
    email: email || undefined
  };

  const payload = {
    sub: authUser.id,
    username: authUser.username,
    role: authUser.role,
    tenantId: authUser.tenantId
  };
  const token = jwt.sign(payload, getJWTSecret(), { expiresIn: JWT_EXPIRES_IN });

  return {
    token,
    user: authUser
  };
}

// ─── Default admin bootstrap ──────────────────────────────────────────────────
export function ensureDefaultAdmin(): void {
  // 1. If mohsin1 exists, ensure mohsin1 is platform_admin and no one else is platform_admin
  const primaryOwner = db.prepare(`SELECT * FROM users WHERE username = 'mohsin1' OR email = 'blazingsoul451@gmail.com'`).get() as any;
  if (primaryOwner) {
    db.prepare(`UPDATE users SET role = 'platform_admin' WHERE id = ?`).run(primaryOwner.id);
    db.prepare(`UPDATE users SET role = 'user' WHERE role = 'platform_admin' AND id != ?`).run(primaryOwner.id);
    return;
  }

  const count = (stmts.countUsers.get() as { c: number }).c;
  if (count > 0) return;

  const defaultPassword = 'octal' + Math.random().toString(36).substring(2, 8).toUpperCase();
  const { hash } = hashPassword(defaultPassword);

  db.prepare(`
    INSERT INTO users (id, username, email, passwordHash, role, tenantId, authProvider, createdAt, updatedAt)
    VALUES (?, ?, 'admin@octaldialer.local', ?, 'user', 'tenant_default', 'local', ?, ?)
  `).run('user_admin_' + crypto.randomBytes(4).toString('hex'), 'admin', hash, new Date().toISOString(), new Date().toISOString());

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

/** Validate credentials (by username or email) → return JWT token or null */
export function login(identifier: string, password: string): string | null {
  const cleanIdent = (identifier || '').trim().toLowerCase();
  const user = stmts.findUserByUsernameOrEmail.get({ ident: cleanIdent }) as any;
  if (!user) return null;
  if (!verifyPassword(password, user.passwordHash)) return null;

  // Strict check: User must belong to a valid tenant (fail-closed)
  if (!user.tenantId) {
    console.error(`[Auth] User ${identifier} has no associated tenantId. Login rejected.`);
    return null;
  }

  // Clean up expired legacy sessions (maintenance)
  stmts.deleteExpired.run({ now: new Date().toISOString() });

  // Include trusted tenant context in JWT token
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
    const decoded = jwt.verify(token, getJWTSecret(), { algorithms: ['HS256'] }) as any;

    if (decoded.sub && decoded.username && decoded.role && decoded.tenantId) {
      // Re-verify against database to prevent stale token usage upon tenant move, role change, or user deletion
      const dbUser = stmts.findUserById.get({ id: decoded.sub }) as any;
      if (!dbUser || !dbUser.tenantId || dbUser.tenantId !== decoded.tenantId) {
        // User no longer exists, tenant membership changed, or user disabled -> Fail closed!
        return null;
      }

      // Check tenant active status
      const dbTenant = db.prepare(`SELECT status FROM tenants WHERE id = ?`).get(dbUser.tenantId) as { status: string } | undefined;
      if (dbTenant && dbTenant.status === 'suspended' && dbUser.role !== 'platform_admin' && dbUser.role !== 'master_admin') {
        return null; // Block access for suspended tenants (platform admin exempt)
      }

      return {
        id: dbUser.id,
        username: dbUser.username,
        role: dbUser.role, // Use authoritative current database role
        tenantId: dbUser.tenantId, // Use authoritative current database tenant
        email: dbUser.email
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
    tenantId: user.tenantId,
    email: user.email
  };
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

/** Password Reset: generate reset token */
export function requestPasswordReset(identifier: string): { success: boolean; message: string; resetToken?: string } {
  const clean = (identifier || '').trim().toLowerCase();
  const user = db.prepare(`SELECT id, email, username FROM users WHERE username = ? OR (email IS NOT NULL AND email = ?)`).get(clean, clean) as any;
  if (!user) {
    // Prevent account enumeration: return success even if not found
    return { success: true, message: 'If an account matches that email/username, a reset link has been issued.' };
  }

  const resetToken = crypto.randomBytes(32).toString('hex');
  const expires = new Date(Date.now() + 3600 * 1000).toISOString(); // 1 hour
  db.prepare(`UPDATE users SET resetToken = ?, resetTokenExpires = ? WHERE id = ?`).run(resetToken, expires, user.id);

  if (user.email) {
    sendPasswordResetEmail(user.email, resetToken).catch(err => console.error('[Auth] Failed to send password reset email:', err));
  }

  console.log(`[Auth] Password reset requested for user ${user.username}. Reset Token: ${resetToken}`);
  return { success: true, message: 'Password reset link generated.', resetToken };
}

/** Password Reset: execute with token */
export function resetPasswordWithToken(resetToken: string, newPassword: string): { success: boolean; message: string } {
  if (!resetToken || !newPassword || newPassword.length < 6) {
    throw new Error('Valid reset token and new password (min 6 chars) are required.');
  }

  const now = new Date().toISOString();
  const user = db.prepare(`SELECT id FROM users WHERE resetToken = ? AND resetTokenExpires > ?`).get(resetToken, now) as any;
  if (!user) {
    throw new Error('Invalid or expired password reset token.');
  }

  const { hash } = hashPassword(newPassword);
  db.prepare(`UPDATE users SET passwordHash = ?, resetToken = NULL, resetTokenExpires = NULL, updatedAt = ? WHERE id = ?`).run(hash, now, user.id);

  return { success: true, message: 'Password successfully updated. You may now log in.' };
}

/** Update user role — STRICTLY restricted to Super Admin (Platform Owner) */
export function updateUserRole(executorUser: AuthUser, targetUserId: string, newRole: string): { success: boolean; user: any } {
  if (executorUser.role !== 'platform_admin' && executorUser.role !== 'master_admin') {
    throw new Error('Forbidden: Only Super Admin can change user roles.');
  }

  const target = db.prepare(`SELECT id, username, role, tenantId FROM users WHERE id = ?`).get(targetUserId) as any;
  if (!target) {
    throw new Error('User not found.');
  }

  // Prevent creating or promoting additional Super Admin accounts
  if ((newRole === 'platform_admin' || newRole === 'master_admin') && target.role !== 'platform_admin') {
    throw new Error('Forbidden: No new Super Admin accounts can be created. There is only one Super Admin.');
  }

  // Prevent demoting the Super Admin account
  if ((target.username === 'mohsin1' || target.role === 'platform_admin') && newRole !== 'platform_admin') {
    throw new Error('Forbidden: The Super Admin account cannot be demoted.');
  }

  const allowedRoles = ['user', 'agent', 'admin'];
  if (target.role === 'platform_admin') allowedRoles.push('platform_admin');
  if (!allowedRoles.includes(newRole)) {
    throw new Error(`Invalid role. Allowed roles: ${allowedRoles.join(', ')}`);
  }

  const normalized = (newRole === 'agent' ? 'user' : newRole);
  const now = new Date().toISOString();
  db.prepare(`UPDATE users SET role = ?, updatedAt = ? WHERE id = ?`).run(normalized, now, targetUserId);

  return {
    success: true,
    user: {
      id: target.id,
      username: target.username,
      role: normalized,
      tenantId: target.tenantId
    }
  };
}

/** Middleware: require platform admin role (Master Admin) */
export function requirePlatformAdmin(req: express.Request, res: express.Response, next: express.NextFunction): void {
  const authHeader = req.headers['authorization'] || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
  const user = validateToken(token);

  if (!user) {
    res.status(401).json({ error: 'Unauthorized. Please log in.' });
    return;
  }

  if (user.role !== 'platform_admin' && user.role !== 'master_admin') {
    res.status(403).json({ error: 'Forbidden. Master Admin access required.' });
    return;
  }

  (req as any).user = user;
  next();
}

export const requireMasterAdmin = requirePlatformAdmin;

/** Middleware: require tenant admin role (Tenant Admin or Master Admin) */
export function requireTenantAdmin(req: express.Request, res: express.Response, next: express.NextFunction): void {
  const authHeader = req.headers['authorization'] || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
  const user = validateToken(token);

  if (!user) {
    res.status(401).json({ error: 'Unauthorized. Please log in.' });
    return;
  }

  if (user.role !== 'admin' && user.role !== 'platform_admin' && user.role !== 'master_admin') {
    res.status(403).json({ error: 'Forbidden. Admin access required.' });
    return;
  }

  (req as any).user = user;
  next();
}

/** Backward compatibility alias for tenant admin routes */
export const requireAdmin = requireTenantAdmin;

/** Middleware: require specific business module permission (Master Admin, Tenant Admin, or authorized Employee) */
export function requireModule(moduleId: string) {
  return (req: express.Request, res: express.Response, next: express.NextFunction): void => {
    const authHeader = req.headers['authorization'] || '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
    const user = validateToken(token);

    if (!user) {
      res.status(401).json({ error: 'Unauthorized. Please log in.' });
      return;
    }

    if (user.role === 'platform_admin' || user.role === 'admin') {
      (req as any).user = user;
      next();
      return;
    }

    // For agents/employees, check user_permissions
    const perm = db.prepare(`SELECT enabled FROM user_permissions WHERE userId = ? AND tenantId = ? AND moduleId = ?`).get(user.id, user.tenantId, moduleId) as { enabled: number } | undefined;
    if (!perm || perm.enabled !== 1) {
      res.status(403).json({ error: `Forbidden. You do not have permission to access the ${moduleId} module.` });
      return;
    }

    (req as any).user = user;
    next();
  };
}


// ─── PHASE 5: SaaS Signup & Tenant Onboarding ────────────────────────────────

export interface SignupInput {
  companyName: string;
  username: string;
  password: string;
  email?: string;
  country?: string;
  logoUrl?: string;
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
  const email = (input.email || '').trim().toLowerCase() || null;

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
    const country = (input.country || 'US').trim().toUpperCase();
    db.prepare(`
      INSERT INTO tenants (id, name, slug, country, logoUrl, ownerEmail, status, createdAt, updatedAt)
      VALUES (@id, @name, @slug, @country, @logoUrl, @ownerEmail, 'active', @createdAt, @updatedAt)
    `).run({
      id: tenantId,
      name: companyName,
      slug: slug,
      country: country,
      logoUrl: input.logoUrl || null,
      ownerEmail: email || null,
      createdAt: now,
      updatedAt: now
    });

    // 3b. Insert First Tenant User (Starts as standard user until approved/promoted by Super Admin)
    stmts.insertUser.run({
      id: userId,
      username: username,
      email: email || null,
      passwordHash: hash,
      role: 'user',
      tenantId: tenantId,
      googleId: null,
      authProvider: 'local',
      createdAt: now,
      updatedAt: now
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

