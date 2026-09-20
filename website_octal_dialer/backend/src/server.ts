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
import dotenv from 'dotenv';
import { apkWatcher } from './apkWatcher';
import { tunnelManager } from './tunnelManager';

dotenv.config({ path: path.join(__dirname, '../.env') });

process.on('uncaughtException', (err) => {
  console.error('[UNCAUGHT EXCEPTION]:', err);
});

process.on('unhandledRejection', (reason) => {
  console.error('[UNHANDLED REJECTION]:', reason);
});

import {
  createCampaign,
  appendLeadsToCampaign,
  getCampaigns,
  getCampaignById,
  getLeads,
  getLead,
  getLogs,
  createLog,
  createManualLog,
  updateLeadStatus,
  normalizePhone,
  releaseLeadLock,
  unlockLeadsForSession,
  getLockedLeads,
  deleteLead,
  clearAllLeadsInCampaign,
  clearFakeQueueLeads,
  releaseExpiredLeases,
  backupDatabase,
  createFollowUp,
  getFollowUps,
  updateFollowUpStatus,
  recordLeadActivity,
  getLeadActivities,
  hasUserModulePermission,
  getUserPermissions,
  updateLogDisposition,
  getNextPendingLead,
  resetAllLeadStatusesInCampaign,
  ALL_BUSINESS_MODULES,
  registerOrUpdateDevice,
  getDevicesForUser,
  getDeviceById,
  revokeDevice,
  updateDeviceStatus,
  DeviceRecord,
  getTeams,
  getTeamById,
  createTeam,
  updateTeam,
  deleteTeam,
  getTeamMembers,
  setTeamMembers,
  getTeamCampaigns,
  setTeamCampaigns,
  getUserTeamIds,
  getUserScopedCampaignIds,
  getAllTenantsSummary,
  updateTenantLeadPoolMode,
  updateTenantStatus,
  getGlobalSuperAdminMetrics,
  getTenantById,
  db
} from './databaseManager';
import { dbAdapter } from './db/dbAdapter';

import {
  reclaimOrCreateSession,
  findActiveWaitingSessionForUser,
  getSessionById,
  getSessionByToken,
  pairPhone,
  pairAuthenticatedDevice,
  revokePhone,
  setSessionStatus,
  setPhoneStatus,
  getSessionBySocketId,
  handleLaptopDisconnect,
  handlePhoneDisconnect,
  updateHeartbeat,
  getSessions,
  Session,
  CallSession,
  CallState,
  createCallSession,
  getCallSession,
  getCallSessionBySessionId,
  getCallSessionByCommandId,
  updateCallSessionState,
  finalizeCallSession
} from './sessionManager';

import {
  ensureDefaultAdmin,
  login,
  logout,
  validateToken,
  changePassword,
  verifyUserPassword,
  registerPublicUser,
  handleGoogleAuthWithIntent,
  verifyGoogleIdToken,
  updateUserRole,
  requirePlatformAdmin,
  requireTenantAdmin,
  requireModule,
  getEffectivePermissions,
  requirePermission,
  validateRoleBelongsToTenant,
  getTenantId,
  signupTenant,
  RevocationStorageUnavailableError,
  registerTokenRevocationHandler
} from './authManager';

import { registerScraperRoutes } from './scraperRoutes';
import { getTenantScraperStatus, stopTenantScraperJob } from './googleMapsScraperService';

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

const isProduction = process.env.NODE_ENV === 'production';

export const app = express();

// Canonical configured origins
const getCanonicalAllowedOrigins = (): string[] => {
  const envOrigins = (process.env.ALLOWED_ORIGINS || process.env.CORS_ORIGIN || '')
    .split(',')
    .map(s => s.trim())
    .filter(Boolean);

  const serverUrl = process.env.SERVER_URL?.trim();
  const publicUrl = process.env.PUBLIC_URL?.trim();

  const origins = new Set<string>([
    ...envOrigins,
    'http://localhost:3000',
    'http://127.0.0.1:3000',
    'http://localhost:5173',
    'http://127.0.0.1:5173',
    'http://localhost:5174',
    'http://127.0.0.1:5174',
    'http://140.245.215.156',
    'http://140.245.215.156:5000',
    'http://140.245.215.156.sslip.io'
  ]);

  if (serverUrl) origins.add(serverUrl.replace(/\/$/, ''));
  if (publicUrl) origins.add(publicUrl.replace(/\/$/, ''));

  return Array.from(origins);
};

export const isOriginAllowed = (origin: string | undefined): boolean => {
  // Non-browser clients (native Flutter/Dart mobile app, curl, server-to-server) do not send Origin header
  if (!origin) return true;

  const allowedOrigins = getCanonicalAllowedOrigins();
  if (allowedOrigins.includes(origin)) return true;

  // In development / test, also permit localhost, 127.0.0.1, LAN development subnets, and test tunnels
  if (!isProduction) {
    try {
      const parsed = new URL(origin);
      const host = parsed.hostname;
      if (
        host === 'localhost' ||
        host === '127.0.0.1' ||
        host.startsWith('192.168.') ||
        host.startsWith('10.') ||
        host.startsWith('172.') ||
        host.endsWith('.sslip.io') ||
        host.endsWith('.trycloudflare.com')
      ) {
        return true;
      }
    } catch {
      return false;
    }
  }

  return false;
};

app.use(cors({
  origin: (origin, callback) => {
    if (isOriginAllowed(origin)) {
      callback(null, true);
    } else {
      callback(new Error(`CORS origin rejected: ${origin}`));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept']
}));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));


// ─── Auth middleware ──────────────────────────────────────────────────────────
async function requireAuth(req: express.Request, res: express.Response, next: express.NextFunction): Promise<void> {
  const authHeader = req.headers['authorization'] || '';
  let token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
  if (!token && typeof req.query?.token === 'string') {
    token = req.query.token;
  }
  try {
    const user = await validateToken(token);
    if (!user) {
      res.status(401).json({ error: 'Unauthorized. Please log in.' });
      return;
    }
    (req as any).user = user;
    next();
  } catch (err: any) {
    if (err instanceof RevocationStorageUnavailableError) {
      res.status(503).json({ error: 'Authentication service temporarily unavailable.', code: 'REVOCATION_STORAGE_UNAVAILABLE' });
      return;
    }
    console.error('[Auth Middleware Error]:', err);
    res.status(500).json({ error: 'Internal authentication error.' });
  }
}

function requireAdmin(req: express.Request, res: express.Response, next: express.NextFunction): void {
  const user = (req as any).user;
  if (!user || (user.role !== 'admin' && user.role !== 'platform_admin')) {
    res.status(403).json({ error: 'Forbidden: Administrator privileges required.' });
    return;
  }
  next();
}

export const httpServer = createServer(app);
export const io = new SocketIOServer(httpServer, {
  cors: {
    origin: (origin, callback) => {
      if (isOriginAllowed(origin)) {
        callback(null, true);
      } else {
        callback(new Error(`Socket.IO CORS origin rejected: ${origin}`));
      }
    },
    methods: ['GET', 'POST'],
    credentials: true,
  },
  transports: ['websocket', 'polling'],
  allowEIO3: true,
  pingInterval: 25000,   // 25s between pings (was 10s)
  pingTimeout: 20000,    // 20s timeout (was 5s — too short for mobile WiFi)
  connectTimeout: 10000,
});

// ─── TASK 1: Socket.IO Authentication & Tenant Isolation Middleware ──────────
io.use(async (socket, next) => {
  const authObj = socket.handshake.auth || {};
  const headers = socket.handshake.headers || {};
  const authHeader = authObj.token || headers.authorization || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : authHeader;

  if (token) {
    try {
      const user = await validateToken(token);
      if (user) {
        socket.data.user = user;
        socket.data.tenantId = user.tenantId || user.id;
        return next();
      } else {
        return next(new Error('Authentication failed: Invalid token'));
      }
    } catch (err: any) {
      return next(new Error('Authentication failed: ' + err.message));
    }
  }

  // Sockets connecting without JWT (e.g., phone before pairing) are allowed initial connection,
  // but will be tenant-scoped during phone:join via the session's tenantId.
  socket.data.user = null;
  socket.data.tenantId = null;
  next();
});

const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 5000;


function findScraperInfo(): { dir: string; scriptPath: string } | null {
  const candidateDirs = [
    'C:\\Users\\ice\\.gemini\\antigravity\\scratch\\MY_PROJECTS\\Lead_And_Data_Scrapers\\google-maps-scraper-pro',
    path.resolve(__dirname, '../../../../Lead_And_Data_Scrapers/google-maps-scraper-pro'),
    path.resolve(__dirname, '../../../Lead_And_Data_Scrapers/google-maps-scraper-pro'),
    path.resolve(__dirname, '../../Lead_And_Data_Scrapers/google-maps-scraper-pro'),
    'C:\\Users\\ice\\.gemini\\antigravity\\scratch\\MY_PROJECTS\\Lead_And_Data_Scrapers'
  ];
  for (const dir of candidateDirs) {
    const scriptPath = path.join(dir, 'scraper.js');
    if (fs.existsSync(scriptPath)) {
      return { dir, scriptPath };
    }
  }
  return null;
}

function getLocalIP(): string {
  const interfaces = os.networkInterfaces();
  const candidates: { address: string; priority: number }[] = [];

  for (const name of Object.keys(interfaces)) {
    const lowerName = name.toLowerCase();

    // Ignore virtual / loopback / container network interfaces
    if (
      lowerName.includes('virtual') ||
      lowerName.includes('veth') ||
      lowerName.includes('wsl') ||
      lowerName.includes('docker') ||
      lowerName.includes('hyper-v') ||
      lowerName.includes('vmware') ||
      lowerName.includes('bluetooth') ||
      lowerName.includes('tailscale') ||
      lowerName.includes('zerotier') ||
      lowerName.includes('loopback')
    ) {
      continue;
    }

    for (const iface of interfaces[name] || []) {
      if (iface.family === 'IPv4' && !iface.internal && iface.address) {
        let priority = 10;
        // Prioritize Wi-Fi and Ethernet
        if (lowerName.includes('wi-fi') || lowerName.includes('wifi') || lowerName.includes('wireless')) {
          priority = 100;
        } else if (lowerName.includes('ethernet') || lowerName.includes('eth') || lowerName.includes('lan')) {
          priority = 80;
        }

        // Boost typical home router subnets
        if (iface.address.startsWith('192.168.')) {
          priority += 20;
        } else if (iface.address.startsWith('10.')) {
          priority += 10;
        }

        candidates.push({ address: iface.address, priority });
      }
    }
  }

  if (candidates.length > 0) {
    candidates.sort((a, b) => b.priority - a.priority);
    return candidates[0].address;
  }

  // Fallback: search any non-internal IPv4
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name] || []) {
      if (iface.family === 'IPv4' && !iface.internal) {
        return iface.address;
      }
    }
  }

  return 'localhost';
}

function getPublicBaseUrl(context?: { headers?: any; handshake?: any }): string {
  if (process.env.DEVICE_SERVER_URL) {
    return process.env.DEVICE_SERVER_URL.replace(/\/+$/, '');
  }
  if (process.env.PUBLIC_BASE_URL) {
    return process.env.PUBLIC_BASE_URL.replace(/\/+$/, '');
  }
  if (process.env.PUBLIC_URL) {
    return process.env.PUBLIC_URL.replace(/\/+$/, '');
  }
  const publicUrl = tunnelManager.getPublicUrl();
  if (publicUrl) return publicUrl.replace(/\/+$/, '');

  const host = context?.headers?.host || context?.handshake?.headers?.host;
  const proto = (context?.headers?.['x-forwarded-proto'] === 'https' || (process.env.NODE_ENV === 'production' && !host?.includes('localhost') && !host?.includes('127.0.0.1'))) ? 'https' : 'http';

  if (host) {
    const hostname = host.split(':')[0];
    // If request comes from localhost/loopback, the external phone cannot reach loopback. Use authoritative LAN IP.
    if (hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1' || hostname === '0.0.0.0') {
      return `${proto}://${getLocalIP()}:${PORT}`;
    }
    if (proto === 'https' || hostname.endsWith('.trycloudflare.com') || hostname.endsWith('.loca.lt')) {
      return `https://${hostname}`;
    }
    if (!host.includes(':') || hostname === '140.245.215.156') {
      return `${proto}://${hostname}`;
    }
    return `${proto}://${hostname}:${PORT}`;
  }
  return `${proto}://${getLocalIP()}:${PORT}`;
}

const getEffectiveServerUrl = getPublicBaseUrl;

// ─── Server Info Endpoint (Public) ──────────────────────────────────────────
app.get(['/info', '/api/info'], (req, res) => {
  const publicBase = getPublicBaseUrl({ headers: req.headers });
  res.json({
    laptopName: os.hostname(),
    localIP: getLocalIP(),
    port: PORT,
    serverUrl: publicBase,
    apkUrl: `${publicBase}/download/apk`
  });
});

// ─── Auth REST Endpoints (no requireAuth — public) ──────────────────────────

// POST /auth/login & /api/auth/login
app.post(['/auth/login', '/api/auth/login'], async (req, res) => {
  const username = (req.body?.username || req.body?.identifier || '').trim();
  const password = req.body?.password || '';
  if (!username || !password) {
    res.status(400).json({ error: 'Username and password required.' });
    return;
  }
  const token = await login(username, password);
  if (!token) {
    res.status(401).json({ error: 'Invalid username or password, or account suspended.' });
    return;
  }
  const user = await validateToken(token);
  if (!user) {
    res.status(401).json({ error: 'Session validation failed.' });
    return;
  }
  res.json({ token, username: user.username, role: user.role, user });
});

// POST /auth/register & /api/auth/register — Public Email/Password Registration Disabled
app.post(['/auth/register', '/api/auth/register'], (_req, res) => {
  res.status(403).json({
    success: false,
    code: 'REGISTRATION_DISABLED',
    error: 'Direct email/password registration is disabled. New accounts must sign up using Google OAuth.'
  });
});

