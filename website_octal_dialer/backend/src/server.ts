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

dotenv.config({ path: path.join(__dirname, '../.env') });

process.on('uncaughtException', (err) => {
  console.error('[UNCAUGHT EXCEPTION]:', err);
});

process.on('unhandledRejection', (reason) => {
  console.error('[UNHANDLED REJECTION]:', reason);
});

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
  releaseExpiredLeases,
  backupDatabase,
  createFollowUp,
  getFollowUps,
  updateFollowUpStatus,
  recordLeadActivity,
  getLeadActivities,
  hasUserModulePermission,
  db
} from './databaseManager';

import {
  reclaimOrCreateSession,
  getSessionById,
  pairPhone,
  revokePhone,
  setSessionStatus,
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
  findOrCreateGoogleUser,
  updateUserRole,
  requirePlatformAdmin,
  requireTenantAdmin,
  requireModule,
  signupTenant
} from './authManager';

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

dotenv.config();

const app = express();

const ALLOWED_ORIGINS = [
  'http://localhost:3000',
  'http://127.0.0.1:3000',
  'http://localhost:5173',
  'http://127.0.0.1:5173'
];

const checkOrigin = (origin: string | undefined, callback: (err: Error | null, allow?: boolean) => void) => {
  if (!origin || ALLOWED_ORIGINS.indexOf(origin) !== -1 || origin.startsWith('http://192.168.') || origin.startsWith('http://172.') || origin.startsWith('http://10.')) {
    callback(null, true);
  } else {
    callback(new Error('Not allowed by CORS'));
  }
};

app.use(cors({
  origin: checkOrigin,
  credentials: true
}));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

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

function requireAdmin(req: express.Request, res: express.Response, next: express.NextFunction): void {
  const user = (req as any).user;
  if (!user || user.role !== 'admin') {
    res.status(403).json({ error: 'Forbidden: Administrator privileges required.' });
    return;
  }
  next();
}

const httpServer = createServer(app);
const io = new SocketIOServer(httpServer, {
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

// ─── TASK 1: Socket.IO Authentication & Tenant Isolation Middleware ──────────
io.use((socket, next) => {
  const authObj = socket.handshake.auth || {};
  const headers = socket.handshake.headers || {};
  const authHeader = authObj.token || headers.authorization || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : authHeader;

  if (token) {
    const user = validateToken(token);
    if (user) {
      socket.data.user = user;
      socket.data.tenantId = user.id;
      return next();
    } else {
      return next(new Error('Authentication failed: Invalid token'));
    }
  }

  // Sockets connecting without JWT (e.g., phone before pairing) are allowed initial connection,
  // but will be tenant-scoped during phone:join via the session's tenantId.
  socket.data.user = null;
  socket.data.tenantId = null;
  next();
});

const PORT = 3000;
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
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name] || []) {
      if (iface.family === 'IPv4' && !iface.internal) {
        return iface.address;
      }
    }
  }
  return 'localhost';
}

// ─── Auth REST Endpoints (no requireAuth — public) ──────────────────────────

// POST /auth/login
app.post('/auth/login', (req, res) => {
  const { username, password } = req.body as { username: string; password: string };
  if (!username || !password) {
    res.status(400).json({ error: 'Username and password required.' });
    return;
  }
  const result = login(username, password);
  if (!result) {
    res.status(401).json({ error: 'Invalid username or password, or account suspended.' });
    return;
  }
  res.json({ token: result.token, username: result.user.username, role: result.user.role, user: result.user });
});

// POST /auth/register — Public Sign Up
app.post('/auth/register', (req, res) => {
  const { username, password, email } = req.body as { username: string; password: string; email?: string };
  if (!username || !password) {
    res.status(400).json({ error: 'Username and password are required.' });
    return;
  }
  if (password.length < 6) {
    res.status(400).json({ error: 'Password must be at least 6 characters.' });
    return;
  }

  try {
    const result = registerPublicUser(username, password, email);
    res.status(201).json({
      success: true,
      token: result.token,
      username: result.user.username,
      role: result.user.role,
      user: result.user
    });
  } catch (err: any) {
    res.status(400).json({ error: err.message || 'Registration failed.' });
  }
});

