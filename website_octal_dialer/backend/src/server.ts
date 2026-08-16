// Load environment variables FIRST before any other imports
import dotenv from 'dotenv';
dotenv.config();

const originalExit = process.exit;
(process as any).exit = function(code?: number) {
  console.error('[Process.exit Trace] Code:', code, new Error().stack);
  return originalExit.call(process, code);
};

process.on('beforeExit', (code) => {
  console.error('[Process beforeExit] Event loop drained with code:', code);
});

process.on('exit', (code) => {
  console.error('[Process exit event] Code:', code);
});

import express from 'express';
import { spawn } from 'child_process';
import { createServer } from 'http';
import { Server as SocketIOServer } from 'socket.io';
import cors from 'cors';
import os from 'os';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import ExcelJS from 'exceljs';
import { chromium } from 'playwright';

import {
  createCampaign,
  getCampaigns,
  getLeads,
  getLogs,
  createLog,
  createManualLog,
  updateLeadStatus,
  loadDb,
  saveDb,
  normalizePhone,
  releaseLeadLock,
  unlockLeadsForSession,
  getLockedLeads,
  deleteLead,
  clearAllLeadsInCampaign,
  clearFakeQueueLeads,
  backupDatabase,
  createFollowUp,
  getFollowUps,
  updateFollowUpStatus,
  recordLeadActivity,
  getLeadActivities,
  db
} from './databaseManager';
import { config } from './config';

import {
  reclaimOrCreateSession,
  getSessionById,
  pairPhone,
  revokePhone,
  setSessionStatus,
  getSessionBySocketId,
  handleLaptopDisconnect,
  handlePhoneDisconnect,
  updateHeartbeat
} from './sessionManager';

import {
  ensureDefaultAdmin,
  login,
  logout,
  validateToken,
  changePassword,
  requireAdmin,
  requirePlatformAdmin,
  requireMasterAdmin,
  requireTenantAdmin,
  requireModule,
  hashPassword,
  signupTenant,
  registerPublicUser,
  initiateEmailSignup,
  verifyEmailCode,
  resendVerificationCode,
  authenticateGoogleSignIn,
  registerGoogleSignUp,
  findOrCreateGoogleUser,
  verifyGoogleIdToken,
  verifyCaptcha,
  updateUserRole,
  requestPasswordReset,
  resetPasswordWithToken,
  completeGoogleProfileSetup,
  AuthUser
} from './authManager';

import {
  getTenantEntitlements,
  getTenantUsage,
  checkLimit,
  requireFeature,
  requireActiveSubscription,
  initializeCatalogPlans
} from './entitlementManager';

import {
  getBillingState,
  getPublicPlans,
  startCheckout,
  confirmPayment,
  failPayment,
  changePlan,
  cancelSubscription,
  reactivateSubscription,
  suspendSubscription,
  adminActivateSubscription,
  getTenantBillingEvents,
  getTenantInvoices,
  sanitizePlanId,
  processWebhookEvent,
  processGracePeriods
} from './billingManager';

import {
  checkCallAllowed,
  triggerEmergencyStop,
  clearEmergencyStop,
  isEmergencyStopped,
  addToSuppressionList,
  bulkAddToSuppressionList,
  removeFromSuppressionList,
  getSuppressionList,
  getCallsInLastHour,
  writeAuditLog,
  expireCommand,
  getActiveCommands
} from './safetyController';

export const app = express();

// Trust Proxy Configuration (Phase 11)
app.set('trust proxy', config.trustProxy);

const checkOrigin = (origin: string | undefined, callback: (err: Error | null, allow?: boolean) => void) => {
  if (!origin) {
    return callback(null, true);
  }
  // Allow localhost, 127.0.0.1, and all private LAN subnets (192.168.x.x, 10.x.x.x, 172.x.x.x, *.local)
  const isLocalOrLAN = origin.startsWith('http://localhost:') ||
                       origin.startsWith('http://127.0.0.1:') ||
                       origin.startsWith('https://localhost:') ||
                       origin.startsWith('https://127.0.0.1:') ||
                       /^https?:\/\/192\.168\.\d{1,3}\.\d{1,3}(:\d+)?$/.test(origin) ||
                       /^https?:\/\/10\.\d{1,3}\.\d{1,3}\.\d{1,3}(:\d+)?$/.test(origin) ||
                       /^https?:\/\/172\.(1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3}(:\d+)?$/.test(origin) ||
                       /^https?:\/\/[a-zA-Z0-9-]+\.local(:\d+)?$/.test(origin);

  if (isLocalOrLAN || config.corsAllowedOrigins.includes(origin)) {
    callback(null, true);
  } else {
    callback(null, false);
  }
};

app.use(cors({
  origin: checkOrigin,
  credentials: true
}));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// Request Correlation ID Middleware (Phase 11)
app.use((req, res, next) => {
  const incomingId = req.headers['x-request-id'];
  const requestId = (typeof incomingId === 'string' && /^[a-zA-Z0-9_-]{8,64}$/.test(incomingId))
    ? incomingId
    : crypto.randomUUID();
  (req as any).requestId = requestId;
  res.setHeader('X-Request-Id', requestId);
  next();
});

// Operational Metrics Tracking (Phase 11)
const metricsData = {
  httpRequestsTotal: 0,
  httpErrorsTotal: 0,
  authFailuresTotal: 0,
  rateLimitHitsTotal: 0,
  startTime: Date.now()
};

app.use((_req, res, next) => {
  metricsData.httpRequestsTotal++;
  res.on('finish', () => {
    if (res.statusCode >= 400) metricsData.httpErrorsTotal++;
    if (res.statusCode === 401 || res.statusCode === 403) metricsData.authFailuresTotal++;
    if (res.statusCode === 429) metricsData.rateLimitHitsTotal++;
  });
  next();
});

// HTTP Security Headers (Phase 10 Hardening)
app.use((_req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'geolocation=(), camera=(), microphone=()');
  if (process.env.NODE_ENV === 'production') {
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  }
  next();
});

// Set request timeout to 30 seconds to prevent slowloris attacks
app.use((req, _res, next) => {
  req.socket.setTimeout(30000);
  next();
});

// ─── Health, Readiness & Metrics Endpoints (Phase 10 & 11) ────────────────────
app.get('/health', (_req, res) => {
  res.json({
    status: 'healthy',
    uptime: Math.floor(process.uptime()),
    timestamp: new Date().toISOString()
  });
});

app.get('/ready', (_req, res) => {
  try {
    db.prepare('SELECT 1').get();
    res.json({
      status: 'ready',
      database: 'connected',
      timestamp: new Date().toISOString()
    });
  } catch {
    res.status(503).json({
      status: 'unready',
      database: 'disconnected'
    });
  }
});

app.get('/metrics', (_req, res) => {
  res.json({
    uptime_seconds: Math.floor((Date.now() - metricsData.startTime) / 1000),
    http_requests_total: metricsData.httpRequestsTotal,
    http_errors_total: metricsData.httpErrorsTotal,
    auth_failures_total: metricsData.authFailuresTotal,
    rate_limit_hits_total: metricsData.rateLimitHitsTotal,
    node_memory_rss_bytes: process.memoryUsage().rss
  });
});

// Serve compiled frontend dashboard directly on backend port 3000
const frontendDist = path.join(__dirname, '../../frontend/dist');
if (fs.existsSync(frontendDist)) {
  app.use(express.static(frontendDist));
}

// ─── Auth middleware ──────────────────────────────────────────────────────────
function requireAuth(req: express.Request, res: express.Response, next: express.NextFunction): void {
  const authHeader = req.headers['authorization'] || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
  const user = validateToken(token);
  if (!user) {
    res.status(401).json({ error: 'Unauthorized. Please log in.' });
    return;
  }
  (req as any).user = user;
  next();
}

// ─── Rate Limiting Middleware (Phase 9 Hardening) ─────────────────────────────
interface RateLimitBucket {
  count: number;
  resetTime: number;
}
const rateLimitStores = new Map<string, Map<string, RateLimitBucket>>();

function createRateLimiter(name: string, maxRequests: number, windowMs: number, keyExtractor?: (req: express.Request) => string) {
  if (!rateLimitStores.has(name)) {
    rateLimitStores.set(name, new Map());
  }
  const store = rateLimitStores.get(name)!;

  return (req: express.Request, res: express.Response, next: express.NextFunction) => {
    const key = keyExtractor ? keyExtractor(req) : (req.ip || (req.socket as any)?.remoteAddress || 'unknown');
    const now = Date.now();
    let bucket = store.get(key);

    if (!bucket || now > bucket.resetTime) {
      bucket = { count: 1, resetTime: now + windowMs };
      store.set(key, bucket);
    } else {
      bucket.count++;
    }

    if (bucket.count > maxRequests) {
      res.status(429).json({
        error: 'Too many requests. Please try again later.',
        retryAfter: Math.ceil((bucket.resetTime - now) / 1000)
      });
      return;
    }

    next();
  };
}

const billingRateLimiter = createRateLimiter('billing', 60, 60 * 1000, (req) => {
  const user = (req as any).user;
  return user ? `${user.tenantId}:${user.id}` : (req.ip || 'unknown');
});

const webhookRateLimiter = createRateLimiter('webhook', 120, 60 * 1000);
const authRateLimiter = createRateLimiter('auth', 30, 60 * 1000);

export const httpServer = createServer(app);
export const io = new SocketIOServer(httpServer, {
  cors: {
    origin: checkOrigin,
    methods: ['GET', 'POST'],
    credentials: true,
  },
  transports: ['websocket', 'polling'],
  allowEIO3: true,
  pingInterval: 25000,   // 25s between pings (was 10s)
  pingTimeout: 20000,    // 20s timeout (was 5s — too short for mobile WiFi)
  connectTimeout: 10000,
});

const PORT = 3000;
const SCRAPER_PATHS = (process.env.SCRAPER_PATHS || '')
  .split(';')
  .filter(Boolean)
  .length > 0
  ? (process.env.SCRAPER_PATHS || '').split(';').filter(Boolean)
  : [
      path.join(process.env.USERPROFILE || '', '.gemini', 'antigravity', 'scratch', 'MY_PROJECTS', 'Lead_And_Data_Scrapers'),
      path.join(process.env.USERPROFILE || '', '.gemini', 'antigravity', 'scratch', 'MY_PROJECTS', 'Lead_And_Data_Scrapers', 'google-maps-scraper-pro', 'output')
    ];

function getLocalIP(): string {
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name] || []) {
      if (iface.family === 'IPv4' && !iface.internal) {
        return iface.address;
      }
    }
  }
  return 'localhost';
}

// ─── Auth REST Endpoints (no requireAuth — public, rate-limited) ────────────

// ─── OAuth State & Session Store (In-Memory with 15-min TTL) ────────────────
interface OAuthStateRecord {
  state: string;
  nonce: string;
  clientOrigin: string;
  intent: 'signin' | 'signup';
  captchaVerified: boolean;
  createdAt: number;
}
const oauthStates = new Map<string, OAuthStateRecord>();

setInterval(() => {
  const now = Date.now();
  for (const [key, val] of oauthStates.entries()) {
    if (now - val.createdAt > 15 * 60 * 1000) {
      oauthStates.delete(key);
    }
  }
}, 10 * 60 * 1000);

// Helper to extract clean frontend origin
function getClientOrigin(req: express.Request): string {
  const headerOrigin = req.headers['origin'] || req.headers['referer'] || (req.query.origin as string) || '';
  if (headerOrigin) {
    try {
      const parsed = new URL(String(headerOrigin));
      return `${parsed.protocol}//${parsed.host}`;
    } catch (_) {}
  }
  return config.corsAllowedOrigins[0] || 'http://localhost:5173';
}

// ─── Auth REST Endpoints (dual mounted on /auth and /api/auth) ────────────────

// GET /auth/config & GET /api/auth/config — Public client configuration
app.get(['/auth/config', '/api/auth/config'], (_req, res) => {
  res.json({
    googleClientId: config.googleClientId || null,
    captchaSiteKey: config.captchaSiteKey || null,
    captchaEnabled: !!(config.captchaSecretKey && config.captchaSecretKey !== 'test' && config.captchaSecretKey !== 'dummy')
  });
});

// POST /auth/login & POST /api/auth/login
app.post(['/auth/login', '/api/auth/login'], authRateLimiter, async (req, res) => {
  const { username, password, captchaToken } = req.body as { username: string; password: string; captchaToken?: string };
  if (!username || !password) {
    res.status(400).json({ error: 'Username and password required.' });
    return;
  }

  // Verify CAPTCHA
  const captchaCheck = await verifyCaptcha(captchaToken, req.ip);
  if (!captchaCheck.success) {
    res.status(400).json({ error: captchaCheck.error || 'CAPTCHA verification failed.' });
    return;
  }

  try {
    const token = login(username, password);
    if (!token) {
      res.status(401).json({ error: 'Invalid username or password.' });
      return;
    }

    const user = validateToken(token);
    res.json({ token, username: user?.username || username, user });
  } catch (err: any) {
    if (err.message && err.message.includes('not verified')) {
      res.status(403).json({ error: err.message, code: 'EMAIL_NOT_VERIFIED' });
      return;
    }
    res.status(400).json({ error: err.message || 'Login failed.' });
  }
});

// POST /auth/initiate-signup & POST /api/auth/initiate-signup — Initiates Email Verification Signup (OTP)
app.post(['/auth/initiate-signup', '/api/auth/initiate-signup'], authRateLimiter, async (req, res) => {
  try {
    const { email, username, password, captchaToken } = req.body as {
      email?: string;
      username?: string;
      password?: string;
      captchaToken?: string;
    };

    if (!email || !password) {
      res.status(400).json({ error: 'Email and password are required.' });
      return;
    }

    // Verify CAPTCHA
    const captchaCheck = await verifyCaptcha(captchaToken, req.ip);
    if (!captchaCheck.success) {
      res.status(400).json({ error: captchaCheck.error || 'CAPTCHA verification failed.' });
      return;
    }

    const result = await initiateEmailSignup({
      email,
      username,
      password,
      ip: req.ip
    });

    res.status(200).json(result);
  } catch (err: any) {
    res.status(400).json({ error: err.message || 'Failed to initiate signup.' });
  }
});

// POST /auth/verify-email & POST /api/auth/verify-email — Verifies 6-digit OTP & Activates Account
app.post(['/auth/verify-email', '/api/auth/verify-email'], authRateLimiter, async (req, res) => {
  try {
    const { signupId, email, code } = req.body as {
      signupId?: string;
      email?: string;
      code?: string;
    };

    if (!email || !code) {
      res.status(400).json({ error: 'Email address and 6-digit verification code are required.' });
      return;
    }

    const result = verifyEmailCode({
      signupId,
      email,
      code
    });

    res.status(201).json(result);
  } catch (err: any) {
    res.status(400).json({ error: err.message || 'Email verification failed.' });
  }
});

// POST /auth/resend-verification & POST /api/auth/resend-verification — Resends OTP Code with Cooldown
app.post(['/auth/resend-verification', '/api/auth/resend-verification'], authRateLimiter, async (req, res) => {
  try {
    const { signupId, email, captchaToken } = req.body as {
      signupId?: string;
      email?: string;
      captchaToken?: string;
    };

    if (!email) {
      res.status(400).json({ error: 'Email address is required.' });
      return;
    }

    // Verify CAPTCHA if provided
    if (captchaToken) {
      const captchaCheck = await verifyCaptcha(captchaToken, req.ip);
      if (!captchaCheck.success) {
        res.status(400).json({ error: captchaCheck.error || 'CAPTCHA verification failed.' });
        return;
      }
    }

    const result = await resendVerificationCode({
      signupId,
      email,
      ip: req.ip
    });

    res.status(200).json(result);
  } catch (err: any) {
    res.status(400).json({ error: err.message || 'Failed to resend verification code.' });
  }
});

// POST /auth/register & POST /api/auth/register — Public User Registration (ALWAYS role='user')
app.post(['/auth/register', '/api/auth/register'], authRateLimiter, async (req, res) => {
  try {
    const { username, email, password, captchaToken } = req.body as {
      username: string;
      email?: string;
      password: string;
      captchaToken?: string;
      role?: string; // Ignored by registerPublicUser
    };

    // Verify CAPTCHA
    const captchaCheck = await verifyCaptcha(captchaToken, req.ip);
    if (!captchaCheck.success) {
      res.status(400).json({ error: captchaCheck.error || 'CAPTCHA verification failed.' });
      return;
    }

    const result = registerPublicUser({ username, email, password });
    res.status(201).json(result);
  } catch (err: any) {
    res.status(400).json({ error: err.message || 'Registration failed.' });
  }
});

// POST /auth/signup & POST /api/auth/signup — SaaS Self-Service Tenant Onboarding (Phase 5, rate-limited)
app.post(['/auth/signup', '/api/auth/signup'], authRateLimiter, async (req, res) => {
  try {
    const { companyName, username, password, email, captchaToken } = req.body as {
      companyName?: string;
      username?: string;
      password?: string;
      email?: string;
      captchaToken?: string;
    };

    // Verify CAPTCHA
    const captchaCheck = await verifyCaptcha(captchaToken, req.ip);
    if (!captchaCheck.success) {
      res.status(400).json({ error: captchaCheck.error || 'CAPTCHA verification failed.' });
      return;
    }

    if (!companyName || !username || !password) {
      res.status(400).json({ error: 'companyName, username, and password are required.' });
      return;
    }

    const result = signupTenant({
      companyName,
      username,
      password,
      email
    });

    res.status(201).json(result);
  } catch (err: any) {
    const isClientError = err.message && (
      err.message.includes('already taken') ||
      err.message.includes('must be at least') ||
      err.message.includes('cannot exceed') ||
      err.message.includes('only contain')
    );
    res.status(isClientError ? 400 : 500).json({ error: err.message || 'Signup failed.' });
  }
});

// GET /auth/google & GET /api/auth/google — Initiates OAuth Redirect
// POST /auth/google/initiate & POST /api/auth/google/initiate — Initiates Google OAuth with explicit intent & CAPTCHA
app.post(['/auth/google/initiate', '/api/auth/google/initiate'], authRateLimiter, async (req, res) => {
  try {
    const clientOrigin = getClientOrigin(req);
    if (!config.googleClientId) {
      res.status(503).json({ error: 'Google authentication is currently unavailable.' });
      return;
    }

    const { intent: rawIntent, captchaToken } = req.body as { intent?: string; captchaToken?: string };
    const intent: 'signin' | 'signup' = rawIntent === 'signup' ? 'signup' : 'signin';

    // Verify CAPTCHA (Mandatory for signup; or if token is provided)
    if (intent === 'signup' || captchaToken) {
      const captchaCheck = await verifyCaptcha(captchaToken, req.ip);
      if (!captchaCheck.success) {
        res.status(400).json({ error: captchaCheck.error || 'CAPTCHA verification failed.' });
        return;
      }
    }

    const state = crypto.randomBytes(24).toString('hex');
    const nonce = crypto.randomBytes(24).toString('hex');

    oauthStates.set(state, {
      state,
      nonce,
      clientOrigin,
      intent,
      captchaVerified: true,
      createdAt: Date.now()
    });

    const scope = encodeURIComponent('openid email profile');
    const redirectUri = encodeURIComponent(config.googleRedirectUri);
    const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${encodeURIComponent(config.googleClientId)}&redirect_uri=${redirectUri}&response_type=code&scope=${scope}&state=${state}&nonce=${nonce}&prompt=select_account`;

    res.json({ authUrl, state, intent });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to initiate Google OAuth.' });
  }
});

// GET /auth/google & GET /api/auth/google — Initiates OAuth Redirect with secure intent
app.get(['/auth/google', '/api/auth/google'], (req, res) => {
  const clientOrigin = getClientOrigin(req);
  console.log(`[OAuth] Google login requested. Origin: ${clientOrigin}`);

  if (!config.googleClientId) {
    console.warn('[OAuth] Warning: GOOGLE_CLIENT_ID is not configured in .env');
    res.redirect(`${clientOrigin}/?auth_error=${encodeURIComponent('Google authentication is currently unavailable.')}`);
    return;
  }

  const intent: 'signin' | 'signup' = (req.query.intent as string) === 'signup' ? 'signup' : 'signin';
  const state = crypto.randomBytes(24).toString('hex');
  const nonce = crypto.randomBytes(24).toString('hex');

  oauthStates.set(state, {
    state,
    nonce,
    clientOrigin,
    intent,
    captchaVerified: true,
    createdAt: Date.now()
  });

  const scope = encodeURIComponent('openid email profile');
  const redirectUri = encodeURIComponent(config.googleRedirectUri);
  const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${encodeURIComponent(config.googleClientId)}&redirect_uri=${redirectUri}&response_type=code&scope=${scope}&state=${state}&nonce=${nonce}&prompt=select_account`;

  console.log(`[OAuth] Redirecting user to Google OAuth consent screen (intent: ${intent})`);
  res.redirect(authUrl);
});

// GET /auth/google/callback & GET /api/auth/google/callback — Handles OAuth Code Exchange with strict intent validation
app.get(['/auth/google/callback', '/api/auth/google/callback'], async (req, res) => {
  const fallbackOrigin = config.corsAllowedOrigins[0] || 'http://localhost:5173';
  let clientOrigin = fallbackOrigin;

  try {
    const { code, state, error } = req.query as { code?: string; state?: string; error?: string };

    if (!state || !oauthStates.has(state)) {
      console.warn(`[OAuth] Warning: Invalid or expired state: ${state}`);
      res.redirect(`${clientOrigin}/?auth_error=${encodeURIComponent('Invalid or expired OAuth session. Please try again.')}`);
      return;
    }

    const storedState = oauthStates.get(state)!;
    clientOrigin = storedState.clientOrigin;
    const intent = storedState.intent;
    oauthStates.delete(state);

    if (error || !code) {
      console.warn(`[OAuth] Google OAuth returned error or no code: ${error}`);
      res.redirect(`${clientOrigin}/?auth_error=${encodeURIComponent(error || 'Google authorization cancelled')}`);
      return;
    }

    if (!config.googleClientId || !config.googleClientSecret) {
      res.redirect(`${clientOrigin}/?auth_error=${encodeURIComponent('Google OAuth client credentials not configured.')}`);
      return;
    }

    console.log('[OAuth] Exchanging authorization code with Google token endpoint...');
    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: config.googleClientId,
        client_secret: config.googleClientSecret,
        redirect_uri: config.googleRedirectUri,
        grant_type: 'authorization_code'
      })
    });

    const tokenData = await tokenRes.json() as any;
    if (!tokenData.id_token) {
      throw new Error(tokenData.error_description || tokenData.error || 'Failed to obtain Google ID token.');
    }

    console.log('[OAuth] Verifying Google identity token...');
    const profile = await verifyGoogleIdToken(tokenData.id_token);
    console.log(`[OAuth] Google identity verified: ${profile.email} (Authenticated intent: ${intent})`);

    let result: { token: string; user: AuthUser; isNewUser: boolean };

    if (intent === 'signin') {
      // SIGN IN INTENT: Authenticate EXISTING account. NEVER create an account if none exists.
      try {
        result = authenticateGoogleSignIn(profile);
      } catch (signInErr: any) {
        if (signInErr.code === 'GOOGLE_ACCOUNT_NOT_FOUND') {
          console.log(`[OAuth] Sign-In rejected: No account found for Google email ${profile.email}`);
          res.redirect(`${clientOrigin}/?auth_error=GOOGLE_ACCOUNT_NOT_FOUND&email=${encodeURIComponent(profile.email)}`);
          return;
        }
        throw signInErr;
      }
    } else {
      // SIGN UP INTENT: Create NEW account. REJECT if account already exists.
      try {
        result = registerGoogleSignUp(profile);
      } catch (signUpErr: any) {
        if (signUpErr.code === 'GOOGLE_ACCOUNT_ALREADY_EXISTS') {
          console.log(`[OAuth] Sign-Up rejected: Account already exists for Google email ${profile.email}`);
          res.redirect(`${clientOrigin}/?auth_error=GOOGLE_ACCOUNT_ALREADY_EXISTS&email=${encodeURIComponent(profile.email)}`);
          return;
        }
        throw signUpErr;
      }
    }

    console.log(`[OAuth] User authenticated: ${result.user.username} (role: ${result.user.role}, isNew: ${result.isNewUser})`);

    const safeUserJson = JSON.stringify(result.user.username);
    const safeToken = JSON.stringify(result.token);
    const targetUrl = `${clientOrigin}/?token=${encodeURIComponent(result.token)}&username=${encodeURIComponent(result.user.username)}`;

    res.send(`
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <title>Authenticating with Google...</title>
          <style>
            body {
              background: #090d16;
              color: #fbbf24;
              font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
              display: flex;
              justify-content: center;
              align-items: center;
              height: 100vh;
              margin: 0;
            }
            .card {
              background: rgba(15, 23, 42, 0.9);
              border: 1px solid rgba(251, 191, 36, 0.3);
              border-radius: 16px;
              padding: 32px 48px;
              text-align: center;
              box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.5);
            }
            .spinner {
              width: 36px;
              height: 36px;
              border: 3px solid rgba(251, 191, 36, 0.2);
              border-top-color: #fbbf24;
              border-radius: 50%;
              animation: spin 1s linear infinite;
              margin: 0 auto 16px auto;
            }
            @keyframes spin { to { transform: rotate(360deg); } }
          </style>
        </head>
        <body>
          <div class="card">
            <div class="spinner"></div>
            <h2 style="margin: 0 0 8px 0; color: #fff;">Google Authentication Successful</h2>
            <p style="margin: 0; color: #94a3b8; font-size: 13px;">Transferring session to Octal Dialer...</p>
          </div>
          <script>
            try {
              localStorage.setItem('octal_auth_token', ${safeToken});
              localStorage.setItem('octal_auth_user', ${safeUserJson});
            } catch (e) {
              console.error('Storage error:', e);
            }
            window.location.href = ${JSON.stringify(targetUrl)};
          </script>
        </body>
      </html>
    `);
  } catch (err: any) {
    console.error('[OAuth] Callback processing error:', err.message);
    res.redirect(`${clientOrigin}/?auth_error=${encodeURIComponent(err.message || 'Google OAuth failed')}`);
  }
});