// POST /auth/signup-tenant & /api/auth/signup-tenant
app.post(['/auth/signup-tenant', '/api/auth/signup-tenant'], async (req, res) => {
  try {
    const { companyName, username, email, password, country, logoUrl } = req.body;
    if (!companyName || !username || !password) {
      res.status(400).json({ error: 'Company name, username, and password are required.' });
      return;
    }
    const result = await signupTenant({
      companyName,
      username,
      email: email || '',
      password,
      country,
      logoUrl
    });
    res.json(result);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// GET /auth/verify & GET /api/auth/verify — Verifies current JWT auth token
app.get(['/auth/verify', '/api/auth/verify'], async (req, res) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({ error: 'No token provided.' });
    return;
  }
  const token = authHeader.split(' ')[1];
  const user = await validateToken(token);
  if (!user) {
    res.status(401).json({ error: 'Token invalid or expired.' });
    return;
  }
  res.json({
    valid: true,
    user: {
      id: user.id,
      username: user.username,
      role: user.role,
      tenantId: user.tenantId,
      email: user.email
    }
  });
});

// In-memory OAuth state storage for CSRF protection & origin routing
const oauthStates = new Map<string, { clientOrigin: string; intent: string; redirectUri?: string; createdAt: number }>();

// GET /auth/config & GET /api/auth/config — Public client configuration
app.get(['/auth/config', '/api/auth/config'], (_req, res) => {
  const clientId = (process.env.GOOGLE_CLIENT_ID || '');
  res.json({
    googleClientId: clientId,
    captchaSiteKey: null,
    captchaEnabled: false
  });
});

// Helper: calculate OAuth redirect URI dynamically based on client origin or host
function getOAuthRedirectUri(clientOrigin: string, req: express.Request): string {
  // Explicit env override has highest priority
  if (process.env.GOOGLE_REDIRECT_URI) {
    return process.env.GOOGLE_REDIRECT_URI;
  }

  // Detect real domain from host headers or client origin
  const host = (req.headers['x-forwarded-host'] as string) || req.headers.host || '';
  
  if (host.includes('zestify7.online') || clientOrigin.includes('zestify7.online')) {
    return 'https://zestify7.online/auth/google/callback';
  }

  // HTTPS / custom domain / Vercel
  if (clientOrigin && clientOrigin.startsWith('https://')) {
    return `${clientOrigin.replace(/\/$/, '')}/auth/google/callback`;
  }

  const proto = (req.headers['x-forwarded-proto'] as string) || req.protocol || 'http';
  if (host && !host.includes('127.0.0.1') && !host.includes('localhost')) {
    return `${proto}://${host}/auth/google/callback`;
  }

  return `http://localhost:${PORT}/auth/google/callback`;
}

// POST /auth/google/initiate — Returns direct Google OAuth URL
app.post(['/auth/google/initiate', '/api/auth/google/initiate'], (req, res) => {
  const { intent = 'signin' } = req.body || {};
  const clientOrigin = req.headers.referer ? new URL(req.headers.referer).origin : (req.headers.origin || `http://${req.headers.host || 'localhost'}`);
  const clientId = (process.env.GOOGLE_CLIENT_ID || '');

  const redirectUri = getOAuthRedirectUri(clientOrigin, req);
  const state = crypto.randomBytes(24).toString('hex');

  oauthStates.set(state, {
    clientOrigin,
    intent,
    redirectUri,
    createdAt: Date.now()
  });

  const scope = encodeURIComponent('openid email profile');
  const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${encodeURIComponent(clientId)}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&scope=${scope}&state=${state}&prompt=select_account`;

  res.json({ success: true, authUrl });
});

// GET /auth/google & GET /api/auth/google — Initiates OAuth Redirect
app.get(['/auth/google', '/api/auth/google'], (req, res) => {
  const clientOrigin = req.headers.referer ? new URL(req.headers.referer).origin : `http://${req.headers.host || 'localhost'}`;
  const clientId = (process.env.GOOGLE_CLIENT_ID || '');

  const redirectUri = getOAuthRedirectUri(clientOrigin, req);
  const intent = (req.query.intent as string) || 'signin';
  const state = crypto.randomBytes(24).toString('hex');

  oauthStates.set(state, {
    clientOrigin,
    intent,
    redirectUri,
    createdAt: Date.now()
  });

  const scope = encodeURIComponent('openid email profile');
  const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${encodeURIComponent(clientId)}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&scope=${scope}&state=${state}&prompt=select_account`;

  console.log(`[OAuth] Redirecting user to Google OAuth consent screen (intent: ${intent}, redirect: ${redirectUri})`);
  res.redirect(authUrl);
});

// GET /auth/google/callback & GET /api/auth/google/callback — Handles OAuth Code Exchange
app.get(['/auth/google/callback', '/api/auth/google/callback'], async (req, res) => {
  const host = (req.headers['x-forwarded-host'] as string) || req.headers.host || '';
  const isProd = host.includes('zestify7.online') || !host.includes('localhost');
  const fallbackOrigin = isProd ? 'https://zestify7.online' : 'http://localhost:5173';
  let clientOrigin = fallbackOrigin;
  let storedRedirectUri: string | undefined;

  try {
    const { code, state, error } = req.query as { code?: string; state?: string; error?: string };

    let authIntent: 'signin' | 'signup' = 'signin';
    if (state && oauthStates.has(state)) {
      const stored = oauthStates.get(state)!;
      clientOrigin = stored.clientOrigin;
      authIntent = (stored as any).intent || 'signin';
      storedRedirectUri = (stored as any).redirectUri;
      oauthStates.delete(state);
    }

    if (error || !code) {
      res.redirect(`${clientOrigin}/?auth_error=${encodeURIComponent(error || 'Google authorization cancelled')}`);
      return;
    }

    const clientId = (process.env.GOOGLE_CLIENT_ID || '');
    const clientSecret = (process.env.GOOGLE_CLIENT_SECRET || '');
    const redirectUri = storedRedirectUri || getOAuthRedirectUri(clientOrigin, req);

    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        grant_type: 'authorization_code'
      })
    });

    const tokenData = await tokenRes.json() as any;
    if (!tokenData.id_token && !tokenData.access_token) {
      throw new Error(tokenData.error_description || tokenData.error || 'Failed to obtain Google tokens.');
    }

    const profile = await verifyGoogleIdToken(tokenData.id_token);
    const result = await handleGoogleAuthWithIntent(profile, authIntent);

    res.redirect(`${clientOrigin}/?token=${encodeURIComponent(result.token)}&username=${encodeURIComponent(result.user.username)}&displayName=${encodeURIComponent((result.user as any).displayName || result.user.username)}&user=${encodeURIComponent(result.user.username)}&isNewUser=${result.isNewUser}`);
  } catch (err: any) {
    console.error('[Google OAuth Callback Error]:', err);
    const code = err.code || 'GOOGLE_AUTH_FAILED';
    const emailParam = err.email ? `&email=${encodeURIComponent(err.email)}` : '';
    res.redirect(`${clientOrigin}/?auth_error=${encodeURIComponent(code)}&message=${encodeURIComponent(err.message || 'Google authentication failed.')}${emailParam}`);
  }
});

// POST /auth/google/verify & /api/auth/google/verify — Google One-Tap / Pop-up verification with intent
app.post(['/auth/google/verify', '/api/auth/google/verify', '/auth/google', '/api/auth/google'], async (req, res) => {
  const { credential, intent = 'signin' } = req.body || {};
  if (typeof credential !== 'string' || !credential || !['signin', 'signup'].includes(intent)) {
    res.status(400).json({ error: 'A Google ID token and valid sign-in intent are required.' });
    return;
  }
  try {
    const profile = await verifyGoogleIdToken(credential);
    const result = await handleGoogleAuthWithIntent(profile, intent);
    res.json({ success: true, token: result.token, username: result.user.username,
      role: result.user.role, user: result.user, isNewUser: result.isNewUser });
  } catch (err: any) {
    res.status(400).json({ code: err.code || 'GOOGLE_AUTH_FAILED', error: err.message || 'Google authentication failed.' });
  }
});

// GET /auth/permissions & /api/auth/permissions — Module permissions for authenticated user
app.get(['/auth/permissions', '/api/auth/permissions'], requireAuth, async (req, res) => {
  const user = (req as any).user;
  if (!user) {
    res.status(401).json({ error: 'Unauthorized.' });
    return;
  }

  // Resolve effective permissions
  const effectivePerms = await getEffectivePermissions(user);
  const isFullAccess = effectivePerms.has('*') || effectivePerms.has('all') || user.role === 'platform_admin' || user.role === 'master_admin';

  // Compute module visibility map expected by the frontend
  const modulePerms: Record<string, boolean> = {};
  for (const m of ALL_BUSINESS_MODULES) {
    if (isFullAccess) {
      modulePerms[m] = true;
    } else {
      if (m === 'octalDialer') {
        modulePerms[m] = Array.from(effectivePerms).some(p => p.startsWith('calls:'));
      } else if (m === 'reports') {
        modulePerms[m] = Array.from(effectivePerms).some(p => p.startsWith('reports:') || p.startsWith('history:'));
      } else if (m === 'googleScraper' || m === 'autoEmailer' || m === 'facebookScraper' || m === 'facebookPoster') {
        modulePerms[m] = effectivePerms.has(m) || effectivePerms.has(`${m}:view`);
      } else {
        modulePerms[m] = effectivePerms.has(`${m}:view`) || Array.from(effectivePerms).some(p => p.startsWith(`${m}:`));
      }
    }
  }

  res.json({
    success: true,
    permissions: modulePerms,
    actionPermissions: Array.from(effectivePerms),
    userRole: user.role
  });
});

// POST /api/mobile/login — Dedicated Mobile App Login & Instant Session Sync
app.post('/api/mobile/login', async (req, res) => {
  const { username, password, email, googleAuthData, deviceName, phoneBtAddress, phoneOsType, phoneIpAddress } = req.body as {
    username?: string;
    password?: string;
    email?: string;
    googleAuthData?: any;
    deviceName?: string;
    phoneBtAddress?: string;
    phoneOsType?: string;
    phoneIpAddress?: string;
  };

  try {
    let authResult: { token: string; user: any } | null = null;

    if (googleAuthData && (googleAuthData.email || googleAuthData.credential)) {
      const gIntent = googleAuthData.intent === 'signup' ? 'signup' : 'signin';
      const profile = await verifyGoogleIdToken(googleAuthData.credential);
      authResult = await handleGoogleAuthWithIntent(profile, gIntent);
    } else if (username && password) {
      const token = await login(username, password);
      if (token) {
        const u = await validateToken(token);
        if (u) authResult = { token, user: u };
      }
    } else if (email && password) {
      const token = await login(email, password);
      if (token) {
        const u = await validateToken(token);
        if (u) authResult = { token, user: u };
      }
    }

    if (!authResult) {
      res.status(401).json({ error: 'Invalid login credentials or account inactive.' });
      return;
    }

    // Allocate or reclaim an active calling session scoped strictly to caller's tenantId
    const tenantId = authResult.user.tenantId;
    if (!tenantId) {
      res.status(401).json({ error: 'Unauthorized: missing tenant identity' });
      return;
    }
    const tenantSessions = (Array.from(getSessions().values()) as Session[]).filter(s => s.tenantId === tenantId && s.userId === authResult!.user.id && s.status === 'WAITING');
    const activeSession = tenantSessions.length > 0 ? tenantSessions[0] : reclaimOrCreateSession('laptop_mobile_host', undefined, tenantId, authResult.user.id);

    // HTTP login does not create a fake online socket. Pair after the authenticated socket connects.

    // Retrieve database campaigns & leads summary
    const campaigns = await db.queryAll(`SELECT * FROM campaigns WHERE "tenantId" = $1 ORDER BY "createdAt" DESC`, [tenantId]);
    const leads = await db.queryAll(`SELECT id, "campaignId", name, phone, status, outcome, duration FROM leads WHERE "tenantId" = $1 LIMIT 100`, [tenantId]);

    res.json({
      success: true,
      token: authResult.token,
      user: authResult.user,
      sessionId: activeSession.id,
      pairingToken: activeSession.token,
      laptopName: activeSession.laptopName || 'Host Server',
      laptopBtAddress: activeSession.laptopBtAddress || '',
      serverUrl: getPublicBaseUrl(req),
      campaigns,
      leads
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Mobile login failed.' });
  }
});

// GET /api/user/quota  (requires auth)
app.get('/api/user/quota', requireAuth, (req, res) => {
  const user = (req as any).user;
  const isUnlimited = user.role === 'platform_admin' || user.role === 'admin';
  res.json({
    userId: user.id,
    username: user.username,
    role: user.role,
    leadLimit: isUnlimited ? -1 : 1000,
    leadsScraped: 0,
    remaining: isUnlimited ? -1 : 1000,
    isUnlimited,
    status: 'active'
  });
});

// POST /auth/logout & /api/auth/logout
app.post(['/auth/logout', '/api/auth/logout'], async (req, res) => {
  const authHeader = req.headers['authorization'] || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : (req.body?.token || '');
  if (!token) {
    res.status(400).json({ error: 'No token provided for logout.' });
    return;
  }
  try {
    await logout(token);
    res.json({ success: true, message: 'Logged out successfully.' });
  } catch (err: any) {
    console.error('[Auth Logout Error]:', err);
    res.status(503).json({
      success: false,
      error: 'Logout could not be durably recorded due to database storage unavailability.',
      code: 'REVOCATION_STORAGE_UNAVAILABLE'
    });
  }
});

// POST /auth/change-password  (requires auth)
app.post('/auth/change-password', requireAuth, async (req, res) => {
  const { newPassword } = req.body as { newPassword: string };
  if (!newPassword || newPassword.length < 6) {
    res.status(400).json({ error: 'Password must be at least 6 characters.' });
    return;
  }
  const user = (req as any).user;
  await changePassword(user.id, newPassword);
  res.json({ success: true });
});

// GET /auth/me — validate token and return current user
app.get('/auth/me', requireAuth, (req, res) => {
  res.json({ user: (req as any).user });
});

// ─── User Profile & Account Management REST Endpoints ─────────────────────────

// GET /api/user/profile — Return authenticated user's profile details
app.get('/api/user/profile', requireAuth, async (req, res) => {
  try {
    const caller = (req as any).user;
    const user = await db.queryOne<any>(
      `SELECT id, username, "displayName", email, phone, role, "tenantId", status, "ipRestrictions", avatar_url, "createdAt" FROM users WHERE id = $1`,
      [caller.id]
    );
    if (!user) {
      res.status(404).json({ error: 'User not found.' });
      return;
    }
    const parts = (user.displayName || user.username || '').split(' ');
    const firstName = parts[0] || '';
    const lastName = parts.slice(1).join(' ') || '';
    const accountNo = user.tenantId ? `Account-${user.tenantId.replace(/[^a-zA-Z0-9]/g, '').slice(-4).toUpperCase()}` : 'Trial-2421';

    res.json({
      id: user.id,
      username: user.username,
      displayName: user.displayName || user.username,
      firstName,
      lastName,
      email: user.email || '',
      phone: user.phone || '',
      role: user.role,
      status: user.status || 'Active',
      accountNo,
      recordsPerPage: 25,
      twoFactorEnabled: false,
      avatarUrl: user.avatar_url || ''
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to fetch user profile.' });
  }
});

// PUT /api/user/profile — Update personal information and preferences
app.put('/api/user/profile', requireAuth, async (req, res) => {
  try {
    const caller = (req as any).user;
    const { firstName = '', lastName = '', phone = '', recordsPerPage = 25, twoFactorEnabled = false, avatarUrl } = req.body;
    const computedDisplayName = `${firstName} ${lastName}`.trim() || caller.username;
    const now = new Date().toISOString();

    if (avatarUrl !== undefined) {
      await db.execute(
        `UPDATE users SET "displayName" = $1, phone = $2, avatar_url = $3, "updatedAt" = $4 WHERE id = $5`,
        [computedDisplayName, phone, avatarUrl, now, caller.id]
      );
    } else {
      await db.execute(
        `UPDATE users SET "displayName" = $1, phone = $2, "updatedAt" = $3 WHERE id = $4`,
        [computedDisplayName, phone, now, caller.id]
      );
    }

    res.json({
      success: true,
      message: 'Profile updated successfully.',
      profile: {
        displayName: computedDisplayName,
        firstName,
        lastName,
        phone,
        recordsPerPage,
        twoFactorEnabled,
        avatarUrl
      }
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to update profile.' });
  }
});

// POST /api/user/avatar — Dedicated image upload/update endpoint
app.post('/api/user/avatar', requireAuth, async (req, res) => {
  try {
    const caller = (req as any).user;
    const { avatarUrl } = req.body;
    if (!avatarUrl) {
      res.status(400).json({ error: 'avatarUrl is required.' });
      return;
    }
    const now = new Date().toISOString();
    await db.execute(
      `UPDATE users SET avatar_url = $1, "updatedAt" = $2 WHERE id = $3`,
      [avatarUrl, now, caller.id]
    );
    res.json({ success: true, message: 'Avatar updated successfully.', avatarUrl });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to update avatar.' });
  }
});

// POST /api/user/change-password — Secure password update with validation rules
app.post('/api/user/change-password', requireAuth, async (req, res) => {
  try {
    const caller = (req as any).user;
    const { oldPassword, newPassword, confirmPassword } = req.body;

    if (!oldPassword || !newPassword) {
      res.status(400).json({ error: 'Current password and new password are required.' });
      return;
    }

    // 1. Verify old password against stored hash
    const isValidOld = await verifyUserPassword(caller.id, oldPassword);
    if (!isValidOld) {
      res.status(400).json({ error: 'Current password is incorrect.' });
      return;
    }

    // 2. Validate password rules
    if (newPassword.length < 8) {
      res.status(400).json({ error: 'New password must be at least 8 characters long.' });
      return;
    }
    if (!/[A-Z]/.test(newPassword)) {
      res.status(400).json({ error: 'New password must contain at least 1 capital letter.' });
      return;
    }
    if (!/[0-9]/.test(newPassword)) {
      res.status(400).json({ error: 'New password must contain at least 1 numeric character.' });
      return;
    }
    if (!/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(newPassword)) {
      res.status(400).json({ error: 'New password must contain at least 1 special character.' });
      return;
    }
    if (confirmPassword && newPassword !== confirmPassword) {
      res.status(400).json({ error: 'New password and confirmation do not match.' });
      return;
    }

    // 3. Save new password
    await changePassword(caller.id, newPassword);
    res.json({ success: true, message: 'Password updated successfully.' });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to change password.' });
  }
});

// POST /api/user/revoke-devices — Remove all other trusted sessions
app.post('/api/user/revoke-devices', requireAuth, async (req, res) => {
  try {
    const caller = (req as any).user;
    const authHeader = req.headers.authorization;
    const currentToken = authHeader?.startsWith('Bearer ') ? authHeader.substring(7) : '';

    if (currentToken) {
      await db.execute(`DELETE FROM sessions_store WHERE "userId" = $1 AND token != $2`, [caller.id, currentToken]);
    } else {
      await db.execute(`DELETE FROM sessions_store WHERE "userId" = $1`, [caller.id]);
    }

    res.json({ success: true, message: 'All other trusted devices have been removed.' });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to revoke devices.' });
  }
});

// ─── Safety Controller REST Endpoints ───────────────────────────────────────

// GET /api/suppression-list — list all DNC numbers
app.get('/api/suppression-list', requireAuth, async (req, res) => {
  const user = (req as any).user;
  const tenantId = user?.tenantId;
  if (!tenantId) {
    res.status(401).json({ error: 'Unauthorized: missing tenant identity' });
    return;
  }
  res.json(await getSuppressionList(tenantId));
});

// POST /api/suppression-list — add a number to DNC
app.post('/api/suppression-list', requireAuth, async (req, res) => {
  const { phone, reason } = req.body as { phone: string; reason?: string };
  if (!phone || !phone.trim()) {
    res.status(400).json({ error: 'Phone number is required.' });
    return;
  }
  const user = (req as any).user;
  const tenantId = user?.tenantId;
  if (!tenantId) {
    res.status(401).json({ error: 'Unauthorized: missing tenant identity' });
    return;
  }
  const added = await addToSuppressionList(phone.trim(), reason || 'Manual DNC', 'dashboard', user.username, tenantId);
  if (added) {
    res.json({ success: true, message: `${phone} added to suppression list.` });
  } else {
    res.status(400).json({ error: 'Number already on suppression list or invalid.' });
  }
});

// POST /api/suppression-list/import — bulk add DNC numbers
app.post('/api/suppression-list/import', requireAuth, async (req, res) => {
  const { entries, reason } = req.body as { entries: { phone: string; reason?: string }[]; reason?: string };
  if (!Array.isArray(entries) || entries.length === 0) {
    res.status(400).json({ error: 'Array of entries with phone property is required.' });
    return;
  }
  const user = (req as any).user;
  const tenantId = user?.tenantId;
  if (!tenantId) {
    res.status(401).json({ error: 'Unauthorized: missing tenant identity' });
    return;
  }
  const result = await bulkAddToSuppressionList(
    entries.map(e => ({ phone: e.phone, reason: e.reason || reason || 'Bulk DNC Import' })),
    'dashboard_import',
    user.username,
    tenantId
  );
  res.json({ success: true, addedCount: result.added, skippedCount: result.skipped });
});

// DELETE /api/suppression-list/:id — remove from DNC
app.delete('/api/suppression-list/:id', requireAuth, async (req, res) => {
  const user = (req as any).user;
  const tenantId = user?.tenantId;
  if (!tenantId) {
    res.status(401).json({ error: 'Unauthorized: missing tenant identity' });
    return;
  }
  const success = await removeFromSuppressionList(req.params.id, user.username, tenantId);
  if (success) {
    res.json({ success: true });
  } else {
    res.status(404).json({ error: 'DNC entry not found in your tenant.' });
  }
});

// POST /api/emergency-stop — halts all active calls immediately
app.post('/api/emergency-stop', requireAuth, async (req, res) => {
  const user = (req as any).user;
  const tenantId = user.tenantId;
  if (!tenantId) {
    res.status(401).json({ error: 'Unauthorized: missing tenant identity' });
    return;
  }
  triggerEmergencyStop(tenantId);
  await writeAuditLog('EMERGENCY_STOP', 'tenant', tenantId, user.username, 'Emergency stop activated', tenantId);

  // Send hangup only to this tenant's active sessions' phones
  for (const [, sess] of getSessions()) {
    if (sess.tenantId === tenantId && sess.phoneSocketId) {
      const ps = io.sockets.sockets.get(sess.phoneSocketId);
      if (ps) ps.emit('phone:hangup');
    }
  }
  io.to(`tenant_${tenantId}`).emit('campaign:emergency_stopped', { stoppedBy: user.username, timestamp: new Date().toISOString() });
  console.warn(`[EmergencyStop] Triggered by ${user.username} for tenant ${tenantId}`);
  res.json({ success: true, message: 'Emergency stop activated. All dialing halted.' });
});

// POST /api/emergency-stop/clear — re-enable dialing after emergency stop
app.post('/api/emergency-stop/clear', requireAuth, async (req, res) => {
  const user = (req as any).user;
  const tenantId = user.tenantId;
  if (!tenantId) {
    res.status(401).json({ error: 'Unauthorized: missing tenant identity' });
    return;
  }
  if (user.role === 'agent') {
    res.status(403).json({ error: 'Only administrators or supervisors can clear emergency stops.' });
    return;
  }
  clearEmergencyStop(tenantId);
  await writeAuditLog('EMERGENCY_STOP_CLEAR', 'tenant', tenantId, user.username, 'Emergency stop cleared', tenantId);
  io.to(`tenant_${tenantId}`).emit('campaign:emergency_cleared', { clearedBy: user.username });
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
app.get('/api/commands', requireAuth, async (req, res) => {
  const user = (req as any).user;
  const isPlatformAdmin = user?.role === 'platform_admin' || user?.role === 'master_admin';
  const tenantId = isPlatformAdmin ? (req.query.tenantId as string | undefined) : user?.tenantId;
  res.json(await getActiveCommands(tenantId));
});

// GET /api/leads/locked — list all currently locked leads
app.get('/api/leads/locked', requireAuth, async (req, res) => {
  const user = (req as any).user;
  const isPlatformAdmin = user?.role === 'platform_admin' || user?.role === 'master_admin';
  const tenantId = isPlatformAdmin ? (req.query.tenantId as string | undefined) : user?.tenantId;
  res.json(await getLockedLeads(tenantId));
});

// POST /api/devices/register — register or update a mobile device
app.post('/api/devices/register', requireAuth, async (req, res) => {
  try {
    const user = (req as any).user;
    const { id, name, btAddress, osType, ipAddress, platform, appVersion, deviceUid } = req.body;
    if (!name && !deviceUid) {
      res.status(400).json({ error: 'Device name or device UID is required.' });
      return;
    }
    const device = await registerOrUpdateDevice({
      id,
      name: name || 'Android Device',
      userId: user.id,
      tenantId: user.tenantId,
      btAddress,
      osType,
      ipAddress,
      platform: platform || 'android',
      appVersion: appVersion || '1.2.0',
      deviceUid
    });
    res.json({ success: true, device });
  } catch (err: any) {
    res.status(400).json({ error: err.message || 'Failed to register device.' });
  }
});

// GET /api/devices — list registered devices for current user and tenant
app.get('/api/devices', requireAuth, async (req, res) => {
  try {
    const user = (req as any).user;
    let devices: DeviceRecord[] = [];
    if (req.query.all === 'true' && (user.role === 'platform_admin' || user.role === 'admin')) {
      devices = await db.queryAll(`SELECT * FROM devices WHERE "tenantId" = $1 AND "isRevoked" = 0 ORDER BY "lastSeenAt" DESC`, [user.tenantId]) as DeviceRecord[];
    } else {
      devices = await getDevicesForUser(user.id, user.tenantId);
    }

    const augmented = devices.map(d => {
      const activeSocket = authenticatedPhoneSockets.get(d.id);
      const isOnline = !!activeSocket;
      return {
        ...d,
        isSocketOnline: isOnline,
        status: isOnline ? (d.status === 'PAIRED' || d.status === 'IN_CALL' ? d.status : 'ONLINE') : 'OFFLINE'
      };
    });

    res.json(augmented);
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to fetch devices.' });
  }
});

// POST /api/devices/:id/revoke — revoke device access
app.post('/api/devices/:id/revoke', requireAuth, async (req, res) => {
  try {
    const user = (req as any).user;
    const deviceId = req.params.id;
    const isAdmin = user.role === 'platform_admin' || user.role === 'admin';
    const success = await revokeDevice(deviceId, user.id, user.tenantId, isAdmin);
    if (!success) {
      res.status(404).json({ error: 'Device not found or not authorized.' });
      return;
    }

    const active = authenticatedPhoneSockets.get(deviceId);
    if (active) {
      const sock = io.sockets.sockets.get(active.socketId);
      if (sock) {
        sock.emit('phone:kicked', { reason: 'Device has been revoked.' });
        sock.disconnect(true);
      }
      authenticatedPhoneSockets.delete(deviceId);
    }

    const statusPayload = { deviceId, status: 'REVOKED', isSocketOnline: false };
    if (user.tenantId) {
      io.to(`tenant_${user.tenantId}`).emit('device:status-changed', statusPayload);
    }

    res.json({ success: true, message: `Device ${deviceId} revoked.` });
  } catch (err: any) {
    res.status(400).json({ error: err.message || 'Failed to revoke device.' });
  }
});

// GET /api/audit-logs & /admin/audit-logs — view system audit logs
app.get(['/api/audit-logs', '/admin/audit-logs'], requireAuth, async (req, res) => {
  const user = (req as any).user;
  const isPlatform = user.role === 'platform_admin' || user.role === 'master_admin';
  const logs = isPlatform
    ? await db.queryAll(`SELECT * FROM audit_logs ORDER BY timestamp DESC LIMIT 200`)
    : await db.queryAll(`SELECT * FROM audit_logs WHERE "tenantId" = $1 ORDER BY timestamp DESC LIMIT 200`, [user.tenantId]);
  res.json({ logs, pagination: { total: logs.length, totalPages: 1 } });
});

// POST /api/leads/:id/unlock — manually unlock a lead (strictly tenant-scoped)
app.post('/api/leads/:id/unlock', requireAuth, async (req, res) => {
  const user = (req as any).user;
  const tenantId = user?.tenantId;
  if (!tenantId) {
    res.status(401).json({ error: 'Unauthorized: missing tenant identity' });
    return;
  }
  const lead = await getLead(req.params.id, tenantId);
  if (!lead) {
    res.status(404).json({ error: 'Lead not found in your organization.' });
    return;
  }
  await releaseLeadLock(req.params.id, undefined, tenantId);
  res.json({ success: true, message: `Lead ${req.params.id} unlocked.` });
});

// GET /api/session/resolve — resolves and validates a session for pairing by authenticated mobile clients
app.get('/api/session/resolve', requireAuth, (req, res) => {
  const user = (req as any).user;
  const sessionId = req.query.sessionId as string;
  const token = req.query.token as string;

  if (!sessionId || !token) {
    res.status(400).json({ error: 'sessionId and token are required.' });
    return;
  }

  const session = getSessionById(sessionId);
  if (!session) {
    res.status(404).json({ error: 'Session not found or expired.' });
    return;
  }

  if (session.tenantId && user.tenantId && session.tenantId !== user.tenantId) {
    res.status(403).json({ error: 'Forbidden: Session belongs to a different tenant.' });
    return;
  }

  if (session.token !== token) {
    res.status(401).json({ error: 'Invalid pairing token.' });
    return;
  }

  res.json({
    success: true,
    sessionId: session.id,
    laptopName: session.laptopName,
    laptopBtAddress: session.laptopBtAddress,
    status: session.status,
    serverUrl: getPublicBaseUrl(req)
  });
});

// REST: Campaigns (protected, strictly tenant-scoped with team-level scoping for agents)
app.get(['/campaigns', '/api/campaigns', '/api/campaigns/mobile'], requireAuth, async (req, res) => {
  const user = (req as any).user;
  const tenantId = user?.tenantId;
  if (!tenantId) {
    res.status(401).json({ error: 'Unauthorized: missing tenant identity' });
    return;
  }
  const allCampaigns = await getCampaigns(tenantId);
  const isElevated = ['admin', 'platform_admin', 'master_admin'].includes(user.role?.toLowerCase());
  if (isElevated) {
    res.json(allCampaigns);
    return;
  }

  // Non-admin agent/user: check if team scoping is configured in this tenant
  const hasTeamsInTenant = await db.queryOne<{ count: string | number }>(
    `SELECT COUNT(*)::int AS count FROM campaign_teams WHERE "tenantId" = $1`,
    [tenantId]
  );
  const activeScopingCount = Number(hasTeamsInTenant?.count || 0);

  // If no campaigns are mapped to any teams in this tenant, fallback to all tenant campaigns
  if (activeScopingCount === 0) {
    res.json(allCampaigns);
    return;
  }

  // Scoping is active: only return campaigns assigned to this user's teams
  const scopedCampaignIds = await getUserScopedCampaignIds(user.id, tenantId);
  const scopedSet = new Set(scopedCampaignIds);
  const filtered = allCampaigns.filter(c => scopedSet.has(c.id));
  res.json(filtered);
});

// REST: Create campaign (protected, strictly tenant-scoped)
app.post(['/campaigns', '/api/campaigns'], requireAuth, async (req, res) => {
  try {
    const tenantId = (req as any).user?.tenantId;
    if (!tenantId) {
      res.status(401).json({ error: 'Unauthorized: missing tenant identity' });
      return;
    }
    const { name, description = '' } = req.body;
    if (!name) {
      res.status(400).json({ error: 'Campaign name is required.' });
      return;
    }
    const result = await createCampaign(name, description, [], tenantId);
    io.to(`tenant_${tenantId}`).emit('campaigns:updated');
    res.json(result.campaign);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// REST: Get leads for a campaign (protected)
app.get(['/campaigns/:id/leads', '/api/campaigns/:id/leads'], requireAuth, async (req, res) => {
  const tenantId = (req as any).user?.tenantId;
  if (!tenantId) {
    res.status(401).json({ error: 'Unauthorized: missing tenant identity' });
    return;
  }
  const campaign = await getCampaignById(req.params.id, tenantId);
  if (!campaign) {
    res.status(404).json({ error: 'Campaign not found in your organization.' });
    return;
  }
  res.json(await getLeads(req.params.id, tenantId));
});

// REST: Global Leads search & pagination (protected)
app.get(['/leads', '/api/leads'], requireAuth, requirePermission(['leads:view', 'crm:view']), async (req, res) => {
  try {
    const tenantId = (req as any).user?.tenantId;
    if (!tenantId) {
      res.status(401).json({ error: 'Unauthorized: missing tenant identity' });
      return;
    }
    const page = Math.max(1, parseInt(req.query.page as string, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string, 10) || 50));
    const offset = (page - 1) * limit;
    const source = (req.query.source as string || '').trim();
    const status = (req.query.status as string || '').trim();

    let query = `
      SELECT l.id, l.name, l.phone, l.status, l.outcome, l.duration, l."createdAt", l."campaignId",
             c.name as "campaignName"
      FROM leads l
      LEFT JOIN campaigns c ON l."campaignId" = c.id
      WHERE l."tenantId" = $1 AND l.status != 'ARCHIVED'
    `;
    const params: any[] = [tenantId];

    if (source) {
      query += ` AND (c.name LIKE $${params.length + 1} OR l."campaignId" = $${params.length + 2})`;
      params.push(`%${source}%`, source);
    }
    if (status) {
      query += ` AND l.status = $${params.length + 1}`;
      params.push(status);
    }

    query += ` ORDER BY l."createdAt" DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
    params.push(limit, offset);

    const leads = await db.queryAll<any>(query, params);

    // Count total for pagination
    let countQuery = `
      SELECT COUNT(*) as total
      FROM leads l
      LEFT JOIN campaigns c ON l."campaignId" = c.id
      WHERE l."tenantId" = $1 AND l.status != 'ARCHIVED'
    `;
    const countParams: any[] = [tenantId];
    if (source) {
      countQuery += ` AND (c.name LIKE $${countParams.length + 1} OR l."campaignId" = $${countParams.length + 2})`;
      countParams.push(`%${source}%`, source);
    }
    if (status) {
      countQuery += ` AND l.status = $${countParams.length + 1}`;
      countParams.push(status);
    }

    const countRow = await db.queryOne<{ total: string | number }>(countQuery, countParams);
    const total = countRow ? Number(countRow.total) : leads.length;

    const formattedLeads = leads.map(r => ({
      id: r.id,
      source: r.campaignName || 'Lead Queue',
      businessName: r.name || 'Unknown Contact',
      phone: r.phone || '',
      email: null,
      address: null,
      website: null,
      status: r.status === 'COMPLETED' ? 'converted' : (r.status === 'PENDING' ? 'new' : 'contacted'),
      scrapedBy: 'Auto Dialer',
      scrapedAt: r.createdAt || new Date().toISOString()
    }));

    res.json({
      leads: formattedLeads,
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit) || 1
      }
    });
  } catch (err: any) {
    console.error('Error fetching leads:', err);
    res.status(500).json({ error: 'Internal server error while fetching leads' });
  }
});

