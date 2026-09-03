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
  getLeads,
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
  ALL_BUSINESS_MODULES,
  registerOrUpdateDevice,
  getDevicesForUser,
  getDeviceById,
  revokeDevice,
  updateDeviceStatus,
  DeviceRecord,
  db
} from './databaseManager';

import {
  reclaimOrCreateSession,
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
  Session
} from './sessionManager';

import {
  ensureDefaultAdmin,
  login,
  logout,
  validateToken,
  changePassword,
  registerPublicUser,
  handleGoogleAuthWithIntent,
  updateUserRole,
  requirePlatformAdmin,
  requireTenantAdmin,
  requireModule,
  signupTenant
} from './authManager';

import {
  runGoogleMapsScraper,
  getScraperStatus,
  stopScraperJob,
  listScraperOutputFiles,
  importScraperFileToCampaign
} from './googleMapsScraperService';

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
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
  const user = await validateToken(token);
  if (!user) {
    res.status(401).json({ error: 'Unauthorized. Please log in.' });
    return;
  }
  (req as any).user = user;
  next();
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
const SCRAPER_PATHS = [
  'C:\\Users\\ice\\.gemini\\antigravity\\scratch\\MY_PROJECTS\\Lead_And_Data_Scrapers\\google-maps-scraper-pro\\output',
  'C:\\Users\\ice\\.gemini\\antigravity\\scratch\\MY_PROJECTS\\Lead_And_Data_Scrapers\\google-maps-scraper-pro',
  'C:\\Users\\ice\\.gemini\\antigravity\\scratch\\MY_PROJECTS\\Lead_And_Data_Scrapers',
  path.resolve(__dirname, '../../../../Lead_And_Data_Scrapers/google-maps-scraper-pro/output'),
  path.resolve(__dirname, '../../../../Lead_And_Data_Scrapers/google-maps-scraper-pro'),
  path.resolve(__dirname, '../../../Lead_And_Data_Scrapers/google-maps-scraper-pro')
];

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
const oauthStates = new Map<string, { clientOrigin: string; intent: string; createdAt: number }>();

// GET /auth/config & GET /api/auth/config — Public client configuration
app.get(['/auth/config', '/api/auth/config'], (_req, res) => {
  const clientId = process.env.GOOGLE_CLIENT_ID || '276074980527-6d3r4q4e013ts65tpfq7d8971k6p99ct.apps.googleusercontent.com';
  res.json({
    googleClientId: clientId,
    captchaSiteKey: null,
    captchaEnabled: false
  });
});

// POST /auth/google/initiate — Returns direct Google OAuth URL
app.post(['/auth/google/initiate', '/api/auth/google/initiate'], (req, res) => {
  const { intent = 'signin' } = req.body || {};
  const clientOrigin = req.headers.referer ? new URL(req.headers.referer).origin : (req.headers.origin || `http://${req.headers.host || 'localhost'}`);
  const clientId = process.env.GOOGLE_CLIENT_ID || '276074980527-6d3r4q4e013ts65tpfq7d8971k6p99ct.apps.googleusercontent.com';
  
  const proto = (req.headers['x-forwarded-proto'] as string) || req.protocol || 'http';
  const host = (req.headers['x-forwarded-host'] as string) || req.headers.host || `localhost:${PORT}`;
  const redirectUri = process.env.GOOGLE_REDIRECT_URI || `${proto}://${host}/auth/google/callback`;
  const state = crypto.randomBytes(24).toString('hex');

  oauthStates.set(state, {
    clientOrigin,
    intent,
    createdAt: Date.now()
  });

  const scope = encodeURIComponent('openid email profile');
  const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${encodeURIComponent(clientId)}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&scope=${scope}&state=${state}&prompt=select_account`;

  res.json({ success: true, authUrl });
});

// GET /auth/google & GET /api/auth/google — Initiates OAuth Redirect
app.get(['/auth/google', '/api/auth/google'], (req, res) => {
  const clientOrigin = req.headers.referer ? new URL(req.headers.referer).origin : `http://${req.headers.host || 'localhost'}`;
  const clientId = process.env.GOOGLE_CLIENT_ID || '276074980527-6d3r4q4e013ts65tpfq7d8971k6p99ct.apps.googleusercontent.com';
  
  const proto = (req.headers['x-forwarded-proto'] as string) || req.protocol || 'http';
  const host = (req.headers['x-forwarded-host'] as string) || req.headers.host || `localhost:${PORT}`;
  const redirectUri = process.env.GOOGLE_REDIRECT_URI || `${proto}://${host}/auth/google/callback`;
  const intent = (req.query.intent as string) || 'signin';
  const state = crypto.randomBytes(24).toString('hex');

  oauthStates.set(state, {
    clientOrigin,
    intent,
    createdAt: Date.now()
  });

  const scope = encodeURIComponent('openid email profile');
  const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${encodeURIComponent(clientId)}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&scope=${scope}&state=${state}&prompt=select_account`;

  console.log(`[OAuth] Redirecting user to Google OAuth consent screen (intent: ${intent})`);
  res.redirect(authUrl);
});

// GET /auth/google/callback & GET /api/auth/google/callback — Handles OAuth Code Exchange
app.get(['/auth/google/callback', '/api/auth/google/callback'], async (req, res) => {
  const fallbackOrigin = 'http://localhost:5173';
  let clientOrigin = fallbackOrigin;

  try {
    const { code, state, error } = req.query as { code?: string; state?: string; error?: string };

    let authIntent: 'signin' | 'signup' = 'signin';
    if (state && oauthStates.has(state)) {
      const stored = oauthStates.get(state)!;
      clientOrigin = stored.clientOrigin;
      authIntent = (stored as any).intent || 'signin';
      oauthStates.delete(state);
    }

    if (error || !code) {
      res.redirect(`${clientOrigin}/?auth_error=${encodeURIComponent(error || 'Google authorization cancelled')}`);
      return;
    }

    const clientId = process.env.GOOGLE_CLIENT_ID || '276074980527-6d3r4q4e013ts65tpfq7d8971k6p99ct.apps.googleusercontent.com';
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET || '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';
    const redirectUri = process.env.GOOGLE_REDIRECT_URI || `http://localhost:${PORT}/auth/google/callback`;

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

    let email = '';
    let name = '';
    let picture = '';
    let googleId = '';

    if (tokenData.id_token) {
      const parts = tokenData.id_token.split('.');
      if (parts.length >= 2) {
        const payloadJson = Buffer.from(parts[1].replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf-8');
        const payload = JSON.parse(payloadJson);
        email = payload.email || '';
        name = payload.name || '';
        picture = payload.picture || '';
        googleId = payload.sub || '';
      }
    }

    if (!email && tokenData.access_token) {
      const userInfoRes = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
        headers: { Authorization: `Bearer ${tokenData.access_token}` }
      });
      const userInfo = await userInfoRes.json() as any;
      email = userInfo.email || '';
      name = userInfo.name || '';
      picture = userInfo.picture || '';
      googleId = userInfo.id || '';
    }

    if (!email) {
      throw new Error('Could not retrieve verified email from Google.');
    }

    const result = await handleGoogleAuthWithIntent({
      email,
      name,
      googleId,
      picture
    }, authIntent);

    res.redirect(`${clientOrigin}/?token=${encodeURIComponent(result.token)}&username=${encodeURIComponent(result.user.username)}&displayName=${encodeURIComponent((result.user as any).displayName || result.user.username)}&user=${encodeURIComponent(result.user.username)}&isNewUser=${result.isNewUser}`);
  } catch (err: any) {
    console.error('[Google OAuth Callback Error]:', err);
    const code = err.code || 'GOOGLE_AUTH_FAILED';
    const emailParam = err.email ? `&email=${encodeURIComponent(err.email)}` : '';
    res.redirect(`${clientOrigin}/?auth_error=${encodeURIComponent(code)}&message=${encodeURIComponent(err.message || 'Google authentication failed.')}${emailParam}`);
  }
});