// POST /auth/google/verify & POST /api/auth/google/verify — Verifies Google ID Token (from Google One Tap or Sign-In button)
app.post(['/auth/google/verify', '/api/auth/google/verify'], authRateLimiter, async (req, res) => {
  try {
    const { credential, intent: rawIntent, captchaToken } = req.body as { credential: string; intent?: string; captchaToken?: string };
    if (!credential) {
      res.status(400).json({ error: 'Google credential (id_token) is required.' });
      return;
    }

    const intent: 'signin' | 'signup' = rawIntent === 'signup' ? 'signup' : 'signin';

    // Verify CAPTCHA for signup
    if (intent === 'signup' || captchaToken) {
      const captchaCheck = await verifyCaptcha(captchaToken, req.ip);
      if (!captchaCheck.success) {
        res.status(400).json({ error: captchaCheck.error || 'CAPTCHA verification failed.' });
        return;
      }
    }

    const profile = await verifyGoogleIdToken(credential);

    if (intent === 'signin') {
      try {
        const result = authenticateGoogleSignIn(profile);
        res.json(result);
      } catch (err: any) {
        if (err.code === 'GOOGLE_ACCOUNT_NOT_FOUND') {
          res.status(404).json({ error: err.message, code: 'GOOGLE_ACCOUNT_NOT_FOUND', email: profile.email });
          return;
        }
        throw err;
      }
    } else {
      try {
        const result = registerGoogleSignUp(profile);
        res.status(201).json(result);
      } catch (err: any) {
        if (err.code === 'GOOGLE_ACCOUNT_ALREADY_EXISTS') {
          res.status(409).json({ error: err.message, code: 'GOOGLE_ACCOUNT_ALREADY_EXISTS', email: profile.email });
          return;
        }
        throw err;
      }
    }
  } catch (err: any) {
    res.status(400).json({ error: err.message || 'Google authentication failed.' });
  }
});

// POST /auth/forgot-password & POST /api/auth/forgot-password — Request Password Reset Token (CAPTCHA Protected)
app.post(['/auth/forgot-password', '/api/auth/forgot-password'], authRateLimiter, async (req, res) => {
  try {
    const { identifier, captchaToken } = req.body as { identifier: string; captchaToken?: string };
    if (!identifier) {
      res.status(400).json({ error: 'Email or username is required.' });
      return;
    }

    const captchaCheck = await verifyCaptcha(captchaToken, req.ip);
    if (!captchaCheck.success) {
      res.status(400).json({ error: captchaCheck.error || 'CAPTCHA verification failed.' });
      return;
    }

    const result = requestPasswordReset(identifier);
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Password reset request failed.' });
  }
});

// POST /auth/reset-password & POST /api/auth/reset-password — Complete Password Reset with Token
app.post(['/auth/reset-password', '/api/auth/reset-password'], authRateLimiter, async (req, res) => {
  try {
    const { resetToken, newPassword, captchaToken } = req.body as { resetToken: string; newPassword: string; captchaToken?: string };
    const captchaCheck = await verifyCaptcha(captchaToken, req.ip);
    if (!captchaCheck.success) {
      res.status(400).json({ error: captchaCheck.error || 'CAPTCHA verification failed.' });
      return;
    }

    const result = resetPasswordWithToken(resetToken, newPassword);
    res.json(result);
  } catch (err: any) {
    res.status(400).json({ error: err.message || 'Password reset failed.' });
  }
});

// POST /auth/logout & POST /api/auth/logout
app.post(['/auth/logout', '/api/auth/logout'], (req, res) => {
  const authHeader = req.headers['authorization'] || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
  if (token) logout(token);
  res.json({ success: true });
});

// POST /auth/change-password & POST /api/auth/change-password  (requires auth)
app.post(['/auth/change-password', '/api/auth/change-password'], requireAuth, (req, res) => {
  const { newPassword } = req.body as { newPassword: string };
  if (!newPassword || newPassword.length < 6) {
    res.status(400).json({ error: 'Password must be at least 6 characters.' });
    return;
  }
  const user = (req as any).user;
  changePassword(user.id, newPassword);
  res.json({ success: true });
});

// GET /auth/me & GET /api/auth/me — validate token and return current user
app.get(['/auth/me', '/api/auth/me'], requireAuth, (req, res) => {
  const user = (req as any).user;
  const dbUser = db.prepare(`SELECT needsProfileSetup FROM users WHERE id = ?`).get(user.id) as any;
  const needsSetup = !!(dbUser && dbUser.needsProfileSetup === 1);
  res.json({
    user: {
      ...user,
      needsProfileSetup: needsSetup
    },
    needsProfileSetup: needsSetup
  });
});

// POST /auth/complete-google-profile & POST /api/auth/complete-google-profile — One-time setup for Google user profile
app.post(['/auth/complete-google-profile', '/api/auth/complete-google-profile'], requireAuth, (req, res) => {
  try {
    const user = (req as any).user;
    const { username, password, skip } = req.body as { username?: string; password?: string; skip?: boolean };
    const result = completeGoogleProfileSetup(user.id, { username, password, skip });
    res.json(result);
  } catch (err: any) {
    res.status(400).json({ error: err.message || 'Profile setup failed.' });
  }
});

// GET /auth/verify & GET /api/auth/verify — verify token validity
app.get(['/auth/verify', '/api/auth/verify'], requireAuth, (req, res) => {
  res.json({ valid: true, user: (req as any).user });
});

// ═══════════════════════════════════════════════════════════════════════════
// ADMIN ENDPOINTS — User & Permission Management
// ═══════════════════════════════════════════════════════════════════════════