// REST: Update lead status (protected)
app.patch(['/leads/:id', '/api/leads/:id'], requireAuth, requirePermission(['leads:edit', 'crm:edit']), async (req, res) => {
  try {
    const tenantId = (req as any).user?.tenantId;
    if (!tenantId) {
      res.status(401).json({ error: 'Unauthorized: missing tenant identity' });
      return;
    }
    const { status } = req.body;
    if (!status) {
      res.status(400).json({ error: 'Status is required' });
      return;
    }
    const info = await db.execute(`UPDATE leads SET status = $1 WHERE id = $2 AND "tenantId" = $3`, [status, req.params.id, tenantId]);
    if (info.rowCount === 0) {
      res.status(404).json({ error: 'Lead not found in your organization.' });
      return;
    }
    io.to(`tenant_${tenantId}`).emit('leads:updated');
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// REST: CRM Campaign Workspace telemetry & leads (protected)
app.get('/api/crm/campaigns/:id/workspace', requireAuth, requirePermission(['campaigns:view', 'crm:view']), async (req, res) => {
  try {
    const tenantId = (req as any).user?.tenantId;
    if (!tenantId) {
      res.status(401).json({ error: 'Unauthorized: missing tenant identity' });
      return;
    }
    const campaignId = req.params.id;
    const campaign = await getCampaignById(campaignId, tenantId);
    if (!campaign) {
      res.status(404).json({ error: 'Campaign not found in your organization.' });
      return;
    }

    const leads = await db.queryAll(`SELECT * FROM leads WHERE "campaignId" = $1 AND "tenantId" = $2 AND status != 'ARCHIVED' ORDER BY "createdAt" ASC, "id" ASC`, [campaignId, tenantId]) as any[];

    const totalLeads = leads.length;
    const completedLeads = leads.filter(l => l.status === 'COMPLETED').length;
    const pendingLeads = leads.filter(l => l.status === 'PENDING').length;
    const callingLeads = leads.filter(l => l.status === 'CALLING').length;
    const answeredLeads = leads.filter(l => l.outcome === 'ANSWERED' || l.outcome === 'CONNECTED').length;
    const noAnswerLeads = leads.filter(l => l.outcome === 'NO_ANSWER' || l.outcome === 'NO_PICKUP' || l.outcome === 'MISSED').length;
    const voicemailLeads = leads.filter(l => l.outcome === 'VOICEMAIL').length;

    const totalProcessed = leads.filter(l => l.status !== 'PENDING').length;
    const answerRate = totalProcessed > 0 ? `${((answeredLeads / totalProcessed) * 100).toFixed(1)}%` : '0.0%';

    res.json({
      stats: {
        totalLeads,
        completedLeads,
        pendingLeads,
        callingLeads,
        answeredLeads,
        noAnswerLeads,
        voicemailLeads,
        answerRate
      },
      leads
    });
  } catch (err: any) {
    console.error('Error fetching campaign workspace:', err);
    res.status(500).json({ error: 'Internal server error while fetching campaign workspace' });
  }
});

// REST: CRM Lead authoritative profile, activities, call history, and follow-ups (protected)
app.get('/api/crm/leads/:id/profile', requireAuth, requirePermission(['leads:view', 'crm:view']), async (req, res) => {
  try {
    const tenantId = (req as any).user?.tenantId;
    if (!tenantId) {
      res.status(401).json({ error: 'Unauthorized: missing tenant identity' });
      return;
    }
    const leadId = req.params.id;
    const lead = await db.queryOne<any>(`
      SELECT l.*, c.name as "campaignName"
      FROM leads l
      LEFT JOIN campaigns c ON l."campaignId" = c.id
      WHERE l.id = $1 AND l."tenantId" = $2
    `, [leadId, tenantId]);

    if (!lead) {
      res.status(404).json({ error: 'Lead not found in your organization.' });
      return;
    }

    const activities = await getLeadActivities(leadId, tenantId);
    const callLogs = await db.queryAll<any>(`
      SELECT id, outcome, duration, timestamp
      FROM call_logs
      WHERE "leadId" = $1 AND "tenantId" = $2
      ORDER BY timestamp DESC, id DESC
      LIMIT 50
    `, [leadId, tenantId]);

    const followUps = await db.queryAll<any>(`
      SELECT id, "scheduledAt", status, notes, "assignedAgent"
      FROM crm_follow_ups
      WHERE "leadId" = $1 AND "tenantId" = $2
      ORDER BY "scheduledAt" ASC
    `, [leadId, tenantId]);

    res.json({
      lead: {
        id: lead.id,
        name: lead.name,
        businessName: lead.businessName || lead.company || lead.name,
        phone: lead.phone,
        email: lead.email || null,
        address: lead.address || null,
        website: lead.website || null,
        source: lead.source || lead.campaignName || 'CRM',
        status: lead.status,
        campaignName: lead.campaignName || 'Unknown Campaign',
        campaignId: lead.campaignId,
        createdAt: lead.createdAt
      },
      activities,
      callLogs,
      followUps
    });
  } catch (err: any) {
    console.error('Error fetching lead profile:', err);
    res.status(500).json({ error: 'Internal server error while fetching lead profile' });
  }
});

// REST: Record lead interaction note (protected)
app.post('/api/crm/leads/:id/notes', requireAuth, requirePermission(['leads:edit', 'crm:edit', 'calls:log_disposition']), async (req, res) => {
  try {
    const user = (req as any).user;
    const tenantId = user?.tenantId;
    if (!tenantId) {
      res.status(401).json({ error: 'Unauthorized: missing tenant identity' });
      return;
    }
    const leadId = req.params.id;
    const note = (req.body?.note || '').trim();
    if (!note) {
      res.status(400).json({ error: 'Note content is required.' });
      return;
    }

    const lead = await getLead(leadId, tenantId);
    if (!lead) {
      res.status(404).json({ error: 'Lead not found in your organization.' });
      return;
    }

    await recordLeadActivity({
      leadId,
      tenantId,
      userId: user.id,
      username: user.username,
      eventType: 'NOTE_ADDED',
      description: note
    });

    res.json({ success: true, message: 'Note recorded successfully.' });
  } catch (err: any) {
    console.error('Error recording note:', err);
    res.status(500).json({ error: 'Internal server error while recording note' });
  }
});

// REST: Get scheduled follow-ups for tenant (protected)
app.get('/api/crm/follow-ups', requireAuth, requirePermission(['crm:view', 'leads:view']), async (req, res) => {
  try {
    const tenantId = (req as any).user?.tenantId;
    if (!tenantId) {
      res.status(401).json({ error: 'Unauthorized: missing tenant identity' });
      return;
    }
    const status = req.query.status as string | undefined;
    const followUps = await getFollowUps(tenantId, status ? { status } : undefined);
    res.json({ followUps });
  } catch (err: any) {
    console.error('Error fetching follow-ups:', err);
    res.status(500).json({ error: 'Internal server error while fetching follow-ups' });
  }
});

// REST: Create scheduled follow-up (protected)
app.post('/api/crm/follow-ups', requireAuth, requirePermission(['crm:edit', 'crm:create', 'leads:edit']), async (req, res) => {
  try {
    const user = (req as any).user;
    const tenantId = user?.tenantId;
    if (!tenantId) {
      res.status(401).json({ error: 'Unauthorized: missing tenant identity' });
      return;
    }
    const { leadId, leadName, leadPhone, campaignId, campaignName, scheduledAt, notes } = req.body;
    if (!leadId || !scheduledAt) {
      res.status(400).json({ error: 'leadId and scheduledAt are required.' });
      return;
    }

    const lead = await getLead(leadId, tenantId);
    if (!lead) {
      res.status(404).json({ error: 'Lead not found in your organization.' });
      return;
    }

    const followUp = await createFollowUp({
      leadId,
      leadName: leadName || lead.name,
      leadPhone: leadPhone || lead.phone,
      campaignId: campaignId || lead.campaignId,
      campaignName: campaignName || '',
      tenantId,
      userId: user.id,
      assignedAgent: user.username,
      scheduledAt,
      notes
    });

    await recordLeadActivity({
      leadId,
      tenantId,
      userId: user.id,
      username: user.username,
      eventType: 'FOLLOW_UP_SCHEDULED',
      description: `Follow-up scheduled for ${new Date(scheduledAt).toLocaleString()}${notes ? ': ' + notes : ''}`
    });

    res.json({ success: true, followUp });
  } catch (err: any) {
    console.error('Error creating follow-up:', err);
    res.status(500).json({ error: 'Internal server error while creating follow-up' });
  }
});

// ============================================================================
// PRODUCT SUPER ADMIN / GLOBAL BACKOFFICE APIS (admin.zestify7.online)
// ============================================================================

// GET /api/super-admin/telemetry: Aggregated platform-wide metrics
app.get('/api/super-admin/telemetry', requirePlatformAdmin, async (req, res) => {
  try {
    const metrics = await getGlobalSuperAdminMetrics();
    // Also include live sessions count
    const sessionList = Array.from(getSessions().values());
    const liveCalls = sessionList.filter((s: Session) => s.status === 'CALLING' || s.phoneStatus === 'CONNECTED').length;
    const connectedPhones = sessionList.filter((s: Session) => !!s.phoneSocketId).length;

    res.json({
      success: true,
      telemetry: {
        ...metrics,
        liveCalls,
        connectedPhones,
        activeLaptops: sessionList.length,
        uptimeSeconds: Math.floor(process.uptime()),
        serverTimestamp: new Date().toISOString()
      }
    });
  } catch (err: any) {
    console.error('[Super Admin] Telemetry error:', err);
    res.status(500).json({ error: 'Failed to retrieve telemetry' });
  }
});

// GET /api/super-admin/tenants: List all organizations
app.get('/api/super-admin/tenants', requirePlatformAdmin, async (req, res) => {
  try {
    const tenants = await getAllTenantsSummary();
    res.json({ success: true, tenants });
  } catch (err: any) {
    console.error('[Super Admin] Get tenants error:', err);
    res.status(500).json({ error: 'Failed to retrieve tenants' });
  }
});

// PUT /api/super-admin/tenants/:id/mode: Toggle Lead Pool Mode (shared vs assigned)
app.put('/api/super-admin/tenants/:id/mode', requirePlatformAdmin, async (req, res) => {
  try {
    const tenantId = req.params.id;
    const { leadPoolMode } = req.body;
    if (leadPoolMode !== 'shared' && leadPoolMode !== 'assigned') {
      res.status(400).json({ error: 'Invalid leadPoolMode. Must be "shared" or "assigned".' });
      return;
    }

    await updateTenantLeadPoolMode(tenantId, leadPoolMode);
    res.json({ success: true, message: `Tenant lead pool mode set to ${leadPoolMode}.` });
  } catch (err: any) {
    console.error('[Super Admin] Update mode error:', err);
    res.status(500).json({ error: 'Failed to update lead pool mode' });
  }
});

// PUT /api/super-admin/tenants/:id/status: Suspend or reactivate a tenant
app.put('/api/super-admin/tenants/:id/status', requirePlatformAdmin, async (req, res) => {
  try {
    const tenantId = req.params.id;
    const { status } = req.body;
    if (status !== 'active' && status !== 'suspended') {
      res.status(400).json({ error: 'Invalid status. Must be "active" or "suspended".' });
      return;
    }

    await updateTenantStatus(tenantId, status);
    res.json({ success: true, message: `Tenant status set to ${status}.` });
  } catch (err: any) {
    console.error('[Super Admin] Update status error:', err);
    res.status(500).json({ error: 'Failed to update tenant status' });
  }
});

// POST /api/super-admin/impersonate/:id: One-click jump into tenant workspace for support
app.post('/api/super-admin/impersonate/:id', requirePlatformAdmin, async (req, res) => {
  try {
    const targetTenantId = req.params.id;
    const tenant = await getTenantById(targetTenantId);
    if (!tenant) {
      res.status(404).json({ error: 'Tenant organization not found.' });
      return;
    }

    // Find the primary admin or user for that tenant
    const primaryUser = await db.queryOne<any>(`
      SELECT id, username, role, "tenantId", email 
      FROM users 
      WHERE "tenantId" = $1 
      ORDER BY CASE WHEN role IN ('platform_admin', 'admin') THEN 1 ELSE 2 END, "createdAt" ASC 
      LIMIT 1
    `, [targetTenantId]);

    if (!primaryUser) {
      res.status(400).json({ error: 'No user accounts found under this tenant.' });
      return;
    }

    // Issue a short-lived impersonation token (1 hour)
    const jwt = require('jsonwebtoken');
    const secret = process.env.JWT_SECRET || 'octal-dev-secret';
    const payload = {
      sub: primaryUser.id,
      username: primaryUser.username,
      role: primaryUser.role,
      tenantId: primaryUser.tenantId,
      impersonatedBy: (req as any).user.username
    };
    const impersonationToken = jwt.sign(payload, secret, { expiresIn: 3600 });

    res.json({
      success: true,
      token: impersonationToken,
      user: {
        id: primaryUser.id,
        username: primaryUser.username,
        role: primaryUser.role,
        tenantId: primaryUser.tenantId,
        email: primaryUser.email
      },
      tenant
    });
  } catch (err: any) {
    console.error('[Super Admin] Impersonate error:', err);
    res.status(500).json({ error: 'Failed to generate impersonation token' });
  }
});


// REST: Update follow-up status (protected)
app.patch('/api/crm/follow-ups/:id/status', requireAuth, requirePermission(['crm:edit', 'leads:edit']), async (req, res) => {
  try {
    const user = (req as any).user;
    const tenantId = user?.tenantId;
    if (!tenantId) {
      res.status(401).json({ error: 'Unauthorized: missing tenant identity' });
      return;
    }
    const id = req.params.id;
    const { status, notes } = req.body;
    const validStatuses = ['pending', 'completed', 'cancelled', 'rescheduled'];
    if (!status || !validStatuses.includes(status)) {
      res.status(400).json({ error: `Invalid status. Must be one of: ${validStatuses.join(', ')}` });
      return;
    }

    const updated = await updateFollowUpStatus(id, tenantId, status, notes);
    if (!updated) {
      res.status(404).json({ error: 'Follow-up not found in your organization.' });
      return;
    }

    const fu = await db.queryOne<{ leadId: string }>(`SELECT "leadId" FROM crm_follow_ups WHERE id = $1 AND "tenantId" = $2`, [id, tenantId]);
    if (fu?.leadId) {
      await recordLeadActivity({
        leadId: fu.leadId,
        tenantId,
        userId: user.id,
        username: user.username,
        eventType: 'FOLLOW_UP_UPDATED',
        description: `Follow-up marked as ${status}${notes ? ': ' + notes : ''}`
      });
    }

    res.json({ success: true, message: 'Follow-up status updated successfully.' });
  } catch (err: any) {
    console.error('Error updating follow-up status:', err);
    res.status(500).json({ error: 'Internal server error while updating follow-up status' });
  }
});

// REST: Get lead activity history timeline (protected)
app.get('/api/crm/leads/:id/activities', requireAuth, requirePermission(['leads:view', 'crm:view']), async (req, res) => {
  try {
    const tenantId = (req as any).user?.tenantId;
    if (!tenantId) {
      res.status(401).json({ error: 'Unauthorized: missing tenant identity' });
      return;
    }
    const leadId = req.params.id;
    const lead = await getLead(leadId, tenantId);
    if (!lead) {
      res.status(404).json({ error: 'Lead not found in your organization.' });
      return;
    }
    const activities = await getLeadActivities(leadId, tenantId);
    res.json({ activities });
  } catch (err: any) {
    console.error('Error fetching lead activities:', err);
    res.status(500).json({ error: 'Internal server error while fetching lead activities' });
  }
});

// REST: Delete single lead (protected)
app.delete(['/api/leads/:id', '/leads/:id'], requireAuth, requirePermission(['leads:delete', 'crm:delete']), async (req, res) => {
  const tenantId = (req as any).user?.tenantId;
  if (!tenantId) {
    res.status(401).json({ error: 'Unauthorized: missing tenant identity' });
    return;
  }
  const success = await deleteLead(req.params.id, tenantId);
  if (success) {
    io.to(`tenant_${tenantId}`).emit('leads:updated');
    res.json({ success: true, message: `Lead ${req.params.id} deleted.` });
  } else {
    res.status(404).json({ error: 'Lead not found.' });
  }
});

// REST: Purge all fake/sample leads across queue (protected)
app.post('/api/leads/purge-fake', requireAuth, requirePermission('leads:delete'), async (req, res) => {
  const tenantId = (req as any).user?.tenantId;
  if (!tenantId) {
    res.status(401).json({ error: 'Unauthorized: missing tenant identity' });
    return;
  }
  const count = await clearFakeQueueLeads(tenantId);
  io.to(`tenant_${tenantId}`).emit('leads:updated');
  res.json({ success: true, count, message: `Removed ${count} fake/sample leads.` });
});

// REST: Clear all leads in a campaign (protected)
app.delete(['/campaigns/:id/leads', '/api/campaigns/:id/leads'], requireAuth, requirePermission(['leads:delete', 'campaigns:delete']), async (req, res) => {
  const tenantId = (req as any).user?.tenantId;
  if (!tenantId) {
    res.status(401).json({ error: 'Unauthorized: missing tenant identity' });
    return;
  }
  const campaign = await getCampaignById(req.params.id, tenantId);
  if (!campaign) {
    res.status(404).json({ error: 'Campaign not found in your organization.' });
    return;
  }
  const count = await clearAllLeadsInCampaign(req.params.id, tenantId);
  io.to(`tenant_${tenantId}`).emit('leads:updated');
  res.json({ success: true, count, message: `Cleared ${count} leads in campaign ${req.params.id}.` });
});

// REST: Reset all lead statuses in a campaign to PENDING without deleting leads (protected)
app.post(['/campaigns/:id/reset-status', '/api/campaigns/:id/reset-status'], requireAuth, requirePermission(['leads:edit', 'campaigns:edit']), async (req, res) => {
  const tenantId = (req as any).user?.tenantId;
  if (!tenantId) {
    res.status(401).json({ error: 'Unauthorized: missing tenant identity' });
    return;
  }
  const campaign = await getCampaignById(req.params.id, tenantId);
  if (!campaign) {
    res.status(404).json({ error: 'Campaign not found in your organization.' });
    return;
  }
  const count = await resetAllLeadStatusesInCampaign(req.params.id, tenantId);
  io.to(`tenant_${tenantId}`).emit('leads:updated');
  res.json({ success: true, count, message: `Reset ${count} leads in campaign ${req.params.id} back to PENDING.` });
});

// REST: Call logs history (protected — for dashboard & mobile)
app.get(['/logs', '/api/logs', '/api/call-logs'], requireAuth, requirePermission(['history:view_logs', 'calls:view_queue']), async (req, res) => {
  const tenantId = (req as any).user?.tenantId;
  if (!tenantId) {
    res.status(401).json({ error: 'Unauthorized: missing tenant identity' });
    return;
  }
  res.json(await getLogs(tenantId));
});

// POST /api/logs/update & /logs/update — Update call disposition (protected)
app.post(['/api/logs/update', '/logs/update'], requireAuth, requirePermission(['calls:log_disposition', 'history:edit_disposition']), async (req, res) => {
  const { leadId, notes, logId } = req.body as { leadId?: string; outcome?: string; notes?: string; disposition?: string; logId?: string };
  const outcome = req.body.outcome || req.body.disposition;
  const user = (req as any).user;
  const tenantId = user?.tenantId;

  if (!tenantId) {
    res.status(401).json({ error: 'Unauthorized: missing tenant identity' });
    return;
  }

  if (!leadId || !outcome) {
    res.status(400).json({ error: 'leadId and outcome are required.' });
    return;
  }

  const leadRow = await db.queryOne('SELECT "campaignId" FROM leads WHERE id = $1 AND "tenantId" = $2', [leadId, tenantId]) as any;

  const updated = await updateLogDisposition({
    leadId,
    outcome,
    notes: notes || '',
    tenantId,
    userId: user?.id,
    username: user?.username,
    logId
  });

  if (updated) {
    const nextLead = leadRow?.campaignId ? await getNextPendingLead(leadRow.campaignId, tenantId, leadId) : null;
    io.to(`tenant_${tenantId}`).emit('leads:updated');
    res.json({
      success: true,
      message: 'Disposition saved successfully.',
      nextLeadId: nextLead ? nextLead.id : null,
      nextLead: nextLead || null
    });
  } else {
    res.status(404).json({ error: 'Lead or log record not found in tenant.' });
  }
});

// GET /api/campaigns/:id/next-lead — Authoritative backend next lead query (protected)
app.get('/api/campaigns/:id/next-lead', requireAuth, async (req, res) => {
  const user = (req as any).user;
  const tenantId = user?.tenantId;
  if (!tenantId) {
    res.status(401).json({ error: 'Unauthorized: missing tenant identity' });
    return;
  }
  const nextLead = await getNextPendingLead(req.params.id, tenantId);
  res.json({
    success: true,
    nextLeadId: nextLead ? nextLead.id : null,
    nextLead: nextLead || null
  });
});

registerScraperRoutes(app, requireAuth, io);

// ─── ADMIN AUTHORITY MASTER CONTROL REST ENDPOINTS ────────────────────────────

// GET /api/admin/overview & /admin/platform/overview
app.get(['/api/admin/overview', '/admin/platform/overview', '/admin/overview'], requireAuth, requireAdmin, async (req, res) => {
  const user = (req as any).user;
  const isPlatform = user.role === 'platform_admin' || user.role === 'master_admin';
  const tenantId = user.tenantId;

  const totalTenantsRow = isPlatform ? await db.queryOne(`SELECT COUNT(*) as c FROM tenants`) as any : null;
  const totalUsersRow = isPlatform
    ? await db.queryOne(`SELECT COUNT(*) as c FROM users`) as any
    : await db.queryOne(`SELECT COUNT(*) as c FROM users WHERE "tenantId" = $1`, [tenantId]) as any;
  const totalCampaignsRow = isPlatform
    ? await db.queryOne(`SELECT COUNT(*) as c FROM campaigns`) as any
    : await db.queryOne(`SELECT COUNT(*) as c FROM campaigns WHERE "tenantId" = $1`, [tenantId]) as any;
  const totalLeadsRow = isPlatform
    ? await db.queryOne(`SELECT COUNT(*) as c FROM leads`) as any
    : await db.queryOne(`SELECT COUNT(*) as c FROM leads WHERE "tenantId" = $1`, [tenantId]) as any;
  const totalLogsRow = isPlatform
    ? await db.queryOne(`SELECT COUNT(*) as c FROM call_logs`) as any
    : await db.queryOne(`SELECT COUNT(*) as c FROM call_logs WHERE "tenantId" = $1`, [tenantId]) as any;

  const metrics = {
    totalTenants: parseInt(totalTenantsRow?.c || '1', 10),
    activeTenants: parseInt(totalTenantsRow?.c || '1', 10),
    suspendedTenants: 0,
    trialTenants: 0,
    totalUsers: parseInt(totalUsersRow?.c || '0', 10),
    adminUsers: 1,
    agentUsers: Math.max(0, parseInt(totalUsersRow?.c || '0', 10) - 1),
    activeSubscriptions: 1,
    totalDevices: 1,
    onlineDevices: 1,
    totalCampaigns: parseInt(totalCampaignsRow?.c || '0', 10),
    totalLeads: parseInt(totalLeadsRow?.c || '0', 10),
    totalCalls: parseInt(totalLogsRow?.c || '0', 10),
    connectedCalls: 0,
    totalLogs: parseInt(totalLogsRow?.c || '0', 10)
  };

  res.json({
    metrics,
    ...metrics,
    activeScraper: tenantId ? getTenantScraperStatus(tenantId) : null,
    systemUptimeSeconds: Math.floor(process.uptime())
  });
});

// GET /api/admin/users & /admin/users
app.get(['/api/admin/users', '/admin/users'], requireAuth, requirePermission('users:view'), async (req, res) => {
  const user = (req as any).user;
  const isPlatform = user.role === 'platform_admin' || user.role === 'master_admin';
  const users = isPlatform
    ? await db.queryAll(`
        SELECT u.id, u.username, u."displayName", u.phone, u.email, u.role, u.status, u."ipRestrictions", u."tenantId", u."createdAt", u."updatedAt", u."roleId",
               COALESCE(cr."roleName", CASE WHEN LOWER(u.role) = 'admin' THEN 'Administrator' WHEN LOWER(u.role) IN ('agent', 'user') THEN 'Agent' ELSE u.role END) AS "roleName"
        FROM users u
        LEFT JOIN custom_roles cr ON cr.id = u."roleId"
        ORDER BY u."createdAt" DESC
      `) as any[]
    : await db.queryAll(`
        SELECT u.id, u.username, u."displayName", u.phone, u.email, u.role, u.status, u."ipRestrictions", u."tenantId", u."createdAt", u."updatedAt", u."roleId",
               COALESCE(cr."roleName", CASE WHEN LOWER(u.role) = 'admin' THEN 'Administrator' WHEN LOWER(u.role) IN ('agent', 'user') THEN 'Agent' ELSE u.role END) AS "roleName"
        FROM users u
        LEFT JOIN custom_roles cr ON cr.id = u."roleId"
        WHERE u."tenantId" = $1
        ORDER BY u."createdAt" DESC
      `, [user.tenantId]) as any[];

  // Attach module permissions for each user
  const perms = isPlatform
    ? await db.queryAll(`SELECT * FROM user_permissions`) as any[]
    : await db.queryAll(`SELECT * FROM user_permissions WHERE "tenantId" = $1`, [user.tenantId]) as any[];

  const permMap = new Map<string, any[]>();
  for (const p of perms) {
    if (!permMap.has(p.userId)) permMap.set(p.userId, []);
    permMap.get(p.userId)!.push(p);
  }
  for (const u of users) {
    u.permissions = permMap.get(u.id) || [];
  }

  res.json(users);
});

// POST /api/admin/users & /admin/users
app.post(['/api/admin/users', '/admin/users'], requireAuth, requirePermission('users:add'), async (req, res) => {
  try {
    const caller = (req as any).user;
    const { username, password, email, role, roleId, phone, status = 'Active', ipRestrictions, firstName, lastName, initialPermissions } = req.body;
    if (!username || !password) {
      res.status(400).json({ error: 'Username and password required.' });
      return;
    }
    let normalizedRole = (role || 'agent').toLowerCase();
    if (normalizedRole.includes('admin')) normalizedRole = 'admin';
    else if (normalizedRole.includes('supervisor') || normalizedRole.includes('agent')) normalizedRole = 'agent';
    else if (!['user', 'agent', 'admin'].includes(normalizedRole)) normalizedRole = 'agent';

    const tenantId = caller.role === 'platform_admin' ? (req.body.tenantId || caller.tenantId) : caller.tenantId;
    if (roleId) {
      const isValidRole = await validateRoleBelongsToTenant(roleId, tenantId);
      if (!isValidRole) {
        res.status(403).json({ error: 'Forbidden: Selected role does not belong to your organization.' });
        return;
      }
    }
    const result = await registerPublicUser({
      username,
      password,
      email,
      requestedRole: normalizedRole,
      tenantId
    });
    if (normalizedRole !== 'user') {
      if (caller.role === 'platform_admin' || caller.role === 'master_admin') {
        await updateUserRole(caller, result.user.id, normalizedRole);
      } else {
        await db.execute(`UPDATE users SET role = $1 WHERE id = $2`, [normalizedRole, result.user.id]);
      }
    }

    // Save extended fields: displayName, phone, status, ipRestrictions, roleId
    const computedDisplayName = (req.body.displayName || `${firstName || ''} ${lastName || ''}`.trim()) || username;
    await db.execute(
      `UPDATE users SET "displayName" = $1, phone = $2, status = $3, "ipRestrictions" = $4, "roleId" = $5 WHERE id = $6`,
      [computedDisplayName, phone || '', status || 'Active', ipRestrictions || '', roleId || null, result.user.id]
    );

    // Insert initial module permissions if provided
    if (Array.isArray(initialPermissions) && initialPermissions.length > 0) {
      const now = new Date().toISOString();
      for (const modId of initialPermissions) {
        const permId = 'p_' + Math.random().toString(36).substring(2, 11);
        await db.execute(
          `INSERT INTO user_permissions (id, "userId", "moduleId", enabled, "grantedBy", "grantedAt", "tenantId")
           VALUES ($1, $2, $3, 1, $4, $5, $6)`,
          [permId, result.user.id, modId, caller.username, now, tenantId]
        );
      }
    }

    res.json({
      success: true,
      user: {
        ...result.user,
        displayName: computedDisplayName,
        phone: phone || '',
        status: status || 'Active',
        ipRestrictions: ipRestrictions || '',
        roleId: roleId || null
      }
    });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// PUT /api/admin/users/:id & /admin/users/:id (Unified update for role, password, and permissions)
app.put(['/api/admin/users/:id', '/admin/users/:id'], requireAuth, requirePermission('users:edit'), async (req, res) => {
  const caller = (req as any).user;
  const isPlatform = caller.role === 'platform_admin' || caller.role === 'master_admin';
  const targetUser = await db.queryOne(`SELECT id, role, "tenantId" FROM users WHERE id = $1`, [req.params.id]) as any;

  if (!targetUser) {
    res.status(404).json({ error: 'User not found.' });
    return;
  }

  if (!isPlatform && targetUser.tenantId !== caller.tenantId) {
    res.status(403).json({ error: 'Forbidden: Cannot edit a user from another organization.' });
    return;
  }

  const { role, roleId, newPassword, password, permissions, displayName, firstName, lastName, email, phone, status, ipRestrictions } = req.body;

  // Validate roleId if provided
  if (roleId) {
    const targetTenantId = targetUser.tenantId || caller.tenantId;
    const isValidRole = await validateRoleBelongsToTenant(roleId, targetTenantId);
    if (!isValidRole) {
      res.status(403).json({ error: 'Forbidden: Selected role does not belong to user\'s organization.' });
      return;
    }
  }

  // 1. Update role if provided
  if (role) {
    if (caller.role === 'platform_admin' || caller.role === 'master_admin') {
      await updateUserRole(caller, req.params.id, role);
    } else {
      let normalizedRole = (role || 'agent').toLowerCase();
      if (!['platform_admin', 'master_admin'].includes(normalizedRole)) {
        await db.execute(`UPDATE users SET role = $1 WHERE id = $2`, [normalizedRole, req.params.id]);
      }
    }
  }

  // 2. Update password if provided
  const pwdToSet = newPassword || password;
  if (pwdToSet && typeof pwdToSet === 'string' && pwdToSet.length >= 4) {
    await changePassword(req.params.id, pwdToSet);
  }

  // 3. Update user profile fields (displayName, phone, status, ipRestrictions, email, roleId)
  const computedDisplayName = displayName || (firstName || lastName ? `${firstName || ''} ${lastName || ''}`.trim() : undefined);
  const updates: string[] = [];
  const params: any[] = [];
  let idx = 1;

  if (computedDisplayName !== undefined) { updates.push(`"displayName" = $${idx++}`); params.push(computedDisplayName); }
  if (email !== undefined) { updates.push(`email = $${idx++}`); params.push(email); }
  if (phone !== undefined) { updates.push(`phone = $${idx++}`); params.push(phone); }
  if (status !== undefined) { updates.push(`status = $${idx++}`); params.push(status); }
  if (ipRestrictions !== undefined) { updates.push(`"ipRestrictions" = $${idx++}`); params.push(ipRestrictions); }
  if (roleId !== undefined) { updates.push(`"roleId" = $${idx++}`); params.push(roleId || null); }

  if (updates.length > 0) {
    params.push(req.params.id);
    await db.execute(`UPDATE users SET ${updates.join(', ')} WHERE id = $${idx}`, params);
  }

  // 4. Update permissions map if provided
  if (permissions && typeof permissions === 'object') {
    const tenantId = targetUser.tenantId || caller.tenantId;
    const now = new Date().toISOString();
    for (const [modId, enabled] of Object.entries(permissions)) {
      const enabledVal = enabled ? 1 : 0;
      const existing = await db.queryOne(
        `SELECT id FROM user_permissions WHERE "userId" = $1 AND "moduleId" = $2`,
        [req.params.id, modId]
      ) as any;
      if (existing) {
        await db.execute(
          `UPDATE user_permissions SET enabled = $1, "grantedBy" = $2, "grantedAt" = $3 WHERE id = $4`,
          [enabledVal, caller.username, now, existing.id]
        );
      } else {
        const permId = 'p_' + Math.random().toString(36).substring(2, 11);
        await db.execute(
          `INSERT INTO user_permissions (id, "userId", "moduleId", enabled, "grantedBy", "grantedAt", "tenantId")
           VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          [permId, req.params.id, modId, enabledVal, caller.username, now, tenantId]
        );
      }
    }
  }

  res.json({ success: true, message: 'User updated successfully.' });
});

// POST /api/admin/permissions & /admin/permissions
app.post(['/api/admin/permissions', '/admin/permissions'], requireAuth, requireAdmin, async (req, res) => {
  try {
    const caller = (req as any).user;
    const { userId, moduleId, enabled } = req.body;
    if (!userId || !moduleId) {
      res.status(400).json({ error: 'userId and moduleId required.' });
      return;
    }

    const isPlatform = caller.role === 'platform_admin' || caller.role === 'master_admin';
    const targetUser = await db.queryOne(`SELECT id, "tenantId" FROM users WHERE id = $1`, [userId]) as any;
    if (!targetUser) {
      res.status(404).json({ error: 'User not found.' });
      return;
    }
    if (!isPlatform && targetUser.tenantId !== caller.tenantId) {
      res.status(403).json({ error: 'Forbidden: Cannot alter permissions for users in another organization.' });
      return;
    }

    const tenantId = targetUser.tenantId || caller.tenantId;
    const enabledVal = enabled ? 1 : 0;
    const now = new Date().toISOString();

    const existing = await db.queryOne(
      `SELECT id FROM user_permissions WHERE "userId" = $1 AND "moduleId" = $2`,
      [userId, moduleId]
    ) as any;

    if (existing) {
      await db.execute(
        `UPDATE user_permissions SET enabled = $1, "grantedBy" = $2, "grantedAt" = $3 WHERE id = $4`,
        [enabledVal, caller.username, now, existing.id]
      );
    } else {
      const permId = 'p_' + Math.random().toString(36).substring(2, 11);
      await db.execute(
        `INSERT INTO user_permissions (id, "userId", "moduleId", enabled, "grantedBy", "grantedAt", "tenantId")
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [permId, userId, moduleId, enabledVal, caller.username, now, tenantId]
      );
    }

    res.json({ success: true, message: `Permission updated for module ${moduleId}.` });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/admin/users/:id/role
app.put(['/api/admin/users/:id/role', '/admin/users/:id/role'], requireAuth, requirePermission('users:edit'), async (req, res) => {
  const { role } = req.body;
  if (!role) {
    res.status(400).json({ error: 'Role is required.' });
    return;
  }
  try {
    const result = await updateUserRole((req as any).user, req.params.id, role);
    if (result && result.success) {
      res.json({ success: true, message: `User role updated to ${role}.` });
    } else {
      res.status(403).json({ error: 'User not found or update unauthorized.' });
    }
  } catch (err: any) {
    res.status(403).json({ error: err.message || 'User not found or update unauthorized.' });
  }
});

// POST /api/admin/users/:id/password
app.post(['/api/admin/users/:id/password', '/admin/users/:id/password'], requireAuth, requirePermission('users:edit'), async (req, res) => {
  const caller = (req as any).user;
  const isPlatform = caller.role === 'platform_admin' || caller.role === 'master_admin';
  const targetUser = await db.queryOne(`SELECT id, role, "tenantId" FROM users WHERE id = $1`, [req.params.id]) as any;

  if (!targetUser) {
    res.status(404).json({ error: 'User not found.' });
    return;
  }

  if (!isPlatform && targetUser.tenantId !== caller.tenantId) {
    res.status(403).json({ error: 'Forbidden: Cannot reset password for a user from another organization.' });
    return;
  }

  if (!isPlatform && (targetUser.role === 'platform_admin' || targetUser.role === 'master_admin')) {
    res.status(403).json({ error: 'Forbidden: Cannot reset password for platform administrators.' });
    return;
  }

  const { newPassword } = req.body;
  if (!newPassword || newPassword.length < 4) {
    res.status(400).json({ error: 'New password must be at least 4 characters.' });
    return;
  }
  await changePassword(req.params.id, newPassword);
  res.json({ success: true, message: 'Password updated successfully.' });
});

// DELETE /api/admin/users/:id
app.delete(['/api/admin/users/:id', '/admin/users/:id'], requireAuth, requirePermission('users:delete'), async (req, res) => {
  const caller = (req as any).user;
  const isPlatform = caller.role === 'platform_admin' || caller.role === 'master_admin';
  const targetUser = await db.queryOne(`SELECT id, role, "tenantId" FROM users WHERE id = $1`, [req.params.id]) as any;

  if (!targetUser) {
    res.status(404).json({ error: 'User not found.' });
    return;
  }

  if (!isPlatform && targetUser.tenantId !== caller.tenantId) {
    res.status(403).json({ error: 'Forbidden: Cannot delete a user from another organization.' });
    return;
  }

  if (!isPlatform && (targetUser.role === 'platform_admin' || targetUser.role === 'master_admin')) {
    res.status(403).json({ error: 'Forbidden: Cannot delete platform administrators.' });
    return;
  }

  await db.execute(`DELETE FROM user_permissions WHERE "userId" = $1`, [req.params.id]);
  const info = isPlatform
    ? await db.execute(`DELETE FROM users WHERE id = $1`, [req.params.id])
    : await db.execute(`DELETE FROM users WHERE id = $1 AND "tenantId" = $2`, [req.params.id, caller.tenantId]);
  if (info.rowCount > 0) {
    res.json({ success: true, message: 'User deleted.' });
  } else {
    res.status(404).json({ error: 'User not found.' });
  }
});

// ─── Custom Roles Endpoints ──────────────────────────────────────────────────

// GET /api/admin/roles & /admin/roles
app.get(['/api/admin/roles', '/admin/roles'], requireAuth, requirePermission('roles:view'), async (req, res) => {
  const user = (req as any).user;
  const isPlatform = user.role === 'platform_admin' || user.role === 'master_admin';
  const roles = isPlatform
    ? await db.queryAll(`
        SELECT r.id, r."roleName", r.description, r.permissions, r.status, r."createdBy", r."createdAt", r."tenantId",
               COUNT(u.id)::int AS "userCount"
        FROM custom_roles r
        LEFT JOIN users u ON (u."roleId" = r.id OR (u."roleId" IS NULL AND LOWER(u.role) = LOWER(r."roleName")))
        GROUP BY r.id, r."roleName", r.description, r.permissions, r.status, r."createdBy", r."createdAt", r."tenantId"
        ORDER BY r."createdAt" ASC
      `) as any[]
    : await db.queryAll(`
        SELECT r.id, r."roleName", r.description, r.permissions, r.status, r."createdBy", r."createdAt", r."tenantId",
               COUNT(u.id)::int AS "userCount"
        FROM custom_roles r
        LEFT JOIN users u ON (u."roleId" = r.id OR (u."roleId" IS NULL AND LOWER(u.role) = LOWER(r."roleName")))
        WHERE (r."tenantId" = $1 OR r."tenantId" = 'tenant_default')
        GROUP BY r.id, r."roleName", r.description, r.permissions, r.status, r."createdBy", r."createdAt", r."tenantId"
        ORDER BY r."createdAt" ASC
      `, [user.tenantId]) as any[];

  // If no custom roles exist yet, seed and return the standard roles matching the UI mock
  if (roles.length === 0) {
    const tenant = user.tenantId || 'tenant_default';
    const now = new Date().toISOString();
    const defaults = [
      { id: '1', roleName: 'Administrator', description: 'Full access to organization and settings', permissions: JSON.stringify(['all']), status: 'Active', createdBy: 'system', createdAt: now, tenantId: tenant, userCount: 1 },
      { id: '2', roleName: 'Supervisor', description: 'Campaign oversight, lead queue and call monitoring', permissions: JSON.stringify(['campaigns:view', 'campaigns:create', 'campaigns:edit', 'leads:view', 'leads:import', 'reports:cdr_view']), status: 'Active', createdBy: 'system', createdAt: now, tenantId: tenant, userCount: 0 },
      { id: '3', roleName: 'Agent', description: 'Direct dialing and call disposition logging', permissions: JSON.stringify(['calls:view_queue', 'calls:dial_outbound', 'calls:manual_keypad', 'calls:log_disposition']), status: 'Active', createdBy: 'system', createdAt: now, tenantId: tenant, userCount: 0 },
      { id: '4', roleName: 'Auditor', description: 'Read-only access to audit records and reporting', permissions: JSON.stringify(['reports:cdr_view', 'reports:cdr_export']), status: 'Active', createdBy: 'system', createdAt: now, tenantId: tenant, userCount: 0 },
      { id: '5', roleName: 'Custom', description: 'Custom tenant configuration', permissions: JSON.stringify([]), status: 'Inactive', createdBy: 'system', createdAt: now, tenantId: tenant, userCount: 0 }
    ];
    for (const r of defaults) {
      await db.execute(
        `INSERT INTO custom_roles (id, "roleName", description, permissions, status, "createdBy", "createdAt", "tenantId")
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         ON CONFLICT (id) DO NOTHING`,
        [r.id, r.roleName, r.description, r.permissions, r.status, r.createdBy, r.createdAt, r.tenantId]
      );
    }
    return res.json(defaults);
  }

  res.json(roles);
});

// POST /api/admin/roles & /admin/roles
app.post(['/api/admin/roles', '/admin/roles'], requireAuth, requirePermission('roles:add'), async (req, res) => {
  const caller = (req as any).user;
  const rawRoleName = req.body.roleName || req.body.name || '';
  const roleName = typeof rawRoleName === 'string' ? rawRoleName.trim() : '';
  const { description = '', permissions = [], status = 'Active' } = req.body;
  if (!roleName) {
    res.status(400).json({ error: 'Role name is required.' });
    return;
  }
  const tenantId = caller.role === 'platform_admin' ? (req.body.tenantId || caller.tenantId) : caller.tenantId;

  // Check for duplicate role name in tenant
  const dup = await db.queryOne(`SELECT id FROM custom_roles WHERE "tenantId" = $1 AND LOWER("roleName") = LOWER($2)`, [tenantId, roleName.trim()]) as any;
  if (dup) {
    res.status(409).json({ error: `A role named "${roleName}" already exists in your organization.` });
    return;
  }

  const id = 'role_' + Math.random().toString(36).substring(2, 9);
  const now = new Date().toISOString();
  const permsStr = typeof permissions === 'string' ? permissions : JSON.stringify(permissions);

  await db.execute(
    `INSERT INTO custom_roles (id, "roleName", description, permissions, status, "createdBy", "createdAt", "tenantId")
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [id, roleName.trim(), description, permsStr, status, caller.username, now, tenantId]
  );

  res.json({
    success: true,
    role: { id, roleName: roleName.trim(), description, permissions: permsStr, status, createdBy: caller.username, createdAt: now, tenantId, userCount: 0 }
  });
});

// PUT /api/admin/roles/:id & /admin/roles/:id
app.put(['/api/admin/roles/:id', '/admin/roles/:id'], requireAuth, requirePermission('roles:edit'), async (req, res) => {
  const caller = (req as any).user;
  const isPlatform = caller.role === 'platform_admin' || caller.role === 'master_admin';
  const targetRole = await db.queryOne(`SELECT id, "roleName", "tenantId" FROM custom_roles WHERE id = $1`, [req.params.id]) as any;

  if (!targetRole) {
    res.status(404).json({ error: 'Role not found.' });
    return;
  }

  if (!isPlatform && targetRole.tenantId !== caller.tenantId) {
    res.status(403).json({ error: 'Forbidden: Cannot edit system default roles or roles from another organization.' });
    return;
  }

  const rawRoleName = req.body.roleName !== undefined ? req.body.roleName : req.body.name;
  const { description, permissions, status } = req.body;
  const updates: string[] = [];
  const params: any[] = [];
  let idx = 1;

  if (rawRoleName !== undefined) {
    const trimmedName = String(rawRoleName).trim();
    if (!trimmedName) {
      res.status(400).json({ error: 'Role name cannot be empty.' });
      return;
    }
    updates.push(`"roleName" = $${idx++}`);
    params.push(trimmedName);
  }
  if (description !== undefined) { updates.push(`description = $${idx++}`); params.push(description); }
  if (permissions !== undefined) { updates.push(`permissions = $${idx++}`); params.push(typeof permissions === 'string' ? permissions : JSON.stringify(permissions)); }
  if (status !== undefined) { updates.push(`status = $${idx++}`); params.push(status); }

  if (updates.length > 0) {
    params.push(req.params.id);
    await db.execute(`UPDATE custom_roles SET ${updates.join(', ')} WHERE id = $${idx}`, params);
  }

  res.json({ success: true, message: 'Role updated successfully.' });
});

// DELETE /api/admin/roles/:id & /admin/roles/:id
app.delete(['/api/admin/roles/:id', '/admin/roles/:id'], requireAuth, requirePermission('roles:delete'), async (req, res) => {
  const caller = (req as any).user;
  const isPlatform = caller.role === 'platform_admin' || caller.role === 'master_admin';
  const targetRole = await db.queryOne(`SELECT id, "roleName", "tenantId" FROM custom_roles WHERE id = $1`, [req.params.id]) as any;

  if (!targetRole) {
    res.status(404).json({ error: 'Role not found.' });
    return;
  }

  if (!isPlatform && targetRole.tenantId !== caller.tenantId) {
    res.status(403).json({ error: 'Forbidden: Cannot delete roles from another organization.' });
    return;
  }

  // Guard: Protect default system roles
  if (['1', '2', '3'].includes(targetRole.id) || ['administrator'].includes(targetRole.roleName.toLowerCase())) {
    res.status(403).json({ error: 'Forbidden: Core system roles cannot be deleted.' });
    return;
  }

  // Guard: Check if users are currently assigned to this role
  const assignedUsers = await db.queryOne(`SELECT COUNT(id)::int AS count FROM users WHERE "roleId" = $1`, [req.params.id]) as any;
  if (assignedUsers && assignedUsers.count > 0) {
    res.status(400).json({ error: `Cannot delete role: ${assignedUsers.count} user(s) are currently assigned to this role. Please reassign them first.` });
    return;
  }

  await db.execute(`DELETE FROM custom_roles WHERE id = $1`, [req.params.id]);
  res.json({ success: true, message: 'Role deleted.' });
});

// ─── Teams & Scoping Endpoints ───────────────────────────────────────────────

// GET /api/admin/teams & /admin/teams
app.get(['/api/admin/teams', '/admin/teams'], requireAuth, requirePermission(['teams:view', 'users:view', 'settings:view']), async (req, res) => {
  try {
    const caller = (req as any).user;
    const isPlatform = caller.role === 'platform_admin' || caller.role === 'master_admin';
    const tenantId = isPlatform ? (req.query.tenantId as string || caller.tenantId) : caller.tenantId;

    const teams = await getTeams(tenantId);

    // Fetch members and campaigns for each team
    const enrichedTeams = await Promise.all(teams.map(async (t) => {
      const members = await getTeamMembers(t.id, t.tenantId);
      const campaigns = await getTeamCampaigns(t.id, t.tenantId);
      return {
        ...t,
        members,
        campaigns,
        memberCount: members.length,
        campaignCount: campaigns.length
      };
    }));

    res.json(enrichedTeams);
  } catch (err: any) {
    console.error('[TEAMS API] GET teams error:', err);
    res.status(500).json({ error: 'Failed to retrieve teams: ' + err.message });
  }
});

// GET /api/admin/teams/:id & /admin/teams/:id
app.get(['/api/admin/teams/:id', '/admin/teams/:id'], requireAuth, requirePermission(['teams:view', 'users:view', 'settings:view']), async (req, res) => {
  try {
    const caller = (req as any).user;
    const isPlatform = caller.role === 'platform_admin' || caller.role === 'master_admin';
    const team = await getTeamById(req.params.id, caller.tenantId);
    if (!team && !isPlatform) {
      res.status(404).json({ error: 'Team not found.' });
      return;
    }
    const teamRecord = team || (await db.queryOne(`SELECT * FROM teams WHERE id = $1`, [req.params.id]));
    if (!teamRecord) {
      res.status(404).json({ error: 'Team not found.' });
      return;
    }
    const members = await getTeamMembers(teamRecord.id, teamRecord.tenantId);
    const campaigns = await getTeamCampaigns(teamRecord.id, teamRecord.tenantId);
    res.json({
      ...teamRecord,
      members,
      campaigns,
      memberCount: members.length,
      campaignCount: campaigns.length
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/admin/teams & /admin/teams
app.post(['/api/admin/teams', '/admin/teams'], requireAuth, requirePermission(['teams:edit', 'users:edit', 'users:add']), async (req, res) => {
  try {
    const caller = (req as any).user;
    const { name, description = '', leaderId, memberIds = [], campaignIds = [], status = 'active' } = req.body;
    if (!name || !String(name).trim()) {
      res.status(400).json({ error: 'Team name is required.' });
      return;
    }
    const tenantId = (caller.role === 'platform_admin' || caller.role === 'master_admin')
      ? (req.body.tenantId || caller.tenantId)
      : caller.tenantId;

    const team = await createTeam({
      name: String(name).trim(),
      description: String(description || '').trim(),
      leaderId: leaderId || undefined,
      tenantId,
      status: status === 'inactive' ? 'inactive' : 'active'
    });

    if (Array.isArray(memberIds) && memberIds.length > 0) {
      await setTeamMembers(team.id, tenantId, memberIds, leaderId);
    }
    if (Array.isArray(campaignIds) && campaignIds.length > 0) {
      await setTeamCampaigns(team.id, tenantId, campaignIds);
    }

    const members = await getTeamMembers(team.id, tenantId);
    const campaigns = await getTeamCampaigns(team.id, tenantId);

    res.status(201).json({
      ...team,
      members,
      campaigns,
      memberCount: members.length,
      campaignCount: campaigns.length
    });
  } catch (err: any) {
    console.error('[TEAMS API] POST team error:', err);
    res.status(500).json({ error: 'Failed to create team: ' + err.message });
  }
});

// PUT /api/admin/teams/:id & /admin/teams/:id
app.put(['/api/admin/teams/:id', '/admin/teams/:id'], requireAuth, requirePermission(['teams:edit', 'users:edit']), async (req, res) => {
  try {
    const caller = (req as any).user;
    const isPlatform = caller.role === 'platform_admin' || caller.role === 'master_admin';
    const tenantId = caller.tenantId;
    const { name, description, leaderId, memberIds, campaignIds, status } = req.body;

    const existing = await getTeamById(req.params.id, tenantId);
    if (!existing && !isPlatform) {
      res.status(404).json({ error: 'Team not found.' });
      return;
    }
    const effectiveTenantId = existing ? existing.tenantId : tenantId;

    await updateTeam(req.params.id, effectiveTenantId, {
      name: name ? String(name).trim() : undefined,
      description: description !== undefined ? String(description).trim() : undefined,
      leaderId: leaderId !== undefined ? (leaderId || null) : undefined,
      status: status !== undefined ? status : undefined
    });

    if (Array.isArray(memberIds)) {
      await setTeamMembers(req.params.id, effectiveTenantId, memberIds, leaderId || existing?.leaderId);
    }
    if (Array.isArray(campaignIds)) {
      await setTeamCampaigns(req.params.id, effectiveTenantId, campaignIds);
    }

    const updated = await getTeamById(req.params.id, effectiveTenantId);
    const members = await getTeamMembers(req.params.id, effectiveTenantId);
    const campaigns = await getTeamCampaigns(req.params.id, effectiveTenantId);

    res.json({
      ...updated,
      members,
      campaigns,
      memberCount: members.length,
      campaignCount: campaigns.length
    });
  } catch (err: any) {
    console.error('[TEAMS API] PUT team error:', err);
    res.status(500).json({ error: 'Failed to update team: ' + err.message });
  }
});

// DELETE /api/admin/teams/:id & /admin/teams/:id
app.delete(['/api/admin/teams/:id', '/admin/teams/:id'], requireAuth, requirePermission(['teams:delete', 'users:delete']), async (req, res) => {
  try {
    const caller = (req as any).user;
    const tenantId = caller.tenantId;
    const ok = await deleteTeam(req.params.id, tenantId);
    if (ok) {
      res.json({ success: true, message: 'Team removed successfully.' });
    } else {
      res.status(404).json({ error: 'Team not found or already deleted.' });
    }
  } catch (err: any) {
    console.error('[TEAMS API] DELETE team error:', err);
    res.status(500).json({ error: 'Failed to delete team: ' + err.message });
  }
});

// GET /api/admin/teams/:id/members
app.get(['/api/admin/teams/:id/members', '/admin/teams/:id/members'], requireAuth, requirePermission(['teams:view', 'users:view']), async (req, res) => {
  try {
    const caller = (req as any).user;
    const members = await getTeamMembers(req.params.id, caller.tenantId);
    res.json(members);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/admin/teams/:id/members
app.post(['/api/admin/teams/:id/members', '/admin/teams/:id/members'], requireAuth, requirePermission(['teams:edit', 'users:edit']), async (req, res) => {
  try {
    const caller = (req as any).user;
    const { userIds, leaderId } = req.body;
    if (!Array.isArray(userIds)) {
      res.status(400).json({ error: 'userIds must be an array.' });
      return;
    }
    await setTeamMembers(req.params.id, caller.tenantId, userIds, leaderId);
    const members = await getTeamMembers(req.params.id, caller.tenantId);
    res.json({ success: true, members });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/admin/teams/:id/campaigns
app.get(['/api/admin/teams/:id/campaigns', '/admin/teams/:id/campaigns'], requireAuth, requirePermission(['teams:view', 'campaigns:view']), async (req, res) => {
  try {
    const caller = (req as any).user;
    const campaigns = await getTeamCampaigns(req.params.id, caller.tenantId);
    res.json(campaigns);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/admin/teams/:id/campaigns
app.post(['/api/admin/teams/:id/campaigns', '/admin/teams/:id/campaigns'], requireAuth, requirePermission(['teams:edit', 'campaigns:edit']), async (req, res) => {
  try {
    const caller = (req as any).user;
    const { campaignIds } = req.body;
    if (!Array.isArray(campaignIds)) {
      res.status(400).json({ error: 'campaignIds must be an array.' });
      return;
    }
    await setTeamCampaigns(req.params.id, caller.tenantId, campaignIds);
    const campaigns = await getTeamCampaigns(req.params.id, caller.tenantId);
    res.json({ success: true, campaigns });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET & POST & PUT for /api/admin/settings & /admin/system-settings
app.get(['/api/admin/settings', '/admin/system-settings', '/admin/settings'], requireAuth, requireAdmin, async (req, res) => {
  const rows = await db.queryAll(`SELECT "settingKey", "settingValue" FROM system_settings`) as any[];
  const map: Record<string, string> = {};
  for (const r of rows) map[r.settingKey] = r.settingValue;
  res.json({ settings: map, ...map });
});

app.post(['/api/admin/settings', '/admin/system-settings', '/admin/settings'], requireAuth, requireAdmin, async (req, res) => {
  const caller = (req as any).user;
  if (caller.role !== 'platform_admin' && caller.role !== 'master_admin') {
    res.status(403).json({ error: 'Forbidden: Platform administrator privileges required to modify system settings.' });
    return;
  }
  const body = req.body.settings ? req.body.settings : req.body;
  const now = new Date().toISOString();
  for (const [key, val] of Object.entries(body)) {
    if (val !== undefined && typeof val !== 'object') {
      const id = 'set_' + key;
      await db.execute(`
        INSERT INTO system_settings (id, category, "settingKey", "settingValue", description, "updatedAt")
        VALUES ($1, 'general', $2, $3, 'System setting', $4)
        ON CONFLICT ("id") DO UPDATE SET "settingValue" = excluded."settingValue", "updatedAt" = $4
      `, [id, key, String(val), now]);
    }
  }
  const rows = await db.queryAll(`SELECT "settingKey", "settingValue" FROM system_settings`) as any[];
  const map: Record<string, string> = {};
  for (const r of rows) map[r.settingKey] = r.settingValue;
  res.json({ success: true, settings: map });
});

app.put(['/api/admin/settings', '/admin/system-settings', '/admin/settings'], requireAuth, requireAdmin, async (req, res) => {
  const caller = (req as any).user;
  if (caller.role !== 'platform_admin' && caller.role !== 'master_admin') {
    res.status(403).json({ error: 'Forbidden: Platform administrator privileges required to modify system settings.' });
    return;
  }
  const body = req.body.settings ? req.body.settings : req.body;
  const now = new Date().toISOString();
  for (const [key, val] of Object.entries(body)) {
    if (val !== undefined && typeof val !== 'object') {
      const id = 'set_' + key;
      await db.execute(`
        INSERT INTO system_settings (id, category, "settingKey", "settingValue", description, "updatedAt")
        VALUES ($1, 'general', $2, $3, 'System setting', $4)
        ON CONFLICT ("id") DO UPDATE SET "settingValue" = excluded."settingValue", "updatedAt" = $4
      `, [id, key, String(val), now]);
    }
  }
  const rows = await db.queryAll(`SELECT "settingKey", "settingValue" FROM system_settings`) as any[];
  const map: Record<string, string> = {};
  for (const r of rows) map[r.settingKey] = r.settingValue;
  res.json({ success: true, settings: map });
});

// Phase 4: Daily Campaign Activity Endpoints
// GET /api/campaigns/:id/activity/today
app.get('/api/campaigns/:id/activity/today', requireAuth, async (req, res) => {
  const user = (req as any).user;
  const campaignId = req.params.id;
  const dateStr = (req.query.date as string) || new Date().toISOString().slice(0, 10);
  const tenantId = user?.tenantId;
  if (!tenantId) {
    res.status(401).json({ error: 'Unauthorized: missing tenant identity' });
    return;
  }
  const row = await db.queryOne(
    `SELECT * FROM daily_campaign_activity WHERE "tenantId" = $1 AND "campaignId" = $2 AND "userId" = $3 AND "activityDate" = $4`,
    [tenantId, campaignId, user.id, dateStr]
  ) as any;

  res.json({
    success: true,
    activity: row || {
      workingSeconds: 0,
      talkSeconds: 0,
      callsPlaced: 0,
      callsAnswered: 0,
      lastState: 'PAUSED',
      activityDate: dateStr
    }
  });
});

// POST /api/campaigns/:id/activity/heartbeat
app.post('/api/campaigns/:id/activity/heartbeat', requireAuth, async (req, res) => {
  try {
    const user = (req as any).user;
    const campaignId = req.params.id;
    const tenantId = user?.tenantId;
    if (!tenantId) {
      res.status(401).json({ error: 'Unauthorized: missing tenant identity' });
      return;
    }
    const { incrementWorkingSeconds = 0, incrementTalkSeconds = 0, state = 'WORKING', dateStr } = req.body;
    const activityDate = dateStr || new Date().toISOString().slice(0, 10);
    const now = new Date().toISOString();

    const existing = await db.queryOne(
      `SELECT id, "workingSeconds", "talkSeconds" FROM daily_campaign_activity 
       WHERE "tenantId" = $1 AND "campaignId" = $2 AND "userId" = $3 AND "activityDate" = $4`,
      [tenantId, campaignId, user.id, activityDate]
    ) as any;

    if (existing) {
      const newWorking = (existing.workingSeconds || 0) + (Number(incrementWorkingSeconds) || 0);
      const newTalk = (existing.talkSeconds || 0) + (Number(incrementTalkSeconds) || 0);
      await db.execute(
        `UPDATE daily_campaign_activity 
         SET "workingSeconds" = $1, "talkSeconds" = $2, "lastState" = $3, "lastHeartbeat" = $4 
         WHERE id = $5`,
        [newWorking, newTalk, state, now, existing.id]
      );
      res.json({ success: true, workingSeconds: newWorking, talkSeconds: newTalk });
    } else {
      const actId = 'act_' + Math.random().toString(36).substring(2, 11);
      const initWorking = Number(incrementWorkingSeconds) || 0;
      const initTalk = Number(incrementTalkSeconds) || 0;
      await db.execute(
        `INSERT INTO daily_campaign_activity (id, "tenantId", "campaignId", "userId", "activityDate", "workingSeconds", "talkSeconds", "lastState", "lastHeartbeat")
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [actId, tenantId, campaignId, user.id, activityDate, initWorking, initTalk, state, now]
      );
      res.json({ success: true, workingSeconds: initWorking, talkSeconds: initTalk });
    }
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/admin/scraper/force-stop
app.post('/api/admin/scraper/force-stop', requireAuth, requireAdmin, async (req, res) => {
  try {
    const user = (req as any).user;
    if (!user?.tenantId) { res.status(401).json({ error: 'Missing tenant identity.' }); return; }
    const job = getTenantScraperStatus(user.tenantId, typeof req.body.jobId === 'string' ? req.body.jobId : undefined);
    if (!job || !await stopTenantScraperJob(user.tenantId, job.jobId)) {
      res.status(404).json({ error: 'Active job not found.' }); return;
    }
    res.json({ success: true, message: 'Scraper stopped for this tenant.' });
  } catch (err: any) { res.status(400).json({ error: err.message }); }
});

// POST /api/admin/system/unlock-all-leads
app.post('/api/admin/system/unlock-all-leads', requireAuth, requireAdmin, async (req, res) => {
  try {
    const user = (req as any).user;
    const isPlatformAdmin = user?.role === 'platform_admin' || user?.role === 'master_admin';
    const targetTenantId = isPlatformAdmin
      ? (req.body?.tenantId || req.query?.tenantId || user?.tenantId)
      : user?.tenantId;

    const count = await releaseExpiredLeases(0, targetTenantId);
    if (targetTenantId) {
      io.to(`tenant_${targetTenantId}`).emit('leads:updated');
    } else {
      io.emit('leads:updated');
    }
    res.json({ success: true, count, message: `Unlocked ${count} locked lead(s).` });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to unlock leads: ' + err.message });
  }
});

// REST: App Version & OTA Update Check with SHA-256 integrity verification
app.get('/api/app-version', async (req, res) => {
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
      await db.execute(`
        INSERT INTO ota_versions (id, version, "buildNumber", "apkHash", signature, "releaseNotes", "isActive")
        VALUES ($1, '1.4.0', 4, $2, 'OCTAL_KEY_SIG_V1', 'Production Foundation build with PostgreSQL, Auth, Safety Gate, Command IDs, DNC, and Heartbeat.', 1)
        ON CONFLICT(version) DO UPDATE SET
          "apkHash" = excluded."apkHash",
          "uploadedAt" = now()
      `, ['ota_v1.4.0', sha256Hash]);
    } catch (err) {
      console.error('[OTA] Error computing hash:', err);
    }
  }

  res.json({
    version: '1.4.0',
    buildNumber: 4,
    apkUrl: `${getPublicBaseUrl({ headers: req.headers })}/download/apk`,
    sha256Hash,
    signature: 'OCTAL_KEY_SIG_V1',
    forceUpdate: false,
    releaseNotes: 'Production Foundation build with SQLite, Auth, Safety Gate, Command IDs, DNC, and Heartbeat.'
  });
});

// REST: Universal QR Code Join Endpoint (for third-party phone camera & QR scanner apps)
app.get('/join', (req, res) => {
  const { sessionId, token, serverUrl, laptop } = req.query;
  const deepLink = 'octaldialer://join?sessionId=' + String(sessionId || '') + '&token=' + String(token || '') + '&serverUrl=' + encodeURIComponent(String(serverUrl || '')) + '&laptop=' + encodeURIComponent(String(laptop || ''));

  const html = '<!DOCTYPE html><html><head><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>Octal Dialer</title><script>setTimeout(function(){ window.location.href = "' + deepLink + '"; }, 300);</script></head><body style="background:#0f172a;color:#fff;text-align:center;padding:40px;"><div style="background:#1e293b;padding:32px;border-radius:20px;max-width:380px;margin:0 auto;"><h2 style="color:#f59e0b;">Octal Dialer Bridge</h2><p>Opening Octal Dialer App...</p><a href="' + deepLink + '" style="background:#f59e0b;color:#0f172a;font-weight:bold;padding:14px 28px;border-radius:14px;text-decoration:none;display:inline-block;">Open App Now</a></div></body></html>';
  res.send(html);
});

// REST: Serve Mobile APK file download — dynamically resolves freshest build by mtimeMs and auto-syncs
const serveApkHandler = (_req: express.Request, res: express.Response): void => {
  // 1. Trigger on-demand sync scan
  apkWatcher.syncFreshestApk();

  const candidatePaths = [
    path.resolve(__dirname, '../../application_octal_dialer/build/app/outputs/flutter-apk/app-debug.apk'),
    path.resolve(__dirname, '../../application_octal_dialer/build/app/outputs/flutter-apk/app-release.apk'),
    path.resolve(__dirname, '../../mobile/build/app/outputs/flutter-apk/app-debug.apk'),
    path.resolve(__dirname, '../../mobile/build/app/outputs/flutter-apk/app-release.apk'),
    path.resolve(__dirname, '../data/OctalDialer.apk'),
    path.resolve(__dirname, '../../frontend/public/OctalDialer.apk'),
    path.resolve(process.env.USERPROFILE || 'C:/Users/ice', 'Desktop/OctalDialer.apk')
  ];

  const existingCandidates = candidatePaths
    .filter(p => {
      try { return fs.existsSync(p); } catch { return false; }
    })
    .map(p => {
      try {
        const stat = fs.statSync(p);
        return { path: p, mtime: stat.mtimeMs, size: stat.size };
      } catch (_) {
        return null;
      }
    })
    .filter((item): item is { path: string; mtime: number; size: number } => item !== null && item.size > 1000000)
    .sort((a, b) => b.mtime - a.mtime);

  if (existingCandidates.length > 0) {
    const freshest = existingCandidates[0];

    res.setHeader('Content-Type', 'application/vnd.android.package-archive');
    res.setHeader('Content-Disposition', 'attachment; filename="OctalDialer.apk"');
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    res.setHeader('Content-Length', freshest.size);

    const fileStream = fs.createReadStream(freshest.path);
    fileStream.pipe(res);
    fileStream.on('error', (err) => {
      console.error('[APK Stream Error]:', err);
      if (!res.headersSent) {
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
app.post('/api/leads/import', requireAuth, async (req, res) => {
  try {
    const { campaignName, campaignId, fileName, leads } = req.body as {
      campaignName?: string;
      campaignId?: string;
      fileName?: string;
      leads: { name: string; phone: string }[];
    };

    if (!leads || !Array.isArray(leads) || leads.length === 0) {
      res.status(400).json({ error: 'No leads provided' });
      return;
    }

    const tenantId = (req as any).user?.tenantId;
    if (!tenantId) {
      res.status(401).json({ error: 'Unauthorized: missing tenant identity' });
      return;
    }

    const result = campaignId
      ? await appendLeadsToCampaign(campaignId, leads, tenantId)
      : await createCampaign(campaignName || 'Imported Campaign', fileName || 'Manual Import', leads, tenantId);

    io.to(`tenant_${tenantId}`).emit('leads:updated');
    io.to(`tenant_${tenantId}`).emit('campaigns:updated');

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

// REST: Manual leads import for mobile (protected)
app.post('/api/leads/import/mobile', requireAuth, async (req, res) => {
  try {
    const user = (req as any).user;
    const tenantId = user?.tenantId;

    if (!tenantId) {
      res.status(401).json({ error: 'Unauthorized: missing tenant identity' });
      return;
    }

    const { campaignName, campaignId, fileName, leads } = req.body as {
      campaignName?: string;
      campaignId?: string;
      fileName?: string;
      leads: { name: string; phone: string }[];
    };

    if (!leads || !Array.isArray(leads) || leads.length === 0) {
      res.status(400).json({ error: 'No leads provided' });
      return;
    }

    // Tenant identity is strictly derived from authenticated user JWT
    const result = campaignId
      ? await appendLeadsToCampaign(campaignId, leads, tenantId)
      : await createCampaign(campaignName || 'Mobile Imported Campaign', fileName || 'Mobile Import', leads, tenantId);

    io.to(`tenant_${tenantId}`).emit('leads:updated');
    io.to(`tenant_${tenantId}`).emit('campaigns:updated');

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

// REST: Export logs to CSV (protected)
app.get('/api/logs/export', requireAuth, requirePermission(['history:view_logs', 'calls:view_queue']), async (req, res) => {
  try {
    const tenantId = (req as any).user?.tenantId;
    if (!tenantId) {
      res.status(401).json({ error: 'Unauthorized: missing tenant identity' });
      return;
    }
    const logs = await getLogs(tenantId);

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

// REST: Export leads to CSV (protected)
app.get('/api/leads/export', requireAuth, requirePermission(['leads:export', 'leads:view']), async (req, res) => {
  try {
    const tenantId = (req as any).user?.tenantId;
    if (!tenantId) {
      res.status(401).json({ error: 'Unauthorized: missing tenant identity' });
      return;
    }

    const source = (req.query.source as string || '').trim();
    const status = (req.query.status as string || '').trim();

    let query = `
      SELECT l.id, l.name, l.phone, l.status, l.outcome, l.duration, l."createdAt",
             c.name as "campaignName"
      FROM leads l
      LEFT JOIN campaigns c ON l."campaignId" = c.id
      WHERE l."tenantId" = $1 AND l.status != 'ARCHIVED'
    `;
    const params: any[] = [tenantId];

    if (source) {
      query += ` AND (c.name LIKE $${params.length + 1} OR l."campaignId" = $${params.length + 2})`;
      params.push(`%${source}%`, source);
    }
    if (status) {
      query += ` AND l.status = $${params.length + 1}`;
      params.push(status);
    }

    query += ` ORDER BY l."createdAt" DESC LIMIT 50000`;

    const leads = await db.queryAll<any>(query, params);

    const header = ['ID', 'Name', 'Phone', 'Status', 'Campaign', 'Outcome', 'Duration (s)', 'Created At'];
    const rows = leads.map(l => [
      `"${(l.id || '').replace(/"/g, '""')}"`,
      `"${(l.name || '').replace(/"/g, '""')}"`,
      `"${(l.phone || '').replace(/"/g, '""')}"`,
      l.status || '',
      `"${(l.campaignName || '').replace(/"/g, '""')}"`,
      l.outcome || '',
      l.duration || 0,
      l.createdAt || ''
    ]);

    const csv = [header.join(','), ...rows.map(r => r.join(','))].join('\n');

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="octal_dialer_leads.csv"');
    res.send(csv);
  } catch (err: any) {
    console.error('Leads CSV Export error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ─── Authenticated Phone Sockets Registry ───────────────────────────────────────
interface ActivePhoneSocket {
  socketId: string;
  deviceId: string;
  userId: string;
  tenantId: string;
  deviceName: string;
  osType: string;
  btAddress: string;
  ipAddress: string;
  platform?: string;
  appVersion?: string;
}
const authenticatedPhoneSockets = new Map<string, ActivePhoneSocket>();
const pendingDialSessions = new Set<string>();
const inFlightCallFinalizations = new Map<string, Promise<boolean>>();
const committedCallEndings = new Set<string>();

// Socket.IO Handshake Auth Middleware
io.use(async (socket, next) => {
  const token = socket.handshake.auth?.token || (socket.handshake.headers?.authorization ? socket.handshake.headers.authorization.replace('Bearer ', '') : undefined);
  if (token) {
    const user = await validateToken(token);
    if (user) {
      socket.data.user = user;
      socket.data.tenantId = user.tenantId;
      socket.data.token = token;
    }
  }
  next();
});

registerTokenRevocationHandler((revokedToken: string) => {
  try {
    for (const [id, s] of io.sockets.sockets.entries()) {
      const socketToken = s.data?.token || s.handshake.auth?.token ||
        (s.handshake.headers?.authorization ? s.handshake.headers.authorization.replace('Bearer ', '') : undefined);
      if (socketToken === revokedToken) {
        s.emit('auth:revoked', { reason: 'Session ended or token revoked.' });
        s.disconnect(true);
        console.log(`[Socket Security] Terminated socket ${id} due to token revocation.`);
      }
    }
  } catch (err: any) {
    console.error('[Socket Security] Error disconnecting sockets for revoked token:', err.message);
  }
});

// WebSocket Event Handlers
io.on('connection', (socket) => {
  console.log(`[Socket] Connected: ${socket.id}`);

  // ─── AUTHENTICATED PHONE REGISTRATION ──────────────────────────────────────────
  socket.on('phone:auth-register', async (data: {
    token: string;
    deviceId?: string;
    deviceUid?: string;
    deviceName?: string;
    btAddress?: string;
    osType?: string;
    ipAddress?: string;
    platform?: string;
    appVersion?: string;
    sims?: any[];
    selectedSimSlot?: number;
  }) => {
    if (!data || !data.token) {
      socket.emit('phone:auth-error', { error: 'Authentication token is required.' });
      return;
    }

    const user = await validateToken(data.token);
    if (!user) {
      socket.emit('phone:auth-error', { error: 'Invalid or expired session token. Please log in again.' });
      return;
    }

    let device: DeviceRecord;
    try {
      device = await registerOrUpdateDevice({
        id: data.deviceId,
        name: data.deviceName || 'Android Device',
        userId: user.id,
        tenantId: user.tenantId,
        btAddress: data.btAddress,
        osType: data.osType || 'Android',
        ipAddress: data.ipAddress || '127.0.0.1',
        platform: data.platform || 'android',
        appVersion: data.appVersion || '1.2.0',
        deviceUid: data.deviceUid
      });
    } catch (err: any) {
      socket.emit('phone:auth-error', { error: err.message || 'Failed to register device.' });
      return;
    }

    if (device.isRevoked === 1) {
      socket.emit('phone:auth-error', { error: 'Device access has been revoked.' });
      return;
    }

    socket.data.user = user;
    socket.data.tenantId = user.tenantId;
    socket.data.deviceId = device.id;
    socket.data.isPhone = true;

    authenticatedPhoneSockets.set(device.id, {
      socketId: socket.id,
      deviceId: device.id,
      userId: user.id,
      tenantId: user.tenantId,
      deviceName: device.name,
      osType: device.osType || 'Android',
      btAddress: device.btAddress || '',
      ipAddress: device.ipAddress || '127.0.0.1',
      platform: device.platform || 'android',
      appVersion: device.appVersion || '1.2.0'
    });

    socket.emit('phone:auth-success', {
      success: true,
      deviceId: device.id,
      status: 'ONLINE',
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        role: user.role,
        tenantId: user.tenantId
      }
    });

    console.log(`[Auth Phone Connected] Device: ${device.name} (${device.id}) | User: ${user.username} | Tenant: ${user.tenantId}`);

    const statusPayload = {
      deviceId: device.id,
      status: 'ONLINE',
      isSocketOnline: true,
      lastSeenAt: new Date().toISOString()
    };
    if (user.tenantId) {
      io.to(`tenant_${user.tenantId}`).emit('device:status-changed', statusPayload);
    }

    // Auto-pair with waiting laptop session for the same authenticated user & tenant
    const waitingSession = findActiveWaitingSessionForUser(
      user.id,
      user.tenantId,
      (laptopSocketId) => io.sockets.sockets.has(laptopSocketId),
      device.id
    );

    if (waitingSession) {
      const pairedSession = await pairAuthenticatedDevice(
        waitingSession.id,
        device.id,
        socket.id,
        device.name,
        device.btAddress || '',
        device.osType || 'Android',
        device.ipAddress || '127.0.0.1',
        user.id,
        user.tenantId
      );

      if (pairedSession) {
        socket.join(waitingSession.id);
        socket.data.sessionId = waitingSession.id;

        const effectiveUrl = getPublicBaseUrl({ handshake: socket.handshake });
        // Emit bridge:paired EXACTLY ONCE to the phone socket
        socket.emit('bridge:paired', {
          sessionId: waitingSession.id,
          token: waitingSession.token,
          laptopName: waitingSession.laptopName,
          laptopBtAddress: waitingSession.laptopBtAddress,
          serverUrl: effectiveUrl
        });

        if (data.sims) waitingSession.sims = data.sims;
        if (data.selectedSimSlot !== undefined) waitingSession.selectedSimSlot = data.selectedSimSlot;

        // Notify the laptop that phone is connected & ready
        io.to(waitingSession.id).emit('phone:connected', {
          deviceName: device.name,
          phoneBtAddress: device.btAddress || '',
          phoneOsType: device.osType || 'Android',
          phoneIpAddress: device.ipAddress || '127.0.0.1',
          phoneStatus: 'READY',
          deviceId: device.id,
          sims: data.sims || waitingSession.sims,
          selectedSimSlot: data.selectedSimSlot !== undefined ? data.selectedSimSlot : waitingSession.selectedSimSlot
        });

        const pairedStatusPayload = {
          deviceId: device.id,
          status: 'PAIRED',
          isSocketOnline: true,
          sessionId: waitingSession.id,
          lastSeenAt: new Date().toISOString()
        };
        if (user.tenantId) {
          io.to(`tenant_${user.tenantId}`).emit('device:status-changed', pairedStatusPayload);
        }

        console.log(`[Auto Pair] Authenticated phone ${device.name} (${device.id}) automatically paired to laptop session ${waitingSession.id} for user ${user.username}`);
      }
    }
  });

  // ─── LAPTOP EXPLICIT CONNECT TO REGISTERED DEVICE ─────────────────────────────
  socket.on('laptop:connect-device', async ({ sessionId, deviceId }: { sessionId: string; deviceId: string }) => {
    const session = getSessionById(sessionId);
    if (!session) {
      socket.emit('device:error', { error: 'Session not found.' });
      return;
    }

    // Verify emitting socket is the authorized laptop socket for this session
    if (session.laptopSocketId !== socket.id) {
      socket.emit('device:error', { error: 'Unauthorized: Emitting socket is not the owner of this session.' });
      return;
    }

    const tenantId = socket.data.tenantId || session.tenantId;
    if (!tenantId) {
      socket.emit('device:error', { error: 'Unauthorized: missing tenant identity.' });
      return;
    }
    const user = socket.data.user;

    const device = await getDeviceById(deviceId, tenantId);
    if (!device) {
      socket.emit('device:error', { error: 'Device not found or not in your tenant.' });
      return;
    }

    if (device.isRevoked === 1) {
      socket.emit('device:error', { error: 'This device is no longer authorized (revoked).' });
      return;
    }

    if (user && user.role !== 'platform_admin' && user.role !== 'admin') {
      if (device.userId && device.userId !== user.id) {
        socket.emit('device:error', { error: 'You are not authorized to connect to this device.' });
        return;
      }
    }

    const phoneRecord = authenticatedPhoneSockets.get(deviceId);
    if (!phoneRecord) {
      socket.emit('device:error', { error: 'This phone is currently offline. Please open the Octal Dialer app.' });
      return;
    }

    const phoneSocket = io.sockets.sockets.get(phoneRecord.socketId);
    if (!phoneSocket) {
      authenticatedPhoneSockets.delete(deviceId);
      socket.emit('device:error', { error: 'Phone socket connection was lost.' });
      return;
    }

    const pairedSession = await pairAuthenticatedDevice(
      sessionId,
      deviceId,
      phoneSocket.id,
      phoneRecord.deviceName,
      phoneRecord.btAddress,
      phoneRecord.osType,
      phoneRecord.ipAddress,
      user ? user.id : 'unknown',
      tenantId
    );

    if (!pairedSession) {
      socket.emit('device:error', { error: 'Unable to connect to device.' });
      return;
    }

    phoneSocket.join(session.id);
    phoneSocket.data.sessionId = session.id;

    socket.emit('phone:connected', {
      deviceName: phoneRecord.deviceName,
      phoneBtAddress: phoneRecord.btAddress,
      phoneOsType: phoneRecord.osType,
      phoneIpAddress: phoneRecord.ipAddress,
      phoneStatus: 'READY',
      deviceId: deviceId
    });

    phoneSocket.emit('bridge:paired', {
      sessionId: session.id,
      token: session.token,
      laptopName: session.laptopName,
      laptopBtAddress: session.laptopBtAddress,
      serverUrl: getPublicBaseUrl({ handshake: socket.handshake })
    });

    console.log(`[Device Bridge Success] Laptop ${socket.id} paired with phone ${deviceId} in session ${sessionId}`);

    const pairedStatusPayload = {
      deviceId,
      status: 'PAIRED',
      isSocketOnline: true,
      sessionId: session.id
    };
    if (session.tenantId) {
      io.to(`tenant_${session.tenantId}`).emit('device:status-changed', pairedStatusPayload);
    }
  });

  // ─── LAPTOP DISCONNECT / REVOKE PHONE ───────────────────────────────────────
  const handleLaptopRevoke = ({ sessionId, deviceId }: { sessionId: string; deviceId?: string }) => {
    const session = getSessionById(sessionId);
    if (!session) return;

    // Verify emitting socket is authorized laptop socket OR authenticated admin belonging to the tenant
    const isAuthorizedSocket = session.laptopSocketId === socket.id;
    const isTenantAdmin = socket.data.user && socket.data.tenantId === session.tenantId &&
      (socket.data.user.role === 'admin' || socket.data.user.role === 'superadmin' || socket.data.user.role === 'platform_admin');

    if (!isAuthorizedSocket && !isTenantAdmin) {
      console.warn(`[Socket Security] Rejected laptop disconnect/revoke from unauthorized socket ${socket.id} for session ${sessionId}`);
      socket.emit('error', { code: 'UNAUTHORIZED_LAPTOP_SESSION', message: 'You are not authorized to disconnect or revoke this session.' });
      return;
    }

    const targetDevId = deviceId || session.phoneDeviceId;

    if (session.phoneSocketId) {
      const phoneSocket = io.sockets.sockets.get(session.phoneSocketId);
      if (phoneSocket) {
        phoneSocket.emit('bridge:unpaired', { reason: 'Disconnected by laptop dashboard.' });
        phoneSocket.leave(sessionId);
        delete phoneSocket.data.sessionId;
      }
    }

    revokePhone(sessionId);

    socket.emit('phone:disconnected');

    if (targetDevId) {
      updateDeviceStatus(targetDevId, 'ONLINE');
      const statusPayload = {
        deviceId: targetDevId,
        status: 'ONLINE',
        isSocketOnline: authenticatedPhoneSockets.has(targetDevId)
      };
      if (session.tenantId) {
        io.to(`tenant_${session.tenantId}`).emit('device:status-changed', statusPayload);
      }
    }

    console.log(`[Device Disconnected] Laptop unlinked phone in session ${sessionId}`);
  };

  socket.on('laptop:disconnect-device', handleLaptopRevoke);
  socket.on('laptop:revoke-phone', handleLaptopRevoke);

  // ─── PHONE DISCONNECT SESSION ────────────────────────────────────────────────
  socket.on('phone:disconnect-session', ({ sessionId }: { sessionId?: string } = {}) => {
    const sid = sessionId || socket.data.sessionId;
    if (!sid) return;

    const session = getSessionById(sid);
    if (!session) return;

    // Strict phone ownership verification:
    // 1. Socket must be the paired phone socket for this session
    // 2. If deviceId is present on socket, it must match session.phoneDeviceId
    // 3. Socket tenantId must match session.tenantId
    const isAuthorizedPhone = session.phoneSocketId === socket.id &&
      (!session.phoneDeviceId || !socket.data.deviceId || session.phoneDeviceId === socket.data.deviceId) &&
      (!session.tenantId || !socket.data.tenantId || session.tenantId === socket.data.tenantId);

    if (!isAuthorizedPhone) {
      console.warn(`[Socket Security] Rejected unauthorized phone:disconnect-session from socket ${socket.id} for session ${sid}`);
      socket.emit('error', { code: 'UNAUTHORIZED_PHONE_SESSION', message: 'Unauthorized phone disconnect attempt.' });
      return;
    }

    revokePhone(sid);
    if (session.laptopSocketId) {
      io.to(session.laptopSocketId).emit('phone:disconnected');
    }
    socket.leave(sid);
    delete socket.data.sessionId;

    const devId = socket.data.deviceId || session.phoneDeviceId;
    if (devId) {
      updateDeviceStatus(devId, 'ONLINE');
      const statusPayload = {
        deviceId: devId,
        status: 'ONLINE',
        isSocketOnline: true
      };
      if (session.tenantId) {
        io.to(`tenant_${session.tenantId}`).emit('device:status-changed', statusPayload);
      }
    }

    socket.emit('bridge:unpaired', { reason: 'Disconnected by phone.' });
    console.log(`[Phone Unlinked] Phone socket ${socket.id} disconnected from session ${sid}`);
  });

  socket.on('laptop:register', async (data?: { previousSessionId?: string; authToken?: string }) => {
    let tenantId = socket.data.tenantId;
    let userId = socket.data.user?.id;
    if (data?.authToken) {
      const user = await validateToken(data.authToken);
      if (user) {
        socket.data.user = user;
        socket.data.tenantId = user.tenantId;
        tenantId = user.tenantId;
        userId = user.id;
      }
    }
    if (!tenantId && socket.data.user?.tenantId) {
      tenantId = socket.data.user.tenantId;
    }

    if (!tenantId) {
      console.warn(`[Socket Security] Rejected unauthenticated laptop:register from socket ${socket.id}`);
      socket.emit('error', { code: 'UNAUTHORIZED_TENANT', message: 'Authentication required with valid tenant identity.' });
      return;
    }

    const session = reclaimOrCreateSession(socket.id, data?.previousSessionId, tenantId, userId);
    if (userId) session.userId = userId;
    if (tenantId) session.tenantId = tenantId;
    socket.join(session.id);
    socket.join(`tenant_${tenantId}`);
    socket.data.sessionId = session.id;
    console.log(`[Socket] Laptop registered: ${session.id} | Tenant: ${tenantId} | User: ${userId || 'anonymous'} | Status: ${session.status}`);

    const effectiveUrl = getPublicBaseUrl({ handshake: socket.handshake });
    const cleanPairingUri = `octaldialer://join?sessionId=${session.id}&token=${session.token}&serverUrl=${encodeURIComponent(effectiveUrl)}&laptop=${encodeURIComponent(session.laptopName || 'Laptop')}&bt=${encodeURIComponent(session.laptopBtAddress || '')}`;

    socket.emit('session:created', {
      sessionId: session.id,
      token: session.token,
      laptopName: session.laptopName,
      laptopBtAddress: session.laptopBtAddress,
      localIP: getLocalIP(),
      port: PORT,
      serverUrl: effectiveUrl,
      pairingUri: cleanPairingUri,
      qrPayload: {
        sessionId: session.id,
        token: session.token,
        laptopName: session.laptopName,
        laptopBtAddress: session.laptopBtAddress,
        pairingUri: cleanPairingUri,
        serverUrl: effectiveUrl
      }
    });

    if (session.phoneSocketId && session.phoneDeviceName) {
      socket.emit('phone:connected', {
        deviceName: session.phoneDeviceName,
        phoneBtAddress: session.phoneBtAddress,
        phoneOsType: session.phoneOsType,
        phoneIpAddress: session.phoneIpAddress,
        phoneStatus: session.phoneStatus || 'READY',
        deviceId: session.phoneDeviceId
      });
    } else {
      // Check if there is an active authenticated phone socket for this same user & tenant
      if (userId && tenantId && session.status === 'WAITING') {
        for (const p of authenticatedPhoneSockets.values()) {
          if (p.userId === userId && p.tenantId === tenantId && session.status === 'WAITING') {
            const phoneSocket = io.sockets.sockets.get(p.socketId);
            if (phoneSocket) {
              const pairedSession = await pairAuthenticatedDevice(
                session.id,
                p.deviceId,
                p.socketId,
                p.deviceName,
                p.btAddress,
                p.osType,
                p.ipAddress,
                userId,
                tenantId
              );

              if (pairedSession) {
                phoneSocket.join(session.id);
                phoneSocket.data.sessionId = session.id;

                socket.emit('phone:connected', {
                  deviceName: p.deviceName,
                  phoneBtAddress: p.btAddress,
                  phoneOsType: p.osType,
                  phoneIpAddress: p.ipAddress,
                  phoneStatus: 'READY',
                  deviceId: p.deviceId
                });

                // Deliver bridge:paired EXACTLY ONCE to the phone socket
                phoneSocket.emit('bridge:paired', {
                  sessionId: session.id,
                  token: session.token,
                  laptopName: session.laptopName,
                  laptopBtAddress: session.laptopBtAddress,
                  serverUrl: effectiveUrl
                });

                const pairedStatusPayload = {
                  deviceId: p.deviceId,
                  status: 'PAIRED',
                  isSocketOnline: true,
                  sessionId: session.id,
                  lastSeenAt: new Date().toISOString()
                };
                io.to(`tenant_${tenantId}`).emit('device:status-changed', pairedStatusPayload);

                console.log(`[Auto Pair] Laptop session ${session.id} automatically paired to authenticated phone ${p.deviceName} (${p.deviceId}) for user ${userId}`);
                break;
              }
            }
          }
        }
      }
    }

    // If an active call is in flight for this session, sync state to reconnected laptop
    const activeCall = getCallSessionBySessionId(session.id);
    if (activeCall && activeCall.state !== 'ENDED') {
      socket.emit('call:status-changed', {
        callId: activeCall.callId,
        state: activeCall.state,
        leadId: activeCall.leadId,
        phone: activeCall.phone,
        name: activeCall.name,
        timestamp: activeCall.activeAt || activeCall.startedAt || activeCall.createdAt
      });
      if (activeCall.state === 'ACTIVE') {
        socket.emit('call:picked-up', { callId: activeCall.callId });
      }
      console.log(`[CallEngine] Synced active call ${activeCall.callId} (${activeCall.state}) to reconnected laptop socket ${socket.id}`);
    }
  });

  socket.on('phone:join', async (data: {
    token?: string;
    sessionId?: string;
    authToken?: string;
    deviceName?: string;
    phoneBtAddress?: string;
    phoneOsType?: string;
    phoneIpAddress?: string;
    deviceId?: string;
  }) => {
    if (!data || typeof data.token !== 'string') {
      socket.emit('error', { code: 'INVALID_TOKEN', message: 'A valid pairing token is required.' });
      return;
    }
    const user = data.authToken ? await validateToken(data.authToken) : socket.data.user;
    if (data.authToken && !user) {
      socket.emit('error', { code: 'UNAUTHORIZED', message: 'Login token is invalid.' });
      return;
    }
    const session = await pairPhone(data.token, socket.id, data.deviceName || 'Mobile Client',
      data.phoneBtAddress || '', data.phoneOsType || 'Android', data.phoneIpAddress || '',
      data.sessionId, user ? { tenantId: user.tenantId, userId: user.id } : undefined);
    if (!session) {
      socket.emit('error', { code: 'INVALID_TOKEN', message: 'Pairing denied. Refresh the QR code and retry.' });
      return;
    }
    if (user) socket.data.user = user;

    socket.data.isPhone = true;
    socket.data.tenantId = session.tenantId;
    socket.data.sessionId = session.id;
    socket.data.deviceId = session.phoneDeviceId;

    socket.join(session.id);
    console.log(`[Socket Success] Phone paired to session: ${session.id} | Tenant: ${session.tenantId} | Device: ${data.deviceName || 'Android'}`);

    const effectiveUrl = getPublicBaseUrl({ handshake: socket.handshake });
    const pairedPayload = {
      sessionId: session.id,
      token: session.token,
      laptopName: session.laptopName,
      laptopBtAddress: session.laptopBtAddress,
      serverUrl: effectiveUrl
    };

    socket.emit('bridge:paired', pairedPayload);
    socket.emit('phone:paired', pairedPayload);

    const connectedPayload = {
      deviceName: data.deviceName || socket.data.deviceName || 'Android Phone',
      phoneBtAddress: data.phoneBtAddress || '',
      phoneOsType: data.phoneOsType || 'Android',
      phoneIpAddress: data.phoneIpAddress || '127.0.0.1',
      phoneStatus: session.phoneStatus || 'READY',
      deviceId: session.phoneDeviceId || socket.data.deviceId || null,
      sims: session.sims,
      selectedSimSlot: session.selectedSimSlot
    };

    // Broadcast phone:connected to the session room so laptop UI updates immediately
    io.to(session.id).emit('phone:connected', connectedPayload);

    if (session.tenantId) {
      io.to(`tenant_${session.tenantId}`).emit('device:status-changed', {
        deviceId: session.phoneDeviceId || socket.data.deviceId || null,
        status: 'PAIRED',
        isSocketOnline: true,
        sessionId: session.id,
        lastSeenAt: new Date().toISOString()
      });
    }
  });

  socket.on('phone:status', (data: { sessionId?: string; phoneStatus: 'READY' | 'PERMISSION_REQUIRED' }) => {
    const sid = socket.data.sessionId || data.sessionId;
    if (!sid) return;

    const session = getSessionById(sid);
    if (!session) return;

    // Strict ownership verification: Emitting socket must be the paired phone socket
    const isAuthorized = session.phoneSocketId === socket.id &&
      (!session.phoneDeviceId || !socket.data.deviceId || session.phoneDeviceId === socket.data.deviceId);

    if (!isAuthorized) {
      console.warn(`[Socket Security] Rejected phone:status from unauthorized socket ${socket.id} for session ${sid}`);
      return;
    }

    setPhoneStatus(sid, data.phoneStatus);
    io.to(sid).emit('phone:status_changed', { phoneStatus: data.phoneStatus });
    console.log(`[Phone Status] Session ${sid} phoneStatus set to: ${data.phoneStatus}`);
  });

  socket.on('phone:sim-info', (data: { sessionId?: string; sims?: any[]; selectedSimSlot?: number; selectedCarrierName?: string }) => {
    const sid = socket.data.sessionId || data.sessionId;
    if (!sid) return;

    const session = getSessionById(sid);
    if (!session) return;

    if (session.phoneSocketId !== socket.id) {
      console.warn(`[Socket Security] Rejected phone:sim-info from unauthorized socket ${socket.id} for session ${sid}`);
      return;
    }

    session.sims = data.sims;
    if (data.selectedSimSlot !== undefined) {
      session.selectedSimSlot = data.selectedSimSlot;
    }

    io.to(sid).emit('device:sim-info', {
      deviceId: session.phoneDeviceId,
      sims: data.sims,
      selectedSimSlot: data.selectedSimSlot,
      selectedCarrierName: data.selectedCarrierName
    });
    console.log(`[SIM Info] Updated SIMs for session ${sid}: count=${data.sims?.length || 0} selectedSlot=${data.selectedSimSlot}`);
  });

  socket.on('phone:ping', async () => {
    await updateHeartbeat(socket.id);
    socket.emit('phone:pong', { timestamp: new Date().toISOString() });
  });

  socket.on('campaign:select', (data: { campaignId: string; sessionId?: string }) => {
    const tenantId = (socket as any).data?.tenantId || (socket as any).tenantId;
    if (!tenantId) return;
    io.to(`tenant_${tenantId}`).emit('campaign:selected', { campaignId: data?.campaignId });
    if (data?.sessionId) {
      io.to(data.sessionId).emit('campaign:selected', { campaignId: data.campaignId });
    }
    console.log(`[Campaign Sync] Broadcasted campaign:selected ${data?.campaignId} to tenant_${tenantId}`);
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

  // Phone responds to latency ping — must be the authoritative paired phone socket
  socket.on('phone:pong', ({ sessionId, timestamp }: { sessionId?: string; timestamp: number }) => {
    const sid = socket.data.sessionId || sessionId;
    if (!sid) return;
    const session = getSessionById(sid);
    if (!session || session.phoneSocketId !== socket.id) return;
    io.to(sid).emit('client:pong', { timestamp });
  });

  socket.on('app:version_check', ({ currentVersion }: { currentVersion: string }) => {
    const SERVER_APP_VERSION = '1.2.0'; // Latest released version
    if (currentVersion !== SERVER_APP_VERSION) {
      socket.emit('app:update_available', {
        latestVersion: SERVER_APP_VERSION,
        apkUrl: `${getPublicBaseUrl({ handshake: socket.handshake })}/download/apk`,
        forceUpdate: false,
        releaseNotes: 'v1.2.0 Fixes: Auto-dialer now ACTUALLY dials (ACTION_CALL), Ring timeout with auto-hangup, NO_ANSWER tracking, Dashboard tab fix, BT Link tab moved to last.'
      });
    } else {
      socket.emit('app:up_to_date', { version: SERVER_APP_VERSION });
    }
  });

  socket.on('dial:lead', async ({ sessionId, phone, name, leadId, campaignId, timeout, forceRedial, simSlot }: {
    sessionId: string;
    phone: string;
    name: string;
    leadId?: string;
    campaignId?: string;
    timeout: number;
    forceRedial?: boolean;
    simSlot?: number;
  }) => {
    // 1. Validate session existence
    const session = getSessionById(sessionId);
    if (!session) {
      socket.emit('error', { code: 'INVALID_SESSION', message: 'No active session found.' });
      return;
    }

    // 2. Validate laptop socket ownership of this session
    if (session.laptopSocketId !== socket.id) {
      socket.emit('error', { code: 'UNAUTHORIZED_LAPTOP', message: 'Unauthorized session emitter socket.' });
      return;
    }

    // 3. Validate phone connection & reachability
    if (!session.phoneSocketId) {
      socket.emit('error', { code: 'NO_PHONE', message: 'No paired phone active.' });
      return;
    }

    const phoneSocket = io.sockets.sockets.get(session.phoneSocketId);
    if (!phoneSocket) {
      socket.emit('error', { code: 'PHONE_UNREACHABLE', message: 'Phone socket not reachable. Reconnect your phone.' });
      return;
    }

    if (session.phoneStatus === 'PERMISSION_REQUIRED') {
      socket.emit('error', { code: 'PERMISSION_REQUIRED', message: 'Phone call permission is required. Please grant permission on your phone.' });
      socket.emit('dial:blocked', {
        reason: 'PERMISSION_REQUIRED',
        message: 'Phone call permission is required. Please grant permission on your phone.',
        phone,
        name
      });
      return;
    }

    const tenantId = session.tenantId;
    if (!tenantId) {
      socket.emit('error', { code: 'UNAUTHORIZED_TENANT', message: 'Session is not bound to an authenticated tenant.' });
      return;
    }

    // 4. Route through Safety Controller & Atomic Lead Reservation (only AFTER authorization checks!)
    if (pendingDialSessions.has(sessionId)) {
      socket.emit('dial:blocked', { reason: 'DEVICE_BUSY', message: 'A dial request is already in progress.' });
      return;
    }
    pendingDialSessions.add(sessionId);
    try {
    const check = await checkCallAllowed({ sessionId, phone, leadId, campaignId, tenantId, allowCompleted: forceRedial === true });

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

    if (session.phoneSocketId !== phoneSocket.id || session.laptopSocketId !== socket.id || isEmergencyStopped(tenantId, campaignId)) {
      if (leadId) await releaseLeadLock(leadId, sessionId);
      if (check.commandId) await expireCommand(check.commandId);
      socket.emit('dial:blocked', { reason: 'SESSION_CHANGED', message: 'Connection or safety state changed during dial preparation.' });
      return;
    }
    setSessionStatus(sessionId, 'CALLING');

    const effectiveSimSlot = simSlot !== undefined ? simSlot : (session.selectedSimSlot !== undefined ? session.selectedSimSlot : undefined);

    // Create canonical CallSession scoped strictly to tenant, user, device, and session
    const callSession = createCallSession({
      sessionId,
      tenantId,
      userId: session.userId || socket.data.user?.id || 'system',
      phoneDeviceId: session.phoneDeviceId || session.phoneDeviceName || 'dev_phone',
      laptopSocketId: socket.id,
      phoneSocketId: session.phoneSocketId,
      leadId,
      phone,
      name,
      direction: 'OUTBOUND',
      commandId: check.commandId,
      campaignId,
      simSlot: effectiveSimSlot
    });

    // P1: Define and commit immutable durable call record BEFORE dispatch
    const dispatchedAt = new Date().toISOString();
    const replayExpiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
    const bindingGen = (session as any).generation || 1;

    try {
      const journalRes = await db.execute(
        `INSERT INTO call_dispatch_journal (
          "callId", "tenantId", "userId", "deviceId", "sessionId", "bindingGeneration",
          "destination", "name", "commandId", "leadId", "campaignId", "simSlot",
          "protocolVersion", "dispatchedAt", "replayExpiresAt", "status"
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, 'DISPATCHED')`,
        [
          callSession.callId,
          tenantId,
          callSession.userId,
          callSession.phoneDeviceId,
          sessionId,
          bindingGen,
          phone,
          name || null,
          check.commandId || null,
          leadId || null,
          campaignId || null,
          effectiveSimSlot ?? null,
          '1.0',
          dispatchedAt,
          replayExpiresAt
        ]
      );

      if (!journalRes || journalRes.rowCount === 0) {
        if (leadId) await releaseLeadLock(leadId, sessionId).catch(() => {});
        if (check.commandId) await expireCommand(check.commandId).catch(() => {});
        setSessionStatus(sessionId, 'PAIRED');
        socket.emit('error', { code: 'PERSISTENCE_FAILED', message: 'Failed to record durable call dispatch in journal.' });
        return;
      }
    } catch (jErr) {
      console.error('[CallEngine] Failed to write call_dispatch_journal:', jErr);
      if (leadId) await releaseLeadLock(leadId, sessionId).catch(() => {});
      if (check.commandId) await expireCommand(check.commandId).catch(() => {});
      setSessionStatus(sessionId, 'PAIRED');
      socket.emit('error', { code: 'PERSISTENCE_FAILED', message: 'Database error writing call dispatch journal.' });
      return;
    }

    if (check.commandId) {
      try {
        const cmdRes = await db.execute(
          `UPDATE commands SET "callId" = $1, "deviceId" = $2, "userId" = $3, "phone" = $4, "name" = $5 WHERE id = $6 AND "tenantId" = $7`,
          [callSession.callId, callSession.phoneDeviceId, callSession.userId, phone, name || null, check.commandId, tenantId]
        );
        if (!cmdRes || cmdRes.rowCount === 0) {
          if (leadId) await releaseLeadLock(leadId, sessionId).catch(() => {});
          await expireCommand(check.commandId).catch(() => {});
          setSessionStatus(sessionId, 'PAIRED');
          socket.emit('error', { code: 'COMMAND_BIND_FAILED', message: 'Failed to bind command to call dispatch.' });
          return;
        }
      } catch (cErr) {
        console.error('[CallEngine] Failed to update command ownership:', cErr);
        if (leadId) await releaseLeadLock(leadId, sessionId).catch(() => {});
        await expireCommand(check.commandId).catch(() => {});
        setSessionStatus(sessionId, 'PAIRED');
        socket.emit('error', { code: 'COMMAND_BIND_FAILED', message: 'Database error binding command to call.' });
        return;
      }
    }

    const dialPayload = {
      callId: callSession.callId,
      phone,
      name,
      leadId: leadId || '',
      timeout,
      commandId: check.commandId,
      simSlot: effectiveSimSlot
    };

    try {
      phoneSocket.emit('phone:dial', dialPayload);
      socket.emit('dial:dispatched', { callId: callSession.callId, commandId: check.commandId, leadId, phone, name });
      io.to(session.id).emit('call:status-changed', {
        callId: callSession.callId,
        state: 'COMMAND_SENT',
        leadId,
        phone,
        name,
        timestamp: new Date().toISOString()
      });
      console.log(`[CallEngine] ✅ DIAL DISPATCHED | CallId: ${callSession.callId} | Phone Socket: ${session.phoneSocketId} | ${name} (${phone}) | Session: ${sessionId} | Cmd: ${check.commandId}`);
    } catch (err: any) {
      if (leadId) await releaseLeadLock(leadId, sessionId);
      updateCallSessionState(callSession.callId, 'DIAL_FAILED', { endReason: 'SOCKET_DISPATCH_ERROR' });
      socket.emit('error', { code: 'DISPATCH_ERROR', message: 'Failed to dispatch call to phone socket.' });
    }
    } catch (err) {
      if (leadId) await releaseLeadLock(leadId, sessionId).catch(() => {});
      socket.emit('error', { code: 'DIAL_FAILED', message: 'Dial preparation failed. Please retry.' });
      console.error('[CallEngine] Dial preparation failed:', err);
    } finally {
      pendingDialSessions.delete(sessionId);
    }
  });

  // Emergency stop from socket
  socket.on('campaign:emergency_stop', ({ sessionId, campaignId }: { sessionId?: string; campaignId?: string } = {}) => {
    const session = getSessionById(sessionId || socket.data.sessionId || '');
    const user = socket.data.user;
    const tenantId = user?.tenantId;
    if (!user || !tenantId || !session || session.tenantId !== tenantId || session.laptopSocketId !== socket.id || session.userId !== user.id) {
      socket.emit('error', { code: 'UNAUTHORIZED', message: 'Unauthorized session.' });
      return;
    }
    if (session.phoneSocketId) {
      io.sockets.sockets.get(session.phoneSocketId)?.emit('phone:hangup');
    }

    triggerEmergencyStop(tenantId, campaignId);

    const sid = sessionId || socket.data.sessionId;
    if (sid) {
      io.to(sid).emit('campaign:emergency_stopped', { stoppedBy: 'dashboard-socket', campaignId, timestamp: new Date().toISOString() });
    }
    io.to(`tenant_${tenantId}`).emit('campaign:emergency_stopped', { stoppedBy: 'dashboard-socket', campaignId, timestamp: new Date().toISOString() });
    console.warn(`[SafetyController] Emergency stop via socket for tenant ${tenantId} / campaign ${campaignId || 'ALL'}`);
  });

  socket.on('campaign:clear_emergency_stop', ({ campaignId }: { campaignId?: string } = {}) => {
    const tenantId = socket.data.tenantId;
    if (!tenantId) {
      socket.emit('error', { code: 'UNAUTHORIZED', message: 'Missing tenant identity.' });
      return;
    }

    // Role check: restricted agents cannot clear emergency stop
    const user = socket.data.user;
    if (!user || !['platform_admin', 'master_admin', 'admin', 'tenant_admin', 'supervisor'].includes(user.role)) {
      console.warn(`[SafetyController Security] Agent ${user.id} attempted to clear emergency stop without admin/supervisor rights.`);
      socket.emit('error', { code: 'FORBIDDEN', message: 'Only administrators or supervisors can clear emergency stops.' });
      return;
    }

    clearEmergencyStop(tenantId, campaignId);
    io.to(`tenant_${tenantId}`).emit('campaign:emergency_cleared', { clearedBy: 'dashboard-socket', campaignId });
  });

  socket.on('dial:hangup', ({ sessionId, callId }: { sessionId: string; callId?: string }) => {
    const session = getSessionById(sessionId);
    if (!session) return;
    if (session.laptopSocketId !== socket.id) {
      console.warn(`[Socket Security] Rejected hangup from unauthorized socket ${socket.id} for session ${sessionId}`);
      return;
    }

    const cs = callId ? getCallSession(callId) : getCallSessionBySessionId(session.id);
    if (!cs || cs.sessionId !== session.id || cs.tenantId !== session.tenantId || cs.endedAt) return;
    if (cs) {
      updateCallSessionState(cs.callId, 'ENDING');
      io.to(session.id).emit('call:status-changed', { callId: cs.callId, state: 'ENDING' });
    }

    if (session.phoneSocketId) {
      const phoneSocket = io.sockets.sockets.get(session.phoneSocketId);
      if (phoneSocket) {
        phoneSocket.emit('phone:hangup');
        phoneSocket.emit('phone:hangup-call', { callId: cs?.callId });
      }
    }
    console.log(`[CallEngine] Hangup command sent to phone in session ${sessionId} (Call: ${cs?.callId || 'active'})`);
  });

  socket.on('phone:dial-ack', async ({ commandId, callId, accepted, reason }: { commandId?: string; callId?: string; accepted: boolean; reason?: string }) => {
    const cs = (callId ? getCallSession(callId) : null) || (commandId ? getCallSessionByCommandId(commandId) : null);
    if (!cs) return;

    if (cs.phoneSocketId !== socket.id) {
      console.warn(`[CallSession Security] Rejected dial-ack from non-authoritative socket ${socket.id}`);
      return;
    }

    if (accepted) {
      updateCallSessionState(cs.callId, 'COMMAND_RECEIVED');
      io.to(cs.sessionId).emit('call:status-changed', {
        callId: cs.callId,
        state: 'COMMAND_RECEIVED',
        leadId: cs.leadId,
        phone: cs.phone,
        name: cs.name,
        timestamp: new Date().toISOString()
      });
      console.log(`[CallEngine] 📱 Phone ACK received: COMMAND_RECEIVED for Call ${cs.callId} (${cs.phone})`);
    } else {
      console.warn(`[CallEngine] ❌ Phone REJECTED dial command for Call ${cs.callId} | Reason: ${reason}`);
      updateCallSessionState(cs.callId, 'DIAL_FAILED', { endReason: reason || 'PHONE_REJECTED' });
      setSessionStatus(cs.sessionId, 'PAIRED');
      if (cs.leadId) {
        await releaseLeadLock(cs.leadId, cs.sessionId);
      }
      io.to(cs.sessionId).emit('call:finished', { callId: cs.callId, reason: reason || 'DIAL_FAILED', duration: 0, leadId: cs.leadId, commandId: cs.commandId });
      io.to(cs.sessionId).emit('call:status-changed', { callId: cs.callId, state: 'DIAL_FAILED', reason });
    }
  });

  socket.on('call:state-changed', ({ callId, commandId, state }: { callId?: string; commandId?: string; state: CallState }) => {
    // Terminal outcomes must pass through the transactional call:ended handler.
    if (!['COMMAND_RECEIVED', 'DIALING', 'RINGING', 'ACTIVE', 'ENDING'].includes(state)) return;
    const cs = (callId ? getCallSession(callId) : null) || (commandId ? getCallSessionByCommandId(commandId) : null);
    if (!cs || cs.phoneSocketId !== socket.id) return;

    if (!updateCallSessionState(cs.callId, state)) return;
    io.to(cs.sessionId).emit('call:status-changed', {
      callId: cs.callId,
      state,
      leadId: cs.leadId,
      phone: cs.phone,
      name: cs.name,
      timestamp: new Date().toISOString()
    });
    console.log(`[CallEngine] Native telephony state sync: Call ${cs.callId} -> ${state}`);
  });

  socket.on('dial:answer', ({ sessionId }: { sessionId: string }) => {
    const session = getSessionById(sessionId);
    if (!session) return;
    if (session.laptopSocketId !== socket.id) {
      console.warn(`[Socket PhoneLink] Rejected answer from unauthorized socket ${socket.id} for session ${sessionId}`);
      return;
    }
    if (session.phoneSocketId) {
      const phoneSocket = io.sockets.sockets.get(session.phoneSocketId);
      if (phoneSocket) {
        phoneSocket.emit('phone:answer-call');
        console.log(`[Socket PhoneLink] Answer command sent to phone in session ${sessionId}`);
      }
    }
  });

  socket.on('phone:incoming-call', ({ sessionId, deviceId, phone }: { sessionId?: string; deviceId?: string; phone?: string }) => {
    const sid = sessionId || socket.data.sessionId;
    const session = sid ? getSessionById(sid) : null;
    if (session && session.phoneSocketId === socket.id) {
      const cs = createCallSession({
        sessionId: session.id,
        tenantId: session.tenantId || 'default',
        userId: session.userId || 'system',
        phoneDeviceId: session.phoneDeviceId || deviceId || 'phone',
        laptopSocketId: session.laptopSocketId || '',
        phoneSocketId: socket.id,
        phone: phone || 'Unknown Caller',
        name: 'Incoming Call',
        direction: 'INCOMING'
      });
      updateCallSessionState(cs.callId, 'RINGING');

      const payload = {
        callId: cs.callId,
        phone: phone || 'Unknown Caller',
        deviceId: session.phoneDeviceId || deviceId,
        deviceName: session.phoneDeviceName || 'Connected Phone',
        timestamp: new Date().toISOString(),
        direction: 'INCOMING'
      };
      io.to(session.id).emit('call:incoming', payload);
      io.to(session.id).emit('call:status-changed', { callId: cs.callId, state: 'RINGING', phone: cs.phone, direction: 'INCOMING' });
      console.log(`[Socket PhoneLink] 📲 Incoming cellular call on phone ${session.phoneDeviceName} (${phone}) -> Notified laptop in session ${session.id}`);
    }
  });

  socket.on('phone:call-idle', ({ sessionId, deviceId }: { sessionId?: string; deviceId?: string }) => {
    const sid = sessionId || socket.data.sessionId;
    const session = sid ? getSessionById(sid) : null;
    if (session && session.phoneSocketId === socket.id) {
      io.to(session.id).emit('call:incoming-dismissed');
      console.log(`[Socket PhoneLink] Cellular call returned to IDLE on phone in session ${session.id}`);
    }
  });

  // ─── STRICT CALL LIFECYCLE SOCKET HANDLERS ─────────────────────────────────
  // Server-side idempotency guard to prevent duplicate terminal processing per call
  const processedCallEndings = new Set<string>();

  socket.on('call:picked-up', ({ sessionId, callId }: { sessionId?: string; callId?: string }) => {
    const session = getSessionById(sessionId || socket.data.sessionId || '');
    if (!session) return;

    // Strict ownership validation: Only the authoritative paired phone socket may emit call:picked-up
    if (session.phoneSocketId !== socket.id) {
      console.warn(`[Socket Security] Rejected call:picked-up from non-authoritative socket ${socket.id} (owner: ${session.phoneSocketId})`);
      return;
    }

    if (socket.data.tenantId && session.tenantId && socket.data.tenantId !== session.tenantId) {
      console.warn(`[Socket Security] Rejected call:picked-up: Tenant mismatch`);
      return;
    }

    const cs = callId ? getCallSession(callId) : getCallSessionBySessionId(session.id);
    if (!cs || cs.sessionId !== session.id || cs.tenantId !== session.tenantId || cs.endedAt) return;
    if (cs) {
      if (!updateCallSessionState(cs.callId, 'ACTIVE')) return;
      io.to(session.id).emit('call:status-changed', {
        callId: cs.callId,
        state: 'ACTIVE',
        leadId: cs.leadId,
        phone: cs.phone,
        name: cs.name,
        timestamp: new Date().toISOString()
      });
    }

    setSessionStatus(session.id, 'CALLING');
    socket.to(session.id).emit('call:started');
    console.log(`[CallEngine] Verified Phone ${socket.id} ACTIVE in session ${session.id} (Call: ${cs?.callId || 'active'})`);
  });

  socket.on('call:ended', async ({ sessionId, callId, leadId, phone, name, reason, duration, commandId, answered, outboxId }: {
    sessionId: string;
    callId?: string;
    leadId?: string;
    phone?: string;
    name?: string;
    reason: string;
    duration: number;
    commandId?: string;
    answered?: boolean;
    outboxId?: string;
  }) => {
    const authTenantId = socket.data.tenantId;
    const socketDeviceId = socket.data.deviceId || socket.data.phoneDeviceId;
    const socketUserId = socket.data.user?.id;

    if (!authTenantId || !socketDeviceId) {
      console.warn(`[Socket Security] Rejected call:ended: Missing authenticated tenant or device principal (${socket.id})`);
      socket.emit('error', { code: 'UNAUTHORIZED_SOCKET', message: 'Socket requires authenticated tenant and device registration' });
      return;
    }

    const rawCallId = typeof callId === 'string' ? callId.trim() : '';
    const rawCmdId = typeof commandId === 'string' ? commandId.trim() : '';
    const targetCallId = rawCallId || rawCmdId;
    if (!targetCallId) {
      console.warn('[Socket Security] Rejected call:ended: Missing callId/commandId');
      socket.emit('error', { code: 'INVALID_PAYLOAD', message: 'Missing callId or commandId' });
      return;
    }

    // Step 1: Query canonical pre-dispatch journal (strictly scoped to authenticated tenant)
    let journalRecord: any = null;
    try {
      journalRecord = await db.queryOne(
        'SELECT * FROM call_dispatch_journal WHERE "tenantId" = $1 AND ("callId" = $2 OR "commandId" = $3) LIMIT 1',
        [authTenantId, targetCallId, rawCmdId || targetCallId]
      );
    } catch (dbErr) {
      console.error('[CallEngine] Database error querying call_dispatch_journal:', dbErr);
      socket.emit('error', { code: 'CALL_OUTCOME_PERSISTENCE_FAILED', message: 'Storage unavailable during recovery check. Retry terminal event.' });
      return;
    }

    const session = getSessionById(sessionId || socket.data.sessionId || '');
    const cs = rawCallId ? getCallSession(rawCallId) : rawCmdId ? getCallSessionByCommandId(rawCmdId) : (session ? getCallSessionBySessionId(session.id) : undefined);

    // Fallback query to legacy commands table if journal does not have it yet
    let legacyCmd: any = null;
    if (!journalRecord && rawCmdId) {
      try {
        legacyCmd = await db.queryOne(
          'SELECT id, "tenantId", "leadId", "sessionId", "deviceId", "userId", "phone", "name", "callId" FROM commands WHERE id = $1 AND "tenantId" = $2 LIMIT 1',
          [rawCmdId, authTenantId]
        );
      } catch (dbErr) {
        console.error('[CallEngine] Database error querying legacy command:', dbErr);
        socket.emit('error', { code: 'CALL_OUTCOME_PERSISTENCE_FAILED', message: 'Storage unavailable during legacy check. Retry terminal event.' });
        return;
      }
    }

    // Fail closed if call cannot be authoritatively identified
    if (!journalRecord && !cs && !legacyCmd) {
      console.warn(`[Socket Security] Rejected call:ended: Unknown call ${targetCallId} on tenant ${authTenantId}`);
      socket.emit('error', { code: 'UNKNOWN_CALL', message: 'Call not found in authoritative dispatch ledger' });
      return;
    }

    const effectiveTenantId = journalRecord?.tenantId || cs?.tenantId || legacyCmd?.tenantId || authTenantId;
    if (effectiveTenantId !== authTenantId) {
      console.warn(`[Socket Security] Rejected call:ended: Tenant mismatch (${effectiveTenantId} !== ${authTenantId})`);
      socket.emit('error', { code: 'TENANT_MISMATCH', message: 'Tenant ownership mismatch' });
      return;
    }

    // Step 2: Verify Device Ownership
    const authoritativeDeviceId = journalRecord?.deviceId || cs?.phoneDeviceId || legacyCmd?.deviceId || session?.phoneDeviceId;
    if (authoritativeDeviceId && authoritativeDeviceId !== socketDeviceId) {
      console.warn(`[Socket Security] Rejected call:ended: Device mismatch (owned by ${authoritativeDeviceId}, socket is ${socketDeviceId})`);
      socket.emit('error', { code: 'DEVICE_MISMATCH', message: 'Device ownership mismatch' });
      return;
    }

    // Step 3: Verify Replay Expiry
    if (journalRecord && journalRecord.replayExpiresAt) {
      if (new Date() > new Date(journalRecord.replayExpiresAt)) {
        console.warn(`[Socket Security] Rejected call:ended: Replay authorization expired for call ${targetCallId}`);
        socket.emit('error', { code: 'REPLAY_EXPIRED', message: 'Replay authorization window expired' });
        return;
      }
    }

    const resolvedCallId = journalRecord?.callId || cs?.callId || legacyCmd?.callId || targetCallId;
    const dedupeKey = `${effectiveTenantId}:${resolvedCallId}`;

    // Step 4: Check durable PostgreSQL call_outcomes ledger (strictly scoped by tenant AND callId)
    let existingDbOutcome = null;
    try {
      existingDbOutcome = await db.queryOne<{ id: string; tenantId: string; leadId?: string }>(
        'SELECT id, "tenantId", "leadId" FROM call_outcomes WHERE "callId" = $1 AND "tenantId" = $2 LIMIT 1',
        [resolvedCallId, effectiveTenantId]
      );
    } catch (dbErr) {
      console.error('[CallEngine] Database error checking existing call_outcomes:', dbErr);
      socket.emit('error', { code: 'CALL_OUTCOME_PERSISTENCE_FAILED', message: 'Storage unavailable during outcome check. Retry terminal event.' });
      return;
    }

    const effectiveCommandId = journalRecord?.commandId || cs?.commandId || legacyCmd?.id || null;
    const effectiveLeadId = journalRecord ? journalRecord.leadId : (cs ? cs.leadId : (legacyCmd ? legacyCmd.leadId : null));
    const effectivePhone = journalRecord?.destination || cs?.phone || legacyCmd?.phone || phone || '';
    const effectiveName = journalRecord?.name || cs?.name || legacyCmd?.name || name || null;
    const effectiveSessionId = journalRecord?.sessionId || cs?.sessionId || legacyCmd?.sessionId || session?.id || '';

    if (existingDbOutcome) {
      socket.emit('call:ended-ack', {
        ack: true,
        protocolVersion: '1.0',
        tenantId: effectiveTenantId,
        callId: resolvedCallId,
        commandId: effectiveCommandId,
        outboxId: outboxId || null,
        leadId: existingDbOutcome.leadId,
      });
      return;
    }

    // In-flight and in-memory deduplication scoped by tenant:callId
    if (committedCallEndings.has(dedupeKey)) {
      socket.emit('call:ended-ack', {
        ack: true,
        protocolVersion: '1.0',
        tenantId: effectiveTenantId,
        callId: resolvedCallId,
        commandId: effectiveCommandId,
        outboxId: outboxId || null,
        leadId: effectiveLeadId
      });
      return;
    }

    const existingInFlight = inFlightCallFinalizations.get(dedupeKey);
    if (existingInFlight) {
      try {
        const ok = await existingInFlight;
        if (ok) {
          socket.emit('call:ended-ack', {
            ack: true,
            protocolVersion: '1.0',
            tenantId: effectiveTenantId,
            callId: resolvedCallId,
            commandId: effectiveCommandId,
            outboxId: outboxId || null,
            leadId: effectiveLeadId
          });
        } else {
          socket.emit('error', { code: 'CALL_FINALIZATION_FAILED', message: 'In-flight transaction failed' });
        }
      } catch {
        socket.emit('error', { code: 'CALL_FINALIZATION_FAILED', message: 'In-flight transaction failed' });
      }
      return;
    }

    const effectiveReason = typeof reason === 'string' && reason.length <= 64 ? reason : 'UNKNOWN';
    const effectiveDuration = typeof duration === 'number' && Number.isFinite(duration) ? Math.max(0, Math.min(86400, Math.floor(duration))) : 0;
    const effectiveAnswered = (answered === true || effectiveReason === 'ANSWERED') ? 1 : 0;
    const outcomeId = `co_${resolvedCallId}_${Date.now()}`;
    const finalizedAt = new Date().toISOString();
    const phoneDeviceId = authoritativeDeviceId || socketDeviceId || null;
    const userId = journalRecord?.userId || cs?.userId || legacyCmd?.userId || session?.userId || socketUserId || null;

    let wonClaim = false;
    let canonicalOutcome: any = null;

    const finalizationTask: Promise<boolean> = (async () => {
      try {
        await db.withTransaction(async () => {
          // P1: Atomic transactional claim: only the winning insert executes associated side-effects
          const insertResult = await db.query(
            `INSERT INTO call_outcomes ("id", "tenantId", "callId", "commandId", "leadId", "phone", "name", "reason", "duration", "answered", "finalizedAt", "phoneDeviceId", "userId")
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
             ON CONFLICT ("tenantId", "callId") DO NOTHING
             RETURNING id;`,
            [
              outcomeId,
              effectiveTenantId,
              resolvedCallId,
              effectiveCommandId,
              effectiveLeadId,
              effectivePhone,
              effectiveName,
              effectiveReason,
              effectiveDuration,
              effectiveAnswered,
              finalizedAt,
              phoneDeviceId,
              userId
            ]
          );

          wonClaim = Boolean(insertResult.rows && insertResult.rows.length > 0 && insertResult.rows[0].id === outcomeId);

          if (wonClaim) {
            if (effectiveCommandId) await expireCommand(effectiveCommandId);
            if (effectiveLeadId) {
              await releaseLeadLock(effectiveLeadId, effectiveSessionId);
              await createLog(effectiveLeadId, effectiveReason, effectiveDuration, effectiveTenantId);
              await updateLeadStatus(effectiveLeadId, 'COMPLETED', effectiveReason, effectiveDuration, effectiveTenantId);
            } else {
              await createManualLog(effectivePhone, effectiveName || 'Manual Quick Dial', effectiveReason, effectiveDuration, effectiveTenantId);
            }
          } else {
            // Conflict / already committed: query full canonical record within transaction; do not repeat mutations
            canonicalOutcome = await db.queryOne<{ id: string; reason: string; duration: number; leadId?: string; commandId?: string }>(
              'SELECT id, "reason", "duration", "leadId", "commandId" FROM call_outcomes WHERE "tenantId" = $1 AND "callId" = $2 LIMIT 1',
              [effectiveTenantId, resolvedCallId]
            );
            if (!canonicalOutcome) {
              throw new Error('Concurrent outcome insertion could not be confirmed');
            }
          }
        });

        if (wonClaim) {
          if (cs) finalizeCallSession(cs.callId, effectiveReason, effectiveDuration);
        }
        committedCallEndings.add(dedupeKey);
        if (committedCallEndings.size > 2000) {
          const first = committedCallEndings.values().next().value;
          if (first) committedCallEndings.delete(first);
        }
        return true;
      } catch (err) {
        console.error('[CallEngine] Finalization transaction failed:', err);
        return false;
      } finally {
        inFlightCallFinalizations.delete(dedupeKey);
      }
    })();

    inFlightCallFinalizations.set(dedupeKey, finalizationTask);
    const success = await finalizationTask;

    if (!success) {
      socket.emit('error', { code: 'CALL_FINALIZATION_FAILED', message: 'Call outcome was not saved. Retry the terminal event.' });
      return;
    }

    if (wonClaim) {
      if (session && cs && cs.sessionId === session.id) {
        setSessionStatus(session.id, 'PAIRED');
      }
    }

    // Acknowledge durable persistence to phone socket for terminal outbox clearing with canonical outcome
    socket.emit('call:ended-ack', {
      ack: true,
      protocolVersion: '1.0',
      tenantId: effectiveTenantId,
      callId: resolvedCallId,
      commandId: effectiveCommandId,
      outboxId: outboxId || null,
      leadId: wonClaim ? effectiveLeadId : (canonicalOutcome?.leadId || effectiveLeadId),
      reason: wonClaim ? effectiveReason : (canonicalOutcome?.reason || effectiveReason),
      duration: wonClaim ? effectiveDuration : (canonicalOutcome?.duration ?? effectiveDuration),
    });

    // Only broadcast call:finished, call:status-changed, and leads:updated if this request won the authoritative insert claim!
    if (wonClaim) {
      if (effectiveSessionId && (!cs || cs.sessionId === effectiveSessionId)) {
        socket.to(effectiveSessionId).emit('call:finished', {
          reason: effectiveReason,
          duration: effectiveDuration,
          leadId: effectiveLeadId,
          commandId: effectiveCommandId,
          callId: resolvedCallId
        });
        io.to(effectiveSessionId).emit('call:status-changed', {
          callId: resolvedCallId,
          state: 'ENDED',
          reason: effectiveReason,
          duration: effectiveDuration,
          leadId: effectiveLeadId,
          commandId: effectiveCommandId,
          timestamp: finalizedAt
        });
      }
      io.to(`tenant_${effectiveTenantId}`).emit('leads:updated');
      console.log(`[CallEngine] Call finalized in session ${effectiveSessionId} | CallId: ${resolvedCallId} | Lead: ${effectiveLeadId || effectivePhone} | Reason: ${effectiveReason} | Duration: ${effectiveDuration}s`);
    } else {
      console.log(`[CallEngine] Call outcome deduplicated on conflict for CallId: ${resolvedCallId} | Canonical Reason: ${canonicalOutcome?.reason || effectiveReason} | Canonical Duration: ${canonicalOutcome?.duration ?? effectiveDuration}s`);
    }
  });

  socket.on('disconnect', async () => {
    // If it was an authenticated phone socket
    if (socket.data.isPhone && socket.data.deviceId) {
      const devId = socket.data.deviceId;
      const tenantId = socket.data.tenantId;
      // Guard: Only delete from active map if it still points to THIS socket ID (prevents stale disconnects from dropping new sockets!)
      if (authenticatedPhoneSockets.get(devId)?.socketId === socket.id) {
        authenticatedPhoneSockets.delete(devId);
        await updateDeviceStatus(devId, 'OFFLINE');
        const statusPayload = {
          deviceId: devId,
          status: 'OFFLINE',
          isSocketOnline: false,
          lastSeenAt: new Date().toISOString()
        };
        if (tenantId) {
          io.to(`tenant_${tenantId}`).emit('device:status-changed', statusPayload);
        }
        console.log(`[Auth Phone Disconnect] Device ${devId} went OFFLINE`);
      } else {
        console.log(`[Auth Phone Disconnect] Stale disconnect ignored for device ${devId}`);
      }
    }

    const session = getSessionBySocketId(socket.id);
    if (!session) return;

    const activeCs = getCallSessionBySessionId(session.id);
    const hasActiveCall = activeCs && activeCs.state !== 'ENDED';

    // Only release idle lead leases if there is no active call in progress
    if (!hasActiveCall) {
      await unlockLeadsForSession(session.id);
    }

    if (session.laptopSocketId === socket.id) {
      // Do NOT send session:ended to phone — laptop socket reclaims session instantly on reconnect!
      console.log(`[Socket Disconnect] Laptop socket ${socket.id} disconnected from session ${session.id} (reclaimable)`);
      handleLaptopDisconnect(socket.id);
    } else if (session.phoneSocketId === socket.id) {
      // CRITICAL ARCHITECTURE RULE: Transport disconnect does NOT mean GSM call ended!
      // Carrier GSM call remains live on the mobile radio.
      // Preserve active CallSession and LeadLock so subsequent reconnect / outbox replay can record truthful duration.
      if (hasActiveCall) {
        console.log(`[Socket Disconnect] Phone socket ${socket.id} transport disconnected from session ${session.id} — preserving live GSM call ${activeCs.callId}`);
      }
      if (session.laptopSocketId) {
        io.to(session.laptopSocketId).emit('phone:disconnected');
      }
      await handlePhoneDisconnect(socket.id);
      console.log(`[Socket Disconnect] Phone socket ${socket.id} disconnected from session ${session.id}`);
    }
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// AUTO-EMAILER MODULE ROUTES
// ══════════════════════════════════════════════════════════════════════════════

// Job state for the emailer campaign runner (strictly isolated per tenant)
interface TenantEmailerJob {
  running: boolean;
  logs: string[];
  stop: boolean;
}

const tenantEmailerJobs = new Map<string, TenantEmailerJob>();

function getTenantEmailerJob(tenantId: string): TenantEmailerJob {
  let job = tenantEmailerJobs.get(tenantId);
  if (!job) {
    job = { running: false, logs: [], stop: false };
    tenantEmailerJobs.set(tenantId, job);
  }
  return job;
}

function emailLog(tenantId: string, msg: string) {
  const line = `[${new Date().toISOString()}] ${msg}`;
  const job = getTenantEmailerJob(tenantId);
  job.logs.push(line);
  if (job.logs.length > 500) job.logs.shift();
  console.log(`[Emailer][${tenantId}]`, msg);
}

// ── GET /email/leads
app.get('/email/leads', requireAuth, requirePermission(['autoEmailer', 'autoEmailer:view', 'autoEmailer:manage']), async (req: express.Request, res: express.Response): Promise<void> => {
  const tenantId = (req as any).user?.tenantId;
  if (!tenantId) {
    res.status(401).json({ error: 'Unauthorized: missing tenant identity' });
    return;
  }
  const rows = await db.queryAll('SELECT * FROM email_leads WHERE "tenantId" = $1 ORDER BY "createdAt" ASC', [tenantId]);
  res.json(rows);
});

// ── POST /email/upload
app.post('/email/upload', requireAuth, requirePermission(['autoEmailer', 'autoEmailer:manage', 'leads:import']), async (req: express.Request, res: express.Response): Promise<void> => {
  const tenantId = (req as any).user?.tenantId;
  if (!tenantId) {
    res.status(401).json({ error: 'Unauthorized: missing tenant identity' });
    return;
  }
  const { leads } = req.body as { leads: { email: string; name?: string; company?: string }[] };
  if (!Array.isArray(leads) || !leads.length) {
    res.status(400).json({ error: 'leads array required' });
    return;
  }
  let added = 0;
  let skipped = 0;
  for (const lead of leads) {
    if (!lead.email?.includes('@')) continue;
    const leadId = `eml_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const result = await db.execute(`
      INSERT INTO email_leads (id, email, name, company, status, stage, "tenantId")
      VALUES ($1, $2, $3, $4, 'pending', 1, $5)
      ON CONFLICT ("id") DO NOTHING
    `, [leadId, lead.email.toLowerCase().trim(), lead.name || 'Client', lead.company || '', tenantId]);
    if (result.rowCount > 0) added++; else skipped++;
  }
  res.json({ success: true, added, duplicates: skipped });
});

// ── DELETE /email/leads
app.delete('/email/leads', requireAuth, requirePermission(['autoEmailer', 'autoEmailer:manage']), async (req: express.Request, res: express.Response): Promise<void> => {
  const tenantId = (req as any).user?.tenantId;
  if (!tenantId) {
    res.status(401).json({ error: 'Unauthorized: missing tenant identity' });
    return;
  }
  await db.execute('DELETE FROM email_leads WHERE "tenantId" = $1', [tenantId]);
  res.json({ success: true });
});

// ── GET /email/accounts
app.get('/email/accounts', requireAuth, requirePermission(['autoEmailer', 'autoEmailer:view', 'autoEmailer:manage']), async (req: express.Request, res: express.Response): Promise<void> => {
  const tenantId = (req as any).user?.tenantId;
  if (!tenantId) {
    res.status(401).json({ error: 'Unauthorized: missing tenant identity' });
    return;
  }
  const rows = await db.queryAll('SELECT id, email, "senderName", "smtpHost", "smtpPort", status FROM email_accounts WHERE "tenantId" = $1', [tenantId]);
  res.json(rows);
});

// ── POST /email/accounts
app.post('/email/accounts', requireAuth, requirePermission(['autoEmailer', 'autoEmailer:manage']), async (req: express.Request, res: express.Response): Promise<void> => {
  const tenantId = (req as any).user?.tenantId;
  if (!tenantId) {
    res.status(401).json({ error: 'Unauthorized: missing tenant identity' });
    return;
  }
  const { accounts } = req.body as { accounts: { email: string; password: string; senderName?: string; smtpHost?: string; smtpPort?: number; status?: string }[] };
  if (!Array.isArray(accounts)) {
    res.status(400).json({ error: 'accounts array required' });
    return;
  }
  for (const acc of accounts) {
    const accId = `eml_acc_${acc.email.toLowerCase().replace(/[^a-z0-9]/g, '_')}`;
    await db.execute(`
      INSERT INTO email_accounts (id, email, password, "senderName", "smtpHost", "smtpPort", status, "tenantId")
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      ON CONFLICT ("id") DO UPDATE SET
        password = CASE WHEN excluded.password = '***keep***' THEN email_accounts.password ELSE excluded.password END,
        "senderName" = excluded."senderName",
        "smtpHost" = excluded."smtpHost",
        "smtpPort" = excluded."smtpPort",
        status = excluded.status,
        "tenantId" = excluded."tenantId"
    `, [
      accId,
      acc.email.toLowerCase(),
      acc.password,
      acc.senderName || null,
      acc.smtpHost || 'smtp.office365.com',
      acc.smtpPort || 587,
      acc.status || 'active',
      tenantId
    ]);
  }
  res.json({ success: true });
});

// ── GET /email/templates
app.get('/email/templates', requireAuth, requirePermission(['autoEmailer', 'autoEmailer:view', 'autoEmailer:manage']), async (req: express.Request, res: express.Response): Promise<void> => {
  const tenantId = (req as any).user?.tenantId;
  if (!tenantId) {
    res.status(401).json({ error: 'Unauthorized: missing tenant identity' });
    return;
  }
  const rows = await db.queryAll('SELECT * FROM email_templates WHERE ("tenantId" = $1 OR "systemTemplate" = 1) ORDER BY stage ASC, id ASC', [tenantId]);
  res.json(rows);
});

// ── POST /email/templates
app.post('/email/templates', requireAuth, requirePermission(['autoEmailer', 'autoEmailer:manage']), async (req: express.Request, res: express.Response): Promise<void> => {
  const tenantId = (req as any).user?.tenantId;
  if (!tenantId) {
    res.status(401).json({ error: 'Unauthorized: missing tenant identity' });
    return;
  }
  const { templates } = req.body as { templates: { subject: string; body: string; stage?: number }[] };
  if (!Array.isArray(templates)) {
    res.status(400).json({ error: 'templates array required' });
    return;
  }
  await db.execute('DELETE FROM email_templates WHERE "tenantId" = $1', [tenantId]);
  for (const t of templates) {
    const tplId = `tpl_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    await db.execute('INSERT INTO email_templates (id, subject, body, stage, "tenantId") VALUES ($1, $2, $3, $4, $5)', [tplId, t.subject, t.body, t.stage || 1, tenantId]);
  }
  res.json({ success: true });
});

// ── POST /email/start — fire-and-forget campaign runner
app.post('/email/start', requireAuth, requirePermission(['autoEmailer', 'autoEmailer:manage', 'email:send']), (req: express.Request, res: express.Response): void => {
  const tenantId = (req as any).user?.tenantId;
  if (!tenantId) {
    res.status(401).json({ error: 'Unauthorized: missing tenant identity' });
    return;
  }
  const job = getTenantEmailerJob(tenantId);
  if (job.running) {
    res.json({ success: true, message: 'Campaign already running.' });
    return;
  }
  const { limit = 300 } = req.body as { limit?: number };

  job.running = true;
  job.stop = false;

  (async () => {
    try {
      const { default: nodemailer } = await import('nodemailer');
      const leads = await db.queryAll(`SELECT * FROM email_leads WHERE "tenantId" = $1 AND status IN ('pending','sent')`, [tenantId]) as any[];
      const accounts = await db.queryAll(`SELECT * FROM email_accounts WHERE "tenantId" = $1 AND status = 'active'`, [tenantId]) as any[];
      const templates = await db.queryAll(`SELECT * FROM email_templates WHERE ("tenantId" = $1 OR "systemTemplate" = 1) ORDER BY stage ASC, id ASC`, [tenantId]) as any[];

      emailLog(tenantId, `=== Campaign Started [Tenant: ${tenantId}]: ${leads.length} eligible leads, ${accounts.length} accounts, ${templates.length} templates ===`);

      if (!accounts.length) { emailLog(tenantId, '❌ No active SMTP accounts for tenant!'); return; }
      if (!templates.length) { emailLog(tenantId, '❌ No email templates for tenant!'); return; }

      const SEVEN_DAYS = 7 * 24 * 60 * 60 * 1000;
      const now = Date.now();

      const eligible = leads.filter((l: any) => {
        if (l.status === 'pending') return true;
        if (l.status === 'sent' && l.stage < 3 && l.lastSentAt) {
          return now - new Date(l.lastSentAt).getTime() >= SEVEN_DAYS;
        }
        return false;
      });

      emailLog(tenantId, `Found ${eligible.length} leads eligible for sending.`);

      let leadIdx = 0;
      let tplIdx = 0;

      for (const acc of accounts) {
        if (leadIdx >= eligible.length || job.stop) break;

        emailLog(tenantId, `Using sender: ${acc.email}`);
        const transporter = nodemailer.createTransport({
          host: acc.smtpHost,
          port: acc.smtpPort,
          secure: false,
          auth: { user: acc.email, pass: acc.password },
          tls: { rejectUnauthorized: false }
        });

        let sent = 0;
        while (sent < limit && leadIdx < eligible.length && !job.stop) {
          const lead = eligible[leadIdx++];
          const tpl = templates[tplIdx++ % templates.length];

          const subject = tpl.subject.replace(/{{name}}/g, lead.name).replace(/{{company}}/g, lead.company);
          const body = tpl.body.replace(/{{name}}/g, lead.name).replace(/{{company}}/g, lead.company);

          try {
            emailLog(tenantId, `Sending Stage ${lead.stage} to: ${lead.email}`);
            await transporter.sendMail({
              from: `"${acc.senderName || 'Office'}" <${acc.email}>`,
              to: lead.email,
              subject,
              text: body
            });
            const newStage = Math.min(lead.stage + 1, 3);
            const newStatus = newStage >= 3 ? 'completed' : 'sent';
            await db.execute('UPDATE email_leads SET status = $1, stage = $2, "lastSentAt" = $3 WHERE id = $4 AND "tenantId" = $5', [newStatus, newStage, new Date().toISOString(), lead.id, tenantId]);
            emailLog(tenantId, `✅ Sent to ${lead.email} (Stage ${lead.stage})`);
            sent++;
            const delay = 30000 + Math.random() * 30000;
            await new Promise(r => setTimeout(r, delay));
          } catch (err: unknown) {
            emailLog(tenantId, `❌ Failed: ${lead.email} — ${(err as Error).message}`);
            if ((err as Error).message?.includes('Authentication') || (err as Error).message?.includes('Username and Password')) {
              await db.execute('UPDATE email_accounts SET status = \'disabled\' WHERE id = $1 AND "tenantId" = $2', [acc.id, tenantId]);
              emailLog(tenantId, `⚠️ Disabled account ${acc.email} (auth failure)`);
              break;
            }
          }
        }
        transporter.close();
      }

      emailLog(tenantId, `=== Campaign Completed [Tenant: ${tenantId}] ===`);
    } catch (err: unknown) {
      emailLog(tenantId, `❌ Campaign error: ${(err as Error).message}`);
    } finally {
      job.running = false;
    }
  })();

  res.json({ success: true, message: 'Campaign started in background.' });
});

// ── POST /emailer/stop
app.post('/emailer/stop', requireAuth, requirePermission(['autoEmailer', 'autoEmailer:manage']), (req: express.Request, res: express.Response): void => {
  const tenantId = (req as any).user?.tenantId;
  if (!tenantId) {
    res.status(401).json({ error: 'Unauthorized: missing tenant identity' });
    return;
  }
  const job = getTenantEmailerJob(tenantId);
  job.stop = true;
  res.json({ success: true });
});

// ── GET /emailer/status
app.get('/emailer/status', requireAuth, requirePermission(['autoEmailer', 'autoEmailer:view', 'autoEmailer:manage']), (req: express.Request, res: express.Response): void => {
  const tenantId = (req as any).user?.tenantId;
  if (!tenantId) {
    res.status(401).json({ error: 'Unauthorized: missing tenant identity' });
    return;
  }
  const job = getTenantEmailerJob(tenantId);
  res.json({
    status: job.running ? 'running' : 'idle',
    logs: job.logs.slice(-200)
  });
});

// Serve frontend SPA from backend port 3000
const frontendDistPath = path.resolve(__dirname, '../../frontend/dist');
if (fs.existsSync(frontendDistPath)) {
  app.use(express.static(frontendDistPath));
  app.get('*', (req, res, next) => {
    if (
      req.path.startsWith('/api') ||
      req.path.startsWith('/auth') ||
      req.path.startsWith('/email') ||
      req.path.startsWith('/download') ||
      req.path.startsWith('/info') ||
      req.path.startsWith('/health') ||
      req.path.startsWith('/ready') ||
      req.path.startsWith('/join') ||
      req.path.startsWith('/socket.io')
    ) {
      return next();
    }
    res.sendFile(path.join(frontendDistPath, 'index.html'));
  });
}

async function startServer() {
  try {
    // 1. Initialize DB and await schema readiness
    console.log('[Octal Backend] Bootstrapping database engine...');
    await dbAdapter.init();

    // Verify schema readiness (ensure users table is queryable)
    let schemaReady = false;
    for (let i = 0; i < 50; i++) {
      try {
        await db.queryOne('SELECT 1 FROM users LIMIT 1');
        schemaReady = true;
        break;
      } catch {
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
    }
    if (!schemaReady) {
      throw new Error('[Octal Backend] Database schema initialization timed out.');
    }
    console.log('[Octal Backend] Database schema ready.');

    // 2. Ensure default admin exists before accepting traffic
    try {
      await ensureDefaultAdmin();
      console.log('[Octal Backend] Default admin verification complete.');
    } catch (err) {
      console.error('[Bootstrap Admin Error]:', err);
      throw err;
    }

    // 3. Initialize background services
    tunnelManager.attachSocketIO(io);
    tunnelManager.init(PORT);
    apkWatcher.init(io, db);

    // 4. Start HTTP listener
    if (process.env.NODE_ENV !== 'test' && !process.env.SKIP_LISTEN) {
      httpServer.listen(PORT, '0.0.0.0', () => {
        console.log(`[Octal Backend] Server running on http://0.0.0.0:${PORT}`);
        console.log(`[Local IP Address] Detected: http://${getLocalIP()}:${PORT}`);
        console.log(`[Phone must use this URL] http://${getLocalIP()}:${PORT}`);
        console.log(`[QR will auto-encode this URL in the pairing link]`);
      });
    }
  } catch (err) {
    console.error('[Startup Fatal]:', err);
    process.exit(1);
  }
}

startServer();