// POST /auth/google/verify & /api/auth/google/verify — Google One-Tap / Pop-up verification with intent
app.post(['/auth/google/verify', '/api/auth/google/verify'], async (req, res) => {
  const { credential, intent = 'signin' } = req.body as {
    credential?: string;
    intent?: 'signin' | 'signup';
    captchaToken?: string;
  };

  if (!credential || typeof credential !== 'string') {
    res.status(400).json({ error: 'Google credential token is required.' });
    return;
  }

  let email = '';
  let name = '';
  let googleId = '';
  let picture = '';

  try {
    const parts = credential.split('.');
    if (parts.length >= 2) {
      const payloadBase64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
      const payloadJson = Buffer.from(payloadBase64, 'base64').toString('utf-8');
      const payload = JSON.parse(payloadJson);
      if (payload.email) email = payload.email;
      if (payload.name) name = payload.name;
      if (payload.sub) googleId = payload.sub;
      if (payload.picture) picture = payload.picture;
    }
  } catch (e) {
    console.warn('[Google OAuth Verify] Failed to decode Google JWT credential:', e);
  }

  if (!email) {
    res.status(400).json({ error: 'Could not extract valid email from Google credential token.' });
    return;
  }

  try {
    const result = await handleGoogleAuthWithIntent({
      email,
      name,
      googleId,
      picture
    }, intent);

    res.json({
      success: true,
      token: result.token,
      username: result.user.username,
      role: result.user.role,
      user: result.user,
      isNewUser: result.isNewUser
    });
  } catch (err: any) {
    if (err.code === 'ACCOUNT_NOT_FOUND' || err.code === 'GOOGLE_ACCOUNT_NOT_FOUND' || 
        err.code === 'ACCOUNT_EXISTS' || err.code === 'GOOGLE_ACCOUNT_ALREADY_EXISTS') {
      res.status(400).json({ code: err.code, error: err.message, email: err.email });
      return;
    }
    res.status(400).json({ code: err.code || 'GOOGLE_AUTH_FAILED', error: err.message || 'Google authentication failed.' });
  }
});