// GET /admin/users — list all users in the current tenant with their permissions
app.get('/admin/users', requireTenantAdmin, (req, res) => {
  try {
    const adminUser = (req as any).user;
    const tenantId = adminUser.tenantId;

    const users = db.prepare(`
      SELECT id, username, role, tenantId, createdAt
      FROM users
      WHERE tenantId = ?
      ORDER BY createdAt DESC
    `).all(tenantId);

    const permissions = db.prepare(`
      SELECT * FROM user_permissions WHERE tenantId = ? ORDER BY userId, moduleId
    `).all(tenantId);

    // Group permissions by userId
    const permissionsByUser: Record<string, any[]> = {};
    for (const perm of permissions as any[]) {
      if (!permissionsByUser[perm.userId]) {
        permissionsByUser[perm.userId] = [];
      }
      permissionsByUser[perm.userId].push(perm);
    }

    const usersWithPermissions = (users as any[]).map(user => ({
      ...user,
      permissions: permissionsByUser[user.id] || []
    }));

    res.json(usersWithPermissions);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Full business modules registry supported by Octal Dialer RBAC
const ALL_BUSINESS_MODULES = [
  'crm',
  'campaigns',
  'octalDialer',
  'leads',
  'reports',
  'googleScraper',
  'autoEmailer',
  'facebookScraper',
  'facebookPoster'
];

// POST /admin/users — create new user in current tenant (Master Admin -> Admin / Employee; Admin -> Employee only)
app.post('/admin/users', requireTenantAdmin, (req, res) => {
  const { username, password, role = 'agent', initialPermissions } = req.body as {
    username: string;
    password: string;
    role?: string;
    initialPermissions?: string[];
  };

  if (!username || !password) {
    res.status(400).json({ error: 'Username and password required.' });
    return;
  }

  if (password.length < 6) {
    res.status(400).json({ error: 'Password must be at least 6 characters.' });
    return;
  }

  const adminUser = (req as any).user;
  const isPlatformMaster = adminUser.role === 'platform_admin';

  // Hierarchy enforcement:
  // Only Master Admin can create 'admin' roles. Normal Admins can ONLY create 'agent' (Employee).
  if (role === 'platform_admin' || role === 'master_admin') {
    res.status(403).json({ error: 'Forbidden. Master Admin accounts cannot be created via user API.' });
    return;
  }

  if (role === 'admin' && !isPlatformMaster) {
    res.status(403).json({ error: 'Forbidden. Only Master Admin can create Administrator accounts. Admins may only create Employees.' });
    return;
  }

  if (!['admin', 'agent'].includes(role)) {
    res.status(400).json({ error: 'Invalid role. Must be admin or agent.' });
    return;
  }

  try {
    const tenantId = adminUser.tenantId;

    // Check user limit on plan
    const createUserTxn = db.transaction(() => {
      const userLimitCheck = checkLimit(tenantId, 'maxUsers', 1);
      if (!userLimitCheck.allowed) {
        const err: any = new Error(userLimitCheck.error || `User limit reached for your plan (${userLimitCheck.current}/${userLimitCheck.limit}).`);
        err.statusCode = 403;
        err.limitDetails = { current: userLimitCheck.current, limit: userLimitCheck.limit };
        throw err;
      }

      // Check if username already exists
      const existing = db.prepare(`SELECT id FROM users WHERE username = ?`).get(username);
      if (existing) {
        const err: any = new Error('Username already exists.');
        err.statusCode = 400;
        throw err;
      }

      const userId = 'user_' + crypto.randomBytes(8).toString('hex');
      const { hash } = hashPassword(password);

      db.prepare(`
        INSERT INTO users (id, username, passwordHash, role, tenantId, createdAt)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(userId, username, hash, role, tenantId, new Date().toISOString());

      // If initialPermissions provided, validate delegation and grant
      const insertPerm = db.prepare(`
        INSERT INTO user_permissions (id, userId, moduleId, enabled, grantedBy, tenantId, grantedAt)
        VALUES (?, ?, ?, 1, ?, ?, ?)
      `);

      if (Array.isArray(initialPermissions) && initialPermissions.length > 0) {
        const entitlements = getTenantEntitlements(tenantId);
        const planFeatures = entitlements.isValid ? entitlements.features : {};

        for (const mod of initialPermissions) {
          if (ALL_BUSINESS_MODULES.includes(mod)) {
            // If creator is not platform admin, verify creator has entitlement
            if (!isPlatformMaster && planFeatures[mod] === false) {
              continue; // cannot delegate what tenant does not have
            }
            insertPerm.run(
              `perm_${userId}_${mod}`,
              userId,
              mod,
              adminUser.username,
              tenantId,
              new Date().toISOString()
            );
          }
        }
      } else if (role === 'admin') {
        // Admins created by Master Admin receive core modules enabled
        for (const mod of ALL_BUSINESS_MODULES) {
          insertPerm.run(
            `perm_${userId}_${mod}`,
            userId,
            mod,
            adminUser.username,
            tenantId,
            new Date().toISOString()
          );
        }
      }
      // Note: For role === 'agent' with no initialPermissions, 0 permissions are inserted (minimal default).

      return userId;
    });

    const newUserId = createUserTxn();

    res.json({
      success: true,
      userId: newUserId,
      message: `User ${username} created successfully.`
    });
  } catch (err: any) {
    res.status(err.statusCode || 500).json({
      error: err.message,
      ...(err.limitDetails ? err.limitDetails : {})
    });
  }
});

// PUT /admin/users/:userId — update user role or password within the current tenant (Phase 6: prevent escalation)
app.put('/admin/users/:userId', requireTenantAdmin, (req, res) => {
  const { userId } = req.params;
  const { role, newPassword } = req.body as { role?: string; newPassword?: string };
  const adminUser = (req as any).user;
  const isPlatformMaster = adminUser.role === 'platform_admin';
  const tenantId = adminUser.tenantId;

  try {
    const user = db.prepare(`SELECT * FROM users WHERE id = ? AND tenantId = ?`).get(userId, tenantId) as any;
    if (!user) {
      res.status(404).json({ error: 'User not found in your organization.' });
      return;
    }

    // Safety: Platform Owner accounts cannot be modified or demoted
    if ((user.role === 'platform_admin' || user.username === 'admin') && role !== undefined && role !== 'platform_admin') {
      res.status(403).json({ error: 'Forbidden. Platform Owner accounts cannot be demoted.' });
      return;
    }

    if (user.role === 'platform_admin' && !isPlatformMaster) {
      res.status(403).json({ error: 'Forbidden. Cannot modify Master Admin accounts.' });
      return;
    }

    if (role !== undefined) {
      if (role === 'platform_admin' || role === 'master_admin') {
        res.status(403).json({ error: 'Forbidden. Cannot escalate to Master Admin.' });
        return;
      }
      if (role === 'admin' && !isPlatformMaster) {
        res.status(403).json({ error: 'Forbidden. Only Master Admin can promote users to Administrator.' });
        return;
      }
      if (!['admin', 'agent', 'user'].includes(role)) {
        res.status(400).json({ error: 'Role must be admin, user, or agent.' });
        return;
      }
      db.prepare(`UPDATE users SET role = ?, updatedAt = (datetime('now')) WHERE id = ? AND tenantId = ?`).run(role, userId, tenantId);
    }

    if (newPassword !== undefined) {
      if (newPassword.length < 6) {
        res.status(400).json({ error: 'Password must be at least 6 characters.' });
        return;
      }
      const { hash } = hashPassword(newPassword);
      db.prepare(`UPDATE users SET passwordHash = ?, updatedAt = (datetime('now')) WHERE id = ? AND tenantId = ?`).run(hash, userId, tenantId);
    }

    const { permissions } = req.body as { permissions?: Record<string, boolean> | string[] };
    if (permissions !== undefined) {
      const allModules = ['crm', 'campaigns', 'octalDialer', 'leads', 'reports', 'googleScraper', 'autoEmailer', 'facebookScraper', 'facebookPoster'];
      const nowIso = new Date().toISOString();
      const insertOrUpdatePerm = db.prepare(`
        INSERT INTO user_permissions (id, userId, moduleId, enabled, grantedBy, tenantId, grantedAt)
        VALUES (@id, @userId, @moduleId, @enabled, @grantedBy, @tenantId, @grantedAt)
        ON CONFLICT(userId, moduleId) DO UPDATE SET
          enabled = excluded.enabled,
          grantedBy = excluded.grantedBy,
          grantedAt = excluded.grantedAt
      `);

      for (const m of allModules) {
        let isEnabled = 0;
        if (Array.isArray(permissions)) {
          isEnabled = permissions.includes(m) ? 1 : 0;
        } else if (typeof permissions === 'object' && permissions !== null) {
          isEnabled = permissions[m] ? 1 : 0;
        }
        insertOrUpdatePerm.run({
          id: `perm_${userId}_${m}`,
          userId,
          moduleId: m,
          enabled: isEnabled,
          grantedBy: adminUser.username || 'ADMIN',
          tenantId,
          grantedAt: nowIso
        });
      }
    }

    res.json({ success: true, message: 'User and module permissions updated successfully.' });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /admin/users/:userId/role — Dedicated role promotion/demotion endpoint (Master Admin only)
app.put('/admin/users/:userId/role', requireMasterAdmin, (req, res) => {
  try {
    const executor = (req as any).user;
    const { userId } = req.params;
    const { role } = req.body as { role: string };
    if (!role) {
      res.status(400).json({ error: 'Role is required.' });
      return;
    }
    const result = updateUserRole(executor, userId, role);
    res.json(result);
  } catch (err: any) {
    res.status(err.message.includes('Forbidden') ? 403 : 400).json({ error: err.message });
  }
});

// DELETE /admin/users/:userId — delete user within the current tenant
app.delete('/admin/users/:userId', requireTenantAdmin, (req, res) => {
  const { userId } = req.params;
  const adminUser = (req as any).user;
  const isPlatformMaster = adminUser.role === 'platform_admin';
  const tenantId = adminUser.tenantId;

  // Prevent self-deletion
  if (userId === adminUser.id) {
    res.status(400).json({ error: 'Cannot delete your own account.' });
    return;
  }

  try {
    const user = db.prepare(`SELECT * FROM users WHERE id = ? AND tenantId = ?`).get(userId, tenantId) as any;
    if (!user) {
      res.status(404).json({ error: 'User not found in your organization.' });
      return;
    }

    if (user.role === 'platform_admin' || user.username === 'admin') {
      res.status(403).json({ error: 'Forbidden. Platform Owner accounts cannot be deleted.' });
      return;
    }

    const result = db.prepare(`DELETE FROM users WHERE id = ? AND tenantId = ?`).run(userId, tenantId);

    if (result.changes === 0) {
      res.status(404).json({ error: 'User not found.' });
      return;
    }

    // Permissions are auto-deleted via CASCADE
    res.json({ success: true, message: 'User deleted successfully.' });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST /admin/permissions — update user module permissions with delegation boundary checks
app.post('/admin/permissions', requireTenantAdmin, (req, res) => {
  const { userId, moduleId, enabled } = req.body as {
    userId: string;
    moduleId: string;
    enabled: boolean
  };

  if (!userId || !moduleId || typeof enabled !== 'boolean') {
    res.status(400).json({ error: 'userId, moduleId, and enabled (boolean) required.' });
    return;
  }

  if (moduleId === 'platform_admin' || moduleId === 'platformAdmin') {
    res.status(403).json({ error: 'Forbidden. Platform Admin is Master Admin only and cannot be delegated as a module permission.' });
    return;
  }

  if (!ALL_BUSINESS_MODULES.includes(moduleId)) {
    res.status(400).json({ error: `Invalid moduleId "${moduleId}".` });
    return;
  }

  try {
    const adminUser = (req as any).user;
    const isPlatformMaster = adminUser.role === 'platform_admin';
    const tenantId = adminUser.tenantId;

    // Verify target user belongs to the requesting admin's tenant
    const targetUser = db.prepare(`SELECT * FROM users WHERE id = ? AND tenantId = ?`).get(userId, tenantId) as any;
    if (!targetUser) {
      res.status(404).json({ error: 'User not found in your organization.' });
      return;
    }

    if (targetUser.role === 'platform_admin' && !isPlatformMaster) {
      res.status(403).json({ error: 'Forbidden. Cannot modify permissions of Master Admin.' });
      return;
    }

    // Delegation boundary: Tenant Admins cannot grant modules not enabled in their tenant plan
    if (!isPlatformMaster && enabled) {
      const entitlements = getTenantEntitlements(tenantId);
      const planFeatures = entitlements.isValid ? entitlements.features : {};
      if (planFeatures[moduleId] === false) {
        res.status(403).json({ error: `Forbidden. Cannot grant module "${moduleId}" because it is not active in your organization plan.` });
        return;
      }
    }

    db.prepare(`
      INSERT INTO user_permissions (id, userId, moduleId, enabled, grantedBy, tenantId, grantedAt)
      VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(userId, moduleId) DO UPDATE SET
        enabled = excluded.enabled,
        grantedBy = excluded.grantedBy,
        tenantId = excluded.tenantId,
        grantedAt = excluded.grantedAt
    `).run(
      `perm_${userId}_${moduleId}`,
      userId,
      moduleId,
      enabled ? 1 : 0,
      adminUser.username,
      tenantId,
      new Date().toISOString()
    );

    res.json({ success: true, message: `Permission for module ${moduleId} updated.` });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET /admin/permissions/:userId — get permissions for a user
app.get('/admin/permissions/:userId', requireAuth, (req, res) => {
  try {
    const permissions = db.prepare(`
      SELECT moduleId, enabled
      FROM user_permissions
      WHERE userId = ?
    `).all(req.params.userId);

    // Convert to object map { moduleId: boolean }
    const permMap: Record<string, boolean> = {};
    for (const perm of permissions as any[]) {
      permMap[perm.moduleId] = perm.enabled === 1;
    }

    res.json(permMap);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET /auth/permissions — get effective permissions for current user across all 9 modules
app.get('/auth/permissions', requireAuth, (req, res) => {
  try {
    const user = (req as any).user;

    // Platform Admins / Master Admin have full access across all modules
    if (user.role === 'platform_admin') {
      const allTrue: Record<string, boolean> = {};
      for (const m of ALL_BUSINESS_MODULES) {
        allTrue[m] = true;
      }
      res.json(allTrue);
      return;
    }

    // Resolve tenant plan entitlements
    const entitlements = getTenantEntitlements(user.tenantId);
    const planFeatures = entitlements.isValid ? entitlements.features : {};

    // Tenant Admins receive all features enabled in their tenant plan
    if (user.role === 'admin') {
      const adminPerms: Record<string, boolean> = {
        crm: planFeatures.crm !== false,
        campaigns: planFeatures.campaigns !== false,
        octalDialer: planFeatures.octalDialer !== false,
        leads: planFeatures.leads !== false,
        reports: planFeatures.reports !== false,
        googleScraper: !!planFeatures.googleScraper,
        autoEmailer: !!planFeatures.autoEmailer,
        facebookScraper: !!planFeatures.facebookScraper,
        facebookPoster: !!planFeatures.facebookPoster
      };
      res.json(adminPerms);
      return;
    }

    // Employees / Agents receive features permitted by BOTH user permission and tenant plan
    const permissions = db.prepare(`
      SELECT moduleId, enabled
      FROM user_permissions
      WHERE userId = ? AND tenantId = ?
    `).all(user.id, user.tenantId);

    const userPermMap: Record<string, boolean> = {};
    for (const perm of permissions as any[]) {
      userPermMap[perm.moduleId] = perm.enabled === 1;
    }

    // Strict: default is FALSE for all modules unless explicitly granted
    const effectiveMap: Record<string, boolean> = {
      crm: !!userPermMap.crm && planFeatures.crm !== false,
      campaigns: !!userPermMap.campaigns && planFeatures.campaigns !== false,
      octalDialer: !!userPermMap.octalDialer && planFeatures.octalDialer !== false,
      leads: !!userPermMap.leads && planFeatures.leads !== false,
      reports: !!userPermMap.reports && planFeatures.reports !== false,
      googleScraper: !!userPermMap.googleScraper && !!planFeatures.googleScraper,
      autoEmailer: !!userPermMap.autoEmailer && !!planFeatures.autoEmailer,
      facebookScraper: !!userPermMap.facebookScraper && !!planFeatures.facebookScraper,
      facebookPoster: !!userPermMap.facebookPoster && !!planFeatures.facebookPoster
    };

    res.json(effectiveMap);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// ADMIN ENDPOINTS — Tool-Level Permissions
// ═══════════════════════════════════════════════════════════════════════════

// ═══════════════════════════════════════════════════════════════════════════
// PLATFORM MODULE CONTROL ENDPOINTS
// ═══════════════════════════════════════════════════════════════════════════

const GLOBAL_MODULES = [
  { id: 'crm', name: 'CRM Workspace', description: 'Contacts, accounts, deal pipelines, and relationship tracking', enabled: 1, status: 'operational' },
  { id: 'campaigns', name: 'Campaigns', description: 'Dialing lists, campaign queues, and workflow orchestration', enabled: 1, status: 'operational' },
  { id: 'octalDialer', name: 'Octal Dialer', description: 'GSM hardware auto-dialer and paired phone queue', enabled: 1, status: 'operational' },
  { id: 'leads', name: 'Leads Database', description: 'Dedicated lead explorer, CSV imports, and enrichment', enabled: 1, status: 'operational' },
  { id: 'reports', name: 'Reports & Analytics', description: 'Call analytics, performance charts, and audit metrics', enabled: 1, status: 'operational' },
  { id: 'googleScraper', name: 'Google Scraper', description: 'Google Maps B2B lead extractor and contact parser', enabled: 1, status: 'operational' },
  { id: 'autoEmailer', name: 'Auto Emailer', description: 'Multi-SMTP rotation and automated cold email sequences', enabled: 1, status: 'operational' },
  { id: 'facebookScraper', name: 'Facebook Scraper', description: 'Facebook group member extractor and lead generator', enabled: 1, status: 'operational' },
  { id: 'facebookPoster', name: 'FB Auto Poster', description: 'Facebook group scheduler and automated poster', enabled: 1, status: 'operational' }
];

app.get('/admin/modules', requirePlatformAdmin, (req, res) => {
  try {
    const settings = db.prepare(`SELECT settingKey, settingValue FROM system_settings WHERE category = 'modules'`).all() as any[];
    const map = new Map(settings.map(s => [s.settingKey, s.settingValue]));
    
    const modules = GLOBAL_MODULES.map(m => {
      const override = map.get(m.id);
      return {
        ...m,
        enabled: override !== undefined ? (override === 'true' || override === '1' ? 1 : 0) : m.enabled
      };
    });
    res.json({ modules });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/admin/modules/:id', requirePlatformAdmin, (req, res) => {
  try {
    const { id } = req.params;
    const { enabled } = req.body as { enabled?: boolean | number };
    const validIds = GLOBAL_MODULES.map(m => m.id);
    if (!validIds.includes(id)) {
      res.status(400).json({ error: 'Invalid module ID' });
      return;
    }

    const isTruthy = enabled === true || enabled === 1 || String(enabled) === 'true' || String(enabled) === '1';
    const val = isTruthy ? 'true' : 'false';
    db.prepare(`
      INSERT INTO system_settings (id, category, settingKey, settingValue, dataType, updatedAt)
      VALUES (?, 'modules', ?, ?, 'boolean', datetime('now'))
      ON CONFLICT(category, settingKey) DO UPDATE SET settingValue = excluded.settingValue, updatedAt = excluded.updatedAt
    `).run(`mod_${id}`, id, val);

    res.json({ success: true, moduleId: id, enabled: val === 'true' ? 1 : 0 });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET /admin/tools — list all registered tools (Platform Admin)
app.get('/admin/tools', requirePlatformAdmin, (req, res) => {
  try {
    const tools = db.prepare(`
      SELECT * FROM module_tools ORDER BY moduleId, toolKey
    `).all();

    // Group by moduleId
    const toolsByModule: Record<string, any[]> = {};
    for (const tool of tools as any[]) {
      if (!toolsByModule[tool.moduleId]) {
        toolsByModule[tool.moduleId] = [];
      }
      toolsByModule[tool.moduleId].push(tool);
    }

    res.json(toolsByModule);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST /admin/tools — register a new tool (Platform Admin)
app.post('/admin/tools', requirePlatformAdmin, (req, res) => {
  const { moduleId, toolKey, toolLabel } = req.body as {
    moduleId: string;
    toolKey: string;
    toolLabel: string;
  };

  if (!moduleId || !toolKey || !toolLabel) {
    res.status(400).json({ error: 'moduleId, toolKey, and toolLabel required.' });
    return;
  }

  const validModules = ['octalDialer', 'googleScraper', 'autoEmailer', 'facebookScraper', 'facebookPoster'];
  if (!validModules.includes(moduleId)) {
    res.status(400).json({ error: 'Invalid moduleId.' });
    return;
  }

  try {
    const toolId = `tool_${moduleId}_${toolKey}`;
    db.prepare(`
      INSERT INTO module_tools (id, moduleId, toolKey, toolLabel, enabledGlobally)
      VALUES (?, ?, ?, ?, 1)
    `).run(toolId, moduleId, toolKey, toolLabel);

    res.json({ success: true, toolId, message: 'Tool registered successfully.' });
  } catch (err: any) {
    if (err.message.includes('UNIQUE')) {
      res.status(400).json({ error: 'Tool already exists for this module.' });
    } else {
      res.status(500).json({ error: err.message });
    }
  }
});

// PATCH /admin/tools/:toolId — toggle global kill-switch (Platform Admin)
app.patch('/admin/tools/:toolId', requirePlatformAdmin, (req, res) => {
  const { toolId } = req.params;
  const { enabledGlobally } = req.body as { enabledGlobally: boolean };

  if (typeof enabledGlobally !== 'boolean') {
    res.status(400).json({ error: 'enabledGlobally (boolean) required.' });
    return;
  }

  try {
    const result = db.prepare(`
      UPDATE module_tools SET enabledGlobally = ? WHERE id = ?
    `).run(enabledGlobally ? 1 : 0, toolId);

    if (result.changes === 0) {
      res.status(404).json({ error: 'Tool not found.' });
      return;
    }

    res.json({ success: true, message: 'Tool global status updated.' });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST /admin/tool-permissions — set per-user tool access (Tenant Admin)
app.post('/admin/tool-permissions', requireTenantAdmin, (req, res) => {
  const { userId, toolId, enabled } = req.body as {
    userId: string;
    toolId: string;
    enabled: boolean;
  };

  if (!userId || !toolId || typeof enabled !== 'boolean') {
    res.status(400).json({ error: 'userId, toolId, and enabled (boolean) required.' });
    return;
  }

  try {
    const adminUser = (req as any).user;
    const targetUser = db.prepare(`SELECT tenantId FROM users WHERE id = ?`).get(userId) as any;
    if (!targetUser || (adminUser.role !== 'platform_admin' && targetUser.tenantId !== adminUser.tenantId)) {
      res.status(404).json({ error: 'User not found in your organization.' });
      return;
    }

    db.prepare(`
      INSERT INTO user_tool_permissions (id, userId, toolId, enabled)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(userId, toolId) DO UPDATE SET enabled = excluded.enabled
    `).run(`uperm_${userId}_${toolId}`, userId, toolId, enabled ? 1 : 0);

    res.json({ success: true, message: 'Tool permission updated.' });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET /auth/tool-permissions — get effective tool access for current user
app.get('/auth/tool-permissions', requireAuth, (req, res) => {
  try {
    const user = (req as any).user;

    // Get all tools with their global status
    const tools = db.prepare(`
      SELECT id, moduleId, toolKey, enabledGlobally FROM module_tools
    `).all() as any[];

    // Get user's explicit tool permissions
    const userPerms = db.prepare(`
      SELECT toolId, enabled FROM user_tool_permissions WHERE userId = ?
    `).all(user.id) as any[];

    const userPermMap: Record<string, boolean> = {};
    for (const perm of userPerms) {
      userPermMap[perm.toolId] = perm.enabled === 1;
    }

    // Effective access = global kill-switch AND user permission
    const effectiveAccess: Record<string, boolean> = {};
    for (const tool of tools) {
      const globalEnabled = tool.enabledGlobally === 1;
      const userEnabled = userPermMap[tool.id] !== undefined ? userPermMap[tool.id] : true; // default true
      effectiveAccess[tool.id] = globalEnabled && userEnabled;
    }

    res.json(effectiveAccess);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// LEADS ENDPOINTS — Scraped Lead Storage
// ═══════════════════════════════════════════════════════════════════════════

// GET /leads — list leads with filters and pagination (Tenant-scoped)
app.get('/leads', requireAuth, (req, res) => {
  try {
    const user = (req as any).user;
    const { source, status, campaignId, page = '1', limit = '50' } = req.query;
    const pageNum = parseInt(page as string, 10);
    const limitNum = parseInt(limit as string, 10);
    const offset = (pageNum - 1) * limitNum;

    let query = `SELECT * FROM scraped_leads WHERE tenantId = ?`;
    const params: any[] = [user.tenantId];

    if (source) {
      query += ` AND source = ?`;
      params.push(source);
    }
    if (status) {
      query += ` AND status = ?`;
      params.push(status);
    }
    if (campaignId) {
      query += ` AND campaignId = ?`;
      params.push(campaignId);
    }

    query += ` ORDER BY scrapedAt DESC LIMIT ? OFFSET ?`;
    params.push(limitNum, offset);

    const leads = db.prepare(query).all(...params);

    // Get total count for pagination
    let countQuery = `SELECT COUNT(*) as total FROM scraped_leads WHERE tenantId = ?`;
    const countParams: any[] = [user.tenantId];
    if (source) {
      countQuery += ` AND source = ?`;
      countParams.push(source);
    }
    if (status) {
      countQuery += ` AND status = ?`;
      countParams.push(status);
    }
    if (campaignId) {
      countQuery += ` AND campaignId = ?`;
      countParams.push(campaignId);
    }

    const { total } = db.prepare(countQuery).get(...countParams) as { total: number };

    res.json({
      leads,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        totalPages: Math.ceil(total / limitNum)
      }
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST /leads — bulk insert from scraper output (Tenant-scoped with atomic maxLeads quota check)
app.post('/leads', requireAuth, (req, res) => {
  const { leads } = req.body as { leads: any[] };

  if (!Array.isArray(leads) || leads.length === 0) {
    res.status(400).json({ error: 'leads array required.' });
    return;
  }

  try {
    const user = (req as any).user;
    const tenantId = user.tenantId;

    const stmt = db.prepare(`
      INSERT INTO scraped_leads (
        id, source, campaignId, businessName, phone, email, address, website,
        socialLinks, rawData, status, scrapedBy, scrapedAt, tenantId
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'new', ?, ?, ?)
      ON CONFLICT(source, phone, businessName) DO UPDATE SET
        email = excluded.email,
        address = excluded.address,
        website = excluded.website,
        socialLinks = excluded.socialLinks,
        rawData = excluded.rawData,
        tenantId = excluded.tenantId
    `);

    const insertManyTxn = db.transaction((leadsArray: any[]) => {
      // Phase 7 Invariant: Check plan limit for maxLeads atomically inside transaction
      const leadLimitCheck = checkLimit(tenantId, 'maxLeads', leadsArray.length);
      if (!leadLimitCheck.allowed) {
        const err: any = new Error(leadLimitCheck.error || `Lead quota exceeded (${leadLimitCheck.current + leadsArray.length}/${leadLimitCheck.limit}).`);
        err.statusCode = 403;
        err.limitDetails = { current: leadLimitCheck.current, limit: leadLimitCheck.limit };
        throw err;
      }

      for (const lead of leadsArray) {
        const leadId = 'lead_' + crypto.randomBytes(8).toString('hex');
        stmt.run(
          leadId,
          lead.source || 'unknown',
          lead.campaignId || null,
          lead.businessName || null,
          lead.phone || null,
          lead.email || null,
          lead.address || null,
          lead.website || null,
          lead.socialLinks ? JSON.stringify(lead.socialLinks) : null,
          lead.rawData ? JSON.stringify(lead.rawData) : null,
          user.username,
          new Date().toISOString(),
          tenantId
        );
      }
    });

    insertManyTxn(leads);

    res.json({ success: true, inserted: leads.length });
  } catch (err: any) {
    res.status(err.statusCode || 500).json({
      error: err.message,
      ...(err.limitDetails ? err.limitDetails : {})
    });
  }
});

// PATCH /leads/:id — update lead status
app.patch('/leads/:id', requireAuth, (req, res) => {
  const { id } = req.params;
  const { status } = req.body as { status: string };

  const validStatuses = ['new', 'contacted', 'converted', 'invalid'];
  if (!status || !validStatuses.includes(status)) {
    res.status(400).json({ error: 'Valid status required: new, contacted, converted, invalid.' });
    return;
  }

  try {
    const result = db.prepare(`
      UPDATE scraped_leads SET status = ? WHERE id = ?
    `).run(status, id);

    if (result.changes === 0) {
      res.status(404).json({ error: 'Lead not found.' });
      return;
    }

    res.json({ success: true, message: 'Lead status updated.' });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /leads/:id — delete a lead within tenant
app.delete('/leads/:id', requireAuth, (req, res) => {
  const { id } = req.params;
  const user = (req as any).user;

  try {
    // Allow deletion if: admin OR the user scraped it within the same tenant
    const lead = db.prepare(`SELECT scrapedBy FROM scraped_leads WHERE id = ? AND tenantId = ?`).get(id, user.tenantId) as any;

    if (!lead) {
      res.status(404).json({ error: 'Lead not found.' });
      return;
    }

    if (user.role !== 'admin' && user.role !== 'platform_admin' && lead.scrapedBy !== user.username) {
      res.status(403).json({ error: 'You can only delete leads you scraped.' });
      return;
    }

    db.prepare(`DELETE FROM scraped_leads WHERE id = ? AND tenantId = ?`).run(id, user.tenantId);
    res.json({ success: true, message: 'Lead deleted.' });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET /leads/export — export filtered leads as CSV within tenant
app.get('/leads/export', requireAuth, (req, res) => {
  try {
    const user = (req as any).user;
    const { source, status, campaignId, format = 'csv' } = req.query;

    if (format !== 'csv') {
      res.status(400).json({ error: 'Only CSV format supported currently.' });
      return;
    }

    let query = `SELECT * FROM scraped_leads WHERE tenantId = ?`;
    const params: any[] = [user.tenantId];

    if (source) {
      query += ` AND source = ?`;
      params.push(source);
    }
    if (status) {
      query += ` AND status = ?`;
      params.push(status);
    }
    if (campaignId) {
      query += ` AND campaignId = ?`;
      params.push(campaignId);
    }

    query += ` ORDER BY scrapedAt DESC`;

    const leads = db.prepare(query).all(...params) as any[];

    // Build CSV
    const headers = ['id', 'source', 'businessName', 'phone', 'email', 'address', 'website', 'status', 'scrapedBy', 'scrapedAt'];
    let csv = headers.join(',') + '\n';

    for (const lead of leads) {
      const row = headers.map(h => {
        const val = lead[h] || '';
        return `"${String(val).replace(/"/g, '""')}"`;
      });
      csv += row.join(',') + '\n';
    }

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="leads_${Date.now()}.csv"`);
    res.send(csv);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// SETTINGS ENDPOINTS — Module Settings
// ═══════════════════════════════════════════════════════════════════════════

// GET /settings/:moduleId — get effective settings for current user
app.get('/settings/:moduleId', requireAuth, (req, res) => {
  try {
    const { moduleId } = req.params;
    const user = (req as any).user;

    // Get global defaults (userId = NULL)
    const globalSettings = db.prepare(`
      SELECT settingKey, settingValue FROM module_settings
      WHERE moduleId = ? AND userId IS NULL
    `).all(moduleId) as any[];

    // Get user overrides
    const userSettings = db.prepare(`
      SELECT settingKey, settingValue FROM module_settings
      WHERE moduleId = ? AND userId = ?
    `).all(moduleId, user.id) as any[];

    // Merge: user overrides take precedence
    const settings: Record<string, any> = {};
    for (const s of globalSettings) {
      try {
        settings[s.settingKey] = JSON.parse(s.settingValue);
      } catch {
        settings[s.settingKey] = s.settingValue;
      }
    }
    for (const s of userSettings) {
      try {
        settings[s.settingKey] = JSON.parse(s.settingValue);
      } catch {
        settings[s.settingKey] = s.settingValue;
      }
    }

    res.json(settings);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /settings/:moduleId — set global default (admin only)
app.put('/settings/:moduleId', requireAdmin, (req, res) => {
  const { moduleId } = req.params;
  const settings = req.body as Record<string, any>;

  if (!settings || typeof settings !== 'object') {
    res.status(400).json({ error: 'Settings object required.' });
    return;
  }

  try {
    const stmt = db.prepare(`
      INSERT INTO module_settings (id, moduleId, userId, settingKey, settingValue, updatedAt)
      VALUES (?, ?, NULL, ?, ?, ?)
      ON CONFLICT(moduleId, userId, settingKey) DO UPDATE SET
        settingValue = excluded.settingValue,
        updatedAt = excluded.updatedAt
    `);

    const upsertMany = db.transaction((settingsObj: Record<string, any>) => {
      for (const [key, value] of Object.entries(settingsObj)) {
        const id = `setting_${moduleId}_global_${key}`;
        const valueStr = typeof value === 'string' ? value : JSON.stringify(value);
        stmt.run(id, moduleId, key, valueStr, new Date().toISOString());
      }
    });

    upsertMany(settings);

    res.json({ success: true, message: 'Global settings updated.' });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /settings/:moduleId/mine — set current user's override
app.put('/settings/:moduleId/mine', requireAuth, (req, res) => {
  const { moduleId } = req.params;
  const user = (req as any).user;
  const settings = req.body as Record<string, any>;

  if (!settings || typeof settings !== 'object') {
    res.status(400).json({ error: 'Settings object required.' });
    return;
  }

  try {
    const stmt = db.prepare(`
      INSERT INTO module_settings (id, moduleId, userId, settingKey, settingValue, updatedAt)
      VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(moduleId, userId, settingKey) DO UPDATE SET
        settingValue = excluded.settingValue,
        updatedAt = excluded.updatedAt
    `);

    const upsertMany = db.transaction((settingsObj: Record<string, any>) => {
      for (const [key, value] of Object.entries(settingsObj)) {
        const id = `setting_${moduleId}_${user.id}_${key}`;
        const valueStr = typeof value === 'string' ? value : JSON.stringify(value);
        stmt.run(id, moduleId, user.id, key, valueStr, new Date().toISOString());
      }
    });

    upsertMany(settings);

    res.json({ success: true, message: 'Your settings updated.' });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Safety Controller REST Endpoints ───────────────────────────────────────

// GET /api/suppression-list — list all DNC numbers
app.get('/api/suppression-list', requireAuth, (req, res) => {
  res.json(getSuppressionList());
});

// POST /api/suppression-list — add a number to DNC
app.post('/api/suppression-list', requireAuth, (req, res) => {
  const { phone, reason } = req.body as { phone: string; reason?: string };
  if (!phone || !phone.trim()) {
    res.status(400).json({ error: 'Phone number is required.' });
    return;
  }
  const user = (req as any).user;
  const added = addToSuppressionList(phone.trim(), reason || 'Manual DNC', 'dashboard', user.username);
  if (added) {
    res.json({ success: true, message: `${phone} added to suppression list.` });
  } else {
    res.status(400).json({ error: 'Number already on suppression list or invalid.' });
  }
});

// POST /api/suppression-list/import — bulk add DNC numbers
app.post('/api/suppression-list/import', requireAuth, (req, res) => {
  const { entries, reason } = req.body as { entries: { phone: string; reason?: string }[]; reason?: string };
  if (!Array.isArray(entries) || entries.length === 0) {
    res.status(400).json({ error: 'Array of entries with phone property is required.' });
    return;
  }
  const user = (req as any).user;
  const result = bulkAddToSuppressionList(
    entries.map(e => ({ phone: e.phone, reason: e.reason || reason || 'Bulk DNC Import' })),
    'dashboard_import',
    user.username
  );
  res.json({ success: true, addedCount: result.added, skippedCount: result.skipped });
});

// DELETE /api/suppression-list/:id — remove from DNC
app.delete('/api/suppression-list/:id', requireAuth, (req, res) => {
  const user = (req as any).user;
  removeFromSuppressionList(req.params.id, user.username);
  res.json({ success: true });
});

// POST /api/emergency-stop — halt all dialing immediately
app.post('/api/emergency-stop', requireAuth, (req, res) => {
  const user = (req as any).user;
  triggerEmergencyStop();
  writeAuditLog('EMERGENCY_STOP', 'global', 'all', user.username, 'Dashboard triggered emergency stop');
  // Broadcast hangup to ALL connected sockets
  io.emit('phone:hangup');
  io.emit('campaign:emergency_stopped', { stoppedBy: user.username, timestamp: new Date().toISOString() });
  console.warn(`[EmergencyStop] Triggered by ${user.username}`);
  res.json({ success: true, message: 'Emergency stop activated. All dialing halted.' });
});

// POST /api/emergency-stop/clear — re-enable dialing after emergency stop
app.post('/api/emergency-stop/clear', requireAuth, (req, res) => {
  const user = (req as any).user;
  clearEmergencyStop();
  writeAuditLog('EMERGENCY_STOP_CLEAR', 'global', 'all', user.username, 'Emergency stop cleared');
  io.emit('campaign:emergency_cleared', { clearedBy: user.username });
  res.json({ success: true, message: 'Emergency stop cleared. Dialing re-enabled.' });
});

// GET /api/safety-status — current safety controller state
app.get('/api/safety-status', requireAuth, (req, res) => {
  res.json({
    emergencyStopped: isEmergencyStopped(),
    timestamp: new Date().toISOString()
  });
});

// GET /api/commands — active in-flight commands
app.get('/api/commands', requireAuth, (req, res) => {
  res.json(getActiveCommands());
});

// GET /api/leads/locked — list all currently locked leads
app.get('/api/leads/locked', requireAuth, (req, res) => {
  res.json(getLockedLeads());
});

// GET /api/devices — list all registered devices and status for current tenant
app.get('/api/devices', requireAuth, (req, res) => {
  const user = (req as any).user;
  const tenantId = user.tenantId;
  const devices = db.prepare(`SELECT * FROM devices WHERE tenantId = ? ORDER BY lastSeenAt DESC`).all(tenantId);
  res.json(devices);
});

// GET /api/audit-logs — view system audit logs
app.get('/api/audit-logs', requireAuth, (req, res) => {
  const logs = db.prepare(`SELECT * FROM audit_logs ORDER BY timestamp DESC LIMIT 200`).all();
  res.json(logs);
});

// POST /api/leads/:id/unlock — manually unlock a lead
app.post('/api/leads/:id/unlock', requireAuth, (req, res) => {
  releaseLeadLock(req.params.id);
  res.json({ success: true, message: `Lead ${req.params.id} unlocked.` });
});

// REST: Server Info (public — mobile app needs this without auth)
app.get('/info', (req, res) => {
  res.json({
    laptopName: os.hostname() || 'Laptop Console',
    localIP: getLocalIP(),
    port: PORT,
  });
});

// REST: Campaigns (protected)
app.get('/campaigns', requireAuth, (req, res) => {
  const user = (req as any).user;
  res.json(getCampaigns(user.tenantId));
});

// REST: Get leads for a campaign (protected)
app.get('/campaigns/:id/leads', requireAuth, (req, res) => {
  const user = (req as any).user;
  res.json(getLeads(req.params.id, user.tenantId));
});

// REST: Public fallback for leads (mobile pairing only)
app.get('/api/campaigns/:id/leads', (req, res) => {
  // Mobile fallback scoped to default tenant if unauthenticated
  res.json(getLeads(req.params.id, 'tenant_default'));
});

// GET /api/campaigns/mobile — protected endpoint for mobile dashboard
app.get('/api/campaigns/mobile', requireAuth, (req, res) => {
  const user = (req as any).user;
  res.json(getCampaigns(user.tenantId));
});

// REST: Delete single lead (protected)
app.delete('/api/leads/:id', requireAuth, (req, res) => {
  const user = (req as any).user;
  const success = deleteLead(req.params.id, user.tenantId);
  if (success) {
    io.to(`tenant:${user.tenantId}`).emit('leads:updated');
    io.emit('leads:updated');
    res.json({ success: true, message: `Lead ${req.params.id} deleted.` });
  } else {
    res.status(404).json({ error: 'Lead not found.' });
  }
});

// REST: Delete single lead shortcut without /api prefix
app.delete('/leads/:id', requireAuth, (req, res) => {
  const user = (req as any).user;
  const success = deleteLead(req.params.id, user.tenantId);
  if (success) {
    io.to(`tenant:${user.tenantId}`).emit('leads:updated');
    io.emit('leads:updated');
    res.json({ success: true, message: `Lead ${req.params.id} deleted.` });
  } else {
    res.status(404).json({ error: 'Lead not found.' });
  }
});

// REST: Purge all fake/sample leads across queue (protected)
app.post('/api/leads/purge-fake', requireAuth, (req, res) => {
  const user = (req as any).user;
  const count = clearFakeQueueLeads(user.tenantId);
  io.to(`tenant:${user.tenantId}`).emit('leads:updated');
  io.emit('leads:updated');
  res.json({ success: true, count, message: `Removed ${count} fake/sample leads.` });
});

// REST: Clear all leads in a campaign (protected)
app.delete('/campaigns/:id/leads', requireAuth, (req, res) => {
  const user = (req as any).user;
  const count = clearAllLeadsInCampaign(req.params.id, user.tenantId);
  io.to(`tenant:${user.tenantId}`).emit('leads:updated');
  io.emit('leads:updated');
  res.json({ success: true, count, message: `Cleared ${count} leads in campaign ${req.params.id}.` });
});

// REST: Call logs history (protected — for dashboard)
app.get('/logs', requireAuth, (req, res) => {
  const user = (req as any).user;
  res.json(getLogs(user.tenantId));
});

// REST: Call logs — mobile endpoint (auth required — Bearer token or socket session)
app.get('/api/logs/mobile', (req, res) => {
  const authHeader = req.headers.authorization || '';
  const token = authHeader.replace(/^Bearer\s+/i, '').trim();

  if (!token) {
    return res.status(401).json({ error: 'Missing authorization token' });
  }

  const user = validateToken(token);
  if (!user) {
    return res.status(401).json({ error: 'Invalid or expired authorization token' });
  }

  const logs = getLogs(user.tenantId);
  res.json(logs.slice(0, 100));
});

// ═══════════════════════════════════════════════════════════════════════════
// PHASE E: CRM & LEAD INTELLIGENCE ROUTES (Gated by 'crm' module permission)
// ═══════════════════════════════════════════════════════════════════════════

// GET /api/crm/follow-ups — list follow-ups for tenant
app.get('/api/crm/follow-ups', requireAuth, requireModule('crm'), (req, res) => {
  try {
    const user = (req as any).user;
    const status = req.query.status as string;
    const followUps = getFollowUps(user.tenantId, { status });
    res.json({ followUps });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/crm/follow-ups — schedule a new follow-up
app.post('/api/crm/follow-ups', requireAuth, requireModule('crm'), (req, res) => {
  try {
    const user = (req as any).user;
    const { leadId, leadName, leadPhone, campaignId, campaignName, scheduledAt, notes, assignedAgent } = req.body;

    if (!leadId || !scheduledAt) {
      res.status(400).json({ error: 'leadId and scheduledAt are required.' });
      return;
    }

    const followUp = createFollowUp({
      leadId,
      leadName,
      leadPhone,
      campaignId,
      campaignName,
      tenantId: user.tenantId,
      userId: user.id,
      assignedAgent: assignedAgent || user.username,
      scheduledAt,
      notes
    });

    recordLeadActivity({
      leadId,
      tenantId: user.tenantId,
      userId: user.id,
      username: user.username,
      eventType: 'FOLLOW_UP_SCHEDULED',
      description: `Follow-up scheduled for ${new Date(scheduledAt).toLocaleString()}${notes ? `: ${notes}` : ''}`,
      metadata: { scheduledAt, notes }
    });

    res.status(201).json({ success: true, followUp });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/crm/follow-ups/:id/status — update follow-up status
app.patch('/api/crm/follow-ups/:id/status', requireAuth, requireModule('crm'), (req, res) => {
  try {
    const user = (req as any).user;
    const { id } = req.params;
    const { status, notes } = req.body;

    if (!status || !['pending', 'completed', 'cancelled', 'rescheduled'].includes(status)) {
      res.status(400).json({ error: 'Valid status (pending, completed, cancelled, rescheduled) required.' });
      return;
    }

    const updated = updateFollowUpStatus(id, user.tenantId, status, notes);
    if (!updated) {
      res.status(404).json({ error: 'Follow-up not found.' });
      return;
    }

    res.json({ success: true, message: `Follow-up updated to ${status}.` });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/crm/leads/:id/timeline — get lead activity timeline
app.get('/api/crm/leads/:id/timeline', requireAuth, requireModule('crm'), (req, res) => {
  try {
    const user = (req as any).user;
    const { id } = req.params;
    const activities = getLeadActivities(id, user.tenantId);
    res.json({ activities });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/crm/leads/:id/notes — log a note/activity for lead
app.post('/api/crm/leads/:id/notes', requireAuth, requireModule('crm'), (req, res) => {
  try {
    const user = (req as any).user;
    const { id } = req.params;
    const { note } = req.body;

    if (!note || !note.trim()) {
      res.status(400).json({ error: 'Note text required.' });
      return;
    }

    recordLeadActivity({
      leadId: id,
      tenantId: user.tenantId,
      userId: user.id,
      username: user.username,
      eventType: 'NOTE_ADDED',
      description: note.trim()
    });

    res.status(201).json({ success: true, message: 'Note recorded in timeline.' });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/crm/leads/:id/profile — full lead profile with timeline & history
app.get('/api/crm/leads/:id/profile', requireAuth, requireModule('crm'), (req, res) => {
  try {
    const user = (req as any).user;
    const { id } = req.params;

    // Search in leads table
    let lead = db.prepare('SELECT * FROM leads WHERE id = ? AND tenantId = ?').get(id, user.tenantId) as any;
    if (!lead) {
      // Search in scraped_leads
      lead = db.prepare('SELECT * FROM scraped_leads WHERE id = ? AND tenantId = ?').get(id, user.tenantId) as any;
    }

    if (!lead) {
      res.status(404).json({ error: 'Lead not found in your organization.' });
      return;
    }

    const activities = getLeadActivities(id, user.tenantId);
    const callLogs = db.prepare('SELECT * FROM call_logs WHERE leadId = ? AND tenantId = ? ORDER BY timestamp DESC').all(id, user.tenantId) as any[];
    const followUps = db.prepare('SELECT * FROM crm_follow_ups WHERE leadId = ? AND tenantId = ? ORDER BY scheduledAt ASC').all(id, user.tenantId) as any[];

    res.json({
      lead,
      activities,
      callLogs,
      followUps
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/crm/campaigns/:id/workspace — detailed campaign metrics
app.get('/api/crm/campaigns/:id/workspace', requireAuth, requireModule('crm'), (req, res) => {
  try {
    const user = (req as any).user;
    const { id } = req.params;

    const campaign = db.prepare('SELECT * FROM campaigns WHERE id = ? AND tenantId = ?').get(id, user.tenantId) as any;
    if (!campaign) {
      res.status(404).json({ error: 'Campaign not found in your organization.' });
      return;
    }

    const leads = db.prepare('SELECT * FROM leads WHERE campaignId = ? AND tenantId = ?').all(id, user.tenantId) as any[];
    const totalLeads = leads.length;
    const completedLeads = leads.filter(l => l.status === 'COMPLETED').length;
    const pendingLeads = leads.filter(l => l.status === 'PENDING').length;
    const callingLeads = leads.filter(l => l.status === 'CALLING').length;
    const answeredLeads = leads.filter(l => (l.outcome || '').toUpperCase() === 'ANSWERED').length;
    const noAnswerLeads = leads.filter(l => (l.outcome || '').toUpperCase() === 'NO_ANSWER').length;
    const voicemailLeads = leads.filter(l => (l.outcome || '').toUpperCase() === 'VOICEMAIL').length;

    res.json({
      campaign,
      stats: {
        totalLeads,
        completedLeads,
        pendingLeads,
        callingLeads,
        answeredLeads,
        noAnswerLeads,
        voicemailLeads,
        answerRate: completedLeads > 0 ? ((answeredLeads / completedLeads) * 100).toFixed(1) : '0.0'
      },
      leads: leads.slice(0, 100)
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// REST: Scan sibling scraper folders (Feature-Gated)
app.get('/api/scraper-files', requireAuth, requireFeature('googleScraper'), (req, res) => {
  const list: { name: string; path: string; sizeBytes: number; lastModified: string }[] = [];
  for (const folder of SCRAPER_PATHS) {
    if (fs.existsSync(folder)) {
      try {
        const files = fs.readdirSync(folder);
        for (const file of files) {
          if (file.endsWith('.xlsx') || file.endsWith('.xls') || file.endsWith('.csv')) {
            const filePath = path.join(folder, file);
            const stats = fs.statSync(filePath);
            list.push({
              name: file,
              path: filePath,
              sizeBytes: stats.size,
              lastModified: stats.mtime.toISOString()
            });
          }
        }
      } catch (err) {
        console.error(`Error scanning folder ${folder}:`, err);
      }
    }
  }
  res.json(list);
});

// REST: Import leads from scraped file (Feature-Gated)
app.post('/api/scraper-files/import', requireAuth, requireFeature('googleScraper'), async (req, res) => {
  try {
    const { filePath, campaignName } = req.body as { filePath: string; campaignName?: string };
    if (!filePath || !fs.existsSync(filePath)) {
      res.status(404).json({ error: 'File not found on system.' });
      return;
    }

    const fileName = path.basename(filePath);
    const rawName = fileName.replace(/\.[^.]+$/, '').trim();
    const finalCampaignName = campaignName || rawName || 'Imported Scraper List';

    const leads: { name: string; phone: string }[] = [];

    if (filePath.endsWith('.xlsx') || filePath.endsWith('.xls')) {
      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.readFile(filePath);
      const worksheet = workbook.getWorksheet('Doctors') || workbook.worksheets[0];
      
      if (!worksheet) {
        res.status(400).json({ error: 'Sheet is empty or invalid.' });
        return;
      }

      let nameColIndex = -1;
      let phoneColIndex = -1;

      const headerRow = worksheet.getRow(1);
      headerRow.eachCell((cell, colNumber) => {
        const val = cell.text.toLowerCase().trim();
        if (val.includes('name') || val.includes('clinic') || val.includes('doctor')) {
          nameColIndex = colNumber;
        } else if (val.includes('phone') || val.includes('number') || val.includes('contact')) {
          phoneColIndex = colNumber;
        }
      });

      if (nameColIndex === -1) nameColIndex = 2; // column 2 default
      if (phoneColIndex === -1) phoneColIndex = 4; // column 4 default

      worksheet.eachRow((row, rowNumber) => {
        if (rowNumber === 1) return; // skip header
        const nameVal = row.getCell(nameColIndex).text.trim();
        const phoneVal = row.getCell(phoneColIndex).text.trim();
        
        if (phoneVal && phoneVal !== 'N/A') {
          leads.push({
            name: nameVal || 'Unnamed Scraped Entry',
            phone: phoneVal
          });
        }
      });

    } else if (filePath.endsWith('.csv')) {
      const content = fs.readFileSync(filePath, 'utf-8');
      const lines = content.split('\n');
      for (let i = 0; i < lines.length; i++) {
        if (i === 0) continue;
        const parts = lines[i].split(',');
        if (parts.length >= 2) {
          const name = parts[0].trim().replace(/^["']|["']$/g, '');
          const phone = parts[1].trim().replace(/^["']|["']$/g, '');
          if (phone) {
            leads.push({ name, phone });
          }
        }
      }
    }

    if (leads.length === 0) {
      res.status(400).json({ error: 'No valid phone numbers extracted from file.' });
      return;
    }

    const user = (req as any).user;
    const result = createCampaign(finalCampaignName, fileName, leads, user.tenantId);
    res.json({
      success: true,
      campaignId: result.campaign.id,
      count: result.finalCount,
      name: result.campaign.name,
      totalRaw: result.totalRaw,
      dedupedCount: result.dedupedCount,
      dncSkippedCount: result.dncSkippedCount
    });

  } catch (err: any) {
    console.error('Import error:', err);
    res.status(500).json({ error: err.message });
  }
});

let activeScrapeProcess: any = null;
let activeScrapeTask = {
  status: 'idle',
  keyword: '',
  location: '',
  logs: [] as string[]
};

// REST: Run Scraper (Feature-Gated)
app.post('/api/scraper/run', requireAuth, requireFeature('googleScraper'), (req, res) => {
  if (activeScrapeTask.status === 'running') {
    res.status(400).json({ error: 'A scraper job is already running.' });
    return;
  }

  const { keyword, location, requirePhone, requireEmail } = req.body as {
    keyword: string;
    location: string;
    requirePhone: boolean;
    requireEmail: boolean;
  };

  if (!keyword) {
    res.status(400).json({ error: 'Keyword is required.' });
    return;
  }

  activeScrapeTask = {
    status: 'running',
    keyword,
    location: location || 'all',
    logs: ['🚀 Starting Google Maps Scraper Pro in background...']
  };

  const targetDir = SCRAPER_PATHS[0];

  const args = [
    'scraper.js',
    '--industry', keyword,
    '--country', location || 'all',
    '--workers', '2',
    '--headless'
  ];

  if (requirePhone) args.push('--require-phone');
  if (requireEmail) args.push('--require-email');

  console.log(`[Scraper] Launching: node ${args.join(' ')} in ${targetDir}`);

  try {
    activeScrapeProcess = spawn('node', args, {
      cwd: targetDir,
      shell: true
    });

    activeScrapeProcess.stdout.on('data', (data: Buffer) => {
      const text = data.toString('utf8').trim();
      if (text) {
        const lines = text.split('\n').map(l => l.replace(/\r/g, '').trim()).filter(Boolean);
        for (const line of lines) {
          activeScrapeTask.logs.push(line);
        }
        if (activeScrapeTask.logs.length > 300) {
          activeScrapeTask.logs = activeScrapeTask.logs.slice(-300);
        }
      }
    });

    activeScrapeProcess.stderr.on('data', (data: Buffer) => {
      const text = data.toString('utf8').trim();
      if (text) {
        activeScrapeTask.logs.push(`⚠️ ${text}`);
      }
    });

    activeScrapeProcess.on('close', (code: number) => {
      console.log(`[Scraper] Finished with exit code ${code}`);
      activeScrapeTask.status = code === 0 ? 'completed' : 'failed';
      activeScrapeTask.logs.push(code === 0 ? '✅ Scraper finished successfully!' : `❌ Scraper failed with exit code ${code}`);
      activeScrapeProcess = null;
    });

  } catch (err: any) {
    console.error('[Scraper] Spawn error:', err);
    activeScrapeTask.status = 'failed';
    activeScrapeTask.logs.push(`❌ Spawn error: ${err.message}`);
    activeScrapeProcess = null;
  }

  res.json({ success: true, message: 'Scraper started successfully.' });
});

// REST: Scraper Status (Feature-Gated)
app.get('/api/scraper/status', requireAuth, requireFeature('googleScraper'), (req, res) => {
  res.json(activeScrapeTask);
});

// REST: Stop Scraper (Feature-Gated)
app.post('/api/scraper/stop', requireAuth, requireFeature('googleScraper'), (req, res) => {
  if (activeScrapeProcess) {
    activeScrapeProcess.kill('SIGINT');
    activeScrapeTask.status = 'failed';
    activeScrapeTask.logs.push('🛑 Scraper stopped by user request.');
    activeScrapeProcess = null;
    res.json({ success: true, message: 'Scraper task killed.' });
  } else {
    res.status(400).json({ error: 'No active scraper task is running.' });
  }
});

// ─── Facebook Scraper & Poster Variables ──────────────────────────
let activeFbScrapeProcess: any = null;
let activeFbScrapeTask = {
  status: 'idle',
  keyword: '',
  location: '',
  account: '',
  maxLeads: 200,
  logs: [] as string[]
};

let activeFbPosterProcess: any = null;
let activeFbPosterTask = {
  status: 'idle',
  mode: 'share',
  account: '',
  logs: [] as string[]
};

const FB_PROFILES_DIR = path.join(__dirname, '../fb_profiles');
const FB_DATA_DIR = path.join(__dirname, '../data');
const FB_ACCOUNTS_FILE = path.join(FB_DATA_DIR, 'fb_accounts.json');
const FB_CONFIG_FILE = path.join(FB_DATA_DIR, 'fb_config.json');
const FB_JOIN_CONFIG_FILE = path.join(FB_DATA_DIR, 'fb_join_config.json');
const FB_GROUPS_FILE = path.join(FB_DATA_DIR, 'fb_groups.json');
const FB_ACTIVITY_FILE = path.join(FB_DATA_DIR, 'fb_activity_log.json');
const FB_LEADS_DIR = path.join(FB_DATA_DIR, 'facebook_leads');

// Ensure directories exist
if (!fs.existsSync(FB_PROFILES_DIR)) fs.mkdirSync(FB_PROFILES_DIR, { recursive: true });
if (!fs.existsSync(FB_DATA_DIR)) fs.mkdirSync(FB_DATA_DIR, { recursive: true });
if (!fs.existsSync(FB_LEADS_DIR)) fs.mkdirSync(FB_LEADS_DIR, { recursive: true });

function readFbJson(filePath: string, defaultVal: any = []) {
  if (!fs.existsSync(filePath)) return defaultVal;
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (_) {
    return defaultVal;
  }
}

function writeFbJson(filePath: string, data: any) {
  try {
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
  } catch (_) {}
}

// REST: Facebook Scraper endpoints (Feature-Gated)
app.post('/api/facebook-scraper/run', requireAuth, requireFeature('facebookScraper'), (req, res) => {
  if (activeFbScrapeTask.status === 'running') {
    res.status(400).json({ error: 'Facebook Scraper is already running.' });
    return;
  }

  const { keyword, location, account, maxLeads } = req.body as {
    keyword: string;
    location: string;
    account: string;
    maxLeads: number;
  };

  if (!keyword) {
    res.status(400).json({ error: 'Keyword is required.' });
    return;
  }
  if (!account) {
    res.status(400).json({ error: 'Facebook account is required.' });
    return;
  }

  activeFbScrapeTask = {
    status: 'running',
    keyword,
    location: location || '',
    account,
    maxLeads: maxLeads || 200,
    logs: ['🚀 Starting Facebook Lead Scraper...']
  };

  let scriptPath = path.join(__dirname, 'facebook_modules', 'facebook_scraper.js');
  if (!fs.existsSync(scriptPath)) {
    scriptPath = path.join(__dirname, '../src/facebook_modules', 'facebook_scraper.js');
  }
  const args = [
    scriptPath,
    '--keyword', keyword,
    '--country', location || '',
    '--profile', account,
    '--max-leads', String(maxLeads || 200)
  ];

  try {
    activeFbScrapeProcess = spawn('node', args, {
      cwd: path.dirname(scriptPath),
      shell: true
    });

    activeFbScrapeProcess.stdout.on('data', (data: Buffer) => {
      const text = data.toString('utf8').trim();
      if (text) {
        const lines = text.split('\n').map(l => l.replace(/\r/g, '').trim()).filter(Boolean);
        for (const line of lines) {
          activeFbScrapeTask.logs.push(line);
        }
        if (activeFbScrapeTask.logs.length > 300) {
          activeFbScrapeTask.logs = activeFbScrapeTask.logs.slice(-300);
        }
      }
    });

    activeFbScrapeProcess.stderr.on('data', (data: Buffer) => {
      const text = data.toString('utf8').trim();
      if (text) {
        activeFbScrapeTask.logs.push(`⚠️ ${text}`);
      }
    });

    activeFbScrapeProcess.on('close', (code: number) => {
      console.log(`[FB Scraper] Finished with exit status ${code}`);
      activeFbScrapeTask.status = code === 0 ? 'completed' : 'failed';
      activeFbScrapeTask.logs.push(code === 0 ? '✅ Facebook Scraper finished successfully!' : `❌ Facebook Scraper failed with exit code ${code}`);
      activeFbScrapeProcess = null;
    });

  } catch (err: any) {
    console.error('[FB Scraper] Spawn error:', err);
    activeFbScrapeTask.status = 'failed';
    activeFbScrapeTask.logs.push(`❌ Spawn error: ${err.message}`);
    activeFbScrapeProcess = null;
  }

  res.json({ success: true, message: 'Facebook Scraper started.' });
});

app.get('/api/facebook-scraper/status', requireAuth, requireFeature('facebookScraper'), (req, res) => {
  let leads = [];
  const currentLeadsFile = path.join(FB_LEADS_DIR, 'current_leads.json');
  if (fs.existsSync(currentLeadsFile)) {
    try {
      leads = JSON.parse(fs.readFileSync(currentLeadsFile, 'utf8'));
    } catch (_) {}
  }
  res.json({
    ...activeFbScrapeTask,
    leads
  });
});

app.post('/api/facebook-scraper/stop', requireAuth, requireFeature('facebookScraper'), (req, res) => {
  if (activeFbScrapeProcess) {
    activeFbScrapeProcess.kill('SIGINT');
    activeFbScrapeTask.status = 'failed';
    activeFbScrapeTask.logs.push('🛑 Scraper stopped by user request.');
    activeFbScrapeProcess = null;
    res.json({ success: true, message: 'Facebook Scraper stopped.' });
  } else {
    res.status(400).json({ error: 'Facebook Scraper is not running.' });
  }
});

app.get('/api/facebook-scraper/download', requireAuth, requireFeature('facebookScraper'), (req, res) => {
  const format = req.query.format as string || 'csv';
  
  if (!fs.existsSync(FB_LEADS_DIR)) {
    res.status(404).json({ error: 'No reports generated yet' });
    return;
  }

  const files = fs.readdirSync(FB_LEADS_DIR)
    .filter(f => f.endsWith('.' + format))
    .map(f => ({ name: f, path: path.join(FB_LEADS_DIR, f), stat: fs.statSync(path.join(FB_LEADS_DIR, f)) }))
    .sort((a, b) => b.stat.mtime.getTime() - a.stat.mtime.getTime());

  if (files.length === 0) {
    res.status(404).json({ error: `No ${format.toUpperCase()} reports found.` });
    return;
  }

  const targetPath = files[0].path;
  const filename = files[0].name;

  let contentType = 'text/csv';
  if (format === 'xlsx') {
    contentType = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
  }

  res.setHeader('Content-Type', contentType);
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  fs.createReadStream(targetPath).pipe(res);
});

// REST: Facebook Poster endpoints (Feature-Gated)
app.get('/api/facebook-poster/accounts', requireAuth, requireFeature('facebookPoster'), (req, res) => {
  const profiles = fs.readdirSync(FB_PROFILES_DIR)
    .filter(f => f.startsWith('fb_profile_') && fs.statSync(path.join(FB_PROFILES_DIR, f)).isDirectory())
    .sort();
  
  const accountsData = readFbJson(FB_ACCOUNTS_FILE, []);
  
  const list = profiles.map(p => {
    const details = accountsData.find((a: any) => a.profileId === p) || {};
    return {
      profileId: p,
      name: details.name || `Facebook Account (${p.replace('fb_profile_', '')})`,
      note: details.note || '',
      status: details.status || 'unknown',
      lastChecked: details.lastChecked || null
    };
  });
  
  res.json(list);
});

app.post('/api/facebook-poster/accounts/add', requireAuth, requireFeature('facebookPoster'), async (req, res) => {
  const { profileId, cookiesStr, note, name } = req.body as { profileId: string; cookiesStr: string; note?: string; name?: string };

  if (!profileId || !cookiesStr) {
    res.status(400).json({ error: 'profileId and cookiesStr are required.' });
    return;
  }

  if (!/^fb_profile_\d+$/.test(profileId)) {
    res.status(400).json({ error: 'Invalid profileId format. Use fb_profile_1, fb_profile_2, etc.' });
    return;
  }

  let cookies;
  try {
    cookies = JSON.parse(cookiesStr);
  } catch (_) {
    res.status(400).json({ error: 'Invalid cookies format. Paste a valid cookie array JSON.' });
    return;
  }

  const targetDir = path.join(FB_PROFILES_DIR, profileId);
  if (!fs.existsSync(targetDir)) fs.mkdirSync(targetDir, { recursive: true });

  let accountsData = readFbJson(FB_ACCOUNTS_FILE, []);
  const index = accountsData.findIndex((a: any) => a.profileId === profileId);
  
  const accountInfo = {
    profileId,
    name: name || `Facebook Account (${profileId.replace('fb_profile_', '')})`,
    note: note || '',
    status: 'checking',
    lastChecked: new Date().toISOString()
  };

  if (index !== -1) accountsData[index] = accountInfo;
  else accountsData.push(accountInfo);

  writeFbJson(FB_ACCOUNTS_FILE, accountsData);

  // Authenticate context using Playwright
  let context;
  try {
    context = await chromium.launchPersistentContext(targetDir, {
      headless: true,
      args: ['--no-sandbox', '--disable-blink-features=AutomationControlled']
    });
    const normCookies = cookies.map((c: any) => ({
      ...c,
      domain: c.domain || '.facebook.com',
      path: c.path || '/',
      sameSite: c.sameSite || 'Lax',
    }));
    await context.addCookies(normCookies);
    const page = await context.newPage();
    await page.goto('https://www.facebook.com', { waitUntil: 'domcontentloaded', timeout: 20000 });
    await new Promise(r => setTimeout(r, 3000));
    const loggedIn = !page.url().includes('/login');
    
    accountInfo.status = loggedIn ? 'valid' : 'expired';
    writeFbJson(FB_ACCOUNTS_FILE, accountsData);

    await context.close();
    res.json({ success: true, loggedIn, message: loggedIn ? 'Session added & verified!' : 'Session verification failed.' });
  } catch (err: any) {
    if (context) await context.close().catch(() => {});
    accountInfo.status = 'error';
    writeFbJson(FB_ACCOUNTS_FILE, accountsData);
    res.status(500).json({ error: `Verification failed: ${err.message}` });
  }
});

app.post('/api/facebook-poster/accounts/delete', requireAuth, requireFeature('facebookPoster'), (req, res) => {
  const { profileId } = req.body as { profileId: string };
  if (!profileId) {
    res.status(400).json({ error: 'profileId is required.' });
    return;
  }

  const targetDir = path.join(FB_PROFILES_DIR, profileId);
  if (fs.existsSync(targetDir)) {
    try {
      fs.rmSync(targetDir, { recursive: true, force: true });
    } catch (_) {}
  }

  let accountsData = readFbJson(FB_ACCOUNTS_FILE, []);
  accountsData = accountsData.filter((a: any) => a.profileId !== profileId);
  writeFbJson(FB_ACCOUNTS_FILE, accountsData);

  res.json({ success: true, message: 'Account deleted successfully.' });
});

app.get('/api/facebook-poster/config', requireAuth, requireFeature('facebookPoster'), (req, res) => {
  res.json(readFbJson(FB_CONFIG_FILE, { postUrls: [], caption: '' }));
});

app.post('/api/facebook-poster/config', requireAuth, requireFeature('facebookPoster'), (req, res) => {
  const { postUrls, caption } = req.body as { postUrls: string[]; caption: string };
  writeFbJson(FB_CONFIG_FILE, { postUrls: postUrls || [], caption: caption || '' });
  res.json({ success: true, message: 'Campaign configuration saved.' });
});

app.get('/api/facebook-poster/join-config', requireAuth, requireFeature('facebookPoster'), (req, res) => {
  res.json(readFbJson(FB_JOIN_CONFIG_FILE, { keywords: [], joinsPerSession: 5 }));
});

app.post('/api/facebook-poster/join-config', requireAuth, requireFeature('facebookPoster'), (req, res) => {
  const { keywords, joinsPerSession } = req.body as { keywords: string[]; joinsPerSession: number };
  writeFbJson(FB_JOIN_CONFIG_FILE, { keywords: keywords || [], joinsPerSession: joinsPerSession || 5 });
  res.json({ success: true, message: 'Auto Joiner configuration saved.' });
});

app.get('/api/facebook-poster/groups', requireAuth, requireFeature('facebookPoster'), (req, res) => {
  res.json(readFbJson(FB_GROUPS_FILE, []));
});

app.get('/api/facebook-poster/activity-log', requireAuth, requireFeature('facebookPoster'), (req, res) => {
  res.json(readFbJson(FB_ACTIVITY_FILE, []));
});

app.get('/api/facebook-poster/status', requireAuth, requireFeature('facebookPoster'), (req, res) => {
  res.json(activeFbPosterTask);
});

app.post('/api/facebook-poster/toggle', requireAuth, requireFeature('facebookPoster'), (req, res) => {
  if (activeFbPosterTask.status === 'running') {
    if (activeFbPosterProcess) {
      activeFbPosterProcess.kill('SIGINT');
      activeFbPosterProcess = null;
    }
    activeFbPosterTask.status = 'stopped';
    activeFbPosterTask.logs.push('🛑 Bot stopped by user request.');
    res.json({ success: true, status: 'stopped' });
  } else {
    const { mode, account } = req.body as { mode: 'share' | 'join'; account: string };
    if (!account) {
      res.status(400).json({ error: 'Please select a Facebook account.' });
      return;
    }
    
    activeFbPosterTask = {
      status: 'running',
      mode: mode || 'share',
      account: account,
      logs: [`🚀 Starting Auto Poster Bot in ${mode.toUpperCase()} mode...`]
    };

    let scriptPath = path.join(__dirname, 'facebook_modules', 'facebook_poster.js');
    if (!fs.existsSync(scriptPath)) {
      scriptPath = path.join(__dirname, '../src/facebook_modules', 'facebook_poster.js');
    }
    const args = [
      scriptPath,
      '--mode', mode || 'share',
      '--profile', account
    ];

    try {
      activeFbPosterProcess = spawn('node', args, {
        cwd: path.dirname(scriptPath),
        shell: true
      });

      activeFbPosterProcess.stdout.on('data', (data: Buffer) => {
        const text = data.toString('utf8').trim();
        if (text) {
          activeFbPosterTask.logs.push(text);
          if (activeFbPosterTask.logs.length > 200) activeFbPosterTask.logs = activeFbPosterTask.logs.slice(-200);
        }
      });

      activeFbPosterProcess.stderr.on('data', (data: Buffer) => {
        const text = data.toString('utf8').trim();
        if (text) activeFbPosterTask.logs.push(`⚠️ ${text}`);
      });

      activeFbPosterProcess.on('close', (code: number) => {
        activeFbPosterTask.status = 'stopped';
        activeFbPosterTask.logs.push(`✅ Bot stopped. Exit status: ${code}`);
        activeFbPosterProcess = null;
      });

    } catch (err: any) {
      activeFbPosterTask.status = 'stopped';
      activeFbPosterTask.logs.push(`❌ Failed to start bot: ${err.message}`);
      activeFbPosterProcess = null;
    }

    res.json({ success: true, status: 'running' });
  }
});

// REST: App Version & OTA Update Check with SHA-256 integrity verification
app.get('/api/app-version', (req, res) => {
  const localIP = getLocalIP();
  const apkPath = path.join(
    __dirname,
    '../../mobile/build/app/outputs/flutter-apk/app-debug.apk'
  );

  let sha256Hash = '';
  if (fs.existsSync(apkPath)) {
    try {
      const fileBuffer = fs.readFileSync(apkPath);
      sha256Hash = crypto.createHash('sha256').update(fileBuffer).digest('hex');

      // Record version & hash in ota_versions table
      db.prepare(`
        INSERT INTO ota_versions (id, version, buildNumber, apkHash, signature, releaseNotes, isActive)
        VALUES (@id, '1.4.0', 4, @hash, 'OCTAL_KEY_SIG_V1', 'Production Foundation build with SQLite, Auth, Safety Gate, Command IDs, DNC, and Heartbeat.', 1)
        ON CONFLICT(version) DO UPDATE SET
          apkHash = @hash,
          uploadedAt = datetime('now')
      `).run({
        id: 'ota_v1.4.0',
        hash: sha256Hash
      });
    } catch (err) {
      console.error('[OTA] Error computing hash:', err);
    }
  }

  res.json({
    version: '1.4.0',
    buildNumber: 4,
    apkUrl: `http://${localIP}:3000/download/apk`,
    sha256Hash,
    signature: 'OCTAL_KEY_SIG_V1',
    forceUpdate: false,
    releaseNotes: 'Production Foundation build with SQLite, Auth, Safety Gate, Command IDs, DNC, and Heartbeat.'
  });
});