// GET /auth/verify & GET /api/auth/verify — Verifies current JWT auth token
app.get(['/auth/verify', '/api/auth/verify'], (req, res) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({ error: 'No token provided.' });
    return;
  }
  const token = authHeader.split(' ')[1];
  const user = validateToken(token);
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
  const clientOrigin = req.headers.referer ? new URL(req.headers.referer).origin : 'http://localhost:5173';
  const clientId = process.env.GOOGLE_CLIENT_ID || '276074980527-6d3r4q4e013ts65tpfq7d8971k6p99ct.apps.googleusercontent.com';
  const redirectUri = process.env.GOOGLE_REDIRECT_URI || `http://localhost:${PORT}/auth/google/callback`;
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
  const clientOrigin = req.headers.referer ? new URL(req.headers.referer).origin : 'http://localhost:5173';
  const clientId = process.env.GOOGLE_CLIENT_ID || '276074980527-6d3r4q4e013ts65tpfq7d8971k6p99ct.apps.googleusercontent.com';
  const redirectUri = process.env.GOOGLE_REDIRECT_URI || `http://localhost:${PORT}/auth/google/callback`;
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

    if (state && oauthStates.has(state)) {
      const stored = oauthStates.get(state)!;
      clientOrigin = stored.clientOrigin;
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

    const result = findOrCreateGoogleUser({
      email,
      name,
      googleId,
      picture
    });

    res.redirect(`${clientOrigin}/?token=${encodeURIComponent(result.token)}&username=${encodeURIComponent(result.user.username)}&user=${encodeURIComponent(result.user.username)}`);
  } catch (err: any) {
    console.error('[Google OAuth Callback Error]:', err);
    res.redirect(`${clientOrigin}/?auth_error=${encodeURIComponent(err.message || 'Google authentication failed.')}`);
  }
});

// POST /auth/google — Google OAuth 2.0 Sign In & Sign Up (One-Tap & Direct)
app.post('/auth/google', (req, res) => {
  const { credential, email, name, googleId, picture } = req.body as {
    credential?: string;
    email?: string;
    name?: string;
    googleId?: string;
    picture?: string;
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
    const result = findOrCreateGoogleUser({
      email: targetEmail,
      name: targetName,
      googleId: targetGoogleId,
      picture: targetPicture
    });

    res.json({
      success: true,
      token: result.token,
      username: result.user.username,
      role: result.user.role,
      user: result.user,
      isNewUser: result.isNewUser
    });
  } catch (err: any) {
    res.status(400).json({ error: err.message || 'Google authentication failed.' });
  }
});