// POST /auth/google — Google OAuth 2.0 Sign In & Sign Up (One-Tap & Direct)
app.post(['/auth/google', '/api/auth/google'], async (req, res) => {
  const { credential, email, name, googleId, picture, intent = 'signin' } = req.body as {
    credential?: string;
    email?: string;
    name?: string;
    googleId?: string;
    picture?: string;
    intent?: 'signin' | 'signup';
  };

  let targetEmail = email || '';
  let targetName = name || '';
  let targetGoogleId = googleId || '';
  let targetPicture = picture || '';

  // If Google Identity Services JWT credential string is provided, decode payload
  if (credential && typeof credential === 'string') {
    try {
      const parts = credential.split('.');
      if (parts.length >= 2) {
        const payloadBase64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
        const payloadJson = Buffer.from(payloadBase64, 'base64').toString('utf-8');
        const payload = JSON.parse(payloadJson);
        if (payload.email) targetEmail = payload.email;
        if (payload.name) targetName = payload.name;
        if (payload.sub) targetGoogleId = payload.sub;
        if (payload.picture) targetPicture = payload.picture;
      }
    } catch (e) {
      console.warn('[Google OAuth] Failed to decode Google JWT credential token:', e);
    }
  }

  if (!targetEmail) {
    res.status(400).json({ error: 'Valid Google email account is required.' });
    return;
  }

  try {
    const result = await handleGoogleAuthWithIntent({
      email: targetEmail,
      name: targetName,
      googleId: targetGoogleId,
      picture: targetPicture
    }, intent);

    res.json({
      success: true,
      token: result.token,
      username: result.user.username,
      role: result.user.role,
      user: result.user,
      isNewUser: result.isNewUser
    });
  } catch (err: any) {
    if (err.code === 'ACCOUNT_NOT_FOUND' || err.code === 'GOOGLE_ACCOUNT_NOT_FOUND' || 
        err.code === 'ACCOUNT_EXISTS' || err.code === 'GOOGLE_ACCOUNT_ALREADY_EXISTS') {
      res.status(400).json({ code: err.code, error: err.message, email: err.email });
      return;
    }
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

  if (user.role === 'platform_admin' || user.role === 'admin') {
    const allPerms: Record<string, boolean> = {};
    for (const m of ALL_BUSINESS_MODULES) {
      allPerms[m] = true;
    }
    res.json({
      success: true,
      permissions: allPerms,
      userRole: user.role
    });
    return;
  }

  const perms = await getUserPermissions(user.id, user.tenantId);
  res.json({
    success: true,
    permissions: perms,
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
      authResult = await handleGoogleAuthWithIntent({
        email: googleAuthData.email || '',
        name: googleAuthData.name || '',
        googleId: googleAuthData.googleId || googleAuthData.sub || '',
        picture: googleAuthData.picture || ''
      }, gIntent);
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
    const tenantSessions = (Array.from(getSessions().values()) as Session[]).filter(s => s.tenantId === tenantId);
    const activeSession = tenantSessions.length > 0 ? tenantSessions[0] : reclaimOrCreateSession('laptop_mobile_host', undefined, tenantId);

    // Automatically pair device
    pairPhone(
      activeSession.token,
      'mobile_http_preauth',
      deviceName || 'Android Client',
      phoneBtAddress || '48:D2:24:D3:5F:AA',
      phoneOsType || 'Android',
      phoneIpAddress || '127.0.0.1',
      activeSession.id
    );

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
      laptopBtAddress: activeSession.laptopBtAddress || '00:11:22:33:44:55',
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

// POST /auth/logout
app.post('/auth/logout', async (req, res) => {
  const authHeader = req.headers['authorization'] || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
  if (token) await logout(token);
  res.json({ success: true });
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
  await writeAuditLog('EMERGENCY_STOP', 'tenant', tenantId, user.username, 'Emergency stop activated');

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
  await writeAuditLog('EMERGENCY_STOP_CLEAR', 'tenant', tenantId, user.username, 'Emergency stop cleared');
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
  res.json(await getActiveCommands());
});

// GET /api/leads/locked — list all currently locked leads
app.get('/api/leads/locked', requireAuth, async (req, res) => {
  res.json(await getLockedLeads());
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
app.post('/api/devices/:id/revoke', requireAuth, (req, res) => {
  try {
    const user = (req as any).user;
    const deviceId = req.params.id;
    const isAdmin = user.role === 'platform_admin' || user.role === 'admin';
    const success = revokeDevice(deviceId, user.id, user.tenantId, isAdmin);
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

// GET /api/audit-logs — view system audit logs
app.get('/api/audit-logs', requireAuth, async (req, res) => {
  const user = (req as any).user;
  const isPlatform = user.role === 'platform_admin' || user.role === 'master_admin';
  const logs = isPlatform
    ? await db.queryAll(`SELECT * FROM audit_logs ORDER BY timestamp DESC LIMIT 200`)
    : await db.queryAll(`SELECT * FROM audit_logs WHERE "tenantId" = $1 ORDER BY timestamp DESC LIMIT 200`, [user.tenantId]);
  res.json(logs);
});

// POST /api/leads/:id/unlock — manually unlock a lead
app.post('/api/leads/:id/unlock', requireAuth, async (req, res) => {
  await releaseLeadLock(req.params.id);
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

// REST: Campaigns (protected)
app.get(['/campaigns', '/api/campaigns'], requireAuth, async (req, res) => {
  const tenantId = (req as any).user?.tenantId;
  if (!tenantId) {
    res.status(401).json({ error: 'Unauthorized: missing tenant identity' });
    return;
  }
  res.json(await getCampaigns(tenantId));
});

// REST: Get leads for a campaign (protected)
app.get(['/campaigns/:id/leads', '/api/campaigns/:id/leads'], requireAuth, async (req, res) => {
  const tenantId = (req as any).user?.tenantId;
  if (!tenantId) {
    res.status(401).json({ error: 'Unauthorized: missing tenant identity' });
    return;
  }
  res.json(await getLeads(req.params.id, tenantId));
});

// REST: Global Leads search & pagination (protected)
app.get(['/leads', '/api/leads'], requireAuth, async (req, res) => {
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
app.patch(['/leads/:id', '/api/leads/:id'], requireAuth, async (req, res) => {
  try {
    const tenantId = (req as any).user?.tenantId;
    if (!tenantId) {
      res.status(401).json({ error: 'Unauthorized: missing tenant identity' });
      return;
    }
    const { status } = req.body;
    if (status) {
      await db.execute(`UPDATE leads SET status = $1 WHERE id = $2 AND "tenantId" = $3`, [status, req.params.id, tenantId]);
      io.to(`tenant_${tenantId}`).emit('leads:updated');
    }
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// REST: CRM Campaign Workspace telemetry & leads (protected)
app.get('/api/crm/campaigns/:id/workspace', requireAuth, async (req, res) => {
  try {
    const tenantId = (req as any).user?.tenantId;
    if (!tenantId) {
      res.status(401).json({ error: 'Unauthorized: missing tenant identity' });
      return;
    }
    const campaignId = req.params.id;

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

// REST: Delete single lead (protected)
app.delete(['/api/leads/:id', '/leads/:id'], requireAuth, async (req, res) => {
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
app.post('/api/leads/purge-fake', requireAuth, async (req, res) => {
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
app.delete(['/campaigns/:id/leads', '/api/campaigns/:id/leads'], requireAuth, async (req, res) => {
  const tenantId = (req as any).user?.tenantId;
  if (!tenantId) {
    res.status(401).json({ error: 'Unauthorized: missing tenant identity' });
    return;
  }
  const count = await clearAllLeadsInCampaign(req.params.id, tenantId);
  io.to(`tenant_${tenantId}`).emit('leads:updated');
  res.json({ success: true, count, message: `Cleared ${count} leads in campaign ${req.params.id}.` });
});

// REST: Call logs history (protected — for dashboard)
app.get(['/logs', '/api/logs'], requireAuth, async (req, res) => {
  const tenantId = (req as any).user?.tenantId;
  if (!tenantId) {
    res.status(401).json({ error: 'Unauthorized: missing tenant identity' });
    return;
  }
  res.json(await getLogs(tenantId));
});

// POST /api/logs/update & /logs/update — Update call disposition (protected)
app.post(['/api/logs/update', '/logs/update'], requireAuth, async (req, res) => {
  const { leadId, outcome, notes } = req.body as { leadId?: string; outcome?: string; notes?: string };
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
    username: user?.username
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

// REST: Scan sibling scraper folders (protected)
app.get('/api/scraper-files', requireAuth, (req, res) => {
  const list: { name: string; path: string; sizeBytes: number; lastModified: string }[] = [];
  
  // 1. Check generated output files from built-in scraper service
  const generatedFiles = listScraperOutputFiles();
  for (const gf of generatedFiles) {
    list.push({
      name: gf.name,
      path: gf.path,
      sizeBytes: gf.size,
      lastModified: gf.mtime.toISOString()
    });
  }

  // 2. Also check external legacy scraper folders
  for (const folder of SCRAPER_PATHS) {
    if (fs.existsSync(folder)) {
      try {
        const files = fs.readdirSync(folder);
        for (const file of files) {
          if ((file.endsWith('.xlsx') || file.endsWith('.xls') || file.endsWith('.csv')) && !list.some(item => item.name === file)) {
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

// REST: Download scraped file
app.get('/api/scraper-files/download/:filename', requireAuth, (req, res) => {
  const filename = path.basename(req.params.filename);
  const candidateDirs = [
    path.resolve(__dirname, '../data/scraper_output'),
    ...SCRAPER_PATHS
  ];

  for (const dir of candidateDirs) {
    const filePath = path.join(dir, filename);
    if (fs.existsSync(filePath)) {
      res.download(filePath, filename);
      return;
    }
  }
  res.status(404).json({ error: 'File not found.' });
});

// REST: Import leads from scraped file (protected)
app.post('/api/scraper-files/import', requireAuth, async (req, res) => {
  try {
    const tenantId = (req as any).user?.tenantId;
    if (!tenantId) {
      res.status(401).json({ error: 'Unauthorized: missing tenant identity' });
      return;
    }
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

    const result = await createCampaign(finalCampaignName, fileName, leads, tenantId);
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
    console.error('Import error:', err);
    res.status(500).json({ error: err.message });
  }
});

// REST: Run Scraper (protected)
app.post('/api/scraper/run', requireAuth, async (req, res) => {
  const currentStatus = getScraperStatus();
  if (currentStatus.status === 'running') {
    res.status(400).json({ error: 'A scraper job is already running.' });
    return;
  }

  const user = (req as any).user;
  const { keyword, location = '', requirePhone = false, requireEmail = false, maxLeads = 50 } = req.body as {
    keyword: string;
    location?: string;
    requirePhone?: boolean;
    requireEmail?: boolean;
    maxLeads?: number | string;
  };

  if (!keyword || !keyword.trim()) {
    res.status(400).json({ error: 'Search keyword is required.' });
    return;
  }

  const parsedLimit = parseInt(String(maxLeads || '50'), 10) || 50;
  const tenantId = user.tenantId;
  if (!tenantId) {
    res.status(401).json({ error: 'Unauthorized: missing tenant identity' });
    return;
  }

  // Run asynchronously so the REST request responds immediately
  runGoogleMapsScraper({
    keyword: keyword.trim(),
    location: location ? location.trim() : '',
    maxLeads: parsedLimit,
    requirePhone: !!requirePhone,
    requireEmail: !!requireEmail,
    tenantId,
    username: user.username || 'admin'
  }).then(result => {
    io.to(`tenant_${tenantId}`).emit('scraper:completed', result);
  }).catch(err => {
    console.error('[Scraper Job Error]:', err);
    io.to(`tenant_${tenantId}`).emit('scraper:failed', { error: err.message });
  });

  res.json({
    success: true,
    message: 'Google Maps Scraper engine started successfully.',
    keyword,
    location,
    targetLimit: parsedLimit
  });
});

// REST: Scraper Status (protected)
app.get('/api/scraper/status', requireAuth, (req, res) => {
  res.json(getScraperStatus());
});

// REST: Stop Scraper (protected)
app.post('/api/scraper/stop', requireAuth, async (req, res) => {
  const stopped = await stopScraperJob();
  if (stopped) {
    res.json({ success: true, message: 'Scraper task stopped.' });
  } else {
    res.status(400).json({ error: 'No active scraper task is running.' });
  }
});

// ─── ADMIN AUTHORITY MASTER CONTROL REST ENDPOINTS ────────────────────────────

// GET /api/admin/overview
app.get('/api/admin/overview', requireAuth, requireAdmin, async (req, res) => {
  const user = (req as any).user;
  const isPlatform = user.role === 'platform_admin' || user.role === 'master_admin';
  const tenantId = user.tenantId;

  const totalUsersRow = isPlatform
    ? await db.queryOne(`SELECT COUNT(*) as c FROM users`)
    : await db.queryOne(`SELECT COUNT(*) as c FROM users WHERE "tenantId" = $1`, [tenantId]);
  const totalCampaignsRow = isPlatform
    ? await db.queryOne(`SELECT COUNT(*) as c FROM campaigns`)
    : await db.queryOne(`SELECT COUNT(*) as c FROM campaigns WHERE "tenantId" = $1`, [tenantId]);
  const totalLeadsRow = isPlatform
    ? await db.queryOne(`SELECT COUNT(*) as c FROM leads`)
    : await db.queryOne(`SELECT COUNT(*) as c FROM leads WHERE "tenantId" = $1`, [tenantId]);
  const totalLogsRow = isPlatform
    ? await db.queryOne(`SELECT COUNT(*) as c FROM call_logs`)
    : await db.queryOne(`SELECT COUNT(*) as c FROM call_logs WHERE "tenantId" = $1`, [tenantId]);

  res.json({
    totalUsers: parseInt(totalUsersRow?.c || '0', 10),
    totalCampaigns: parseInt(totalCampaignsRow?.c || '0', 10),
    totalLeads: parseInt(totalLeadsRow?.c || '0', 10),
    totalLogs: parseInt(totalLogsRow?.c || '0', 10),
    activeScraper: getScraperStatus(),
    systemUptimeSeconds: Math.floor(process.uptime())
  });
});

// GET /api/admin/users
app.get('/api/admin/users', requireAuth, requireAdmin, async (req, res) => {
  const user = (req as any).user;
  const isPlatform = user.role === 'platform_admin' || user.role === 'master_admin';
  const users = isPlatform
    ? await db.queryAll(`SELECT id, username, email, role, "tenantId", "createdAt", "updatedAt" FROM users ORDER BY "createdAt" DESC`)
    : await db.queryAll(`SELECT id, username, email, role, "tenantId", "createdAt", "updatedAt" FROM users WHERE "tenantId" = $1 ORDER BY "createdAt" DESC`, [user.tenantId]);
  res.json(users);
});

// POST /api/admin/users
app.post('/api/admin/users', requireAuth, requireAdmin, async (req, res) => {
  try {
    const caller = (req as any).user;
    const { username, password, email, role } = req.body;
    if (!username || !password) {
      res.status(400).json({ error: 'Username and password required.' });
      return;
    }
    const result = await registerPublicUser({ 
      username, 
      password, 
      email, 
      requestedRole: role,
      tenantId: caller.role === 'platform_admin' ? (req.body.tenantId || caller.tenantId) : caller.tenantId 
    });
    if (role && role !== 'user') {
      await updateUserRole(caller, result.user.id, role);
    }
    res.json({ success: true, user: result.user });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// PUT /api/admin/users/:id/role
app.put('/api/admin/users/:id/role', requireAuth, requireAdmin, async (req, res) => {
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
app.post('/api/admin/users/:id/password', requireAuth, requireAdmin, async (req, res) => {
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
app.delete('/api/admin/users/:id', requireAuth, requireAdmin, async (req, res) => {
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

  const info = await db.execute(`DELETE FROM users WHERE id = $1`, [req.params.id]);
  if (info.rowCount > 0) {
    res.json({ success: true, message: 'User deleted.' });
  } else {
    res.status(404).json({ error: 'User not found.' });
  }
});

// GET /api/admin/settings
app.get('/api/admin/settings', requireAuth, requireAdmin, async (req, res) => {
  const rows = await db.queryAll(`SELECT "settingKey", "settingValue" FROM system_settings`) as any[];
  const map: Record<string, string> = {};
  for (const r of rows) map[r.settingKey] = r.settingValue;
  res.json(map);
});

// POST /api/admin/settings
app.post('/api/admin/settings', requireAuth, requireAdmin, async (req, res) => {
  const { default_free_scraper_limit, max_workers_allowed, scraper_engine_status } = req.body;
  if (default_free_scraper_limit !== undefined) {
    await db.execute(`
      INSERT INTO system_settings (id, category, "settingKey", "settingValue", description, "updatedAt")
      VALUES ($1, 'scraper', 'default_free_scraper_limit', $2, 'Default free leads quota', now())
      ON CONFLICT ("id") DO UPDATE SET "settingValue" = excluded."settingValue", "updatedAt" = now()
    `, ['set_free_lim', String(default_free_scraper_limit)]);
  }
  if (max_workers_allowed !== undefined) {
    await db.execute(`
      INSERT INTO system_settings (id, category, "settingKey", "settingValue", description, "updatedAt")
      VALUES ($1, 'scraper', 'max_workers_allowed', $2, 'Max browser workers', now())
      ON CONFLICT ("id") DO UPDATE SET "settingValue" = excluded."settingValue", "updatedAt" = now()
    `, ['set_workers', String(max_workers_allowed)]);
  }
  if (scraper_engine_status !== undefined) {
    await db.execute(`
      INSERT INTO system_settings (id, category, "settingKey", "settingValue", description, "updatedAt")
      VALUES ($1, 'scraper', 'scraper_engine_status', $2, 'Scraper engine status', now())
      ON CONFLICT ("id") DO UPDATE SET "settingValue" = excluded."settingValue", "updatedAt" = now()
    `, ['set_status', String(scraper_engine_status)]);
  }
  const rows = await db.queryAll(`SELECT "settingKey", "settingValue" FROM system_settings`);
  const map: Record<string, string> = {};
  for (const r of rows) map[r.settingKey] = r.settingValue;
  res.json({ success: true, settings: map });
});

// POST /api/admin/scraper/force-stop
app.post('/api/admin/scraper/force-stop', requireAuth, requireAdmin, async (req, res) => {
  await stopScraperJob();
  res.json({ success: true, message: 'Scraper terminated by admin.' });
});

// POST /api/admin/system/unlock-all-leads
app.post('/api/admin/system/unlock-all-leads', requireAuth, requireAdmin, (req, res) => {
  const user = (req as any).user;
  const count = releaseExpiredLeases(0);
  if (user?.tenantId) {
    io.to(`tenant_${user.tenantId}`).emit('leads:updated');
  } else {
    io.emit('leads:updated');
  }
  res.json({ success: true, count, message: `Unlocked ${count} locked lead(s).` });
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
app.get('/api/logs/export', requireAuth, async (req, res) => {
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

// Socket.IO Handshake Auth Middleware
io.use(async (socket, next) => {
  const token = socket.handshake.auth?.token || (socket.handshake.headers?.authorization ? socket.handshake.headers.authorization.replace('Bearer ', '') : undefined);
  if (token) {
    const user = await validateToken(token);
    if (user) {
      socket.data.user = user;
      socket.data.tenantId = user.tenantId;
    }
  }
  next();
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
      btAddress: device.btAddress || '48:D2:24:D3:5F:AA',
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

    // Auto-pair with waiting laptop session for the same user / tenant
    const allSessions = getSessions();
    for (const s of allSessions.values()) {
      if ((s.userId === user.id || s.tenantId === user.tenantId) && s.laptopSocketId && s.status === 'WAITING') {
        await pairAuthenticatedDevice(
          s.id,
          device.id,
          socket.id,
          device.name,
          device.btAddress || '48:D2:24:D3:5F:AA',
          device.osType || 'Android',
          device.ipAddress || '127.0.0.1',
          user.id,
          user.tenantId
        );

        socket.join(s.id);
        socket.data.sessionId = s.id;

        const effectiveUrl = getPublicBaseUrl({ handshake: socket.handshake });
        socket.emit('bridge:paired', {
          sessionId: s.id,
          token: s.token,
          laptopName: s.laptopName,
          laptopBtAddress: s.laptopBtAddress,
          serverUrl: effectiveUrl
        });

        socket.emit('phone:paired', {
          sessionId: s.id,
          laptopName: s.laptopName,
          laptopBtAddress: s.laptopBtAddress
        });

        io.to(s.id).emit('phone:connected', {
          deviceName: device.name,
          phoneBtAddress: device.btAddress || '48:D2:24:D3:5F:AA',
          phoneOsType: device.osType || 'Android',
          phoneIpAddress: device.ipAddress || '127.0.0.1',
          phoneStatus: 'READY',
          deviceId: device.id
        });

        console.log(`[Auto Pair] Phone ${device.name} auto-paired to laptop session ${s.id} for user ${user.username}`);
        break;
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

    phoneSocket.emit('phone:paired', {
      sessionId: session.id,
      laptopName: session.laptopName,
      laptopBtAddress: session.laptopBtAddress
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

    const session = reclaimOrCreateSession(socket.id, data?.previousSessionId, tenantId);
    if (userId && !session.userId) session.userId = userId;
    socket.join(session.id);
    socket.join(`tenant_${tenantId}`);
    socket.data.sessionId = session.id;
    console.log(`[Socket] Laptop registered: ${session.id} | Tenant: ${tenantId} | User: ${userId || 'anonymous'} | Status: ${session.status}`);

    const effectiveUrl = getPublicBaseUrl({ handshake: socket.handshake });
    const cleanPairingUri = `octaldialer://join?sessionId=${session.id}&token=${session.token}&serverUrl=${encodeURIComponent(effectiveUrl)}&laptop=${encodeURIComponent(session.laptopName || 'Laptop')}&bt=${encodeURIComponent(session.laptopBtAddress || '00:11:22:33:44:55')}`;

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
      // Check if there is an active authenticated phone socket for this user/tenant
      for (const p of authenticatedPhoneSockets.values()) {
        if ((p.userId === userId || p.tenantId === tenantId) && session.status === 'WAITING') {
          const phoneSocket = io.sockets.sockets.get(p.socketId);
          if (phoneSocket) {
            pairAuthenticatedDevice(
              session.id,
              p.deviceId,
              p.socketId,
              p.deviceName,
              p.btAddress,
              p.osType,
              p.ipAddress,
              userId || 'unknown',
              tenantId
            );

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

            phoneSocket.emit('bridge:paired', {
              sessionId: session.id,
              token: session.token,
              laptopName: session.laptopName,
              laptopBtAddress: session.laptopBtAddress,
              serverUrl: effectiveUrl
            });

            phoneSocket.emit('phone:paired', {
              sessionId: session.id,
              laptopName: session.laptopName,
              laptopBtAddress: session.laptopBtAddress
            });

            console.log(`[Auto Pair] Laptop session ${session.id} auto-paired to phone ${p.deviceName} for user ${userId}`);
            break;
          }
        }
      }
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
  }) => {
    let tokenOrSessionId = data.token || data.sessionId || data.authToken || '';
    let targetTenantId = socket.data.tenantId;

    if (!targetTenantId && data.authToken) {
      const u = await validateToken(data.authToken);
      if (u) targetTenantId = u.tenantId;
    }

    const cleanKey = tokenOrSessionId ? tokenOrSessionId.trim() : '';
    const existingSession = getSessionByToken(cleanKey) || (data.sessionId ? getSessionById(data.sessionId) : null) || getSessionById(cleanKey);
    if (existingSession && existingSession.phoneDeviceId != null) {
      console.warn(`[Socket Pairing Warning] Phone ${socket.id} attempted phone:join on authenticated session ${existingSession.id}`);
      socket.emit('error', { 
        code: 'ALREADY_AUTHENTICATED_SESSION', 
        message: 'This session is paired with an authenticated device and cannot be joined via anonymous phone:join.' 
      });
      return;
    }

    let session = await pairPhone(
      tokenOrSessionId, 
      socket.id, 
      data.deviceName || 'Mobile Client', 
      data.phoneBtAddress || '48:D2:24:D3:5F:AA', 
      data.phoneOsType || 'Android', 
      data.phoneIpAddress || '127.0.0.1',
      data.sessionId
    );

    if (!session && tokenOrSessionId) {
      const user = await validateToken(tokenOrSessionId);
      if (user) {
        targetTenantId = user.tenantId;
        const tenantSessions = Array.from(getSessions().values()).filter((s: any) => s.tenantId === user.tenantId);
        const active = tenantSessions.length > 0 ? tenantSessions[0] : reclaimOrCreateSession('laptop_mobile_host', undefined, user.tenantId);
        session = await pairPhone(
          active.token,
          socket.id,
          data.deviceName || 'Mobile Client',
          data.phoneBtAddress || '48:D2:24:D3:5F:AA',
          data.phoneOsType || 'Android',
          data.phoneIpAddress || '127.0.0.1',
          active.id
        );
      }
    }

    if (!session) {
      console.warn(`[Socket Pairing Warning] Phone failed to pair with key: ${tokenOrSessionId}`);
      socket.emit('error', { code: 'INVALID_TOKEN', message: 'Token is invalid or expired.' });
      return;
    }

    socket.data.tenantId = session.tenantId;
    socket.data.sessionId = session.id;

    socket.join(session.id);
    console.log(`[Socket Success] Phone paired to session: ${session.id} | Tenant: ${session.tenantId} | Device: ${data.deviceName || 'Android'}`);

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
      phoneIpAddress: data.phoneIpAddress || '127.0.0.1',
      phoneStatus: session.phoneStatus || 'READY'
    };

    // Broadcast to the session room only
    io.to(session.id).emit('phone:connected', connectedPayload);
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

  socket.on('dial:lead', async ({ sessionId, phone, name, leadId, campaignId, timeout }: {
    sessionId: string;
    phone: string;
    name: string;
    leadId?: string;
    campaignId?: string;
    timeout: number;
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
    const check = await checkCallAllowed({ sessionId, phone, leadId, campaignId, tenantId });

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

    setSessionStatus(sessionId, 'CALLING');
    const dialPayload = { phone, name, leadId: leadId || '', timeout, commandId: check.commandId };
    
    try {
      phoneSocket.emit('phone:dial', dialPayload);
      socket.emit('dial:dispatched', { commandId: check.commandId, leadId, phone, name });
      console.log(`[SafetyController] ✅ DIAL SENT TO PHONE SOCKET ${session.phoneSocketId} | ${name} (${phone}) | Session: ${sessionId} | Cmd: ${check.commandId}`);
    } catch (err: any) {
      if (leadId) await releaseLeadLock(leadId, sessionId);
      socket.emit('error', { code: 'DISPATCH_ERROR', message: 'Failed to dispatch call to phone socket.' });
    }
  });

  // Emergency stop from socket
  socket.on('campaign:emergency_stop', ({ sessionId, campaignId }: { sessionId?: string; campaignId?: string } = {}) => {
    const session = getSessionById(sessionId || socket.data.sessionId || '');
    if (session?.phoneSocketId) {
      const phoneSocket = io.sockets.sockets.get(session.phoneSocketId);
      if (phoneSocket) phoneSocket.emit('phone:hangup');
    }

    const tenantId = socket.data.tenantId || session?.tenantId;
    if (!tenantId) {
      socket.emit('error', { code: 'UNAUTHORIZED', message: 'Missing tenant identity for emergency stop.' });
      return;
    }

    // Verify session belongs to tenant if provided
    if (session && session.tenantId && session.tenantId !== tenantId) {
      console.warn(`[SafetyController Security] Rejected emergency stop from cross-tenant session`);
      socket.emit('error', { code: 'UNAUTHORIZED', message: 'Unauthorized session.' });
      return;
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
    if (user && user.role === 'agent') {
      console.warn(`[SafetyController Security] Agent ${user.id} attempted to clear emergency stop without admin/supervisor rights.`);
      socket.emit('error', { code: 'FORBIDDEN', message: 'Only administrators or supervisors can clear emergency stops.' });
      return;
    }

    clearEmergencyStop(tenantId, campaignId);
    io.to(`tenant_${tenantId}`).emit('campaign:emergency_cleared', { clearedBy: 'dashboard-socket', campaignId });
  });

  socket.on('dial:hangup', ({ sessionId }: { sessionId: string }) => {
    const session = getSessionById(sessionId);
    if (!session) return;
    if (session.laptopSocketId !== socket.id) {
      console.warn(`[Socket] Rejected hangup from unauthorized socket ${socket.id} for session ${sessionId}`);
      return;
    }
    if (session.phoneSocketId) {
      const phoneSocket = io.sockets.sockets.get(session.phoneSocketId);
      if (phoneSocket) {
        phoneSocket.emit('phone:hangup');
        phoneSocket.emit('phone:hangup-call');
      }
    }
    console.log(`[Socket] Hangup command sent to phone in session ${sessionId}`);
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
      const payload = {
        phone: phone || 'Unknown Caller',
        deviceId: session.phoneDeviceId || deviceId,
        deviceName: session.phoneDeviceName || 'Connected Phone',
        timestamp: new Date().toISOString(),
        direction: 'INCOMING'
      };
      io.to(session.id).emit('call:incoming', payload);
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

  socket.on('call:picked-up', ({ sessionId }: { sessionId: string }) => {
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

    setSessionStatus(session.id, 'CALLING');
    socket.to(session.id).emit('call:started');
    console.log(`[Socket] Verified Phone ${socket.id} entered active call state in session ${session.id}`);
  });

  socket.on('call:ended', async ({ sessionId, leadId, phone, name, reason, duration, commandId }: {
    sessionId: string;
    leadId?: string;
    phone?: string;
    name?: string;
    reason: string;
    duration: number;
    commandId?: string;
  }) => {
    const session = getSessionById(sessionId || socket.data.sessionId || '');
    if (!session) {
      console.warn(`[Socket] Rejected call:ended: Session ${sessionId} not found`);
      return;
    }

    // Strict ownership validation: Only the authoritative paired phone socket may emit call:ended
    if (session.phoneSocketId !== socket.id) {
      console.warn(`[Socket Security] Rejected call:ended from non-authoritative socket ${socket.id} (owner: ${session.phoneSocketId})`);
      return;
    }

    const tenantId = session.tenantId;
    if (!tenantId) {
      console.warn(`[Socket] Session ${session.id} missing tenantId on call:ended`);
      return;
    }

    if (socket.data.tenantId && socket.data.tenantId !== tenantId) {
      console.warn(`[Socket Security] Rejected call:ended: Tenant mismatch`);
      return;
    }

    // Idempotency guard: Prevent processing duplicate call:ended for the exact same call
    const termKey = `${session.id}_${leadId || phone || ''}_${commandId || ''}`;
    if (processedCallEndings.has(termKey)) {
      console.log(`[Socket Idempotency] Ignoring duplicate call:ended for key: ${termKey}`);
      return;
    }
    processedCallEndings.add(termKey);
    if (processedCallEndings.size > 2000) {
      const first = processedCallEndings.values().next().value;
      if (first) processedCallEndings.delete(first);
    }

    setSessionStatus(session.id, 'PAIRED');
    if (commandId) {
      await expireCommand(commandId);
    }
    if (leadId) {
      await releaseLeadLock(leadId, session.id);
      await createLog(leadId, reason, duration, tenantId);
      await updateLeadStatus(leadId, 'COMPLETED', reason, duration, tenantId);
    } else if (phone) {
      await createManualLog(phone, name || 'Manual Quick Dial', reason, duration, tenantId);
    }

    // Include leadId and commandId in call:finished broadcast so web knows exact completed lead
    socket.to(session.id).emit('call:finished', { reason, duration, leadId, commandId });
    io.to(`tenant_${tenantId}`).emit('leads:updated');
    console.log(`[Socket] Call finished in session ${session.id} | Lead: ${leadId || phone} | Reason: ${reason} | Duration: ${duration}s`);
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

    // Release any lead locks reserved by this session
    await unlockLeadsForSession(session.id);

    if (session.laptopSocketId === socket.id) {
      // Do NOT send session:ended to phone — laptop socket reclaims session instantly on reconnect!
      console.log(`[Socket Disconnect] Laptop socket ${socket.id} disconnected from session ${session.id} (reclaimable)`);
      handleLaptopDisconnect(socket.id);
    } else if (session.phoneSocketId === socket.id) {
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

// ── GET /email/leads
app.get('/email/leads', requireAuth, async (req: express.Request, res: express.Response): Promise<void> => {
  const tenantId = (req as any).user?.tenantId;
  if (!tenantId) {
    res.status(401).json({ error: 'Unauthorized: missing tenant identity' });
    return;
  }
  const rows = await db.queryAll('SELECT * FROM email_leads WHERE "tenantId" = $1 ORDER BY "createdAt" ASC', [tenantId]);
  res.json(rows);
});

// ── POST /email/upload
app.post('/email/upload', requireAuth, async (req: express.Request, res: express.Response): Promise<void> => {
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
app.delete('/email/leads', requireAuth, async (req: express.Request, res: express.Response): Promise<void> => {
  const tenantId = (req as any).user?.tenantId;
  if (!tenantId) {
    res.status(401).json({ error: 'Unauthorized: missing tenant identity' });
    return;
  }
  await db.execute('DELETE FROM email_leads WHERE "tenantId" = $1', [tenantId]);
  res.json({ success: true });
});

// ── GET /email/accounts
app.get('/email/accounts', requireAuth, async (req: express.Request, res: express.Response): Promise<void> => {
  const tenantId = (req as any).user?.tenantId;
  if (!tenantId) {
    res.status(401).json({ error: 'Unauthorized: missing tenant identity' });
    return;
  }
  const rows = await db.queryAll('SELECT id, email, "senderName", "smtpHost", "smtpPort", status FROM email_accounts WHERE "tenantId" = $1', [tenantId]);
  res.json(rows);
});

// ── POST /email/accounts
app.post('/email/accounts', requireAuth, async (req: express.Request, res: express.Response): Promise<void> => {
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
app.get('/email/templates', requireAuth, async (req: express.Request, res: express.Response): Promise<void> => {
  const tenantId = (req as any).user?.tenantId;
  if (!tenantId) {
    res.status(401).json({ error: 'Unauthorized: missing tenant identity' });
    return;
  }
  const rows = await db.queryAll('SELECT * FROM email_templates WHERE ("tenantId" = $1 OR "systemTemplate" = 1) ORDER BY stage ASC, id ASC', [tenantId]);
  res.json(rows);
});

// ── POST /email/templates
app.post('/email/templates', requireAuth, async (req: express.Request, res: express.Response): Promise<void> => {
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
app.post('/email/start', requireAuth, (req: express.Request, res: express.Response): void => {
  const tenantId = (req as any).user?.tenantId;
  if (!tenantId) {
    res.status(401).json({ error: 'Unauthorized: missing tenant identity' });
    return;
  }
  if (emailerJob.running) {
    res.json({ success: true, message: 'Campaign already running.' });
    return;
  }
  const { limit = 300 } = req.body as { limit?: number };

  emailerJob.running = true;
  emailerJob.stop = false;

  (async () => {
    try {
      const { default: nodemailer } = await import('nodemailer');
      const leads = await db.queryAll(`SELECT * FROM email_leads WHERE "tenantId" = $1 AND status IN ('pending','sent')`, [tenantId]) as any[];
      const accounts = await db.queryAll(`SELECT * FROM email_accounts WHERE "tenantId" = $1 AND status = 'active'`, [tenantId]) as any[];
      const templates = await db.queryAll(`SELECT * FROM email_templates WHERE ("tenantId" = $1 OR "systemTemplate" = 1) ORDER BY stage ASC, id ASC`, [tenantId]) as any[];

      emailLog(`=== Campaign Started [Tenant: ${tenantId}]: ${leads.length} eligible leads, ${accounts.length} accounts, ${templates.length} templates ===`);

      if (!accounts.length) { emailLog('❌ No active SMTP accounts for tenant!'); return; }
      if (!templates.length) { emailLog('❌ No email templates for tenant!'); return; }

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

      for (const acc of accounts) {
        if (leadIdx >= eligible.length || emailerJob.stop) break;

        emailLog(`Using sender: ${acc.email}`);
        const transporter = nodemailer.createTransport({
          host: acc.smtpHost,
          port: acc.smtpPort,
          secure: false,
          auth: { user: acc.email, pass: acc.password },
          tls: { rejectUnauthorized: false }
        });

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
            await db.execute('UPDATE email_leads SET status = $1, stage = $2, "lastSentAt" = $3 WHERE id = $4 AND "tenantId" = $5', [newStatus, newStage, new Date().toISOString(), lead.id, tenantId]);
            emailLog(`✅ Sent to ${lead.email} (Stage ${lead.stage})`);
            sent++;
            const delay = 30000 + Math.random() * 30000;
            await new Promise(r => setTimeout(r, delay));
          } catch (err: unknown) {
            emailLog(`❌ Failed: ${lead.email} — ${(err as Error).message}`);
            if ((err as Error).message?.includes('Authentication') || (err as Error).message?.includes('Username and Password')) {
              await db.execute('UPDATE email_accounts SET status = \'disabled\' WHERE id = $1 AND "tenantId" = $2', [acc.id, tenantId]);
              emailLog(`⚠️ Disabled account ${acc.email} (auth failure)`);
              break;
            }
          }
        }
        transporter.close();
      }

      emailLog(`=== Campaign Completed [Tenant: ${tenantId}] ===`);
    } catch (err: unknown) {
      emailLog(`❌ Campaign error: ${(err as Error).message}`);
    } finally {
      emailerJob.running = false;
    }
  })();

  res.json({ success: true, message: 'Campaign started in background.' });
});

// ── POST /emailer/stop
app.post('/emailer/stop', requireAuth, (_req: express.Request, res: express.Response): void => {
  emailerJob.stop = true;
  res.json({ success: true });
});

// ── GET /emailer/status
app.get('/emailer/status', requireAuth, (_req: express.Request, res: express.Response): void => {
  res.json({
    status: emailerJob.running ? 'running' : 'idle',
    logs: emailerJob.logs.slice(-200)
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

if (process.env.NODE_ENV !== 'test' && !process.env.SKIP_LISTEN) {
  httpServer.listen(PORT, '0.0.0.0', () => {
    console.log(`[Octal Backend] Server running on http://0.0.0.0:${PORT}`);
    console.log(`[Local IP Address] Detected: http://${getLocalIP()}:${PORT}`);
    console.log(`[Phone must use this URL] http://${getLocalIP()}:${PORT}`);
    console.log(`[QR will auto-encode this URL in the pairing link]`);

    // Initialize Cloudflare Tunnel, APK Watcher, and Default Admin
    tunnelManager.attachSocketIO(io);
    tunnelManager.init(PORT);
    apkWatcher.init(io, db);
    ensureDefaultAdmin().catch(err => console.error('[Bootstrap Admin Error]:', err));
  });
}