// REST: Universal QR Code Join Endpoint (for third-party phone camera & QR scanner apps)
app.get('/join', (req, res) => {
  const { sessionId, token, serverUrl, laptop } = req.query;

  // Sanitize inputs to prevent XSS
  const escape = (s: string) => String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;');

  const safeSessionId = escape(String(sessionId || ''));
  const safeToken = escape(String(token || ''));
  const safeServerUrl = escape(String(serverUrl || ''));
  const safeLaptop = escape(String(laptop || ''));

  const deepLink = 'octaldialer://join?sessionId=' + encodeURIComponent(safeSessionId) +
                   '&token=' + encodeURIComponent(safeToken) +
                   '&serverUrl=' + encodeURIComponent(safeServerUrl) +
                   '&laptop=' + encodeURIComponent(safeLaptop);

  const html = `<!DOCTYPE html><html><head><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>Octal Dialer</title><script>setTimeout(function(){ window.location.href = "${escape(deepLink)}"; }, 300);</script></head><body style="background:#0f172a;color:#fff;text-align:center;padding:40px;"><div style="background:#1e293b;padding:32px;border-radius:20px;max-width:380px;margin:0 auto;"><h2 style="color:#f59e0b;">Octal Dialer Bridge</h2><p>Opening Octal Dialer App...</p><a href="${escape(deepLink)}" style="background:#f59e0b;color:#0f172a;font-weight:bold;padding:14px 28px;border-radius:14px;text-decoration:none;display:inline-block;">Open App Now</a></div></body></html>`;
  res.send(html);
});