// POST /api/mobile/login — Dedicated Mobile App Login & Instant Session Sync
app.post('/api/mobile/login', (req, res) => {
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

  let authResult: { token: string; user: any } | null = null;

  try {
    if (googleAuthData && (googleAuthData.email || googleAuthData.credential)) {
      authResult = handleGoogleAuth({
        email: googleAuthData.email || '',
        name: googleAuthData.name || '',
        googleId: googleAuthData.googleId || googleAuthData.sub || '',
        picture: googleAuthData.picture || ''
      });
    } else if (username && password) {
      authResult = login(username, password);
    } else if (email && password) {
      authResult = login(email, password);
    }

    if (!authResult) {
      res.status(401).json({ error: 'Invalid login credentials or account inactive.' });
      return;
    }

    // Allocate or reclaim an active calling session scoped strictly to caller's tenantId
    const tenantId = authResult.user.id;
    const tenantSessions = (Array.from(getSessions().values()) as Session[]).filter(s => s.tenantId === tenantId);
    const activeSession = tenantSessions.length > 0 ? tenantSessions[0] : reclaimOrCreateSession('laptop_mobile_host', tenantId);

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
    const campaigns = db.prepare(`SELECT * FROM campaigns ORDER BY createdAt DESC`).all();
    const leads = db.prepare(`SELECT id, campaignId, name, phone, status, outcome, duration FROM leads LIMIT 100`).all();

    res.json({
      success: true,
      token: authResult.token,
      user: authResult.user,
      sessionId: activeSession.id,
      pairingToken: activeSession.token,
      laptopName: activeSession.laptopName || 'Host Server',
      laptopBtAddress: activeSession.laptopBtAddress || '00:11:22:33:44:55',
      serverUrl: `http://${getLocalIP()}:${PORT}`,
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
  const quota = getUserQuota(user.id);
  res.json(quota || {
    userId: user.id,
    username: user.username,
    role: user.role,
    leadLimit: user.leadLimit ?? (user.role === 'admin' ? -1 : 1000),
    leadsScraped: user.leadsScraped || 0,
    remaining: user.role === 'admin' ? -1 : Math.max(0, (user.leadLimit || 1000) - (user.leadsScraped || 0)),
    isUnlimited: user.role === 'admin' || user.leadLimit === -1,
    status: user.status || 'active'
  });
});

// POST /auth/logout
app.post('/auth/logout', (req, res) => {
  const authHeader = req.headers['authorization'] || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
  if (token) logout(token);
  res.json({ success: true });
});

// POST /auth/change-password  (requires auth)
app.post('/auth/change-password', requireAuth, (req, res) => {
  const { newPassword } = req.body as { newPassword: string };
  if (!newPassword || newPassword.length < 6) {
    res.status(400).json({ error: 'Password must be at least 6 characters.' });
    return;
  }
  const user = (req as any).user;
  changePassword(user.id, newPassword);
  res.json({ success: true });
});

// GET /auth/me — validate token and return current user
app.get('/auth/me', requireAuth, (req, res) => {
  res.json({ user: (req as any).user });
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

// GET /api/devices — list all registered devices and status
app.get('/api/devices', requireAuth, (req, res) => {
  const devices = db.prepare(`SELECT * FROM devices ORDER BY lastSeenAt DESC`).all();
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
  res.json(getCampaigns());
});

// REST: Get leads for a campaign (protected)
app.get('/campaigns/:id/leads', requireAuth, (req, res) => {
  res.json(getLeads(req.params.id));
});

// REST: Public fallback for leads
app.get('/api/campaigns/:id/leads', (req, res) => {
  res.json(getLeads(req.params.id));
});

// GET /api/campaigns/mobile — public endpoint for mobile dashboard
app.get('/api/campaigns/mobile', (req, res) => {
  res.json(getCampaigns());
});

// GET /download/apk — serve APK binary file to mobile clients
app.get('/download/apk', (req, res) => {
  const apkPaths = [
    path.join(__dirname, '../../mobile/build/app/outputs/flutter-apk/app-release.apk'),
    path.join(__dirname, '../../mobile/build/app/outputs/apk/release/app-release.apk'),
    path.join(__dirname, '../public/OctalDialer.apk'),
    path.join(__dirname, '../data/OctalDialer.apk')
  ];

  for (const p of apkPaths) {
    if (fs.existsSync(p)) {
      return res.download(p, 'OctalDialer.apk');
    }
  }

  res.status(404).send('APK build file not found on host.');
});

// REST: Delete single lead (protected)
app.delete('/api/leads/:id', requireAuth, (req, res) => {
  const success = deleteLead(req.params.id);
  if (success) {
    io.emit('leads:updated');
    res.json({ success: true, message: `Lead ${req.params.id} deleted.` });
  } else {
    res.status(404).json({ error: 'Lead not found.' });
  }
});

// REST: Delete single lead shortcut without /api prefix
app.delete('/leads/:id', requireAuth, (req, res) => {
  const success = deleteLead(req.params.id);
  if (success) {
    io.emit('leads:updated');
    res.json({ success: true, message: `Lead ${req.params.id} deleted.` });
  } else {
    res.status(404).json({ error: 'Lead not found.' });
  }
});

// REST: Purge all fake/sample leads across queue (protected)
app.post('/api/leads/purge-fake', requireAuth, (req, res) => {
  const count = clearFakeQueueLeads();
  io.emit('leads:updated');
  res.json({ success: true, count, message: `Removed ${count} fake/sample leads.` });
});

// REST: Clear all leads in a campaign (protected)
app.delete('/campaigns/:id/leads', requireAuth, (req, res) => {
  const count = clearAllLeadsInCampaign(req.params.id);
  io.emit('leads:updated');
  res.json({ success: true, count, message: `Cleared ${count} leads in campaign ${req.params.id}.` });
});

// REST: Call logs history (protected — for dashboard)
app.get('/logs', requireAuth, (req, res) => {
  res.json(getLogs());
});

// REST: Call logs — public mobile-friendly endpoint (no auth needed, phone is already paired via socket)
app.get('/api/logs/mobile', (req, res) => {
  const logs = getLogs();
  // Return last 100 only for mobile
  res.json(logs.slice(0, 100));
});

// REST: Scan sibling scraper folders (protected)
app.get('/api/scraper-files', requireAuth, (req, res) => {
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

// REST: Import leads from scraped file (protected)
app.post('/api/scraper-files/import', requireAuth, async (req, res) => {
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

    const result = createCampaign(finalCampaignName, fileName, leads);
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

// REST: Run Scraper (protected)
app.post('/api/scraper/run', requireAuth, (req, res) => {
  if (activeScrapeTask.status === 'running') {
    res.status(400).json({ error: 'A scraper job is already running.' });
    return;
  }

  const user = (req as any).user;
  const userQuota = getUserQuota(user.id);
  const settings = getSystemSettings();

  if (settings.scraper_engine_status === 'disabled' && user.role !== 'admin') {
    res.status(403).json({ error: 'Google Maps Scraper engine is currently disabled by administrator.' });
    return;
  }

  if (user.role !== 'admin') {
    if (!userQuota || userQuota.remaining <= 0) {
      res.status(403).json({
        error: `Free scraping quota reached (${userQuota?.leadLimit || 1000} leads limit). Please contact an administrator to increase your quota.`
      });
      return;
    }
  }

  const { keyword, location, requirePhone, requireEmail, maxLeads } = req.body as {
    keyword: string;
    location: string;
    requirePhone: boolean;
    requireEmail: boolean;
    maxLeads?: number | string;
  };

  if (!keyword) {
    res.status(400).json({ error: 'Keyword is required.' });
    return;
  }

  const scraperInfo = findScraperInfo();
  if (!scraperInfo) {
    console.error('[Scraper] Error: scraper.js could not be located.');
    activeScrapeTask = {
      status: 'failed',
      keyword,
      location: location || 'all',
      logs: [
        '🚀 Starting Google Maps Scraper Pro in background...',
        '❌ Error: Could not locate scraper.js in google-maps-scraper-pro directory.'
      ]
    };
    res.status(500).json({ error: 'Google Maps Scraper script (scraper.js) not found.' });
    return;
  }

  // Calculate target lead limit
  let effectiveLimit = 0;
  const requestedLimit = parseInt(String(maxLeads || '0'), 10) || 0;

  if (user.role !== 'admin') {
    const remaining = userQuota ? userQuota.remaining : 1000;
    if (requestedLimit > 0) {
      effectiveLimit = Math.min(requestedLimit, remaining);
    } else {
      effectiveLimit = remaining;
    }
  } else {
    effectiveLimit = requestedLimit; // 0 means unlimited
  }

  const limitDesc = effectiveLimit > 0 ? `${effectiveLimit} leads max` : 'Unlimited';
  activeScrapeTask = {
    status: 'running',
    keyword,
    location: location || 'all',
    logs: [
      `🚀 Starting Google Maps Scraper Pro in background...`,
      `👤 User: ${user.username} (${user.role.toUpperCase()}) | 🎯 Limit: ${limitDesc}`
    ]
  };

  const quoteArg = (str: string) => str.includes(' ') ? `"${str.replace(/"/g, '')}"` : str;

  const maxWorkers = parseInt(settings.max_workers_allowed || '4', 10) || 2;
  const workers = String(Math.min(maxWorkers, 2));

  const args = [
    `"${scraperInfo.scriptPath}"`,
    '--industry', quoteArg(keyword),
    '--country', quoteArg(location || 'all'),
    '--workers', workers,
    '--headless'
  ];

  if (effectiveLimit > 0) {
    args.push('--max-leads', String(effectiveLimit));
  }

  if (requirePhone) args.push('--require-phone');
  if (requireEmail) args.push('--require-email');

  console.log(`[Scraper] Launching: node ${args.join(' ')} in ${scraperInfo.dir}`);

  let leadsScrapedThisRun = 0;

  try {
    activeScrapeProcess = spawn('node', args, {
      cwd: scraperInfo.dir,
      shell: true
    });

    activeScrapeProcess.stdout.on('data', (data: Buffer) => {
      const text = data.toString('utf8').trim();
      if (text) {
        const lines = text.split('\n').map(l => l.replace(/\r/g, '').trim()).filter(Boolean);
        for (const line of lines) {
          activeScrapeTask.logs.push(line);
          if (line.includes('✅ #')) {
            leadsScrapedThisRun++;
          }
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
      console.log(`[Scraper] Finished with exit code ${code}. Extracted: ${leadsScrapedThisRun} leads.`);
      if (leadsScrapedThisRun > 0 && user.id) {
        recordUserScrapedLeads(user.id, leadsScrapedThisRun);
      }
      activeScrapeTask.status = code === 0 ? 'completed' : 'failed';
      activeScrapeTask.logs.push(code === 0 ? `✅ Scraper finished successfully! (${leadsScrapedThisRun} leads extracted)` : `❌ Scraper failed with exit code ${code}`);
      activeScrapeProcess = null;
    });

  } catch (err: any) {
    console.error('[Scraper] Spawn error:', err);
    activeScrapeTask.status = 'failed';
    activeScrapeTask.logs.push(`❌ Spawn error: ${err.message}`);
    activeScrapeProcess = null;
  }

  res.json({ success: true, message: 'Scraper started successfully.', effectiveLimit });
});

// REST: Scraper Status (protected)
app.get('/api/scraper/status', requireAuth, (req, res) => {
  res.json(activeScrapeTask);
});

// REST: Stop Scraper (protected)
app.post('/api/scraper/stop', requireAuth, (req, res) => {
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

// ─── ADMIN AUTHORITY MASTER CONTROL REST ENDPOINTS ────────────────────────────

// GET /api/admin/overview
app.get('/api/admin/overview', requireAuth, requireAdmin, (req, res) => {
  const stats = getAdminOverviewStats();
  res.json({
    ...stats,
    activeScraper: activeScrapeTask,
    systemUptimeSeconds: Math.floor(process.uptime())
  });
});

// GET /api/admin/users
app.get('/api/admin/users', requireAuth, requireAdmin, (req, res) => {
  res.json(getAllUsers());
});

// POST /api/admin/users
app.post('/api/admin/users', requireAuth, requireAdmin, (req, res) => {
  try {
    const { username, password, role, leadLimit } = req.body;
    if (!username || !password) {
      res.status(400).json({ error: 'Username and password required.' });
      return;
    }
    const newUser = registerUser(username, password, undefined, role || 'user', leadLimit !== undefined ? parseInt(leadLimit) : 1000);
    res.json({ success: true, user: newUser });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// PUT /api/admin/users/:id/quota
app.put('/api/admin/users/:id/quota', requireAuth, requireAdmin, (req, res) => {
  const { leadLimit, resetScraped } = req.body;
  const success = updateUserQuota(req.params.id, parseInt(leadLimit) || 1000, !!resetScraped);
  if (success) {
    res.json({ success: true, message: 'User quota updated successfully.' });
  } else {
    res.status(404).json({ error: 'User not found.' });
  }
});

// PUT /api/admin/users/:id/role
app.put('/api/admin/users/:id/role', requireAuth, requireAdmin, (req, res) => {
  const { role } = req.body;
  if (!role) {
    res.status(400).json({ error: 'Role is required.' });
    return;
  }
  const success = updateUserRole(req.params.id, role);
  if (success) {
    res.json({ success: true, message: `User role updated to ${role}.` });
  } else {
    res.status(404).json({ error: 'User not found.' });
  }
});

// PUT /api/admin/users/:id/status
app.put('/api/admin/users/:id/status', requireAuth, requireAdmin, (req, res) => {
  const { status } = req.body;
  const success = updateUserStatus(req.params.id, status || 'active');
  if (success) {
    res.json({ success: true, message: `User status set to ${status}.` });
  } else {
    res.status(404).json({ error: 'User not found.' });
  }
});

// POST /api/admin/users/:id/reset-quota
app.post('/api/admin/users/:id/reset-quota', requireAuth, requireAdmin, (req, res) => {
  const success = resetUserScrapedCount(req.params.id);
  if (success) {
    res.json({ success: true, message: 'User scraped counter reset to 0.' });
  } else {
    res.status(404).json({ error: 'User not found.' });
  }
});

// POST /api/admin/users/:id/password
app.post('/api/admin/users/:id/password', requireAuth, requireAdmin, (req, res) => {
  const { newPassword } = req.body;
  if (!newPassword || newPassword.length < 4) {
    res.status(400).json({ error: 'New password must be at least 4 characters.' });
    return;
  }
  changePassword(req.params.id, newPassword);
  res.json({ success: true, message: 'Password updated successfully.' });
});

// DELETE /api/admin/users/:id
app.delete('/api/admin/users/:id', requireAuth, requireAdmin, (req, res) => {
  const success = dbDeleteUser(req.params.id);
  if (success) {
    res.json({ success: true, message: 'User deleted.' });
  } else {
    res.status(404).json({ error: 'User not found.' });
  }
});

// GET /api/admin/settings
app.get('/api/admin/settings', requireAuth, requireAdmin, (req, res) => {
  res.json(getSystemSettings());
});

// POST /api/admin/settings
app.post('/api/admin/settings', requireAuth, requireAdmin, (req, res) => {
  const { default_free_scraper_limit, max_workers_allowed, scraper_engine_status } = req.body;
  if (default_free_scraper_limit !== undefined) {
    updateSystemSetting('default_free_scraper_limit', String(default_free_scraper_limit), 'Default free leads quota for regular users');
  }
  if (max_workers_allowed !== undefined) {
    updateSystemSetting('max_workers_allowed', String(max_workers_allowed), 'Max concurrent browser workers (1-4)');
  }
  if (scraper_engine_status !== undefined) {
    updateSystemSetting('scraper_engine_status', String(scraper_engine_status), 'Master scraper engine status');
  }
  res.json({ success: true, settings: getSystemSettings() });
});

// POST /api/admin/scraper/force-stop
app.post('/api/admin/scraper/force-stop', requireAuth, requireAdmin, (req, res) => {
  if (activeScrapeProcess) {
    try {
      activeScrapeProcess.kill('SIGINT');
    } catch {}
    activeScrapeProcess = null;
  }
  activeScrapeTask.status = 'failed';
  activeScrapeTask.logs.push('🛑 Scraper force-stopped by administrator authority.');
  res.json({ success: true, message: 'Scraper terminated by admin.' });
});

// POST /api/admin/system/unlock-all-leads
app.post('/api/admin/system/unlock-all-leads', requireAuth, requireAdmin, (req, res) => {
  const count = releaseExpiredLeases(0);
  io.emit('leads:updated');
  res.json({ success: true, count, message: `Unlocked ${count} locked lead(s).` });
});

// REST: Scraper Status (protected)
app.get('/api/scraper/status', requireAuth, (req, res) => {
  res.json(activeScrapeTask);
});

// REST: Stop Scraper (protected)
app.post('/api/scraper/stop', requireAuth, (req, res) => {
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
  const deepLink = 'octaldialer://join?sessionId=' + String(sessionId || '') + '&token=' + String(token || '') + '&serverUrl=' + encodeURIComponent(String(serverUrl || '')) + '&laptop=' + encodeURIComponent(String(laptop || ''));
  
  const html = '<!DOCTYPE html><html><head><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>Octal Dialer</title><script>setTimeout(function(){ window.location.href = "' + deepLink + '"; }, 300);</script></head><body style="background:#0f172a;color:#fff;text-align:center;padding:40px;"><div style="background:#1e293b;padding:32px;border-radius:20px;max-width:380px;margin:0 auto;"><h2 style="color:#f59e0b;">Octal Dialer Bridge</h2><p>Opening Octal Dialer App...</p><a href="' + deepLink + '" style="background:#f59e0b;color:#0f172a;font-weight:bold;padding:14px 28px;border-radius:14px;text-decoration:none;display:inline-block;">Open App Now</a></div></body></html>';
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
    const { campaignName, fileName, leads } = req.body as {
      campaignName: string;
      fileName: string;
      leads: { name: string; phone: string }[];
    };

    if (!leads || !Array.isArray(leads) || leads.length === 0) {
      res.status(400).json({ error: 'No leads provided' });
      return;
    }

    const result = createCampaign(campaignName, fileName, leads);
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

    const result = createCampaign(campaignName, fileName, leads);
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
    const { leadId, outcome, notes } = req.body as { leadId: string; outcome: string; notes?: string };
    const db = loadDb();
    
    // find log
    const log = db.logs.find(l => l.leadId === leadId);
    if (log) {
      log.outcome = outcome;
    }
    
    // find lead
    const lead = db.leads.find(l => l.id === leadId);
    if (lead) {
      lead.status = 'COMPLETED';
      lead.outcome = outcome;
    }
    
    saveDb(db);
    io.emit('leads:updated');
    res.json({ success: true });
  } catch (err: any) {
    console.error('Disposition error:', err);
    res.status(550).json({ error: err.message });
  }
});

// REST: Export logs to CSV (protected)
app.get('/api/logs/export', requireAuth, (req, res) => {
  try {
    const logs = getLogs(); // use SQLite directly — no loadDb() needed

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

// WebSocket Event Handlers
io.on('connection', (socket) => {
  console.log(`[Socket] Connected: ${socket.id}`);

  socket.on('laptop:register', (data?: { previousSessionId?: string }) => {
    const tenantId = socket.data.tenantId || (socket.data.user ? socket.data.user.id : 'user_admin_e38eeed3');
    const session = reclaimOrCreateSession(socket.id, tenantId, data?.previousSessionId);
    socket.join(session.id);
    socket.data.sessionId = session.id;
    console.log(`[Socket] Laptop registered: ${session.id} | Tenant: ${tenantId} | Status: ${session.status}`);

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
        phoneIpAddress: session.phoneIpAddress,
        phoneStatus: session.phoneStatus || 'READY'
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
    authToken?: string;
    deviceName?: string;
    phoneBtAddress?: string;
    phoneOsType?: string;
    phoneIpAddress?: string;
  }) => {
    let tokenOrSessionId = data.token || data.sessionId || data.authToken || '';
    let targetTenantId = socket.data.tenantId;

    if (!targetTenantId && data.authToken) {
      const u = validateToken(data.authToken);
      if (u) targetTenantId = u.id;
    }

    let session = pairPhone(
      tokenOrSessionId, 
      socket.id, 
      data.deviceName || 'Mobile Client', 
      data.phoneBtAddress || '48:D2:24:D3:5F:AA', 
      data.phoneOsType || 'Android', 
      data.phoneIpAddress || '127.0.0.1',
      data.sessionId
    );

    if (!session && tokenOrSessionId) {
      const user = validateToken(tokenOrSessionId);
      if (user) {
        targetTenantId = user.id;
        const tenantSessions = Array.from(getSessions().values()).filter((s: any) => s.tenantId === user.id);
        const active = tenantSessions.length > 0 ? tenantSessions[0] : reclaimOrCreateSession('laptop_mobile_host', user.id);
        session = pairPhone(
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
    const sid = data.sessionId || socket.data.sessionId;
    if (!sid) return;
    const session = getSessionById(sid);
    if (session) {
      setPhoneStatus(sid, data.phoneStatus);
      io.to(sid).emit('phone:status_changed', { phoneStatus: data.phoneStatus });
      console.log(`[Phone Status] Session ${sid} phoneStatus set to: ${data.phoneStatus}`);
    }
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
      createManualLog(phone, name || 'Manual Quick Dial', reason, duration);
    }
    socket.to(sessionId).emit('call:finished', { reason, duration });
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

// ── GET /email/leads
app.get('/email/leads', requireAuth, (_req: express.Request, res: express.Response): void => {
  const rows = emailDb.prepare('SELECT * FROM email_leads ORDER BY createdAt ASC').all();
  res.json(rows);
});

// ── POST /email/upload
app.post('/email/upload', requireAuth, (req: express.Request, res: express.Response): void => {
  const { leads } = req.body as { leads: { email: string; name?: string; company?: string }[] };
  if (!Array.isArray(leads) || !leads.length) {
    res.status(400).json({ error: 'leads array required' });
    return;
  }
  let added = 0;
  let skipped = 0;
  const insert = emailDb.prepare(`
    INSERT OR IGNORE INTO email_leads (email, name, company, status, stage)
    VALUES (?, ?, ?, 'pending', 1)
  `);
  for (const lead of leads) {
    if (!lead.email?.includes('@')) continue;
    const result = insert.run(lead.email.toLowerCase().trim(), lead.name || 'Client', lead.company || '');
    if ((result as any).changes > 0) added++; else skipped++;
  }
  res.json({ success: true, added, duplicates: skipped });
});

// ── DELETE /email/leads
app.delete('/email/leads', requireAuth, (_req: express.Request, res: express.Response): void => {
  emailDb.prepare('DELETE FROM email_leads').run();
  res.json({ success: true });
});

// ── GET /email/accounts
app.get('/email/accounts', requireAuth, (_req: express.Request, res: express.Response): void => {
  const rows = emailDb.prepare('SELECT id, email, senderName, smtpHost, smtpPort, status FROM email_accounts').all();
  res.json(rows);
});

// ── POST /email/accounts
app.post('/email/accounts', requireAuth, (req: express.Request, res: express.Response): void => {
  const { accounts } = req.body as { accounts: { email: string; password: string; senderName?: string; smtpHost?: string; smtpPort?: number; status?: string }[] };
  if (!Array.isArray(accounts)) {
    res.status(400).json({ error: 'accounts array required' });
    return;
  }
  const upsert = emailDb.prepare(`
    INSERT INTO email_accounts (email, password, senderName, smtpHost, smtpPort, status)
    VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(email) DO UPDATE SET
      password = CASE WHEN excluded.password = '***keep***' THEN password ELSE excluded.password END,
      senderName = excluded.senderName,
      smtpHost = excluded.smtpHost,
      smtpPort = excluded.smtpPort,
      status = excluded.status
  `);
  for (const acc of accounts) {
    upsert.run(
      acc.email.toLowerCase(),
      acc.password,
      acc.senderName || null,
      acc.smtpHost || 'smtp.office365.com',
      acc.smtpPort || 587,
      acc.status || 'active'
    );
  }
  res.json({ success: true });
});

// ── GET /email/templates
app.get('/email/templates', requireAuth, (_req: express.Request, res: express.Response): void => {
  const rows = emailDb.prepare('SELECT * FROM email_templates ORDER BY stage ASC, id ASC').all();
  res.json(rows);
});

// ── POST /email/templates
app.post('/email/templates', requireAuth, (req: express.Request, res: express.Response): void => {
  const { templates } = req.body as { templates: { subject: string; body: string; stage?: number }[] };
  if (!Array.isArray(templates)) {
    res.status(400).json({ error: 'templates array required' });
    return;
  }
  emailDb.prepare('DELETE FROM email_templates').run();
  const insert = emailDb.prepare('INSERT INTO email_templates (subject, body, stage) VALUES (?, ?, ?)');
  for (const t of templates) {
    insert.run(t.subject, t.body, t.stage || 1);
  }
  res.json({ success: true });
});

// ── POST /email/start — fire-and-forget campaign runner
app.post('/email/start', requireAuth, (req: express.Request, res: express.Response): void => {
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
      const leads = emailDb.prepare(`SELECT * FROM email_leads WHERE status IN ('pending','sent')`).all() as any[];
      const accounts = emailDb.prepare(`SELECT * FROM email_accounts WHERE status = 'active'`).all() as any[];
      const templates = emailDb.prepare(`SELECT * FROM email_templates ORDER BY stage ASC, id ASC`).all() as any[];

      emailLog(`=== Campaign Started: ${leads.length} eligible leads, ${accounts.length} accounts, ${templates.length} templates ===`);

      if (!accounts.length) { emailLog('❌ No active SMTP accounts!'); return; }
      if (!templates.length) { emailLog('❌ No email templates!'); return; }

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

      const updateLead = emailDb.prepare(`UPDATE email_leads SET status=?, stage=?, lastSentAt=? WHERE id=?`);
      const disableAcc = emailDb.prepare(`UPDATE email_accounts SET status='disabled' WHERE id=?`);

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
            updateLead.run(newStatus, newStage, new Date().toISOString(), lead.id);
            emailLog(`✅ Sent to ${lead.email} (Stage ${lead.stage})`);
            sent++;
            const delay = 30000 + Math.random() * 30000;
            await new Promise(r => setTimeout(r, delay));
          } catch (err: unknown) {
            emailLog(`❌ Failed: ${lead.email} — ${(err as Error).message}`);
            if ((err as Error).message?.includes('Authentication') || (err as Error).message?.includes('Username and Password')) {
              disableAcc.run(acc.id);
              emailLog(`⚠️ Disabled account ${acc.email} (auth failure)`);
              break;
            }
          }
        }
        transporter.close();
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


httpServer.listen(PORT, '0.0.0.0', () => {
  console.log(`[Octal Backend] Server running on http://0.0.0.0:${PORT}`);
  console.log(`[Local IP Address] Detected: http://${getLocalIP()}:${PORT}`);
  console.log(`[Phone must use this URL] http://${getLocalIP()}:${PORT}`);
  console.log(`[QR will auto-encode this URL in the pairing link]`);
});