// REST: Serve Mobile APK file download
const serveApkHandler = (_req: express.Request, res: express.Response): void => {
  const possiblePaths = [
    path.join(__dirname, '../data/OctalDialer.apk'),
    path.join(__dirname, '../OctalDialer.apk'),
    path.join(__dirname, '../../OctalDialer.apk'),
    path.join(__dirname, '../public/OctalDialer.apk'),
    path.join(__dirname, '../../frontend/public/OctalDialer.apk'),
    path.join(__dirname, '../../application_octal_dialer/build/app/outputs/flutter-apk/app-debug.apk'),
    path.join(__dirname, '../../application_octal_dialer/build/app/outputs/flutter-apk/app-release.apk'),
    path.join(__dirname, '../../mobile/build/app/outputs/flutter-apk/app-release.apk'),
    path.join(__dirname, '../../mobile/build/app/outputs/flutter-apk/app-debug.apk')
  ];
  const apkPath = possiblePaths.find(p => fs.existsSync(p));
  if (apkPath) {
    res.setHeader('Content-Type', 'application/vnd.android.package-archive');
    res.download(apkPath, 'OctalDialer.apk', (err) => {
      if (err && !res.headersSent) {
        res.status(500).json({ error: 'Download stream interrupted.' });
      }
    });
  } else {
    res.status(404).json({ error: 'APK build file not found.' });
  }
};

app.get('/download/apk', serveApkHandler);
app.get('/api/download/apk', serveApkHandler);

// REST: Manual leads import (protected)
app.post('/api/leads/import', requireAuth, (req, res) => {
  try {
    const user = (req as any).user;
    const tenantId = user.tenantId;

    const { campaignName, fileName, leads } = req.body as {
      campaignName: string;
      fileName: string;
      leads: { name: string; phone: string }[];
    };

    if (!leads || !Array.isArray(leads) || leads.length === 0) {
      res.status(400).json({ error: 'No leads provided' });
      return;
    }

    const result = createCampaign(campaignName, fileName, leads, tenantId);
    res.json({
      success: true,
      campaignId: result.campaign.id,
      count: result.finalCount,
      name: result.campaign.name,
      totalRaw: result.totalRaw,
      dedupedCount: result.dedupedCount,
      dncSkippedCount: result.dncSkippedCount
    });
  } catch (err: any) {
    console.error('Manual import error:', err);
    res.status(500).json({ error: err.message });
  }
});

// REST: Manual leads import for mobile (no requireAuth)
app.post('/api/leads/import/mobile', (req, res) => {
  try {
    const { campaignName, fileName, leads } = req.body as {
      campaignName: string;
      fileName: string;
      leads: { name: string; phone: string }[];
    };

    if (!leads || !Array.isArray(leads) || leads.length === 0) {
      res.status(400).json({ error: 'No leads provided' });
      return;
    }

    const result = createCampaign(campaignName, fileName, leads, 'tenant_default');
    res.json({
      success: true,
      campaignId: result.campaign.id,
      count: result.finalCount,
      name: result.campaign.name,
      totalRaw: result.totalRaw,
      dedupedCount: result.dedupedCount,
      dncSkippedCount: result.dncSkippedCount
    });
  } catch (err: any) {
    console.error('Mobile manual import error:', err);
    res.status(500).json({ error: err.message });
  }
});

// REST: Update Log outcome / Disposition (protected)
app.post('/api/logs/update', requireAuth, (req, res) => {
  try {
    const user = (req as any).user;
    const tenantId = user.tenantId;
    const { leadId, outcome, notes } = req.body as { leadId: string; outcome: string; notes?: string };

    // Update call log with outcome scoped by tenantId
    db.prepare(`UPDATE call_logs SET outcome = @outcome WHERE leadId = @leadId AND tenantId = @tenantId`)
      .run({ outcome, leadId, tenantId });

    // Update lead status to COMPLETED scoped by tenantId
    db.prepare(`UPDATE leads SET status = 'COMPLETED', outcome = @outcome WHERE id = @leadId AND tenantId = @tenantId`)
      .run({ outcome, leadId, tenantId });

    io.to(`tenant:${tenantId}`).emit('leads:updated');
    io.emit('leads:updated');
    res.json({ success: true });
  } catch (err: any) {
    console.error('Disposition error:', err);
    res.status(500).json({ error: err.message });
  }
});

// REST: Export logs to CSV (protected)
app.get('/api/logs/export', requireAuth, (req, res) => {
  try {
    const user = (req as any).user;
    const tenantId = user.tenantId;
    const logs = getLogs(tenantId); // use SQLite directly scoped by tenantId

    const header = ['Time', 'Lead Name', 'Phone', 'Campaign', 'Outcome', 'Duration (s)'];
    const rows = logs.map(l => [
      new Date(l.timestamp).toLocaleString(),
      `"${(l.leadName || '').replace(/"/g, '""')}"`,
      `"${l.leadPhone}"`,
      `"${(l.campaignName || '').replace(/"/g, '""')}"`,
      l.outcome,
      l.duration
    ]);

    const csv = [header.join(','), ...rows.map(r => r.join(','))].join('\n');

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="octal_dialer_call_logs.csv"');
    res.send(csv);
  } catch (err: any) {
    console.error('CSV Export error:', err);
    res.status(500).json({ error: err.message });
  }
});

// WebSocket Event Handlers & Authentication Middleware
io.use((socket, next) => {
  try {
    const authHeader = (socket.handshake.headers?.authorization as string) || '';
    const token = (socket.handshake.auth?.token as string) || (authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '');
    if (token) {
      const user = validateToken(token);
      if (user) {
        (socket as any).user = user;
        socket.join(`tenant:${user.tenantId}`);
      }
    }
  } catch (err) {
    // Ignore error — unauthenticated sockets (like mobile pairing) continue
  }
  next();
});

io.on('connection', (socket) => {
  console.log(`[Socket] Connected: ${socket.id}`);

  socket.on('laptop:register', (data?: { previousSessionId?: string; tenantId?: string }) => {
    const tenantId = (socket as any).user?.tenantId || data?.tenantId || 'tenant_default';
    const session = reclaimOrCreateSession(socket.id, data?.previousSessionId, tenantId);
    socket.join(session.id);
    console.log(`[Socket] Laptop registered: ${session.id} | Tenant: ${session.tenantId} | Status: ${session.status}`);

    socket.emit('session:created', {
      sessionId: session.id,
      token: session.token,
      laptopName: session.laptopName,
      laptopBtAddress: session.laptopBtAddress,
      localIP: getLocalIP(),
      port: PORT,
      qrPayload: {
        sessionId: session.id,
        token: session.token,
        laptopName: session.laptopName,
        laptopBtAddress: session.laptopBtAddress,
        serverUrl: `http://${getLocalIP()}:${PORT}`
      }
    });

    if (session.phoneSocketId && session.phoneDeviceName) {
      socket.emit('phone:connected', { 
        deviceName: session.phoneDeviceName,
        phoneBtAddress: session.phoneBtAddress,
        phoneOsType: session.phoneOsType,
        phoneIpAddress: session.phoneIpAddress
      });
    }
  });

  socket.on('laptop:revoke-phone', ({ sessionId }: { sessionId: string }) => {
    const session = getSessionById(sessionId);
    if (!session) return;
    
    if (session.phoneSocketId) {
      const phoneSocket = io.sockets.sockets.get(session.phoneSocketId);
      if (phoneSocket) {
        phoneSocket.emit('phone:kicked', { reason: 'Revoked by dashboard.' });
        phoneSocket.leave(sessionId);
      }
    }

    const newToken = revokePhone(sessionId);
    socket.emit('session:refreshed', {
      token: newToken,
      qrPayload: {
        sessionId,
        token: newToken,
        laptopName: session.laptopName,
        laptopBtAddress: session.laptopBtAddress,
        serverUrl: `http://${getLocalIP()}:${PORT}`
      }
    });
  });

  socket.on('phone:join', (data: {
    token?: string;
    sessionId?: string;
    deviceName?: string;
    phoneBtAddress?: string;
    phoneOsType?: string;
    phoneIpAddress?: string;
  }, callback?: (response: { success: boolean; error?: string }) => void) => {
    const tokenOrSessionId = data.token || data.sessionId || '';
    const providedSessionId = data.sessionId || '';

    if (!tokenOrSessionId) {
      const response = { success: false, error: 'Token or sessionId required.' };
      if (typeof callback === 'function') callback(response);
      socket.emit('error', { code: 'MISSING_AUTH', message: 'Token or sessionId required.' });
      return;
    }

    const session = pairPhone(
      tokenOrSessionId,
      socket.id,
      data.deviceName || 'Mobile Client',
      data.phoneBtAddress || '48:D2:24:D3:5F:AA',
      data.phoneOsType || 'Android',
      data.phoneIpAddress || '127.0.0.1',
      providedSessionId
    );

    if (!session) {
      console.warn(`[Socket Pairing Warning] Phone failed to pair with key: ${tokenOrSessionId}`);
      const response = { success: false, error: 'Token is invalid or expired.' };
      if (typeof callback === 'function') callback(response);
      socket.emit('error', { code: 'INVALID_TOKEN', message: 'Token is invalid or expired.' });
      return;
    }

    if (providedSessionId && session.id !== providedSessionId) {
      console.warn(`[Socket Pairing Warning] SessionId mismatch: provided ${providedSessionId}, got ${session.id}`);
      const response = { success: false, error: 'Session ID mismatch.' };
      if (typeof callback === 'function') callback(response);
      socket.emit('error', { code: 'SESSION_MISMATCH', message: 'Session ID mismatch.' });
      return;
    }

    socket.join(session.id);
    console.log(`[Socket Success] Phone paired instantly to session: ${session.id} | Device: ${data.deviceName || 'Android'}`);

    const pairedPayload = {
      sessionId: session.id,
      laptopName: session.laptopName,
      laptopBtAddress: session.laptopBtAddress
    };

    socket.emit('phone:paired', pairedPayload);

    const connectedPayload = {
      deviceName: data.deviceName || 'Android Phone',
      phoneBtAddress: data.phoneBtAddress || '48:D2:24:D3:5F:AA',
      phoneOsType: data.phoneOsType || 'Android',
      phoneIpAddress: data.phoneIpAddress || '127.0.0.1'
    };

    io.to(session.id).emit('phone:connected', connectedPayload);
    io.emit('phone:connected', connectedPayload);

    if (typeof callback === 'function') callback({ success: true });
  });

  socket.on('phone:ping', () => {
    updateHeartbeat(socket.id);
    socket.emit('phone:pong', { timestamp: new Date().toISOString() });
  });

  // Web dashboard sends ping to measure phone latency
  socket.on('client:ping', ({ sessionId, timestamp }: { sessionId: string; timestamp: number }) => {
    const session = getSessionById(sessionId);
    if (session && session.phoneSocketId) {
      const phoneSocket = io.sockets.sockets.get(session.phoneSocketId);
      if (phoneSocket) {
        phoneSocket.emit('phone:ping', { timestamp });
      }
    }
  });

  // Phone responds to latency ping
  socket.on('phone:pong', ({ sessionId, timestamp }: { sessionId: string; timestamp: number }) => {
    // Broadcast back to the laptop room
    io.to(sessionId).emit('client:pong', { timestamp });
  });

  socket.on('app:version_check', ({ currentVersion }: { currentVersion: string }) => {
    const SERVER_APP_VERSION = '1.2.0'; // Latest released version
    const localIP = getLocalIP();
    if (currentVersion !== SERVER_APP_VERSION) {
      socket.emit('app:update_available', {
        latestVersion: SERVER_APP_VERSION,
        apkUrl: `http://${localIP}:3000/download/apk`,
        forceUpdate: false,
        releaseNotes: 'v1.2.0 Fixes: Auto-dialer now ACTUALLY dials (ACTION_CALL), Ring timeout with auto-hangup, NO_ANSWER tracking, Dashboard tab fix, BT Link tab moved to last.'
      });
    } else {
      socket.emit('app:up_to_date', { version: SERVER_APP_VERSION });
    }
  });

  socket.on('dial:lead', ({ sessionId, phone, name, leadId, campaignId, timeout }: {
    sessionId: string;
    phone: string;
    name: string;
    leadId?: string;
    campaignId?: string;
    timeout: number;
  }) => {
    // ─── Route through Safety Controller before touching the device ───
    const check = checkCallAllowed({ sessionId, phone, leadId, campaignId });

    if (!check.allowed) {
      console.warn(`[SafetyController] BLOCKED dial to ${phone} | Reason: ${check.reason} | ${check.message}`);
      socket.emit('dial:blocked', {
        reason: check.reason,
        message: check.message,
        phone,
        name
      });
      return;
    }

    const session = getSessionById(sessionId);
    if (!session) {
      socket.emit('error', { code: 'INVALID_SESSION', message: 'No active session found.' });
      return;
    }
    if (session.laptopSocketId !== socket.id) {
      socket.emit('error', { code: 'UNAUTHORIZED_LAPTOP', message: 'Unauthorized session emitter socket.' });
      return;
    }
    if (!session.phoneSocketId) {
      socket.emit('error', { code: 'NO_PHONE', message: 'No paired phone active.' });
      return;
    }

    setSessionStatus(sessionId, 'CALLING');
    // Send DIRECTLY to the phone socket — do not use room broadcast which can miss the phone
    const phoneSocket = io.sockets.sockets.get(session.phoneSocketId);
    if (!phoneSocket) {
      socket.emit('error', { code: 'PHONE_UNREACHABLE', message: 'Phone socket not reachable. Reconnect your phone.' });
      return;
    }
    const dialPayload = { phone, name, leadId: leadId || '', timeout, commandId: check.commandId };
    phoneSocket.emit('phone:dial', dialPayload);
    // Also broadcast to room so any other listeners get it
    io.to(sessionId).emit('phone:dial', dialPayload);
    console.log(`[SafetyController] ✅ DIAL SENT TO PHONE SOCKET ${session.phoneSocketId} | ${name} (${phone}) | Session: ${sessionId} | Cmd: ${check.commandId}`);
  });

  // Emergency stop from socket (in addition to REST endpoint)
  socket.on('campaign:emergency_stop', ({ sessionId }: { sessionId: string }) => {
    triggerEmergencyStop();
    io.emit('phone:hangup');
    io.emit('campaign:emergency_stopped', { stoppedBy: 'dashboard-socket', timestamp: new Date().toISOString() });
    console.warn(`[SafetyController] Emergency stop via socket from session ${sessionId}`);
  });

  socket.on('campaign:clear_emergency_stop', () => {
    clearEmergencyStop();
    io.emit('campaign:emergency_cleared', { clearedBy: 'dashboard-socket' });
  });

  socket.on('dial:hangup', ({ sessionId }: { sessionId: string }) => {
    const session = getSessionById(sessionId);
    if (!session || !session.phoneSocketId) return;

    socket.to(sessionId).emit('phone:hangup');
    setSessionStatus(sessionId, 'PAIRED');
    console.log(`[Socket] Hangup command sent to phone in session ${sessionId}`);
  });

  socket.on('call:picked-up', ({ sessionId }: { sessionId: string }) => {
    setSessionStatus(sessionId, 'CALLING');
    socket.to(sessionId).emit('call:started');
    console.log(`[Socket] Phone picked up call in session ${sessionId}`);
  });

  socket.on('call:ended', ({ sessionId, leadId, phone, name, reason, duration, commandId }: {
    sessionId: string;
    leadId?: string;
    phone?: string;
    name?: string;
    reason: string;
    duration: number;
    commandId?: string;
  }) => {
    setSessionStatus(sessionId, 'PAIRED');
    if (commandId) {
      expireCommand(commandId);
    }
    if (leadId) {
      releaseLeadLock(leadId);
      createLog(leadId, reason, duration);
      updateLeadStatus(leadId, 'COMPLETED', reason, duration);
    } else if (phone) {
      const session = getSessionById(sessionId);
      const callTenantId = session?.tenantId || 'tenant_default';
      createManualLog(phone, name || 'Manual Quick Dial', reason, duration, callTenantId);
    }
    socket.to(sessionId).emit('call:finished', { reason, duration });
    const session = getSessionById(sessionId);
    if (session?.tenantId) {
      io.to(`tenant:${session.tenantId}`).emit('leads:updated');
    }
    io.emit('leads:updated');
    console.log(`[Socket] Call finished in session ${sessionId} | Phone: ${phone || leadId} | Reason: ${reason} | Duration: ${duration}s`);
  });

  socket.on('disconnect', () => {
    const session = getSessionBySocketId(socket.id);
    if (!session) return;

    // Release any lead locks reserved by this session
    unlockLeadsForSession(session.id);

    if (session.laptopSocketId === socket.id) {
      // Do NOT send session:ended to phone — laptop socket reclaims session instantly on reconnect!
      console.log(`[Socket Disconnect] Laptop socket ${socket.id} disconnected from session ${session.id} (reclaimable)`);
      handleLaptopDisconnect(socket.id);
    } else if (session.phoneSocketId === socket.id) {
      if (session.laptopSocketId) {
        io.to(session.laptopSocketId).emit('phone:disconnected');
      }
      handlePhoneDisconnect(socket.id);
      console.log(`[Socket Disconnect] Phone socket ${socket.id} disconnected from session ${session.id}`);
    }
  });
});

// Bootstrap default admin user if no users exist yet
ensureDefaultAdmin();

// ══════════════════════════════════════════════════════════════════════════════
// AUTO-EMAILER MODULE ROUTES
// ══════════════════════════════════════════════════════════════════════════════

const emailDb = db; // uses the same better-sqlite3 instance

// Job state for the emailer campaign runner
const emailerJob: { running: boolean; logs: string[]; stop: boolean } = {
  running: false,
  logs: [],
  stop: false,
};

function emailLog(msg: string) {
  const line = `[${new Date().toISOString()}] ${msg}`;
  emailerJob.logs.push(line);
  if (emailerJob.logs.length > 500) emailerJob.logs.shift();
  console.log('[Emailer]', msg);
}

// ── GET /email/leads (Feature-Gated)
app.get('/email/leads', requireAuth, requireFeature('autoEmailer'), (req: express.Request, res: express.Response): void => {
  const user = (req as any).user;
  const tenantId = user.tenantId;
  const rows = emailDb.prepare('SELECT * FROM email_leads WHERE tenantId = ? ORDER BY createdAt ASC').all(tenantId);
  res.json(rows);
});

// ── POST /email/upload (Feature-Gated)
app.post('/email/upload', requireAuth, requireFeature('autoEmailer'), (req: express.Request, res: express.Response): void => {
  const user = (req as any).user;
  const tenantId = user.tenantId;
  const { leads } = req.body as { leads: { email: string; name?: string; company?: string }[] };
  if (!Array.isArray(leads) || !leads.length) {
    res.status(400).json({ error: 'leads array required' });
    return;
  }
  let added = 0;
  let skipped = 0;
  const insert = emailDb.prepare(`
    INSERT OR IGNORE INTO email_leads (email, name, company, status, stage, tenantId)
    VALUES (?, ?, ?, 'pending', 1, ?)
  `);
  for (const lead of leads) {
    if (!lead.email?.includes('@')) continue;
    const result = insert.run(lead.email.toLowerCase().trim(), lead.name || 'Client', lead.company || '', tenantId);
    if ((result as any).changes > 0) added++; else skipped++;
  }
  res.json({ success: true, added, duplicates: skipped });
});

// ── DELETE /email/leads (Feature-Gated)
app.delete('/email/leads', requireAuth, requireFeature('autoEmailer'), (req: express.Request, res: express.Response): void => {
  const user = (req as any).user;
  const tenantId = user.tenantId;
  emailDb.prepare('DELETE FROM email_leads WHERE tenantId = ?').run(tenantId);
  res.json({ success: true });
});

// ── GET /email/accounts (Feature-Gated)
app.get('/email/accounts', requireAuth, requireFeature('autoEmailer'), (req: express.Request, res: express.Response): void => {
  const user = (req as any).user;
  const tenantId = user.tenantId;
  const rows = emailDb.prepare('SELECT id, email, senderName, smtpHost, smtpPort, status, tenantId, authType, createdAt FROM email_accounts WHERE tenantId = ?').all(tenantId);
  res.json(rows);
});

// ── DELETE /email/accounts/:id (Feature-Gated)
app.delete('/email/accounts/:id', requireAuth, requireFeature('autoEmailer'), (req: express.Request, res: express.Response): void => {
  const user = (req as any).user;
  const tenantId = user.tenantId;
  const id = req.params.id;
  emailDb.prepare('DELETE FROM email_accounts WHERE id = ? AND tenantId = ?').run(id, tenantId);
  res.json({ success: true });
});

// ── POST /email/accounts (Feature-Gated)
app.post('/email/accounts', requireAuth, requireFeature('autoEmailer'), (req: express.Request, res: express.Response): void => {
  const user = (req as any).user;
  const tenantId = user.tenantId;
  const { accounts } = req.body as { accounts: { email: string; password?: string; senderName?: string; smtpHost?: string; smtpPort?: number; status?: string; authType?: string; refreshToken?: string; accessToken?: string }[] };
  if (!Array.isArray(accounts)) {
    res.status(400).json({ error: 'accounts array required' });
    return;
  }
  const upsert = emailDb.prepare(`
    INSERT INTO email_accounts (email, password, senderName, smtpHost, smtpPort, status, tenantId, authType, refreshToken, accessToken)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(email) DO UPDATE SET
      password = CASE WHEN excluded.password = '***keep***' THEN password ELSE excluded.password END,
      senderName = excluded.senderName,
      smtpHost = excluded.smtpHost,
      smtpPort = excluded.smtpPort,
      status = excluded.status,
      tenantId = excluded.tenantId,
      authType = excluded.authType,
      refreshToken = CASE WHEN excluded.refreshToken IS NOT NULL THEN excluded.refreshToken ELSE refreshToken END,
      accessToken = CASE WHEN excluded.accessToken IS NOT NULL THEN excluded.accessToken ELSE accessToken END
  `);
  for (const acc of accounts) {
    upsert.run(
      acc.email.toLowerCase().trim(),
      acc.password || '',
      acc.senderName || null,
      acc.smtpHost || 'smtp.gmail.com',
      acc.smtpPort || 587,
      acc.status || 'active',
      tenantId,
      acc.authType || 'password',
      acc.refreshToken || null,
      acc.accessToken || null
    );
  }
  res.json({ success: true });
});

// ── GET /email/oauth/google/connect — 1-Click Google OAuth Mailbox Authorization
app.get(['/email/oauth/google/connect', '/api/email/oauth/google/connect'], requireAuth, (req: express.Request, res: express.Response) => {
  const clientOrigin = getClientOrigin(req);
  if (!config.googleClientId) {
    res.redirect(`${clientOrigin}/?oauth_error=${encodeURIComponent('Google Client ID is not configured in .env')}`);
    return;
  }
  const user = (req as any).user;
  const state = crypto.randomBytes(24).toString('hex');
  const nonce = crypto.randomBytes(24).toString('hex');

  oauthStates.set(state, {
    state,
    nonce,
    clientOrigin,
    intent: 'email_connect' as any,
    provider: 'google',
    tenantId: user.tenantId,
    username: user.username,
    createdAt: Date.now()
  } as any);

  const serverBase = `http://${req.headers.host || 'localhost:3000'}`;
  const scope = encodeURIComponent('openid email profile https://mail.google.com/');
  const redirectUri = encodeURIComponent(`${serverBase}/email/oauth/google/callback`);
  const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${encodeURIComponent(config.googleClientId)}&redirect_uri=${redirectUri}&response_type=code&scope=${scope}&state=${state}&access_type=offline&prompt=consent`;

  res.redirect(authUrl);
});

// ── GET /email/oauth/google/callback — Google OAuth Mailbox callback
app.get(['/email/oauth/google/callback', '/api/email/oauth/google/callback'], async (req: express.Request, res: express.Response) => {
  const fallbackOrigin = config.corsAllowedOrigins[0] || 'http://localhost:5173';
  let clientOrigin = fallbackOrigin;
  try {
    const { code, state, error } = req.query as { code?: string; state?: string; error?: string };
    if (!state || !oauthStates.has(state)) {
      res.redirect(`${clientOrigin}/?oauth_error=${encodeURIComponent('Invalid or expired OAuth state.')}`);
      return;
    }
    const storedState = oauthStates.get(state) as any;
    clientOrigin = storedState.clientOrigin || fallbackOrigin;
    const tenantId = storedState.tenantId || 'tenant_default';
    oauthStates.delete(state);

    if (error || !code) {
      res.redirect(`${clientOrigin}/?oauth_error=${encodeURIComponent(error || 'Google access cancelled.')}`);
      return;
    }

    const serverBase = `http://${req.headers.host || 'localhost:3000'}`;
    const redirectUri = `${serverBase}/email/oauth/google/callback`;
    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: config.googleClientId,
        client_secret: config.googleClientSecret,
        redirect_uri: redirectUri,
        grant_type: 'authorization_code'
      })
    });

    const tokenData: any = await tokenRes.json();
    if (!tokenRes.ok || !tokenData.access_token) {
      throw new Error(tokenData.error_description || 'Failed to exchange Google OAuth code');
    }

    const userRes = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
      headers: { Authorization: `Bearer ${tokenData.access_token}` }
    });
    const profile: any = await userRes.json();
    const email = (profile.email || '').toLowerCase().trim();
    const senderName = profile.name || email.split('@')[0];

    if (!email) throw new Error('Could not retrieve email from Google profile');

    const upsert = emailDb.prepare(`
      INSERT INTO email_accounts (email, password, senderName, smtpHost, smtpPort, status, tenantId, authType, refreshToken, accessToken)
      VALUES (?, ?, ?, 'smtp.gmail.com', 465, 'active', ?, 'oauth_google', ?, ?)
      ON CONFLICT(email) DO UPDATE SET
        senderName = excluded.senderName,
        smtpHost = 'smtp.gmail.com',
        smtpPort = 465,
        status = 'active',
        tenantId = excluded.tenantId,
        authType = 'oauth_google',
        refreshToken = CASE WHEN excluded.refreshToken IS NOT NULL THEN excluded.refreshToken ELSE refreshToken END,
        accessToken = excluded.accessToken
    `);

    upsert.run(email, '***oauth***', senderName, tenantId, tokenData.refresh_token || null, tokenData.access_token);
    res.redirect(`${clientOrigin}/?email_connected=${encodeURIComponent(email)}`);
  } catch (err: any) {
    console.error('[Email OAuth Error]:', err);
    res.redirect(`${clientOrigin}/?oauth_error=${encodeURIComponent(err.message || 'Failed to connect Google account')}`);
  }
});

// ── GET /email/oauth/microsoft/connect — 1-Click Microsoft Outlook / 365 OAuth
app.get(['/email/oauth/microsoft/connect', '/api/email/oauth/microsoft/connect'], requireAuth, (req: express.Request, res: express.Response) => {
  const clientOrigin = getClientOrigin(req);
  const clientId = config.microsoftClientId;
  if (!clientId) {
    res.redirect(`${clientOrigin}/?oauth_error=${encodeURIComponent('Microsoft Client ID (MICROSOFT_CLIENT_ID) is not configured in .env')}`);
    return;
  }
  const user = (req as any).user;
  const state = crypto.randomBytes(24).toString('hex');
  const nonce = crypto.randomBytes(24).toString('hex');

  oauthStates.set(state, {
    state,
    nonce,
    clientOrigin,
    intent: 'email_connect' as any,
    provider: 'microsoft',
    tenantId: user.tenantId,
    username: user.username,
    createdAt: Date.now()
  } as any);

  const serverBase = `http://${req.headers.host || 'localhost:3000'}`;
  const scope = encodeURIComponent('openid profile email offline_access https://outlook.office.com/SMTP.Send');
  const redirectUri = encodeURIComponent(`${serverBase}/email/oauth/microsoft/callback`);
  const authUrl = `https://login.microsoftonline.com/common/oauth2/v2.0/authorize?client_id=${encodeURIComponent(clientId)}&redirect_uri=${redirectUri}&response_type=code&scope=${scope}&state=${state}&response_mode=query&prompt=select_account`;

  res.redirect(authUrl);
});

// ── GET /email/oauth/microsoft/callback — Microsoft OAuth Mailbox callback
app.get(['/email/oauth/microsoft/callback', '/api/email/oauth/microsoft/callback'], async (req: express.Request, res: express.Response) => {
  const fallbackOrigin = config.corsAllowedOrigins[0] || 'http://localhost:5173';
  let clientOrigin = fallbackOrigin;
  try {
    const { code, state, error, error_description } = req.query as { code?: string; state?: string; error?: string; error_description?: string };
    if (!state || !oauthStates.has(state)) {
      res.redirect(`${clientOrigin}/?oauth_error=${encodeURIComponent('Invalid or expired Microsoft OAuth session.')}`);
      return;
    }
    const storedState = oauthStates.get(state) as any;
    clientOrigin = storedState.clientOrigin || fallbackOrigin;
    const tenantId = storedState.tenantId || 'tenant_default';
    oauthStates.delete(state);

    if (error || !code) {
      res.redirect(`${clientOrigin}/?oauth_error=${encodeURIComponent(error_description || error || 'Microsoft access cancelled.')}`);
      return;
    }

    const serverBase = `http://${req.headers.host || 'localhost:3000'}`;
    const redirectUri = `${serverBase}/email/oauth/microsoft/callback`;
    const tokenRes = await fetch('https://login.microsoftonline.com/common/oauth2/v2.0/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: config.microsoftClientId,
        client_secret: config.microsoftClientSecret,
        code,
        redirect_uri: redirectUri,
        grant_type: 'authorization_code'
      })
    });

    const tokenData: any = await tokenRes.json();
    if (!tokenRes.ok || !tokenData.access_token) {
      throw new Error(tokenData.error_description || 'Failed to exchange Microsoft OAuth code');
    }

    const userRes = await fetch('https://graph.microsoft.com/v1.0/me', {
      headers: { Authorization: `Bearer ${tokenData.access_token}` }
    });
    const profile: any = await userRes.json();
    const email = (profile.mail || profile.userPrincipalName || '').toLowerCase().trim();
    const senderName = profile.displayName || email.split('@')[0];

    if (!email) throw new Error('Could not retrieve email from Microsoft profile');

    const upsert = emailDb.prepare(`
      INSERT INTO email_accounts (email, password, senderName, smtpHost, smtpPort, status, tenantId, authType, refreshToken, accessToken)
      VALUES (?, ?, ?, 'smtp.office365.com', 587, 'active', ?, 'oauth_microsoft', ?, ?)
      ON CONFLICT(email) DO UPDATE SET
        senderName = excluded.senderName,
        smtpHost = 'smtp.office365.com',
        smtpPort = 587,
        status = 'active',
        tenantId = excluded.tenantId,
        authType = 'oauth_microsoft',
        refreshToken = CASE WHEN excluded.refreshToken IS NOT NULL THEN excluded.refreshToken ELSE refreshToken END,
        accessToken = excluded.accessToken
    `);

    upsert.run(email, '***oauth***', senderName, tenantId, tokenData.refresh_token || null, tokenData.access_token);
    res.redirect(`${clientOrigin}/?email_connected=${encodeURIComponent(email)}`);
  } catch (err: any) {
    console.error('[Microsoft OAuth Error]:', err);
    res.redirect(`${clientOrigin}/?oauth_error=${encodeURIComponent(err.message || 'Failed to connect Microsoft Outlook account')}`);
  }
});

// ── GET /email/oauth/yahoo/connect — 1-Click Yahoo Mail OAuth
app.get(['/email/oauth/yahoo/connect', '/api/email/oauth/yahoo/connect'], requireAuth, (req: express.Request, res: express.Response) => {
  const clientOrigin = getClientOrigin(req);
  const clientId = config.yahooClientId;
  if (!clientId) {
    res.redirect(`${clientOrigin}/?oauth_error=${encodeURIComponent('Yahoo Client ID (YAHOO_CLIENT_ID) is not configured in .env')}`);
    return;
  }
  const user = (req as any).user;
  const state = crypto.randomBytes(24).toString('hex');
  const nonce = crypto.randomBytes(24).toString('hex');

  oauthStates.set(state, {
    state,
    nonce,
    clientOrigin,
    intent: 'email_connect' as any,
    provider: 'yahoo',
    tenantId: user.tenantId,
    username: user.username,
    createdAt: Date.now()
  } as any);

  const serverBase = `http://${req.headers.host || 'localhost:3000'}`;
  const redirectUri = encodeURIComponent(`${serverBase}/email/oauth/yahoo/callback`);
  const scope = encodeURIComponent('openid email profile mail-w');
  const authUrl = `https://api.login.yahoo.com/oauth2/request_auth?client_id=${encodeURIComponent(clientId)}&redirect_uri=${redirectUri}&response_type=code&scope=${scope}&state=${state}&nonce=${nonce}`;

  res.redirect(authUrl);
});

// ── GET /email/oauth/yahoo/callback — Yahoo OAuth Mailbox callback
app.get(['/email/oauth/yahoo/callback', '/api/email/oauth/yahoo/callback'], async (req: express.Request, res: express.Response) => {
  const fallbackOrigin = config.corsAllowedOrigins[0] || 'http://localhost:5173';
  let clientOrigin = fallbackOrigin;
  try {
    const { code, state, error } = req.query as { code?: string; state?: string; error?: string };
    if (!state || !oauthStates.has(state)) {
      res.redirect(`${clientOrigin}/?oauth_error=${encodeURIComponent('Invalid or expired Yahoo OAuth state.')}`);
      return;
    }
    const storedState = oauthStates.get(state) as any;
    clientOrigin = storedState.clientOrigin || fallbackOrigin;
    const tenantId = storedState.tenantId || 'tenant_default';
    oauthStates.delete(state);

    if (error || !code) {
      res.redirect(`${clientOrigin}/?oauth_error=${encodeURIComponent(error || 'Yahoo access cancelled.')}`);
      return;
    }

    const serverBase = `http://${req.headers.host || 'localhost:3000'}`;
    const redirectUri = `${serverBase}/email/oauth/yahoo/callback`;
    const credentials = Buffer.from(`${config.yahooClientId}:${config.yahooClientSecret}`).toString('base64');
    
    const tokenRes = await fetch('https://api.login.yahoo.com/oauth2/get_token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Authorization': `Basic ${credentials}`
      },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        redirect_uri: redirectUri,
        code
      })
    });

    const tokenData: any = await tokenRes.json();
    if (!tokenRes.ok || !tokenData.access_token) {
      throw new Error(tokenData.error_description || 'Failed to exchange Yahoo OAuth code');
    }

    const userRes = await fetch('https://api.login.yahoo.com/openid/v1/userinfo', {
      headers: { Authorization: `Bearer ${tokenData.access_token}` }
    });
    const profile: any = await userRes.json();
    const email = (profile.email || '').toLowerCase().trim();
    const senderName = profile.name || profile.nickname || email.split('@')[0];

    if (!email) throw new Error('Could not retrieve email from Yahoo profile');

    const upsert = emailDb.prepare(`
      INSERT INTO email_accounts (email, password, senderName, smtpHost, smtpPort, status, tenantId, authType, refreshToken, accessToken)
      VALUES (?, ?, ?, 'smtp.mail.yahoo.com', 465, 'active', ?, 'oauth_yahoo', ?, ?)
      ON CONFLICT(email) DO UPDATE SET
        senderName = excluded.senderName,
        smtpHost = 'smtp.mail.yahoo.com',
        smtpPort = 465,
        status = 'active',
        tenantId = excluded.tenantId,
        authType = 'oauth_yahoo',
        refreshToken = CASE WHEN excluded.refreshToken IS NOT NULL THEN excluded.refreshToken ELSE refreshToken END,
        accessToken = excluded.accessToken
    `);

    upsert.run(email, '***oauth***', senderName, tenantId, tokenData.refresh_token || null, tokenData.access_token);
    res.redirect(`${clientOrigin}/?email_connected=${encodeURIComponent(email)}`);
  } catch (err: any) {
    console.error('[Yahoo OAuth Error]:', err);
    res.redirect(`${clientOrigin}/?oauth_error=${encodeURIComponent(err.message || 'Failed to connect Yahoo account')}`);
  }
});



// ── GET /email/templates (Feature-Gated)
app.get('/email/templates', requireAuth, requireFeature('autoEmailer'), (req: express.Request, res: express.Response): void => {
  const user = (req as any).user;
  const tenantId = user.tenantId;
  const rows = emailDb.prepare('SELECT * FROM email_templates WHERE tenantId = ? ORDER BY stage ASC, id ASC').all(tenantId);
  res.json(rows);
});

// ── POST /email/templates (Feature-Gated)
app.post('/email/templates', requireAuth, requireFeature('autoEmailer'), (req: express.Request, res: express.Response): void => {
  const user = (req as any).user;
  const tenantId = user.tenantId;
  const { templates } = req.body as { templates: { subject: string; body: string; stage?: number }[] };
  if (!Array.isArray(templates)) {
    res.status(400).json({ error: 'templates array required' });
    return;
  }
  emailDb.prepare('DELETE FROM email_templates WHERE tenantId = ?').run(tenantId);
  const insert = emailDb.prepare(`
    INSERT INTO email_templates (subject, body, stage, tenantId)
    VALUES (?, ?, ?, ?)
  `);
  for (let i = 0; i < templates.length; i++) {
    const t = templates[i];
    insert.run(t.subject, t.body, t.stage || (i + 1), tenantId);
  }
  res.json({ success: true });
});

// ── POST /email/start — tenant-isolated campaign runner (Feature-Gated)
app.post('/email/start', requireAuth, requireFeature('autoEmailer'), (req: express.Request, res: express.Response): void => {
  if (emailerJob.running) {
    res.json({ success: true, message: 'Campaign already running.' });
    return;
  }
  const user = (req as any).user;
  const tenantId = user.tenantId;
  const { limit = 200, accountIds } = req.body as { limit?: number; accountIds?: number[] };

  emailerJob.running = true;
  emailerJob.stop = false;

  (async () => {
    try {
      const { default: nodemailer } = await import('nodemailer');
      const leads = emailDb.prepare(`SELECT * FROM email_leads WHERE tenantId = ? AND status IN ('pending','sent')`).all(tenantId) as any[];
      let accounts = emailDb.prepare(`SELECT * FROM email_accounts WHERE tenantId = ? AND status = 'active'`).all(tenantId) as any[];
      
      // Filter by user-selected account IDs if specified
      if (Array.isArray(accountIds) && accountIds.length > 0) {
        const idSet = new Set(accountIds.map(Number));
        accounts = accounts.filter((a: any) => idSet.has(Number(a.id)));
      }

      const templates = emailDb.prepare(`SELECT * FROM email_templates WHERE tenantId = ? ORDER BY stage ASC, id ASC`).all(tenantId) as any[];

      emailLog(`=== Campaign Started [Tenant: ${tenantId}]: ${leads.length} eligible leads, ${accounts.length} accounts, ${templates.length} templates ===`);

      if (!accounts.length) { emailLog('❌ No active SMTP accounts available for this campaign selection!'); return; }
      if (!templates.length) { emailLog('❌ No email templates for this tenant!'); return; }

      const SEVEN_DAYS = 7 * 24 * 60 * 60 * 1000;
      const now = Date.now();

      const eligible = leads.filter((l: any) => {
        if (l.status === 'pending') return true;
        if (l.status === 'sent' && l.stage < 3 && l.lastSentAt) {
          return now - new Date(l.lastSentAt).getTime() >= SEVEN_DAYS;
        }
        return false;
      });

      emailLog(`Found ${eligible.length} leads eligible for sending.`);

      let leadIdx = 0;
      let tplIdx = 0;

      const updateLead = emailDb.prepare(`UPDATE email_leads SET status=?, stage=?, lastSentAt=? WHERE id=? AND tenantId=?`);
      const disableAcc = emailDb.prepare(`UPDATE email_accounts SET status='disabled' WHERE id=? AND tenantId=?`);

      for (const acc of accounts) {
        if (leadIdx >= eligible.length || emailerJob.stop) break;

        const isSecure = Number(acc.smtpPort) === 465;
        emailLog(`Using sender: ${acc.email} (${acc.smtpHost}:${acc.smtpPort || 587}, type: ${acc.authType || 'password'})`);
        
        let transporter: any;
        if (acc.authType === 'oauth_google' && (acc.refreshToken || acc.accessToken)) {
          transporter = nodemailer.createTransport({
            service: 'gmail',
            auth: {
              type: 'OAuth2',
              user: acc.email,
              clientId: config.googleClientId,
              clientSecret: config.googleClientSecret,
              refreshToken: acc.refreshToken,
              accessToken: acc.accessToken
            }
          });
        } else if (acc.authType === 'oauth_microsoft' && (acc.refreshToken || acc.accessToken)) {
          transporter = nodemailer.createTransport({
            host: 'smtp.office365.com',
            port: 587,
            secure: false,
            auth: {
              type: 'OAuth2',
              user: acc.email,
              clientId: config.microsoftClientId,
              clientSecret: config.microsoftClientSecret,
              refreshToken: acc.refreshToken,
              accessToken: acc.accessToken
            },
            tls: { ciphers: 'SSLv3' }
          });
        } else if (acc.authType === 'oauth_yahoo' && (acc.refreshToken || acc.accessToken)) {
          transporter = nodemailer.createTransport({
            host: 'smtp.mail.yahoo.com',
            port: 465,
            secure: true,
            auth: {
              type: 'OAuth2',
              user: acc.email,
              clientId: config.yahooClientId,
              clientSecret: config.yahooClientSecret,
              refreshToken: acc.refreshToken,
              accessToken: acc.accessToken
            }
          });
        } else {
          transporter = nodemailer.createTransport({
            host: acc.smtpHost,
            port: Number(acc.smtpPort) || 587,
            secure: isSecure,
            auth: { user: acc.email, pass: acc.password },
            tls: { rejectUnauthorized: false }
          });
        }

        let sent = 0;
        while (sent < limit && leadIdx < eligible.length && !emailerJob.stop) {
          const lead = eligible[leadIdx++];
          const tpl = templates[tplIdx++ % templates.length];

          const subject = tpl.subject.replace(/{{name}}/g, lead.name).replace(/{{company}}/g, lead.company);
          const body = tpl.body.replace(/{{name}}/g, lead.name).replace(/{{company}}/g, lead.company);

          try {
            emailLog(`Sending Stage ${lead.stage} to: ${lead.email}`);
            await transporter.sendMail({
              from: `"${acc.senderName || 'Office'}" <${acc.email}>`,
              to: lead.email,
              subject,
              text: body
            });
            const newStage = Math.min(lead.stage + 1, 3);
            const newStatus = newStage >= 3 ? 'completed' : 'sent';
            updateLead.run(newStatus, newStage, new Date().toISOString(), lead.id, tenantId);
            emailLog(`✅ Sent to ${lead.email} (Stage ${lead.stage})`);
            sent++;
            const delay = 30000 + Math.random() * 30000;
            await new Promise(r => setTimeout(r, delay));
          } catch (err: unknown) {
            emailLog(`❌ Failed: ${lead.email} — ${(err as Error).message}`);
            if ((err as Error).message?.includes('Authentication') || (err as Error).message?.includes('Username and Password')) {
              disableAcc.run(acc.id, tenantId);
              emailLog(`⚠️ Disabled account ${acc.email} (auth failure)`);
              break;
            }
          }
        }
        if (transporter && typeof transporter.close === 'function') transporter.close();
      }

      emailLog(`=== Campaign Completed ===`);
    } catch (err: unknown) {
      emailLog(`❌ Campaign error: ${(err as Error).message}`);
    } finally {
      emailerJob.running = false;
    }
  })();

  res.json({ success: true, message: 'Campaign started in background.' });
});


// ── POST /emailer/stop (Feature-Gated)
app.post('/emailer/stop', requireAuth, requireFeature('autoEmailer'), (_req: express.Request, res: express.Response): void => {
  emailerJob.stop = true;
  res.json({ success: true });
});

// ── GET /emailer/status (Feature-Gated)
app.get('/emailer/status', requireAuth, requireFeature('autoEmailer'), (_req: express.Request, res: express.Response): void => {
  res.json({
    status: emailerJob.running ? 'running' : 'idle',
    logs: emailerJob.logs.slice(-200)
  });
});


// ═══════════════════════════════════════════════════════════════════════════
// ADMIN DASHBOARD ENDPOINTS (Tenant-Scoped Analytics)
// ═══════════════════════════════════════════════════════════════════════════

// Analytics: Overview KPIs (Scoped to current tenant - Feature Gated)
app.get('/admin/analytics/overview', requireTenantAdmin, requireFeature('analytics'), (req, res) => {
  try {
    const adminUser = (req as any).user;
    const tenantId = adminUser.tenantId;

    const totalUsers = db.prepare('SELECT COUNT(*) as count FROM users WHERE tenantId = ?').get(tenantId) as { count: number };
    const activeSessions = db.prepare(`
      SELECT COUNT(*) as count 
      FROM sessions_store s 
      JOIN users u ON u.id = s.userId 
      WHERE u.tenantId = ? AND s.expiresAt > datetime("now")
    `).get(tenantId) as { count: number };
    const todaysCalls = db.prepare(`SELECT COUNT(*) as count FROM call_logs WHERE tenantId = ? AND date(timestamp) = date('now')`).get(tenantId) as { count: number };
    const todaysLeads = db.prepare(`SELECT COUNT(*) as count FROM scraped_leads WHERE tenantId = ? AND date(scrapedAt) = date('now')`).get(tenantId) as { count: number };

    res.json({
      totalUsers: totalUsers.count,
      activeSessions: activeSessions.count,
      callsToday: todaysCalls.count,
      leadsScrapedToday: todaysLeads.count
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Analytics: Usage trends (last 30 days — Scoped to current tenant - Feature Gated)
app.get('/admin/analytics/usage-trends', requireTenantAdmin, requireFeature('analytics'), (req, res) => {
  try {
    const adminUser = (req as any).user;
    const tenantId = adminUser.tenantId;

    const trends = db.prepare(`
      SELECT
        date(timestamp) as date,
        COUNT(*) as callCount
      FROM call_logs
      WHERE tenantId = ? AND timestamp > datetime('now', '-30 days')
      GROUP BY date(timestamp)
      ORDER BY date ASC
    `).all(tenantId) as Array<{ date: string; callCount: number }>;

    res.json({ trends });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Analytics: Module usage stats (Scoped to current tenant - Feature Gated)
app.get('/admin/analytics/module-usage', requireTenantAdmin, requireFeature('analytics'), (req, res) => {
  try {
    const adminUser = (req as any).user;
    const tenantId = adminUser.tenantId;

    const modules = [
      { moduleId: 'octalDialer', label: 'Octal Dialer' },
      { moduleId: 'googleScraper', label: 'Google Scraper' },
      { moduleId: 'autoEmailer', label: 'Auto Emailer' },
      { moduleId: 'facebookScraper', label: 'Facebook Scraper' },
      { moduleId: 'facebookPoster', label: 'Facebook Poster' }
    ];

    const stats = modules.map(m => {
      const enabledUsers = db.prepare(`
        SELECT COUNT(DISTINCT userId) as count 
        FROM user_permissions
        WHERE tenantId = ? AND moduleId = ? AND enabled = 1
      `).get(tenantId, m.moduleId) as { count: number };
      return { module: m.label, enabledUsers: enabledUsers.count };
    });

    res.json({ stats });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// TENANT SUBSCRIPTION & ENTITLEMENT ENDPOINTS (Phase 7)
// ═══════════════════════════════════════════════════════════════════════════

// GET /subscription — get subscription, entitlements, limits & real-time usage for authenticated tenant
app.get('/subscription', requireAuth, (req, res) => {
  try {
    const user = (req as any).user;
    const entitlements = getTenantEntitlements(user.tenantId);
    const usage = getTenantUsage(user.tenantId);

    res.json({
      tenantId: user.tenantId,
      entitlements,
      usage
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET /auth/entitlements — lightweight entitlement check for current tenant
app.get('/auth/entitlements', requireAuth, (req, res) => {
  try {
    const user = (req as any).user;
    const entitlements = getTenantEntitlements(user.tenantId);

    res.json(entitlements);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// BILLING & SUBSCRIPTION LIFECYCLE ENDPOINTS (Phase 8 & 9 - Hardened)
// ═══════════════════════════════════════════════════════════════════════════

// GET /billing/plans — public plan catalog for purchasable plans
app.get('/billing/plans', (_req, res) => {
  try {
    const plans = getPublicPlans();
    res.json({ plans });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET /billing/subscription — get full billing state (subscription + plan + over-limit status)
app.get('/billing/subscription', requireAuth, (req, res) => {
  try {
    const user = (req as any).user;
    const billingState = getBillingState(user.tenantId);
    const entitlements = getTenantEntitlements(user.tenantId);
    const usage = getTenantUsage(user.tenantId);

    res.json({
      tenantId: user.tenantId,
      ...billingState,
      entitlements,
      usage
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET /billing/events — get tenant billing event history (Tenant Admin only)
app.get('/billing/events', requireTenantAdmin, (req, res) => {
  try {
    const user = (req as any).user;
    const events = getTenantBillingEvents(user.tenantId);
    res.json({ events });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET /billing/invoices — get tenant invoice summary (Tenant Admin only)
app.get('/billing/invoices', requireTenantAdmin, (req, res) => {
  try {
    const user = (req as any).user;
    const invoices = getTenantInvoices(user.tenantId);
    res.json({ invoices });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST /billing/checkout — start checkout session for a plan (server authoritative, rate-limited)
app.post('/billing/checkout', requireAuth, billingRateLimiter, (req, res) => {
  try {
    const user = (req as any).user;
    const { planId } = req.body as { planId?: string };

    if (!planId || typeof planId !== 'string') {
      res.status(400).json({ error: 'planId is required and must be a string.' });
      return;
    }

    const cleanPlanId = sanitizePlanId(planId);
    const checkout = startCheckout(user.tenantId, cleanPlanId);
    res.json({
      success: true,
      ...checkout
    });
  } catch (err: any) {
    const isClientError = err.message && (
      err.message.includes('not found') ||
      err.message.includes('cannot be purchased') ||
      err.message.includes('not available') ||
      err.message.includes('required') ||
      err.message.includes('Invalid planId')
    );
    res.status(isClientError ? 400 : 500).json({ error: err.message });
  }
});

// POST /billing/change-plan — upgrade/downgrade plan for authenticated tenant (rate-limited)
app.post('/billing/change-plan', requireTenantAdmin, billingRateLimiter, (req, res) => {
  try {
    const user = (req as any).user;
    const { planId } = req.body as { planId?: string };

    if (!planId || typeof planId !== 'string') {
      res.status(400).json({ error: 'planId is required and must be a string.' });
      return;
    }

    const cleanPlanId = sanitizePlanId(planId);
    const isPlatformAdmin = user.role === 'platform_admin';
    const updatedSub = changePlan(user.tenantId, cleanPlanId, isPlatformAdmin);

    res.json({
      success: true,
      subscription: updatedSub,
      message: `Plan changed to ${cleanPlanId} successfully.`
    });
  } catch (err: any) {
    const isClientError = err.message && (
      err.message.includes('not found') ||
      err.message.includes('not available') ||
      err.message.includes('Already subscribed') ||
      err.message.includes('cannot be purchased') ||
      err.message.includes('Invalid planId')
    );
    res.status(isClientError ? 400 : 500).json({ error: err.message });
  }
});

// POST /billing/cancel — schedule cancellation at current period end (rate-limited)
app.post('/billing/cancel', requireTenantAdmin, billingRateLimiter, (req, res) => {
  try {
    const user = (req as any).user;
    const cancelledSub = cancelSubscription(user.tenantId);

    res.json({
      success: true,
      subscription: cancelledSub,
      message: 'Subscription scheduled for cancellation at period end.'
    });
  } catch (err: any) {
    res.status(err.message?.includes('No active') ? 400 : 500).json({ error: err.message });
  }
});

// POST /billing/reactivate — undo scheduled cancellation before period end (rate-limited)
app.post('/billing/reactivate', requireTenantAdmin, billingRateLimiter, (req, res) => {
  try {
    const user = (req as any).user;
    const reactivatedSub = reactivateSubscription(user.tenantId);

    res.json({
      success: true,
      subscription: reactivatedSub,
      message: 'Subscription successfully reactivated.'
    });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// POST /billing/webhook — authoritative payment provider webhook handler (HMAC-verified, rate-limited)
app.post('/billing/webhook', webhookRateLimiter, (req, res) => {
  try {
    const signature = (req.headers['x-webhook-signature'] || req.headers['stripe-signature'] || '') as string;
    const payload = typeof req.body === 'string' ? req.body : JSON.stringify(req.body);

    const result = processWebhookEvent(payload, signature);

    if (!result.processed) {
      if (result.error?.includes('signature')) {
        res.status(401).json({ error: result.error });
        return;
      }
      if (result.error?.includes('Malformed') || result.error?.includes('Missing')) {
        res.status(400).json({ error: result.error });
        return;
      }
      // Idempotency: duplicate event is safe 200
      res.json({ success: true, message: result.error || 'Event already processed' });
      return;
    }

    res.json({ success: true, eventId: result.eventId });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// PLATFORM ADMIN ENDPOINTS (Super Admin only — platform-wide authority)
// ═══════════════════════════════════════════════════════════════════════════

// Emergency State Tracker
let emergencyState = {
  isPaused: false,
  pausedAt: null as string | null,
  pausedBy: null as string | null,
  reason: null as string | null
};

app.get('/admin/emergency/status', requirePlatformAdmin, (req, res) => {
  res.json(emergencyState);
});

app.post('/admin/emergency/pause', requirePlatformAdmin, (req, res) => {
  const adminUser = (req as any).user;
  const { reason } = req.body as { reason?: string };
  emergencyState = {
    isPaused: true,
    pausedAt: new Date().toISOString(),
    pausedBy: adminUser.username || 'admin',
    reason: reason || 'Platform Admin Emergency Stop'
  };
  res.json({ success: true, message: 'Platform emergency stop activated.', emergencyState });
});

app.post('/admin/emergency/resume', requirePlatformAdmin, (req, res) => {
  emergencyState = {
    isPaused: false,
    pausedAt: null,
    pausedBy: null,
    reason: null
  };
  res.json({ success: true, message: 'Platform operations resumed.', emergencyState });
});

// GET /admin/platform/overview — Global platform overview KPIs
app.get('/admin/platform/overview', requirePlatformAdmin, (req, res) => {
  try {
    const totalTenants = (db.prepare(`SELECT COUNT(*) as count FROM tenants`).get() as any)?.count || 0;
    const activeTenants = (db.prepare(`SELECT COUNT(*) as count FROM tenants WHERE status = 'active'`).get() as any)?.count || 0;
    const suspendedTenants = (db.prepare(`SELECT COUNT(*) as count FROM tenants WHERE status = 'suspended'`).get() as any)?.count || 0;

    const totalUsers = (db.prepare(`SELECT COUNT(*) as count FROM users`).get() as any)?.count || 0;
    const adminUsers = (db.prepare(`SELECT COUNT(*) as count FROM users WHERE role = 'admin' OR role = 'platform_admin'`).get() as any)?.count || 0;
    const agentUsers = (db.prepare(`SELECT COUNT(*) as count FROM users WHERE role = 'agent' OR role = 'user'`).get() as any)?.count || 0;

    const activeSubscriptions = (db.prepare(`SELECT COUNT(*) as count FROM subscriptions WHERE status = 'active'`).get() as any)?.count || 0;
    const trialTenants = (db.prepare(`SELECT COUNT(*) as count FROM subscriptions WHERE status = 'trialing' OR planId = 'plan_starter'`).get() as any)?.count || 0;

    const totalDevices = (db.prepare(`SELECT COUNT(*) as count FROM devices`).get() as any)?.count || 0;
    const onlineDevices = (db.prepare(`SELECT COUNT(*) as count FROM devices WHERE status = 'ONLINE'`).get() as any)?.count || 0;

    const callsToday = (db.prepare(`SELECT COUNT(*) as count FROM call_logs WHERE timestamp >= date('now')`).get() as any)?.count || 0;
    const totalLeads = (db.prepare(`SELECT COUNT(*) as count FROM leads`).get() as any)?.count || 0;
    const totalCampaigns = (db.prepare(`SELECT COUNT(*) as count FROM campaigns`).get() as any)?.count || 0;

    const recentTenants = db.prepare(`
      SELECT t.id, t.name, t.country, t.status, t.createdAt,
             (SELECT p.name FROM subscriptions s JOIN plans p ON p.id = s.planId WHERE s.tenantId = t.id ORDER BY s.createdAt DESC LIMIT 1) as planName
      FROM tenants t
      ORDER BY t.createdAt DESC
      LIMIT 5
    `).all();

    res.json({
      metrics: {
        totalTenants,
        activeTenants,
        suspendedTenants,
        trialTenants,
        totalUsers,
        adminUsers,
        agentUsers,
        activeSubscriptions,
        totalDevices,
        onlineDevices,
        callsToday,
        totalLeads,
        totalCampaigns
      },
      recentTenants,
      emergencyState
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET /admin/platform/users — Global cross-tenant users list
app.get('/admin/platform/users', requirePlatformAdmin, (req, res) => {
  try {
    const { search, role, tenantId } = req.query as { search?: string; role?: string; tenantId?: string };

    let query = `
      SELECT 
        u.id, u.username, u.email, u.role, u.tenantId, u.createdAt, u.updatedAt,
        t.name as tenantName, t.country as tenantCountry, t.status as tenantStatus
      FROM users u
      LEFT JOIN tenants t ON t.id = u.tenantId
      WHERE 1=1
    `;
    const params: any[] = [];

    if (search && search.trim()) {
      query += ` AND (u.username LIKE ? OR u.email LIKE ? OR t.name LIKE ?)`;
      const s = `%${search.trim()}%`;
      params.push(s, s, s);
    }
    if (role && role !== 'ALL') {
      query += ` AND u.role = ?`;
      params.push(role);
    }
    if (tenantId && tenantId !== 'ALL') {
      query += ` AND u.tenantId = ?`;
      params.push(tenantId);
    }

    query += ` ORDER BY u.createdAt DESC`;

    const users = db.prepare(query).all(...params) as any[];

    const usersWithPerms = users.map(u => {
      const perms = db.prepare(`SELECT moduleId, enabled FROM user_permissions WHERE userId = ?`).all(u.id);
      return {
        ...u,
        permissions: perms,
        activePermsCount: perms.filter((p: any) => p.enabled === 1).length
      };
    });

    res.json({ users: usersWithPerms });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET /admin/platform/devices — Global devices list
app.get('/admin/platform/devices', requirePlatformAdmin, (req, res) => {
  try {
    const devices = db.prepare(`
      SELECT 
        d.id, d.name as phoneName, d.btAddress, d.osType, d.ipAddress, d.status, d.lastSeenAt, d.createdAt, d.tenantId,
        t.name as tenantName,
        (SELECT u.username FROM users u WHERE u.tenantId = d.tenantId LIMIT 1) as assignedUser
      FROM devices d
      LEFT JOIN tenants t ON t.id = d.tenantId
      ORDER BY d.lastSeenAt DESC
    `).all();

    res.json({ devices });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET /admin/tenants — list all tenants across the platform with rich metadata
app.get('/admin/tenants', requirePlatformAdmin, (req, res) => {
  try {
    const { search, status, country, plan } = req.query as { search?: string; status?: string; country?: string; plan?: string };

    let query = `
      SELECT 
        t.id, t.name, t.slug, t.country, t.logoUrl, t.ownerEmail, t.status, t.createdAt, t.updatedAt,
        (SELECT u.username FROM users u WHERE u.tenantId = t.id AND (u.role = 'admin' OR u.role = 'platform_admin') ORDER BY u.createdAt ASC LIMIT 1) as ownerUsername,
        (SELECT u.email FROM users u WHERE u.tenantId = t.id AND (u.role = 'admin' OR u.role = 'platform_admin') ORDER BY u.createdAt ASC LIMIT 1) as userEmail,
        (SELECT COUNT(*) FROM users u WHERE u.tenantId = t.id) as userCount,
        (SELECT COUNT(DISTINCT d.id) FROM devices d WHERE d.tenantId = t.id) as deviceCount,
        (SELECT s.planId FROM subscriptions s WHERE s.tenantId = t.id AND s.status = 'active' ORDER BY s.createdAt DESC LIMIT 1) as planId,
        (SELECT p.name FROM subscriptions s JOIN plans p ON p.id = s.planId WHERE s.tenantId = t.id AND s.status = 'active' ORDER BY s.createdAt DESC LIMIT 1) as planName,
        (SELECT s.status FROM subscriptions s WHERE s.tenantId = t.id ORDER BY s.createdAt DESC LIMIT 1) as subscriptionStatus
      FROM tenants t
      WHERE 1=1
    `;
    const params: any[] = [];

    if (search && search.trim()) {
      query += ` AND (t.name LIKE ? OR t.slug LIKE ? OR t.ownerEmail LIKE ?)`;
      const s = `%${search.trim()}%`;
      params.push(s, s, s);
    }
    if (status && status !== 'ALL') {
      query += ` AND t.status = ?`;
      params.push(status);
    }
    if (country && country !== 'ALL') {
      query += ` AND t.country = ?`;
      params.push(country);
    }

    query += ` ORDER BY t.createdAt DESC`;

    let tenants = db.prepare(query).all(...params) as any[];

    if (plan && plan !== 'ALL') {
      tenants = tenants.filter(t => (t.planId === plan || t.planName === plan));
    }

    res.json({ tenants });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET /admin/tenants/:id — get full business detail with users, devices, subscription & usage
app.get('/admin/tenants/:id', requirePlatformAdmin, (req, res) => {
  try {
    const { id } = req.params;
    const tenant = db.prepare(`SELECT * FROM tenants WHERE id = ?`).get(id) as any;
    if (!tenant) {
      res.status(404).json({ error: 'Tenant not found.' });
      return;
    }

    const owner = db.prepare(`SELECT id, username, email, role, createdAt FROM users WHERE tenantId = ? AND (role = 'admin' OR role = 'platform_admin') ORDER BY createdAt ASC LIMIT 1`).get(id) as any;

    const users = db.prepare(`SELECT id, username, email, role, createdAt FROM users WHERE tenantId = ? ORDER BY createdAt DESC`).all(id);

    const subscriptions = db.prepare(`
      SELECT s.*, p.name as planName, p.priceMonthly, p.priceYearly
      FROM subscriptions s
      JOIN plans p ON p.id = s.planId
      WHERE s.tenantId = ?
      ORDER BY s.createdAt DESC
    `).all(id);

    // Devices & Sessions mapping (User -> Computer/Session -> Phone)
    const devices = db.prepare(`
      SELECT 
        d.id, d.name as phoneName, d.btAddress, d.osType, d.ipAddress, d.status, d.lastSeenAt, d.createdAt,
        (SELECT s.id FROM sessions_store s JOIN users u ON u.id = s.userId WHERE u.tenantId = d.tenantId LIMIT 1) as sessionId,
        (SELECT u.username FROM users u WHERE u.tenantId = d.tenantId LIMIT 1) as username
      FROM devices d
      WHERE d.tenantId = ?
      ORDER BY d.lastSeenAt DESC
    `).all(id);

    // Usage & Entitlements
    const leadCount = (db.prepare(`SELECT COUNT(*) as count FROM leads WHERE campaignId IN (SELECT id FROM campaigns WHERE tenantId = ?)`).get(id) as any)?.count || 0;
    const campaignCount = (db.prepare(`SELECT COUNT(*) as count FROM campaigns WHERE tenantId = ?`).get(id) as any)?.count || 0;
    const apiKeyCount = (db.prepare(`SELECT COUNT(*) as count FROM api_keys WHERE userId IN (SELECT id FROM users WHERE tenantId = ?)`).get(id) as any)?.count || 0;
    const userCount = users.length;
    const deviceCount = devices.length;

    let entitlements: any = { limits: { max_users: 10, max_devices: 5, max_campaigns: 25, max_leads_per_campaign: 5000 } };
    try {
      entitlements = getTenantEntitlements(id);
    } catch (_) {}

    const usage = {
      users: { current: userCount, max: entitlements.limits?.max_users || 10 },
      devices: { current: deviceCount, max: entitlements.limits?.max_devices || 5 },
      campaigns: { current: campaignCount, max: entitlements.limits?.max_campaigns || 25 },
      leads: { current: leadCount, max: (entitlements.limits?.max_leads_per_campaign || 2500) * 10 },
      apiKeys: { current: apiKeyCount, max: 5 }
    };

    // Recent Audit / Activity logs for this tenant
    const auditLogs = db.prepare(`
      SELECT id, action, entityType, performedBy, details, timestamp
      FROM audit_logs
      WHERE details LIKE ? OR performedBy IN (SELECT username FROM users WHERE tenantId = ?)
      ORDER BY timestamp DESC
      LIMIT 20
    `).all(`%${id}%`, id);

    res.json({
      tenant: {
        ...tenant,
        ownerUsername: owner?.username || tenant.ownerEmail || 'Unknown Owner',
        ownerEmail: owner?.email || tenant.ownerEmail || null
      },
      users,
      devices,
      subscriptions,
      usage,
      entitlements,
      auditLogs
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /admin/tenants/:id/status — update tenant status (Platform Admin only)
app.put('/admin/tenants/:id/status', requirePlatformAdmin, (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body as { status: string };

    if (!['active', 'suspended'].includes(status)) {
      res.status(400).json({ error: 'Status must be active or suspended.' });
      return;
    }

    const result = db.prepare(`UPDATE tenants SET status = ?, updatedAt = datetime('now') WHERE id = ?`).run(status, id);
    if (result.changes === 0) {
      res.status(404).json({ error: 'Tenant not found.' });
      return;
    }

    res.json({ success: true, message: `Tenant status updated to ${status}.` });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET /admin/plans — list all catalog plans (Platform Admin only)
app.get('/admin/plans', requirePlatformAdmin, (req, res) => {
  try {
    const plans = db.prepare(`SELECT * FROM plans ORDER BY priceMonthly ASC`).all() as any[];
    res.json({ plans });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST /admin/plans — create a new catalog plan (Platform Admin only)
app.post('/admin/plans', requirePlatformAdmin, (req, res) => {
  try {
    const { name, priceMonthly, priceYearly, description, maxAgents, maxDailyDials } = req.body as {
      name: string;
      priceMonthly: number;
      priceYearly: number;
      description?: string;
      maxAgents?: number;
      maxDailyDials?: number;
    };

    if (!name) {
      res.status(400).json({ error: 'Plan name is required.' });
      return;
    }

    const planId = 'plan_' + name.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
    const now = new Date().toISOString();

    db.prepare(`
      INSERT INTO plans (id, name, priceMonthly, priceYearly, status, createdAt, updatedAt)
      VALUES (?, ?, ?, ?, 'active', ?, ?)
    `).run(planId, name, priceMonthly || 0, priceYearly || 0, now, now);

    res.status(201).json({ success: true, planId });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /admin/plans/:id — update a catalog plan (Platform Admin only)
app.put('/admin/plans/:id', requirePlatformAdmin, (req, res) => {
  try {
    const { id } = req.params;
    const { name, priceMonthly, priceYearly, status } = req.body as {
      name?: string;
      priceMonthly?: number;
      priceYearly?: number;
      status?: string;
    };

    const plan = db.prepare(`SELECT * FROM plans WHERE id = ?`).get(id);
    if (!plan) {
      res.status(404).json({ error: 'Plan not found.' });
      return;
    }

    if (name) db.prepare(`UPDATE plans SET name = ?, updatedAt = datetime('now') WHERE id = ?`).run(name, id);
    if (priceMonthly !== undefined) db.prepare(`UPDATE plans SET priceMonthly = ?, updatedAt = datetime('now') WHERE id = ?`).run(priceMonthly, id);
    if (priceYearly !== undefined) db.prepare(`UPDATE plans SET priceYearly = ?, updatedAt = datetime('now') WHERE id = ?`).run(priceYearly, id);
    if (status) db.prepare(`UPDATE plans SET status = ?, updatedAt = datetime('now') WHERE id = ?`).run(status, id);

    res.json({ success: true, message: 'Plan updated.' });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET /admin/subscriptions — list all tenant subscriptions (Platform Admin only)
app.get('/admin/subscriptions', requirePlatformAdmin, (req, res) => {
  try {
    const subscriptions = db.prepare(`
      SELECT 
        s.*, 
        t.name as tenantName, 
        p.name as planName 
      FROM subscriptions s
      LEFT JOIN tenants t ON t.id = s.tenantId
      LEFT JOIN plans p ON p.id = s.planId
      ORDER BY s.createdAt DESC
    `).all() as any[];

    res.json({ subscriptions });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST /admin/database/backup — trigger consistent online database snapshot (Platform Admin only - Phase 11)
app.post('/admin/database/backup', requirePlatformAdmin, async (_req, res) => {
  try {
    const result = await backupDatabase();
    res.json({
      message: 'Database backup created and verified successfully.',
      ...result
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Audit Logs: Get paginated logs (Platform Admin only)
app.get('/admin/audit-logs', requirePlatformAdmin, (req, res) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 50;
    const offset = (page - 1) * limit;

    const logs = db.prepare(`
      SELECT * FROM audit_logs_admin
      ORDER BY timestamp DESC
      LIMIT ? OFFSET ?
    `).all(limit, offset) as any[];

    const total = db.prepare('SELECT COUNT(*) as count FROM audit_logs_admin').get() as { count: number };

    res.json({
      logs,
      pagination: {
        page,
        limit,
        total: total.count,
        pages: Math.ceil(total.count / limit)
      }
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// System Settings: Get all settings grouped by category (Platform Admin only)
app.get('/admin/system-settings', requirePlatformAdmin, (req, res) => {
  try {
    const settings = db.prepare(`
      SELECT * FROM system_settings
      ORDER BY category, settingKey
    `).all() as any[];

    const grouped = settings.reduce((acc: any, s: any) => {
      if (!acc[s.category]) acc[s.category] = [];
      acc[s.category].push(s);
      return acc;
    }, {});

    res.json({ settings: grouped });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// System Settings: Update settings (Platform Admin only)
app.put('/admin/system-settings', requirePlatformAdmin, (req, res) => {
  try {
    const { settings } = req.body as { settings: Array<{ id: string; settingValue: string }> };
    if (!Array.isArray(settings)) {
      res.status(400).json({ error: 'settings array required' });
      return;
    }

    const user = (req as any).user;
    const update = db.prepare("UPDATE system_settings SET settingValue = ?, updatedBy = ?, updatedAt = datetime('now') WHERE id = ?");

    const updateTxn = db.transaction(() => {
      for (const s of settings) {
        update.run(s.settingValue, user.username, s.id);
      }
    });

    updateTxn();
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// System Health: Get current metrics (Platform Admin only)
app.get('/admin/health/status', requirePlatformAdmin, (req, res) => {
  try {
    const uptime = process.uptime();
    const memUsage = process.memoryUsage();
    const activeSessions = db.prepare("SELECT COUNT(*) as count FROM sessions_store WHERE expiresAt > datetime('now')").get() as { count: number };

    res.json({
      uptime,
      memory: {
        heapUsed: Math.round(memUsage.heapUsed / 1024 / 1024),
        heapTotal: Math.round(memUsage.heapTotal / 1024 / 1024)
      },
      activeSessions: activeSessions.count,
      timestamp: new Date().toISOString()
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Platform Admin: View all subscriptions across platform
app.get('/admin/billing/subscriptions', requirePlatformAdmin, (req, res) => {
  try {
    const subscriptions = db.prepare(`
      SELECT s.*, t.name as tenantName, p.name as planName, p.priceMonthly, p.priceYearly
      FROM subscriptions s
      JOIN tenants t ON t.id = s.tenantId
      JOIN plans p ON p.id = s.planId
      ORDER BY s.createdAt DESC
    `).all() as any[];
    res.json({ subscriptions });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Platform Admin: Manually activate a subscription
app.post('/admin/billing/activate', requirePlatformAdmin, (req, res) => {
  try {
    const { subscriptionId } = req.body as { subscriptionId?: string };
    if (!subscriptionId) {
      res.status(400).json({ error: 'subscriptionId is required.' });
      return;
    }
    adminActivateSubscription(subscriptionId);
    res.json({ success: true, message: 'Subscription activated.' });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Platform Admin: Manually suspend a subscription
app.post('/admin/billing/suspend', requirePlatformAdmin, (req, res) => {
  try {
    const { tenantId, reason } = req.body as { tenantId?: string; reason?: string };
    if (!tenantId) {
      res.status(400).json({ error: 'tenantId is required.' });
      return;
    }
    suspendSubscription(tenantId, reason || 'manual_admin_suspension');
    res.json({ success: true, message: `Subscription for tenant ${tenantId} suspended.` });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// TENANT ADMIN ENDPOINTS (Scoped to current tenant)
// ═══════════════════════════════════════════════════════════════════════════

// Custom Roles: List roles for current tenant (Feature-Gated)
app.get('/admin/roles', requireTenantAdmin, requireFeature('custom_roles'), (req, res) => {
  try {
    const adminUser = (req as any).user;
    const roles = db.prepare('SELECT * FROM custom_roles WHERE tenantId = ? ORDER BY createdAt DESC').all(adminUser.tenantId) as any[];
    res.json({ roles });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Custom Roles: Create role for current tenant (Feature-Gated)
app.post('/admin/roles', requireTenantAdmin, requireFeature('custom_roles'), (req, res) => {
  try {
    const { roleName, description, permissions } = req.body as { roleName: string; description: string; permissions: any };
    const adminUser = (req as any).user;
    const id = crypto.randomUUID();

    db.prepare(`
      INSERT INTO custom_roles (id, roleName, description, permissions, createdBy, tenantId)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(id, roleName, JSON.stringify(permissions), adminUser.username, adminUser.tenantId);

    res.json({ success: true, id });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Custom Roles: Update role within current tenant (Feature-Gated)
app.put('/admin/roles/:roleId', requireTenantAdmin, requireFeature('custom_roles'), (req, res) => {
  try {
    const { roleName, description, permissions } = req.body as { roleName: string; description: string; permissions: any };
    const { roleId } = req.params;
    const adminUser = (req as any).user;

    const result = db.prepare(`
      UPDATE custom_roles SET roleName = ?, description = ?, permissions = ? WHERE id = ? AND tenantId = ?
    `).run(roleName, description, JSON.stringify(permissions), roleId, adminUser.tenantId);

    if (result.changes === 0) {
      res.status(404).json({ error: 'Role not found in your organization.' });
      return;
    }

    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// API Keys: List all keys for current tenant (Feature-Gated)
app.get('/admin/api-keys', requireTenantAdmin, requireFeature('api_keys'), (req, res) => {
  try {
    const adminUser = (req as any).user;
    const tenantId = adminUser.tenantId;

    const keys = db.prepare(`
      SELECT id, keyName, userId, scopes, expiresAt, lastUsedAt, createdAt, revokedAt, tenantId
      FROM api_keys
      WHERE tenantId = ?
      ORDER BY createdAt DESC
    `).all(tenantId) as any[];

    res.json({ keys });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// API Keys: Generate new key for current tenant (Feature-Gated & Atomic limit check)
app.post('/admin/api-keys', requireTenantAdmin, requireFeature('api_keys'), (req, res) => {
  try {
    const adminUser = (req as any).user;
    const tenantId = adminUser.tenantId;

    const { keyName, userId, scopes, expiresAt } = req.body as { keyName: string; userId: string; scopes: string[]; expiresAt?: string };
    const id = crypto.randomUUID();
    const keyValue = crypto.randomBytes(32).toString('hex');
    const keyHash = crypto.createHash('sha256').update(keyValue).digest('hex');

    const createKeyTxn = db.transaction(() => {
      // Phase 7 Invariant: Check plan limit for maxApiKeys atomically inside transaction
      const apiKeyLimitCheck = checkLimit(tenantId, 'maxApiKeys', 1);
      if (!apiKeyLimitCheck.allowed) {
        const err: any = new Error(apiKeyLimitCheck.error || `API key limit reached for your plan (${apiKeyLimitCheck.current}/${apiKeyLimitCheck.limit}).`);
        err.statusCode = 403;
        err.limitDetails = { current: apiKeyLimitCheck.current, limit: apiKeyLimitCheck.limit };
        throw err;
      }

      db.prepare(`
        INSERT INTO api_keys (id, keyName, keyHash, userId, scopes, expiresAt, tenantId)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(id, keyName, keyHash, userId, JSON.stringify(scopes), expiresAt || null, tenantId);
    });

    createKeyTxn();

    res.json({ success: true, id, keyValue, message: 'Save this key — it will not be shown again' });
  } catch (err: any) {
    res.status(err.statusCode || 500).json({
      error: err.message,
      ...(err.limitDetails ? err.limitDetails : {})
    });
  }
});

// API Keys: Revoke key within current tenant (Feature-Gated)
app.delete('/admin/api-keys/:keyId', requireTenantAdmin, requireFeature('api_keys'), (req, res) => {
  try {
    const adminUser = (req as any).user;
    const tenantId = adminUser.tenantId;
    const { keyId } = req.params;

    const result = db.prepare('UPDATE api_keys SET revokedAt = datetime("now") WHERE id = ? AND tenantId = ?').run(keyId, tenantId);
    if (result.changes === 0) {
      res.status(404).json({ error: 'API key not found.' });
      return;
    }

    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Periodic background processor for grace periods and cancellations (Phase 8)
const gracePeriodTimer = setInterval(() => {
  try {
    const processed = processGracePeriods();
    if (processed > 0) {
      console.log(`[Billing] Processed ${processed} expired grace/cancellation subscriptions.`);
    }
  } catch (err) {
    console.error('[Billing] Grace period check error:', err);
  }
}, 60 * 60 * 1000); // Check hourly

// SPA Fallback: Serve index.html for all non-API GET requests on port 3000
app.get('*', (req, res, next) => {
  if (
    req.path.startsWith('/api') ||
    req.path.startsWith('/auth') ||
    req.path.startsWith('/admin') ||
    req.path.startsWith('/download') ||
    req.path.startsWith('/socket.io') ||
    req.path.startsWith('/health') ||
    req.path.startsWith('/ready') ||
    req.path.startsWith('/metrics') ||
    req.path.startsWith('/campaigns') ||
    req.path.startsWith('/leads') ||
    req.path.startsWith('/logs') ||
    req.path.startsWith('/settings') ||
    req.path.startsWith('/info') ||
    req.path.startsWith('/crm')
  ) {
    return next();
  }
  const indexPath = path.join(frontendDist, 'index.html');
  if (fs.existsSync(indexPath)) {
    res.sendFile(indexPath);
  } else {
    next();
  }
});

// Centralized Safe Error Handling Middleware (Phase 10 Hardening)
app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error('[Server] Unhandled Error:', err?.message || err);
  const status = err.status || err.statusCode || 500;
  // Never expose internal stack traces or database errors to client
  res.status(status).json({
    error: status === 500 ? 'An unexpected error occurred. Please try again.' : err.message
  });
});

if (process.env.NODE_ENV !== 'test') {
  httpServer.listen(PORT, '0.0.0.0', () => {
    console.log(`[Octal Backend] Server running on http://0.0.0.0:${PORT}`);
    console.log(`[Local IP Address] Detected: http://${getLocalIP()}:${PORT}`);
    console.log(`[Phone must use this URL] http://${getLocalIP()}:${PORT}`);
    console.log(`[QR will auto-encode this URL in the pairing link]`);
    console.log(`[Billing] Lifecycle manager ready`);
  });
}

// Graceful Shutdown Handler (Phase 10 Hardening)
function handleGracefulShutdown(signal: string) {
  console.log(`[Server] Received ${signal}. Starting graceful shutdown...`);
  clearInterval(gracePeriodTimer);

  httpServer.close(() => {
    console.log('[Server] HTTP server closed.');
    try {
      db.close();
      console.log('[Database] SQLite database connection closed cleanly.');
    } catch (err) {
      console.error('[Database] Error closing SQLite connection:', err);
    }
    process.exit(0);
  });

  // Force exit if shutdown hangs
  setTimeout(() => {
    console.error('[Server] Forced shutdown after 10s timeout.');
    process.exit(1);
  }, 10000);
}

process.on('SIGTERM', () => {
  if (process.env.NODE_ENV !== 'production' && process.env.ALLOW_SHUTDOWN !== 'true') return;
  handleGracefulShutdown('SIGTERM');
});
process.on('SIGINT', () => {
  if (process.env.NODE_ENV !== 'production' && process.env.ALLOW_SHUTDOWN !== 'true') return;
  handleGracefulShutdown('SIGINT');
});

process.on('uncaughtException', (err) => {
  console.error('[Process] Uncaught Exception caught safely:', err);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('[Process] Unhandled Rejection at:', promise, 'reason:', reason);
});
