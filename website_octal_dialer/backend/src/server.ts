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
import { tunnelManager } from './tunnelManager';

dotenv.config({ path: path.join(__dirname, '../.env') });

process.on('uncaughtException', (err) => {
  console.error('[UNCAUGHT EXCEPTION]:', err);
});

process.on('unhandledRejection', (reason) => {
  console.error('[UNHANDLED REJECTION]:', reason);
});

import { isValidEmailFormat, sendAdminCompanyEmail } from './emailVerificationService';

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
  getTeamsLedByUser,
  getTeamMemberUserIds,
  isTeamLeader,
  canAccessTeam,
  canAccessUser,
  getTeamLeadScopedUserIds,
  getUserTeamPeerVisibilitySets,
  getCampaignIdsForLedTeams,
  getTeamSettings,
  upsertTeamSettings,
  getTeamEffectiveVisibility,
  getAllTenantsSummary,
  updateTenantLeadPoolMode,
  getScopedCrmUserIds,
  recordCrmNote,
  updateTenantStatus,
  updateTenantSeatLimit,
  getGlobalCustomerUsers,
  getGlobalSuperAdminMetrics,
  getGlobalPlatformOverview,
  getDetailedTenantsList,
  getTenantDetail,
  getGlobalDevicesList,
  getGlobalRecentActivity,
  provisionWorkspaceOrganization,
  getTenantById,
  canAccessLead,
  canReadLead,
  canEditLead,
  canDeleteLead,
  getScopedLeadFilterSql,
  getScopedLogs,
  canDispositionLead,
  getScopedLockedLeads,
  CANONICAL_MODULES,
  ALL_CANONICAL_MODULES,
  normalizeModuleKey,
  getTenantModuleEntitlements,
  setTenantModuleEntitlement,
  getTenantAccessMatrix,
  getTenantSeatUsage,
  lockWorkspaceForMembershipChange,
  getWorkspaceInvitations,
  getWorkspaceInvitationByTokenHash,
  getPendingInvitationForEmail,
  createWorkspaceInvitation,
  revokeWorkspaceInvitation,
  acceptWorkspaceInvitation,
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
  authenticateLogin,
  logout,
  validateToken,
  changePassword,
  verifyUserPassword,
  hashPassword,
  registerPublicUser,
  handleGoogleAuthWithIntent,
  verifyGoogleIdToken,
  updateUserRole,
  requirePlatformAdmin,
  requireSuperAdmin,
  requireTenantAdmin,
  requireTeamLeadOrAdmin,
  resolveAccessScope,
  requireModule,
  getEffectivePermissions,
  getUserModuleAccess,
  isActiveUserStatus,
  requirePermission,
  validateRoleBelongsToTenant,
  getTenantId,
  signupTenant,
  registerCustomerWithEmail,
  issueAuthToken,
  RevocationStorageUnavailableError,
  registerTokenRevocationHandler,
  isPlatformRole,
  isPlatformAdmin,
  isSuperAdmin,
  isCompanyOwner,
  isTeamLead,
  isTenantMember,
  SQL_EXCLUDE_PLATFORM_ROLES
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

import {
  logUserActivity,
  recordAgentCallMetric,
  getUserActivityLogs,
  getAgentDailyMetrics
} from './activityManager';

const isProduction = process.env.NODE_ENV === 'production';

// Campaign SMTP verifies certificates by default. Set SMTP_REJECT_UNAUTHORIZED=false
// only when a tenant's SMTP relay uses a certificate that cannot be validated.
const smtpRejectUnauthorizedValue = process.env.SMTP_REJECT_UNAUTHORIZED?.trim().toLowerCase();
const SMTP_REJECT_UNAUTHORIZED = smtpRejectUnauthorizedValue !== 'false';
if (smtpRejectUnauthorizedValue && !['true', 'false'].includes(smtpRejectUnauthorizedValue)) {
  console.warn('[SMTP TLS] Invalid SMTP_REJECT_UNAUTHORIZED value; defaulting to certificate verification.');
}
if (!SMTP_REJECT_UNAUTHORIZED) {
  console.warn('[SMTP TLS] Certificate verification is disabled for campaign SMTP by explicit configuration. Use only for legacy relays; prefer installing a trusted CA.');
}

export const app = express();

// First-party production apps and tenant portals remain available. Other production
// apps must be listed as exact HTTPS origins in ALLOWED_ORIGINS/CORS_ORIGIN.
const getCanonicalAllowedOrigins = (): string[] => {
  const origins = new Set<string>([
    'https://zestify7.online',
    'https://www.zestify7.online',
    'https://admin.zestify7.online',
    'https://app.zestify7.online',
    'https://api.zestify7.online'
  ]);

  const configuredValues = [
    ...(process.env.ALLOWED_ORIGINS || process.env.CORS_ORIGIN || '').split(','),
    process.env.SERVER_URL,
    process.env.PUBLIC_URL
  ];
  for (const configuredValue of configuredValues) {
    const normalized = configuredOrigin(configuredValue);
    if (normalized && (!isProduction || normalized.startsWith('https://'))) origins.add(normalized);
  }

  if (!isProduction) {
    for (const origin of [
      'http://localhost:3000',
      'http://127.0.0.1:3000',
      'http://localhost:5173',
      'http://127.0.0.1:5173',
      'http://localhost:5174',
      'http://127.0.0.1:5174',
      'http://140.245.215.156',
      'http://140.245.215.156:5000',
      'http://140.245.215.156.sslip.io',
      'http://zestify7.online',
      'http://www.zestify7.online'
    ]) origins.add(origin);
  }

  return Array.from(origins);
};

export const isOriginAllowed = (origin: string | undefined): boolean => {
  // Non-browser clients (native Flutter/Dart mobile app, curl, server-to-server) do not send Origin header
  if (!origin) return true;

  const normalized = normalizeOAuthOrigin(origin);
  if (!normalized) return false;
  const allowedOrigins = getCanonicalAllowedOrigins();
  if (allowedOrigins.includes(normalized)) return true;

  try {
    const parsed = new URL(normalized);
    const host = parsed.hostname.toLowerCase();

    // Tenant subdomains are first-party only; production requires HTTPS on the default port.
    if (host === 'zestify7.online' || host.endsWith('.zestify7.online')) {
      return (!isProduction || parsed.protocol === 'https:') && (!parsed.port || parsed.port === '443');
    }

    if (isProduction) return false;

    // Local/private-network and temporary tunnel origins are development-only.
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

  return false;
};

app.use(cors({
  origin: (origin, callback) => {
    if (isOriginAllowed(origin)) {
      callback(null, true);
    } else {
      console.warn(`[CORS Blocked]: Origin not allowed: ${origin}`);
      callback(null, false);
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept']
}));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// Handle JSON body syntax parse errors gracefully with JSON error response instead of HTML
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  if (err instanceof SyntaxError && 'status' in err && (err as any).status === 400 && 'body' in err) {
    res.status(400).json({ error: 'Malformed JSON payload.' });
    return;
  }
  next(err);
});


// ─── Auth middleware ──────────────────────────────────────────────────────────
async function requireAuth(req: express.Request, res: express.Response, next: express.NextFunction): Promise<void> {
  const authHeader = req.headers['authorization'] || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
  if (!token) {
    res.status(401).json({ error: 'Unauthorized. Missing Bearer authorization token.' });
    return;
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
  if (!user || (!isCompanyOwner(user) && !isPlatformRole(user.role))) {
    res.status(403).json({ error: 'Forbidden: Administrator privileges required.' });
    return;
  }
  next();
}

function requireCompanyOwnerOrPlatformAdmin(req: express.Request, res: express.Response, next: express.NextFunction): void {
  const user = (req as any).user;
  if (!user || (!isCompanyOwner(user) && !isPlatformRole(user.role))) {
    res.status(403).json({ error: 'Forbidden: Company Owner or Platform Administrator privileges required.' });
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
// CRM endpoints must respect the CRM module ceiling even when an action also accepts lead/call permissions.
app.use('/api/crm', requireAuth, requireModule('crm'));

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
  const authResult = await authenticateLogin(username, password);
  if (!authResult.success) {
    if (authResult.code === 'ACCOUNT_SUSPENDED') {
      res.status(403).json({
        code: 'ACCOUNT_SUSPENDED',
        error: authResult.error || 'Your account or workspace has been suspended.',
        email: authResult.email,
        tenantName: authResult.tenantName
      });
      return;
    }
    res.status(401).json({ error: authResult.error || 'Invalid username or password.' });
    return;
  }
  const token = authResult.token!;
  const user = await validateToken(token);
  if (!user) {
    res.status(401).json({ error: 'Session validation failed.' });
    return;
  }
  logUserActivity({
    tenantId: user.tenantId || 'platform',
    userId: user.id,
    username: user.username,
    action: 'USER_LOGIN',
    resourceType: 'auth',
    details: { role: user.role },
    req
  });
  res.json({ token, username: user.username, role: user.role, user });
});

// POST /admin/login & /api/admin/login — Dedicated Platform Administrator Authentication
app.post(['/admin/login', '/api/admin/login'], async (req, res) => {
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
  if (!isPlatformRole(user.role)) {
    res.status(403).json({
      error: 'Access denied: Customer accounts cannot authenticate through the Platform Admin portal. Please log in at /login.'
    });
    return;
  }
  logUserActivity({
    tenantId: user.tenantId || 'platform',
    userId: user.id,
    username: user.username,
    action: 'ADMIN_LOGIN',
    resourceType: 'auth',
    details: { role: user.role, portal: 'platform_admin' },
    req
  });
  res.json({ token, username: user.username, role: user.role, user });
});

// POST /auth/register & /api/auth/register — Public Customer Registration (Email + Password)
app.post(['/auth/register', '/api/auth/register'], async (req, res) => {
  try {
    const { name, fullName, email, password, captchaToken } = req.body;
    const finalName = (fullName || name || '').trim();
    if (!finalName || !email || !password) {
      res.status(400).json({ error: 'Full name, email, and password are required.' });
      return;
    }
    const result = await registerCustomerWithEmail({
      fullName: finalName,
      email,
      password,
      captchaToken,
      ip: req.ip
    });
    res.json(result);
  } catch (err: any) {
    if (err.code === 'ACCOUNT_EXISTS') {
      res.status(409).json({ error: err.message, code: 'ACCOUNT_EXISTS' });
      return;
    }
    res.status(400).json({ error: err.message || 'Registration failed.' });
  }
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

  let pendingInvitation: any = null;
  let needsOnboarding = false;

  const isPlatform = isPlatformRole(user.role);
  if (!user.tenantId && !isPlatform) {
    if (user.email) {
      pendingInvitation = await getPendingInvitationForEmail(user.email);
    }
    if (!pendingInvitation) {
      needsOnboarding = true;
    }
  }

  res.json({
    valid: true,
    user: {
      id: user.id,
      username: user.username,
      displayName: user.displayName,
      role: user.role,
      tenantId: user.tenantId || null,
      email: user.email,
      needsOnboarding,
      pendingInvitation
    },
    needsOnboarding,
    pendingInvitation
  });
});

// POST /auth/contact-admin & /api/auth/contact-admin — Public endpoint for suspended accounts to contact support
app.post(['/auth/contact-admin', '/api/auth/contact-admin'], async (req, res) => {
  try {
    const email = (req.body?.email || '').trim().toLowerCase();
    const name = (req.body?.name || '').trim();
    const message = (req.body?.message || '').trim();
    const tenantName = (req.body?.tenantName || '').trim();
    const ip = req.ip || req.headers['x-forwarded-for'] || 'unknown';

    if (!email || !isValidEmailFormat(email)) {
      res.status(400).json({ error: 'A valid email address is required.' });
      return;
    }

    if (!message || message.length < 5) {
      res.status(400).json({ error: 'Please enter a message describing your reactivation request (at least 5 characters).' });
      return;
    }

    const existingUser = await db.queryOne<any>('SELECT id, username, "tenantId" FROM users WHERE email = $1', [email]);
    let resolvedTenantId = existingUser?.tenantId || null;
    let resolvedTenantName = tenantName;

    if (!resolvedTenantName && resolvedTenantId) {
      const t = await db.queryOne<any>('SELECT name FROM tenants WHERE id = $1', [resolvedTenantId]);
      if (t) resolvedTenantName = t.name;
    }

    const now = new Date().toISOString();
    const auditId = 'reactivate_' + crypto.randomUUID();

    await db.execute(`
      INSERT INTO audit_logs_admin (id, username, action, "targetType", "targetId", details, timestamp, "tenantId")
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
    `, [
      auditId,
      existingUser?.username || email,
      'WORKSPACE_REACTIVATION_REQUEST',
      'tenant',
      resolvedTenantId || 'unassigned',
      JSON.stringify({
        email,
        name: name || existingUser?.username || 'Customer User',
        message,
        tenantName: resolvedTenantName || 'Unknown Workspace',
        ip: String(ip),
        submittedAt: now
      }),
      now,
      resolvedTenantId
    ]);

    if (resolvedTenantId) {
      try {
        const msgId = 'cmsg_' + crypto.randomUUID();
        await db.execute(`
          INSERT INTO company_messages (
            id, "tenantId", "senderRole", "senderId", "senderName", "senderEmail",
            "recipientEmail", "recipientName", subject, message, channel, "deliveryStatus", "createdAt", metadata
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
        `, [
          msgId,
          resolvedTenantId,
          'customer',
          existingUser?.id || null,
          name || existingUser?.username || 'Customer User',
          email,
          'blazingsoul451@gmail.com',
          'Platform Administrator',
          'Workspace Reactivation Request',
          message,
          'in_app',
          'received',
          now,
          JSON.stringify({ ip: String(ip), tenantName: resolvedTenantName })
        ]);
      } catch (cmsgErr) {
        console.warn('[contact-admin] Failed to save in company_messages:', cmsgErr);
      }
    }

    emitPlatformEvent('platform:reactivation-requested', {
      id: auditId,
      email,
      name: name || existingUser?.username || 'Customer User',
      message,
      tenantName: resolvedTenantName || 'Unknown Workspace',
      submittedAt: now
    });

    res.json({
      success: true,
      message: 'Your reactivation request has been sent to the platform administrator. We will review your account and contact you shortly.'
    });
  } catch (err: any) {
    console.error('[Contact Admin Error]:', err);
    res.status(500).json({ error: 'Failed to submit request. Please try again or contact administrator directly.' });
  }
});

// OAuth completion-code flow is opt-in during rollout. Old clients that do not
// request it continue receiving the existing token-fragment response.
const OAUTH_STATE_TTL_MS = 10 * 60 * 1000;
const OAUTH_COMPLETION_TTL_MS = 60 * 1000;
const MAX_PENDING_OAUTH_ENTRIES = 5000;
type OAuthIntent = 'signin' | 'signup';
type OAuthCompletionMode = 'legacy' | 'code';
const oauthStates = new Map<string, {
  clientOrigin: string;
  intent: OAuthIntent;
  redirectUri: string;
  completionMode: OAuthCompletionMode;
  createdAt: number;
}>();
const oauthCompletionCodes = new Map<string, {
  clientOrigin: string;
  token: string;
  user: any;
  isNewUser: boolean;
  createdAt: number;
}>();

function pruneOAuthEntries<T extends { createdAt: number }>(store: Map<string, T>, ttlMs: number): void {
  const now = Date.now();
  for (const [key, value] of store) {
    if (now - value.createdAt > ttlMs) store.delete(key);
  }
  while (store.size >= MAX_PENDING_OAUTH_ENTRIES) {
    const oldest = store.keys().next();
    if (oldest.done) break;
    store.delete(oldest.value);
  }
}

function normalizeOAuthOrigin(value: string | undefined): string | null {
  if (!value) return null;
  try {
    const parsed = new URL(value);
    if (parsed.origin === 'null' || parsed.username || parsed.password || parsed.pathname !== '/' || parsed.search || parsed.hash) {
      return null;
    }
    return parsed.origin;
  } catch {
    return null;
  }
}

function configuredOrigin(value: string | undefined): string | null {
  if (!value?.trim()) return null;
  try {
    return normalizeOAuthOrigin(new URL(value.trim()).origin);
  } catch {
    return null;
  }
}

function isOAuthClientOriginAllowed(value: string | undefined): boolean {
  const origin = normalizeOAuthOrigin(value);
  return origin !== null && isOriginAllowed(origin);
}

function requestOAuthClientOrigin(req: express.Request): string | null {
  const origin = req.get('origin');
  let candidate: string | null = null;
  if (origin !== undefined) {
    candidate = normalizeOAuthOrigin(origin);
  } else if (req.get('referer')) {
    try {
      candidate = normalizeOAuthOrigin(new URL(req.get('referer')!).origin);
    } catch {
      candidate = null;
    }
  }
  return candidate && isOAuthClientOriginAllowed(candidate) ? candidate : null;
}

function oauthCompletionModeRequested(value: unknown): OAuthCompletionMode {
  const enabled = process.env.GOOGLE_OAUTH_CODE_EXCHANGE_ENABLED?.trim().toLowerCase() === 'true';
  return enabled && value === 'code' ? 'code' : 'legacy';
}

// GET /auth/config & GET /api/auth/config — Public client configuration
app.get(['/auth/config', '/api/auth/config'], (_req, res) => {
  const clientId = (process.env.GOOGLE_CLIENT_ID || '');
  res.json({
    googleClientId: clientId,
    captchaSiteKey: null,
    captchaEnabled: false
  });
});

// Keep the registered production callback fixed; never derive it from Host headers.
function getOAuthRedirectUri(): string | null {
  const configured = process.env.GOOGLE_REDIRECT_URI?.trim();
  if (configured) {
    try {
      const parsed = new URL(configured);
      const origin = normalizeOAuthOrigin(parsed.origin);
      const isLocalDevelopmentCallback = !isProduction && parsed.protocol === 'http:' &&
        ['localhost', '127.0.0.1'].includes(parsed.hostname) && parsed.port === String(PORT);
      if (parsed.pathname !== '/auth/google/callback' || parsed.search || parsed.hash || !origin ||
          (isProduction && !origin.startsWith('https://')) ||
          (!isOAuthClientOriginAllowed(origin) && !isLocalDevelopmentCallback)) {
        return null;
      }
      return `${origin}${parsed.pathname}`;
    } catch {
      return null;
    }
  }

  return isProduction
    ? 'https://zestify7.online/auth/google/callback'
    : `http://localhost:${PORT}/auth/google/callback`;
}

function buildGoogleOAuthAuthorization(
  req: express.Request,
  intent: OAuthIntent,
  requestedMode: OAuthCompletionMode
): { success: true; clientOrigin: string; authUrl: string } | { success: false; status: number; error: string } {
  const clientOrigin = requestOAuthClientOrigin(req);
  if (!clientOrigin) {
    return { success: false, status: 403, error: 'OAuth client origin is not allowed.' };
  }

  const clientId = process.env.GOOGLE_CLIENT_ID?.trim();
  const redirectUri = getOAuthRedirectUri();
  if (!clientId || !redirectUri) {
    return { success: false, status: 503, error: 'Google authentication is not configured.' };
  }

  pruneOAuthEntries(oauthStates, OAUTH_STATE_TTL_MS);
  const state = crypto.randomBytes(24).toString('hex');
  const completionMode = oauthCompletionModeRequested(requestedMode);
  oauthStates.set(state, { clientOrigin, intent, redirectUri, completionMode, createdAt: Date.now() });

  const authUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  authUrl.searchParams.set('client_id', clientId);
  authUrl.searchParams.set('redirect_uri', redirectUri);
  authUrl.searchParams.set('response_type', 'code');
  authUrl.searchParams.set('scope', 'openid email profile');
  authUrl.searchParams.set('state', state);
  authUrl.searchParams.set('prompt', 'select_account');
  return { success: true, clientOrigin, authUrl: authUrl.toString() };
}

// POST /auth/google/initiate — Returns direct Google OAuth URL
app.post(['/auth/google/initiate', '/api/auth/google/initiate'], (req, res) => {
  const intent = req.body?.intent === undefined ? 'signin' : req.body.intent;
  if (intent !== 'signin' && intent !== 'signup') {
    res.status(400).json({ error: 'A valid Google sign-in intent is required.' });
    return;
  }
  const authorization = buildGoogleOAuthAuthorization(req, intent, req.body?.completion);
  if (!authorization.success) {
    res.status(authorization.status).json({ error: authorization.error });
    return;
  }
  res.set('Cache-Control', 'no-store').json({ success: true, authUrl: authorization.authUrl });
});

// GET /auth/google & GET /api/auth/google — Initiates OAuth Redirect
app.get(['/auth/google', '/api/auth/google'], (req, res) => {
  const intent = req.query.intent === undefined ? 'signin' : req.query.intent;
  if (intent !== 'signin' && intent !== 'signup') {
    res.status(400).json({ error: 'A valid Google sign-in intent is required.' });
    return;
  }
  const authorization = buildGoogleOAuthAuthorization(req, intent, req.query.completion);
  if (!authorization.success) {
    res.status(authorization.status).json({ error: authorization.error });
    return;
  }
  console.log(`[OAuth] Redirecting to Google (intent: ${intent})`);
  res.set('Cache-Control', 'no-store').redirect(302, authorization.authUrl);
});

// GET /auth/google/callback & GET /api/auth/google/callback — Handles OAuth Code Exchange
app.get(['/auth/google/callback', '/api/auth/google/callback'], async (req, res) => {
  const state = typeof req.query.state === 'string' ? req.query.state : '';
  const stored = state ? oauthStates.get(state) : undefined;
  if (!stored || Date.now() - stored.createdAt > OAUTH_STATE_TTL_MS) {
    if (state) oauthStates.delete(state);
    res.status(400).json({ error: 'Invalid or expired OAuth state. Please start sign-in again.' });
    return;
  }
  oauthStates.delete(state);

  const clientOrigin = normalizeOAuthOrigin(stored.clientOrigin);
  if (!clientOrigin || !isOAuthClientOriginAllowed(clientOrigin)) {
    res.status(400).json({ error: 'OAuth client origin is no longer allowed.' });
    return;
  }

  try {
    const providerError = typeof req.query.error === 'string' ? req.query.error : '';
    const authorizationCode = typeof req.query.code === 'string' ? req.query.code : '';
    if (providerError || !authorizationCode) {
      res.set('Cache-Control', 'no-store').set('Referrer-Policy', 'no-referrer')
        .redirect(`${clientOrigin}/?auth_error=${encodeURIComponent(providerError || 'Google authorization cancelled')}`);
      return;
    }

    const clientId = process.env.GOOGLE_CLIENT_ID || '';
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET || '';
    if (!clientId || !clientSecret) throw new Error('Google authentication is not configured.');

    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code: authorizationCode,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: stored.redirectUri,
        grant_type: 'authorization_code'
      })
    });

    const tokenData = await tokenRes.json() as any;
    if (!tokenRes.ok || typeof tokenData?.id_token !== 'string') {
      throw new Error('Google token exchange failed.');
    }

    const profile = await verifyGoogleIdToken(tokenData.id_token);
    const result = await handleGoogleAuthWithIntent(profile, stored.intent);

    if (stored.completionMode === 'code') {
      pruneOAuthEntries(oauthCompletionCodes, OAUTH_COMPLETION_TTL_MS);
      const completionCode = crypto.randomBytes(32).toString('hex');
      oauthCompletionCodes.set(completionCode, {
        clientOrigin,
        token: result.token,
        user: result.user,
        isNewUser: result.isNewUser,
        createdAt: Date.now()
      });
      res.set('Cache-Control', 'no-store').set('Referrer-Policy', 'no-referrer')
        .redirect(303, `${clientOrigin}/#oauth_code=${completionCode}`);
      return;
    }

    // Legacy mode remains available until each client has deployed the dual-handshake frontend.
    const displayName = (result.user as any).displayName || result.user.username;
    res.set('Cache-Control', 'no-store').set('Referrer-Policy', 'no-referrer')
      .redirect(`${clientOrigin}/#token=${encodeURIComponent(result.token)}&username=${encodeURIComponent(result.user.username)}&displayName=${encodeURIComponent(displayName)}&user=${encodeURIComponent(result.user.username)}&isNewUser=${result.isNewUser}`);
  } catch (err: any) {
    console.error('[Google OAuth Callback Error]:', err?.code || err?.message || 'authentication failed');
    const errorCode = err?.code || 'GOOGLE_AUTH_FAILED';
    const emailParam = err?.email ? `&email=${encodeURIComponent(err.email)}` : '';
    const tenantParam = err?.tenantName ? `&tenant=${encodeURIComponent(err.tenantName)}` : '';
    res.set('Cache-Control', 'no-store').set('Referrer-Policy', 'no-referrer')
      .redirect(`${clientOrigin}/?auth_error=${encodeURIComponent(errorCode)}&message=${encodeURIComponent(err?.message || 'Google authentication failed.')}${emailParam}${tenantParam}`);
  }
});

// POST /auth/google/exchange — redeems a single-use code only for its initiating origin.
app.post(['/auth/google/exchange', '/api/auth/google/exchange'], (req, res) => {
  res.set('Cache-Control', 'no-store, private');
  const code = typeof req.body?.code === 'string' ? req.body.code : '';
  if (!/^[a-f0-9]{64}$/.test(code)) {
    res.status(400).json({ error: 'A valid OAuth completion code is required.' });
    return;
  }

  const completion = oauthCompletionCodes.get(code);
  if (!completion) {
    res.status(401).json({ error: 'OAuth completion code is invalid or already used.' });
    return;
  }
  if (Date.now() - completion.createdAt > OAUTH_COMPLETION_TTL_MS) {
    oauthCompletionCodes.delete(code);
    res.status(410).json({ error: 'OAuth completion code has expired. Please sign in again.' });
    return;
  }

  const requestOrigin = normalizeOAuthOrigin(req.get('origin')) || (() => {
    try { return normalizeOAuthOrigin(new URL(req.get('referer') || '').origin); } catch { return null; }
  })();
  if (!requestOrigin || requestOrigin !== completion.clientOrigin || !isOAuthClientOriginAllowed(requestOrigin)) {
    res.status(403).json({ error: 'OAuth completion code is bound to a different client origin.' });
    return;
  }

  // Delete synchronously after caller validation, before sending the token, to prevent replay.
  oauthCompletionCodes.delete(code);
  res.json({
    success: true,
    token: completion.token,
    user: completion.user,
    role: completion.user?.role,
    isNewUser: completion.isNewUser
  });
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
    res.status(400).json({
      code: err.code || 'GOOGLE_AUTH_FAILED',
      error: err.message || 'Google authentication failed.',
      email: err.email,
      tenantName: err.tenantName
    });
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
  const isPlatform = isPlatformRole(user.role);
  const isFullAccess = effectivePerms.has('*') || effectivePerms.has('all') || isPlatform;

  // Resolve company entitlement ceiling (Platform Admins have zero restrictions; tenant users are capped by company ceiling)
  const companyEntitlements = (!isPlatform && user.tenantId)
    ? await getTenantModuleEntitlements(user.tenantId)
    : null;

  // Compute module visibility map expected by the frontend
  const modulePerms: Record<string, boolean> = {};
  const resolvedAccess = await getUserModuleAccess(user, companyEntitlements || {});
  for (const m of ALL_BUSINESS_MODULES) {
    let allowed = false;
    if (isPlatform) {
      allowed = true;
    } else if (isFullAccess) {
      allowed = true;
    } else {
      if (m === 'octalDialer') {
        allowed = Array.from(effectivePerms).some(p => p.startsWith('calls:'));
      } else if (m === 'reports') {
        allowed = Array.from(effectivePerms).some(p => p.startsWith('reports:') || p.startsWith('history:'));
      } else if (m === 'autoEmailer' || m === 'facebookPoster') {
        allowed = effectivePerms.has(m) || effectivePerms.has(`${m}:view`);
      } else {
        allowed = effectivePerms.has(`${m}:view`) || Array.from(effectivePerms).some(p => p.startsWith(`${m}:`));
      }
    }

    // Intersect with company entitlement ceiling: no tenant user (including Company Owner) may access unentitled modules
    if (companyEntitlements && companyEntitlements[m] === false) {
      allowed = false;
    }

    modulePerms[m] = (isPlatform || isFullAccess) ? allowed : resolvedAccess.effectiveModules.includes(normalizeModuleKey(m));
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
    const user = await validateToken(token);
    await logout(token);
    if (user) {
      logUserActivity({
        tenantId: user.tenantId || 'platform',
        userId: user.id,
        username: user.username,
        action: 'USER_LOGOUT',
        resourceType: 'auth',
        details: { role: user.role },
        req
      });
    }
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
app.get('/auth/me', requireAuth, async (req, res) => {
  const user = (req as any).user;
  let tenant: any = null;
  let needsOnboarding = false;
  let pendingInvitation: any = null;

  if (user?.tenantId) {
    tenant = await getTenantById(user.tenantId);
  }

  if (!tenant) {
    if (user.email) {
      pendingInvitation = await getPendingInvitationForEmail(user.email);
    }
    if (!pendingInvitation) {
      needsOnboarding = true;
    }
  }

  res.json({
    user,
    tenant,
    needsOnboarding,
    pendingInvitation
  });
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

    let companyName = '';
    if (user.tenantId) {
      const tenant = await db.queryOne<{ name: string }>(`SELECT name FROM tenants WHERE id = $1`, [user.tenantId]);
      if (tenant?.name) companyName = tenant.name;
    }

    res.json({
      id: user.id,
      username: user.username,
      displayName: user.displayName || user.username,
      firstName,
      lastName,
      email: user.email || '',
      phone: user.phone || '',
      role: user.role,
      tenantId: user.tenantId || null,
      companyName,
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
app.post('/api/suppression-list/import', requireAuth, requireCompanyOwnerOrPlatformAdmin, async (req, res) => {
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
app.delete('/api/suppression-list/:id', requireAuth, requireCompanyOwnerOrPlatformAdmin, async (req, res) => {
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
app.post('/api/emergency-stop/clear', requireAuth, requireCompanyOwnerOrPlatformAdmin, async (req, res) => {
  const user = (req as any).user;
  const tenantId = user.tenantId;
  if (!tenantId) {
    res.status(401).json({ error: 'Unauthorized: missing tenant identity' });
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

// GET /api/leads/locked — list all currently locked leads (scoped per actor role)
app.get('/api/leads/locked', requireAuth, async (req, res) => {
  const user = (req as any).user;
  const isPlatformAdmin = user?.role === 'platform_admin' || user?.role === 'master_admin';
  const tenantId = isPlatformAdmin ? (req.query.tenantId as string | undefined || user?.tenantId) : user?.tenantId;
  res.json(await getScopedLockedLeads(user, tenantId));
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

// GET /api/audit-logs & /admin/audit-logs — view system audit logs (strictly Company Owner / Platform Owner)
app.get(['/api/audit-logs', '/admin/audit-logs'], requireAuth, requireCompanyOwnerOrPlatformAdmin, async (req, res) => {
  const user = (req as any).user;
  const isPlatform = user.role === 'platform_admin' || user.role === 'master_admin';
  const logs = isPlatform
    ? await db.queryAll(`SELECT * FROM audit_logs ORDER BY timestamp DESC LIMIT 200`)
    : await db.queryAll(`SELECT * FROM audit_logs WHERE "tenantId" = $1 ORDER BY timestamp DESC LIMIT 200`, [user.tenantId]);
  res.json({ logs, pagination: { total: logs.length, totalPages: 1 } });
});

// POST /api/leads/:id/unlock — manually unlock a lead (strictly scoped)
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

  const isPlatform = user.role === 'platform_admin' || user.role === 'master_admin';
  const isCompanyAdmin = user.role === 'admin';
  if (!isPlatform && !isCompanyAdmin) {
    if (!lead.assignedTo) {
      res.status(403).json({ error: 'Forbidden: Cannot unlock unassigned lead.' });
      return;
    }
    if (user.role === 'team_lead') {
      const teamUserIds = await getTeamLeadScopedUserIds(user.id, tenantId);
      if (lead.assignedTo !== user.id && !teamUserIds.includes(lead.assignedTo)) {
        res.status(403).json({ error: 'Forbidden: Team Lead can only unlock leads assigned to themselves or their led team members.' });
        return;
      }
    } else {
      if (lead.assignedTo !== user.id) {
        res.status(403).json({ error: 'Forbidden: Members can only unlock leads assigned to themselves.' });
        return;
      }
    }
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

  // Scoping is active:
  // For team_lead: only campaigns assigned to teams they LEAD
  // For standard user/member: campaigns assigned to teams they are member of
  const scopedCampaignIds = user.role === 'team_lead'
    ? await getCampaignIdsForLedTeams(user.id, tenantId)
    : await getUserScopedCampaignIds(user.id, tenantId);
  const scopedSet = new Set(scopedCampaignIds);
  const filtered = allCampaigns.filter(c => scopedSet.has(c.id));
  res.json(filtered);
});

// REST: Create campaign (protected, strictly company owner / platform admin)
app.post(['/campaigns', '/api/campaigns'], requireAuth, requireCompanyOwnerOrPlatformAdmin, async (req, res) => {
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

// REST: Get leads for a campaign (protected and strictly scoped to caller visibility)
app.get(['/campaigns/:id/leads', '/api/campaigns/:id/leads'], requireAuth, async (req, res) => {
  const caller = (req as any).user;
  const tenantId = caller?.tenantId;
  if (!tenantId) {
    res.status(401).json({ error: 'Unauthorized: missing tenant identity' });
    return;
  }
  const campaign = await getCampaignById(req.params.id, tenantId);
  if (!campaign) {
    res.status(404).json({ error: 'Campaign not found in your organization.' });
    return;
  }
  const isPlatform = isPlatformRole(caller.role);
  const isCompanyAdmin = isCompanyOwner(caller.role);

  if (!isPlatform && !isCompanyAdmin) {
    const scopedFilter = await getScopedLeadFilterSql(caller, tenantId, '', 3);
    const leads = await db.queryAll(
      `SELECT * FROM leads WHERE "campaignId" = $1 AND "tenantId" = $2 AND status != 'ARCHIVED'${scopedFilter.sql}`,
      [req.params.id, tenantId, ...scopedFilter.params]
    );
    res.json(leads);
    return;
  }

  res.json(await getLeads(req.params.id, tenantId));
});

// REST: Global Leads search & pagination (protected)
app.get(['/leads', '/api/leads', '/api/crm/leads', '/api/scraped-leads'], requireAuth, requirePermission(['leads:view', 'crm:view']), async (req, res) => {
  try {
    const caller = (req as any).user;
    const tenantId = caller?.tenantId || (isPlatformRole(caller?.role) ? 'tenant_default' : null);
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
      SELECT l.id, l.name, l.phone, l.status, l.outcome, l.duration, l."createdAt", l."campaignId", l."assignedTo",
             c.name as "campaignName"
      FROM leads l
      LEFT JOIN campaigns c ON l."campaignId" = c.id
      WHERE l."tenantId" = $1 AND l.status != 'ARCHIVED'
    `;
    const params: any[] = [tenantId];

    // Access Scoping (Platform -> Platform, Admin -> Tenant, Team Lead -> Team, User -> OWN / Team Policy)
    const isPlatform = isPlatformRole(caller.role);
    const isCompanyAdmin = isCompanyOwner(caller.role);
    const isTeamLead = caller.role === 'team_lead';

    let scopeSql = '';
    const scopeParams: any[] = [];
    if (!isPlatform && !isCompanyAdmin) {
      if (isTeamLead) {
        // Team Lead lead visibility:
        // Must strictly scope to: lead.assignedTo IN membersOfTeamsLedByCurrentUser plus Team Lead's own assigned leads.
        // No unassigned leads leak (fail closed).
        const teamUserIds = await getTeamLeadScopedUserIds(caller.id, tenantId);
        const phs = teamUserIds.map((_, i) => `$${params.length + 1 + i}`).join(', ');
        scopeSql = ` AND l."assignedTo" IN (${phs})`;
        scopeParams.push(...teamUserIds);
        params.push(...teamUserIds);
      } else {
        // Standard Member / Agent:
        // Compute policy PER TEAM via getUserTeamPeerVisibilitySets(caller.id, tenantId).
        // User always sees own assigned leads: l."assignedTo" = caller.id
        // Plus any peers granted by TEAM_READ or TEAM_COLLABORATE.
        // NO unassigned leads leak (unassigned leads excluded).
        const { readablePeerUserIds } = await getUserTeamPeerVisibilitySets(caller.id, tenantId);
        if (readablePeerUserIds.length > 0) {
          const visibleUserIds = [caller.id, ...readablePeerUserIds];
          const phs = visibleUserIds.map((_, i) => `$${params.length + 1 + i}`).join(', ');
          scopeSql = ` AND l."assignedTo" IN (${phs})`;
          scopeParams.push(...visibleUserIds);
          params.push(...visibleUserIds);
        } else {
          // Strict OWN: only assigned to current user
          scopeSql = ` AND l."assignedTo" = $${params.length + 1}`;
          scopeParams.push(caller.id);
          params.push(caller.id);
        }
      }
    }

    query += scopeSql;

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
    if (scopeSql) {
      // Re-index scopeSql placeholders for countParams
      let countScopeSql = scopeSql;
      // Since countParams starts with [tenantId], scopeParams are indices $2 ... $1+scopeParams.length
      // scopeSql was constructed with params.length which was 1, so the placeholders $2, $3... match countParams!
      countQuery += countScopeSql;
      countParams.push(...scopeParams);
    }
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
      name: r.name || 'Unknown Contact',
      source: r.campaignName || 'Lead Queue',
      businessName: r.name || 'Unknown Contact',
      phone: r.phone || '',
      email: null,
      address: null,
      website: null,
      status: r.status === 'COMPLETED' ? 'converted' : (r.status === 'PENDING' ? 'new' : (r.status || 'contacted')),
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

// REST: Update lead status or assignment (protected)
app.patch(['/leads/:id', '/api/leads/:id'], requireAuth, requirePermission(['leads:edit', 'crm:edit']), async (req, res) => {
  try {
    const caller = (req as any).user;
    const tenantId = caller?.tenantId;
    if (!tenantId) {
      res.status(401).json({ error: 'Unauthorized: missing tenant identity' });
      return;
    }
    const { status, assignedTo } = req.body;
    if (!status && assignedTo === undefined) {
      res.status(400).json({ error: 'Status or assignedTo is required' });
      return;
    }

    const isPlatform = isPlatformRole(caller.role);
    const isCompanyAdmin = isCompanyOwner(caller);
    const isLeadSupervisor = isTeamLead(caller);

    // Verify access to update this specific lead
    const targetLead = await db.queryOne<{ id: string; assignedTo?: string; campaignId?: string }>(
      `SELECT id, "assignedTo", "campaignId" FROM leads WHERE id = $1 AND "tenantId" = $2`,
      [req.params.id, tenantId]
    );
    if (!targetLead) {
      res.status(404).json({ error: 'Lead not found in your organization.' });
      return;
    }

    // Reassignment guard: Only Platform Owner, Company Owner, or Team Lead can reassign leads.
    // Standard members can NEVER change assignedTo (neither reassign nor set to null).
    if (assignedTo !== undefined) {
      if (!isPlatform && !isCompanyAdmin && !isLeadSupervisor) {
        res.status(403).json({ error: 'Forbidden: Standard members cannot reassign leads.' });
        return;
      }
      if (assignedTo && typeof assignedTo === 'string' && assignedTo.trim() !== '') {
        const targetUser = await db.queryOne<{ id: string; tenantId: string }>(
          `SELECT id, "tenantId" FROM users WHERE id = $1 AND "tenantId" = $2 AND LOWER(role) NOT IN ('platform_admin', 'master_admin', 'super_admin')`,
          [assignedTo.trim(), tenantId]
        );
        if (!targetUser) {
          res.status(400).json({ error: 'Invalid assigned user: user not found in this workspace or is a platform administrator.' });
          return;
        }
      }
      if (isLeadSupervisor) {
        // Team Lead must assign to a real user in a team they lead; unassignment (null/empty) is forbidden
        if (!assignedTo || typeof assignedTo !== 'string' || assignedTo.trim() === '') {
          res.status(400).json({ error: 'Team Lead cannot unassign leads. A valid member ID from a team you lead is required.' });
          return;
        }
        const teamUserIds = await getTeamLeadScopedUserIds(caller.id, tenantId);
        if (!teamUserIds.includes(assignedTo)) {
          res.status(403).json({ error: 'Forbidden: Team Lead cannot reassign leads to users outside their led teams.' });
          return;
        }
      }
    }

    // Edit permission guard: use central canEditLead helper (no campaign bypass)
    const canEdit = await canEditLead(caller, targetLead, tenantId);
    if (!canEdit) {
      res.status(403).json({ error: 'Forbidden: Cannot edit leads outside your authorized scope.' });
      return;
    }

    const updates: string[] = [];
    const params: any[] = [];
    let idx = 1;

    if (status) {
      updates.push(`status = $${idx++}`);
      params.push(status);
    }
    if (assignedTo !== undefined) {
      updates.push(`"assignedTo" = $${idx++}`);
      params.push(assignedTo);
    }

    params.push(req.params.id, tenantId);
    await db.execute(`UPDATE leads SET ${updates.join(', ')} WHERE id = $${idx++} AND "tenantId" = $${idx}`, params);

    io.to(`tenant_${tenantId}`).emit('leads:updated');
    res.json({ success: true, message: 'Lead updated successfully.' });
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

    const caller = (req as any).user;
    const isPlatform = isPlatformRole(caller.role);
    const isCompanyAdmin = isCompanyOwner(caller.role);

    let leads: any[] = [];
    if (!isPlatform && !isCompanyAdmin) {
      const scopedFilter = await getScopedLeadFilterSql(caller, tenantId, '', 3);
      leads = await db.queryAll(
        `SELECT * FROM leads WHERE "campaignId" = $1 AND "tenantId" = $2 AND status != 'ARCHIVED'${scopedFilter.sql} ORDER BY "createdAt" ASC, "id" ASC`,
        [campaignId, tenantId, ...scopedFilter.params]
      );
    } else {
      leads = await db.queryAll(
        `SELECT * FROM leads WHERE "campaignId" = $1 AND "tenantId" = $2 AND status != 'ARCHIVED' ORDER BY "createdAt" ASC, "id" ASC`,
        [campaignId, tenantId]
      );
    }

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

// ============================================================================
// CORE CRM WORKSPACE APIS (PHASE 1)
// ============================================================================

async function validateTenantAssignee(assignedUserId: string | null | undefined, tenantId: string): Promise<string | null> {
  if (!assignedUserId || typeof assignedUserId !== 'string' || !assignedUserId.trim()) {
    return null;
  }
  const cleanId = assignedUserId.trim();
  const row = await db.queryOne<{ id: string }>(
    `SELECT id FROM users WHERE id = $1 AND "tenantId" = $2 AND LOWER(role) NOT IN ('platform_admin', 'master_admin', 'super_admin')`,
    [cleanId, tenantId]
  );
  if (!row) {
    throw new Error('Invalid assigned user: user not found in this workspace or is a platform administrator.');
  }
  return row.id;
}


// 1. GET /api/crm/overview: Aggregated CRM metrics with date-range presets
app.get('/api/crm/overview', requireAuth, requirePermission(['crm:view', 'leads:view']), async (req, res) => {
  try {
    const user = (req as any).user;
    const tenantId = user?.tenantId;
    if (!tenantId) {
      res.status(401).json({ error: 'Unauthorized: missing tenant identity' });
      return;
    }

    const range = (req.query.range as string) || 'all';
    const now = new Date();
    let startDate: Date | null = null;
    let endDate: Date | null = null;

    if (range === 'today') {
      startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0);
      endDate = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
    } else if (range === 'yesterday') {
      const y = new Date(now.getTime() - 86400000);
      startDate = new Date(y.getFullYear(), y.getMonth(), y.getDate(), 0, 0, 0);
      endDate = new Date(y.getFullYear(), y.getMonth(), y.getDate(), 23, 59, 59, 999);
    } else if (range === '7d') {
      startDate = new Date(now.getTime() - 7 * 86400000);
      endDate = now;
    } else if (range === '30d') {
      startDate = new Date(now.getTime() - 30 * 86400000);
      endDate = now;
    } else if (range === 'this_month') {
      startDate = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0);
      endDate = now;
    } else if (range === 'last_month') {
      startDate = new Date(now.getFullYear(), now.getMonth() - 1, 1, 0, 0, 0);
      endDate = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999);
    } else if (req.query.startDate && req.query.endDate) {
      startDate = new Date(req.query.startDate as string);
      endDate = new Date(req.query.endDate as string);
    }

    const scopedUserIds = await getScopedCrmUserIds(user, tenantId);

    // Helpers to build scoping clause
    const userScopeSql = (colName: string, params: any[]) => {
      if (!scopedUserIds) return '';
      const phs = scopedUserIds.map((_, i) => `$${params.length + 1 + i}`).join(', ');
      params.push(...scopedUserIds);
      return ` AND (${colName} IN (${phs}) OR ${colName} IS NULL)`;
    };

    // 1. Companies count
    const compParams: any[] = [tenantId];
    let compSql = `SELECT COUNT(*) as count FROM crm_companies WHERE "tenantId" = $1`;
    compSql += userScopeSql('"assignedUserId"', compParams);
    const compRow = await db.queryOne<{ count: string | number }>(compSql, compParams);
    const totalCompanies = parseInt(String(compRow?.count || '0'), 10);

    // 2. Leads count
    const leadParams: any[] = [tenantId];
    let leadSql = `SELECT COUNT(*) as count FROM leads WHERE "tenantId" = $1`;
    leadSql += userScopeSql('"assignedTo"', leadParams);
    const leadRow = await db.queryOne<{ count: string | number }>(leadSql, leadParams);
    const totalLeads = parseInt(String(leadRow?.count || '0'), 10);

    // 3. Tasks counts (total, overdue, meetings, open)
    const taskParams: any[] = [tenantId];
    let taskSql = `SELECT * FROM crm_tasks WHERE "tenantId" = $1`;
    taskSql += userScopeSql('"assignedUserId"', taskParams);
    const tasks = await db.queryAll<any>(taskSql, taskParams);

    const nowIso = now.toISOString();
    const openTasks = tasks.filter(t => t.status === 'open');
    const overdueTasks = openTasks.filter(t => t.dueAt < nowIso);
    const meetings = tasks.filter(t => t.taskType === 'meeting' || t.taskType === 'online_meeting');

    // Due today tasks
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
    const endOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999).toISOString();
    const dueTodayTasks = openTasks.filter(t => t.dueAt >= startOfToday && t.dueAt <= endOfToday);

    // 4. Follow-ups (bridge)
    const fuParams: any[] = [tenantId];
    const fuRows = await db.queryAll<any>(`SELECT * FROM crm_follow_ups WHERE "tenantId" = $1`, fuParams);
    const openFollowUps = fuRows.filter(f => f.status === 'pending');

    // 5. Recent Activity Stream
    const recentNotes = await db.queryAll<any>(`
      SELECT id, category as "eventType", body as description, "createdByName" as username, "createdAt", 'NOTE' as source, "entityType", "entityId"
      FROM crm_notes
      WHERE "tenantId" = $1
      ORDER BY "createdAt" DESC
      LIMIT 10
    `, [tenantId]);

    res.json({
      metrics: {
        totalCompanies,
        totalLeads,
        openTasks: openTasks.length,
        overdueTasks: overdueTasks.length,
        totalMeetings: meetings.length,
        dueTodayTasks: dueTodayTasks.length,
        openFollowUps: openFollowUps.length
      },
      dueTodayTasks: dueTodayTasks.slice(0, 10),
      recentActivity: recentNotes
    });
  } catch (err: any) {
    console.error('Error fetching CRM overview:', err);
    res.status(500).json({ error: 'Internal server error while fetching CRM overview' });
  }
});

// 2. CRM COMPANIES CRUD
// GET /api/crm/companies
app.get('/api/crm/companies', requireAuth, requirePermission(['crm:view']), async (req, res) => {
  try {
    const user = (req as any).user;
    const tenantId = user?.tenantId;
    if (!tenantId) {
      res.status(401).json({ error: 'Unauthorized: missing tenant identity' });
      return;
    }

    const { status, paymentStatus, country, assignedUserId, search } = req.query as Record<string, string>;
    const scopedUserIds = await getScopedCrmUserIds(user, tenantId);

    let sql = `SELECT * FROM crm_companies WHERE "tenantId" = $1`;
    const params: any[] = [tenantId];

    if (status && status !== 'All') {
      sql += ` AND status = $${params.length + 1}`;
      params.push(status);
    }
    if (paymentStatus && paymentStatus !== 'All') {
      sql += ` AND "paymentStatus" = $${params.length + 1}`;
      params.push(paymentStatus);
    }
    if (country) {
      sql += ` AND country = $${params.length + 1}`;
      params.push(country);
    }
    if (assignedUserId) {
      sql += ` AND "assignedUserId" = $${params.length + 1}`;
      params.push(assignedUserId);
    }
    if (scopedUserIds) {
      const phs = scopedUserIds.map((_, i) => `$${params.length + 1 + i}`).join(', ');
      sql += ` AND ("assignedUserId" IN (${phs}) OR "assignedUserId" IS NULL)`;
      params.push(...scopedUserIds);
    }
    if (search && search.trim()) {
      const q = `%${search.trim().toLowerCase()}%`;
      sql += ` AND (LOWER(name) LIKE $${params.length + 1} OR LOWER(COALESCE(email, '')) LIKE $${params.length + 1} OR LOWER(COALESCE(phone, '')) LIKE $${params.length + 1})`;
      params.push(q);
    }

    sql += ` ORDER BY "createdAt" DESC LIMIT 200`;
    const companies = await db.queryAll(sql, params);
    res.json({ companies });
  } catch (err: any) {
    console.error('Error fetching CRM companies:', err);
    res.status(500).json({ error: 'Internal server error while fetching CRM companies' });
  }
});

// POST /api/crm/companies
app.post('/api/crm/companies', requireAuth, requirePermission(['crm:edit', 'crm:create']), async (req, res) => {
  try {
    const user = (req as any).user;
    const tenantId = user?.tenantId;
    if (!tenantId) {
      res.status(401).json({ error: 'Unauthorized: missing tenant identity' });
      return;
    }

    const { name, industry, country, phone, email, website, address, status, paymentStatus, assignedUserId, metadata } = req.body;
    if (!name || !name.trim()) {
      res.status(400).json({ error: 'Company name is required.' });
      return;
    }

    let finalAssignedUserId: string | null = null;
    try {
      finalAssignedUserId = assignedUserId ? await validateTenantAssignee(assignedUserId, tenantId) : (!isPlatformRole(user.role) ? user.id : null);
    } catch (e: any) {
      res.status(400).json({ error: e.message });
      return;
    }

    const id = `comp_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const now = new Date().toISOString();

    await db.execute(`
      INSERT INTO crm_companies (id, "tenantId", name, industry, country, phone, email, website, address, status, "paymentStatus", "assignedUserId", metadata, "createdAt", "updatedAt")
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $14)
    `, [
      id,
      tenantId,
      name.trim(),
      industry || null,
      country || null,
      phone || null,
      email || null,
      website || null,
      address || null,
      status || 'Active',
      paymentStatus || 'Trial',
      finalAssignedUserId,
      metadata ? JSON.stringify(metadata) : null,
      now
    ]);

    if (req.body.initialContact && req.body.initialContact.name) {
      const contactId = `cnt_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
      await db.execute(`
        INSERT INTO crm_contacts (id, "tenantId", "crmCompanyId", name, email, phone, "roleTitle", notes, "assignedUserId", "createdAt", "updatedAt")
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $10)
      `, [
        contactId,
        tenantId,
        id,
        req.body.initialContact.name.trim(),
        req.body.initialContact.email || null,
        req.body.initialContact.phone || null,
        req.body.initialContact.roleTitle || null,
        req.body.initialContact.notes || null,
        finalAssignedUserId,
        now
      ]);
    }

    if (req.body.initialNote && req.body.initialNote.trim()) {
      await recordCrmNote({
        tenantId,
        entityType: 'crm_company',
        entityId: id,
        category: 'general',
        body: req.body.initialNote.trim(),
        createdByUserId: user.id,
        createdByName: user.username
      });
    } else {
      await recordCrmNote({
        tenantId,
        entityType: 'crm_company',
        entityId: id,
        category: 'general',
        body: `Company record created by ${user.username}`,
        createdByUserId: user.id,
        createdByName: user.username
      });
    }

    const company = await db.queryOne(`SELECT * FROM crm_companies WHERE id = $1 AND "tenantId" = $2`, [id, tenantId]);
    res.json({ success: true, company });
  } catch (err: any) {
    console.error('Error creating CRM company:', err);
    res.status(500).json({ error: 'Internal server error while creating company' });
  }
});

// GET /api/crm/companies/:id
app.get('/api/crm/companies/:id', requireAuth, requirePermission(['crm:view']), async (req, res) => {
  try {
    const user = (req as any).user;
    const tenantId = user?.tenantId;
    if (!tenantId) {
      res.status(401).json({ error: 'Unauthorized: missing tenant identity' });
      return;
    }
    const companyId = req.params.id;
    const company = await db.queryOne<any>(`SELECT * FROM crm_companies WHERE id = $1 AND "tenantId" = $2`, [companyId, tenantId]);
    if (!company) {
      res.status(404).json({ error: 'Company not found in your organization.' });
      return;
    }

    const contacts = await db.queryAll(`SELECT * FROM crm_contacts WHERE "crmCompanyId" = $1 AND "tenantId" = $2 ORDER BY "createdAt" DESC`, [companyId, tenantId]);
    const leads = await db.queryAll(`SELECT * FROM leads WHERE "crmCompanyId" = $1 AND "tenantId" = $2 ORDER BY "createdAt" DESC`, [companyId, tenantId]);
    const tasks = await db.queryAll(`SELECT * FROM crm_tasks WHERE "crmCompanyId" = $1 AND "tenantId" = $2 ORDER BY "dueAt" ASC`, [companyId, tenantId]);
    const notes = await db.queryAll(`SELECT * FROM crm_notes WHERE "entityId" = $1 AND "tenantId" = $2 ORDER BY "createdAt" DESC`, [companyId, tenantId]);

    res.json({
      company,
      contacts,
      leads,
      tasks,
      notes
    });
  } catch (err: any) {
    console.error('Error fetching company details:', err);
    res.status(500).json({ error: 'Internal server error while fetching company details' });
  }
});

// PUT /api/crm/companies/:id
app.put('/api/crm/companies/:id', requireAuth, requirePermission(['crm:edit']), async (req, res) => {
  try {
    const user = (req as any).user;
    const tenantId = user?.tenantId;
    if (!tenantId) {
      res.status(401).json({ error: 'Unauthorized: missing tenant identity' });
      return;
    }
    const companyId = req.params.id;
    const { name, industry, country, phone, email, website, address, status, paymentStatus, assignedUserId } = req.body;

    const existing = await db.queryOne(`SELECT id FROM crm_companies WHERE id = $1 AND "tenantId" = $2`, [companyId, tenantId]);
    if (!existing) {
      res.status(404).json({ error: 'Company not found.' });
      return;
    }

    let finalAssignedUserId = assignedUserId;
    if (assignedUserId !== undefined && assignedUserId !== null && assignedUserId !== '') {
      try {
        finalAssignedUserId = await validateTenantAssignee(assignedUserId, tenantId);
      } catch (e: any) {
        res.status(400).json({ error: e.message });
        return;
      }
    }

    const now = new Date().toISOString();
    await db.execute(`
      UPDATE crm_companies
      SET name = COALESCE($1, name),
          industry = COALESCE($2, industry),
          country = COALESCE($3, country),
          phone = COALESCE($4, phone),
          email = COALESCE($5, email),
          website = COALESCE($6, website),
          address = COALESCE($7, address),
          status = COALESCE($8, status),
          "paymentStatus" = COALESCE($9, "paymentStatus"),
          "assignedUserId" = COALESCE($10, "assignedUserId"),
          "updatedAt" = $11
      WHERE id = $12 AND "tenantId" = $13
    `, [name, industry, country, phone, email, website, address, status, paymentStatus, finalAssignedUserId, now, companyId, tenantId]);

    const updated = await db.queryOne(`SELECT * FROM crm_companies WHERE id = $1 AND "tenantId" = $2`, [companyId, tenantId]);
    res.json({ success: true, company: updated });
  } catch (err: any) {
    console.error('Error updating company:', err);
    res.status(500).json({ error: 'Internal server error while updating company' });
  }
});

// DELETE /api/crm/companies/:id
app.delete('/api/crm/companies/:id', requireAuth, requirePermission(['crm:edit']), async (req, res) => {
  try {
    const user = (req as any).user;
    const tenantId = user?.tenantId;
    if (!tenantId) {
      res.status(401).json({ error: 'Unauthorized: missing tenant identity' });
      return;
    }
    const companyId = req.params.id;
    await db.execute(`DELETE FROM crm_companies WHERE id = $1 AND "tenantId" = $2`, [companyId, tenantId]);
    res.json({ success: true, message: 'Company removed successfully.' });
  } catch (err: any) {
    console.error('Error deleting company:', err);
    res.status(500).json({ error: 'Internal server error while deleting company' });
  }
});

// 3. CRM CONTACTS CRUD
// GET /api/crm/contacts
app.get('/api/crm/contacts', requireAuth, requirePermission(['crm:view']), async (req, res) => {
  try {
    const user = (req as any).user;
    const tenantId = user?.tenantId;
    if (!tenantId) {
      res.status(401).json({ error: 'Unauthorized: missing tenant identity' });
      return;
    }

    const { crmCompanyId, search, assignedUserId } = req.query as Record<string, string>;
    const scopedUserIds = await getScopedCrmUserIds(user, tenantId);

    let sql = `
      SELECT ct.*, co.name as "companyName"
      FROM crm_contacts ct
      LEFT JOIN crm_companies co ON ct."crmCompanyId" = co.id
      WHERE ct."tenantId" = $1
    `;
    const params: any[] = [tenantId];

    if (crmCompanyId) {
      sql += ` AND ct."crmCompanyId" = $${params.length + 1}`;
      params.push(crmCompanyId);
    }
    if (assignedUserId) {
      sql += ` AND ct."assignedUserId" = $${params.length + 1}`;
      params.push(assignedUserId);
    }
    if (scopedUserIds) {
      const phs = scopedUserIds.map((_, i) => `$${params.length + 1 + i}`).join(', ');
      sql += ` AND (ct."assignedUserId" IN (${phs}) OR ct."assignedUserId" IS NULL)`;
      params.push(...scopedUserIds);
    }
    if (search && search.trim()) {
      const q = `%${search.trim().toLowerCase()}%`;
      sql += ` AND (LOWER(ct.name) LIKE $${params.length + 1} OR LOWER(COALESCE(ct.email, '')) LIKE $${params.length + 1} OR LOWER(COALESCE(ct.phone, '')) LIKE $${params.length + 1} OR LOWER(COALESCE(co.name, '')) LIKE $${params.length + 1})`;
      params.push(q);
    }

    sql += ` ORDER BY ct."createdAt" DESC LIMIT 200`;
    const contacts = await db.queryAll(sql, params);
    res.json({ contacts });
  } catch (err: any) {
    console.error('Error fetching contacts:', err);
    res.status(500).json({ error: 'Internal server error while fetching contacts' });
  }
});

// POST /api/crm/contacts
app.post('/api/crm/contacts', requireAuth, requirePermission(['crm:edit', 'crm:create']), async (req, res) => {
  try {
    const user = (req as any).user;
    const tenantId = user?.tenantId;
    if (!tenantId) {
      res.status(401).json({ error: 'Unauthorized: missing tenant identity' });
      return;
    }

    const { crmCompanyId, name, email, phone, roleTitle, notes, assignedUserId } = req.body;
    if (!name || !name.trim()) {
      res.status(400).json({ error: 'Contact name is required.' });
      return;
    }

    let finalAssignedUserId: string | null = null;
    try {
      finalAssignedUserId = assignedUserId ? await validateTenantAssignee(assignedUserId, tenantId) : (!isPlatformRole(user.role) ? user.id : null);
    } catch (e: any) {
      res.status(400).json({ error: e.message });
      return;
    }

    const id = `cnt_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const now = new Date().toISOString();

    await db.execute(`
      INSERT INTO crm_contacts (id, "tenantId", "crmCompanyId", name, email, phone, "roleTitle", notes, "assignedUserId", "createdAt", "updatedAt")
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $10)
    `, [
      id,
      tenantId,
      crmCompanyId || null,
      name.trim(),
      email ? email.trim() : null,
      phone ? phone.trim() : null,
      roleTitle || null,
      notes || null,
      finalAssignedUserId,
      now
    ]);

    const contact = await db.queryOne(`
      SELECT ct.*, co.name as "companyName"
      FROM crm_contacts ct
      LEFT JOIN crm_companies co ON ct."crmCompanyId" = co.id
      WHERE ct.id = $1 AND ct."tenantId" = $2
    `, [id, tenantId]);

    res.json({ success: true, contact });
  } catch (err: any) {
    console.error('Error creating contact:', err);
    res.status(500).json({ error: 'Internal server error while creating contact' });
  }
});

// GET /api/crm/contacts/:id
app.get('/api/crm/contacts/:id', requireAuth, requirePermission(['crm:view']), async (req, res) => {
  try {
    const user = (req as any).user;
    const tenantId = user?.tenantId;
    if (!tenantId) {
      res.status(401).json({ error: 'Unauthorized: missing tenant identity' });
      return;
    }
    const id = req.params.id;
    const contact = await db.queryOne<any>(`
      SELECT ct.*, co.name as "companyName"
      FROM crm_contacts ct
      LEFT JOIN crm_companies co ON ct."crmCompanyId" = co.id
      WHERE ct.id = $1 AND ct."tenantId" = $2
    `, [id, tenantId]);

    if (!contact) {
      res.status(404).json({ error: 'Contact not found.' });
      return;
    }

    const tasks = await db.queryAll(`SELECT * FROM crm_tasks WHERE "contactId" = $1 AND "tenantId" = $2 ORDER BY "dueAt" ASC`, [id, tenantId]);
    const notes = await db.queryAll(`SELECT * FROM crm_notes WHERE "entityId" = $1 AND "tenantId" = $2 ORDER BY "createdAt" DESC`, [id, tenantId]);

    res.json({ contact, tasks, notes });
  } catch (err: any) {
    console.error('Error fetching contact:', err);
    res.status(500).json({ error: 'Internal server error while fetching contact' });
  }
});

// PUT /api/crm/contacts/:id
app.put('/api/crm/contacts/:id', requireAuth, requirePermission(['crm:edit']), async (req, res) => {
  try {
    const user = (req as any).user;
    const tenantId = user?.tenantId;
    if (!tenantId) {
      res.status(401).json({ error: 'Unauthorized: missing tenant identity' });
      return;
    }
    const id = req.params.id;
    const { name, email, phone, roleTitle, notes, crmCompanyId, assignedUserId } = req.body;

    let finalAssignedUserId = assignedUserId;
    if (assignedUserId !== undefined && assignedUserId !== null && assignedUserId !== '') {
      try {
        finalAssignedUserId = await validateTenantAssignee(assignedUserId, tenantId);
      } catch (e: any) {
        res.status(400).json({ error: e.message });
        return;
      }
    }

    const now = new Date().toISOString();
    await db.execute(`
      UPDATE crm_contacts
      SET name = COALESCE($1, name),
          email = COALESCE($2, email),
          phone = COALESCE($3, phone),
          "roleTitle" = COALESCE($4, "roleTitle"),
          notes = COALESCE($5, notes),
          "crmCompanyId" = COALESCE($6, "crmCompanyId"),
          "assignedUserId" = COALESCE($7, "assignedUserId"),
          "updatedAt" = $8
      WHERE id = $9 AND "tenantId" = $10
    `, [name, email, phone, roleTitle, notes, crmCompanyId, finalAssignedUserId, now, id, tenantId]);

    const updated = await db.queryOne(`SELECT * FROM crm_contacts WHERE id = $1 AND "tenantId" = $2`, [id, tenantId]);
    res.json({ success: true, contact: updated });
  } catch (err: any) {
    console.error('Error updating contact:', err);
    res.status(500).json({ error: 'Internal server error while updating contact' });
  }
});

// DELETE /api/crm/contacts/:id
app.delete('/api/crm/contacts/:id', requireAuth, requirePermission(['crm:edit']), async (req, res) => {
  try {
    const user = (req as any).user;
    const tenantId = user?.tenantId;
    if (!tenantId) {
      res.status(401).json({ error: 'Unauthorized: missing tenant identity' });
      return;
    }
    const id = req.params.id;
    await db.execute(`DELETE FROM crm_contacts WHERE id = $1 AND "tenantId" = $2`, [id, tenantId]);
    res.json({ success: true, message: 'Contact deleted successfully.' });
  } catch (err: any) {
    console.error('Error deleting contact:', err);
    res.status(500).json({ error: 'Internal server error while deleting contact' });
  }
});

// 4. CANONICAL LEADS DIRECT CRM CREATION
// POST /api/crm/leads
app.post('/api/crm/leads', requireAuth, requirePermission(['leads:create', 'crm:create']), async (req, res) => {
  try {
    const user = (req as any).user;
    const tenantId = user?.tenantId;
    if (!tenantId) {
      res.status(401).json({ error: 'Unauthorized: missing tenant identity' });
      return;
    }

    const { name, phone, email, address, campaignId, crmCompanyId, contactId, requirement, country, assignedTo, companyName, task } = req.body;
    if (!name || !phone) {
      res.status(400).json({ error: 'Lead name and phone number are required.' });
      return;
    }

    // Auto-link or create company if companyName provided
    let targetCompanyId = crmCompanyId;
    if (!targetCompanyId && companyName && companyName.trim()) {
      const cleanCompName = companyName.trim();
      const existingComp = await db.queryOne<{ id: string }>(
        `SELECT id FROM crm_companies WHERE "tenantId" = $1 AND LOWER(name) = LOWER($2) LIMIT 1`,
        [tenantId, cleanCompName]
      );
      if (existingComp) {
        targetCompanyId = existingComp.id;
      } else {
        const newCompId = 'comp_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7);
        await db.execute(
          `INSERT INTO crm_companies (id, "tenantId", name, status, "createdAt", "updatedAt") VALUES ($1, $2, $3, 'Active', $4, $4)`,
          [newCompId, tenantId, cleanCompName, new Date().toISOString()]
        );
        targetCompanyId = newCompId;
      }
    }

    // Default campaign if none specified
    let targetCampaignId = campaignId;
    if (!targetCampaignId) {
      const defaultCamp = await db.queryOne<{ id: string }>(`SELECT id FROM campaigns WHERE "tenantId" = $1 ORDER BY "createdAt" ASC LIMIT 1`, [tenantId]);
      targetCampaignId = defaultCamp?.id || 'camp_default';
    }

    const leadId = `lead_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const now = new Date().toISOString();
    const cleanPhone = normalizePhone(phone);
    const initialStatus = (req.body.pipelineStatus?.trim() || req.body.status?.trim() || 'PENDING').toUpperCase();

    await db.execute(`
      INSERT INTO leads (id, "campaignId", name, phone, status, "createdAt", "tenantId", address, "crmCompanyId", "contactId", requirement, country, "assignedTo", email)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
    `, [
      leadId,
      targetCampaignId,
      name.trim(),
      cleanPhone,
      initialStatus,
      now,
      tenantId,
      address || null,
      targetCompanyId || null,
      contactId || null,
      requirement || null,
      country || null,
      assignedTo || user.id,
      email ? email.trim() : null
    ]);

    await recordLeadActivity({
      leadId,
      tenantId,
      userId: user.id,
      username: user.username,
      eventType: 'LEAD_CREATED',
      description: `Lead created manually via CRM${requirement ? ': ' + requirement : ''}`
    });

    let createdTaskId: string | null = null;
    if (task && task.title && task.dueAt) {
      const parsedDueAt = new Date(task.dueAt).getTime();
      const safeDueAt = !isNaN(parsedDueAt) ? new Date(parsedDueAt).toISOString() : new Date(Date.now() + 30 * 60000).toISOString();
      createdTaskId = 'task_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7);
      await db.execute(`
        INSERT INTO crm_tasks (id, "tenantId", title, description, "taskType", status, priority, "dueAt", "leadId", "crmCompanyId", "createdByUserId", "assignedUserId", "createdAt", "updatedAt")
        VALUES ($1, $2, $3, $4, $5, 'open', $6, $7, $8, $9, $10, $11, $12, $12)
      `, [
        createdTaskId,
        tenantId,
        task.title.trim(),
        task.description ? task.description.trim() : null,
        task.taskType || 'call',
        task.priority || 'medium',
        safeDueAt,
        leadId,
        targetCompanyId || null,
        user.id,
        user.id,
        now
      ]);
      await recordLeadActivity({
        leadId,
        tenantId,
        userId: user.id,
        username: user.username,
        eventType: 'TASK_CREATED',
        description: `Task scheduled: ${task.title} (Due: ${task.dueAt})`
      });
      io.to(`tenant_${tenantId}`).emit('crm:tasks:updated');
    }

    const lead = await db.queryOne(`SELECT * FROM leads WHERE id = $1 AND "tenantId" = $2`, [leadId, tenantId]);
    logUserActivity({
      tenantId,
      userId: user.id,
      username: user.username,
      action: 'LEAD_CREATED',
      resourceType: 'lead',
      resourceId: leadId,
      details: { leadName: name.trim(), phone: cleanPhone, companyName: companyName || null },
      req
    });
    res.json({ success: true, lead, taskId: createdTaskId });
  } catch (err: any) {
    console.error('Error creating CRM lead:', err);
    res.status(500).json({ error: 'Internal server error while creating lead' });
  }
});

// REST: Get single lead by ID with strict scoping guard (protected)
app.get(['/leads/:id', '/api/leads/:id', '/api/crm/leads/:id'], requireAuth, requirePermission(['leads:view', 'crm:view']), async (req, res, next) => {
  if (req.params.id === 'export') {
    return next();
  }
  try {
    const tenantId = (req as any).user?.tenantId;
    if (!tenantId) {
      res.status(401).json({ error: 'Unauthorized: missing tenant identity' });
      return;
    }
    const leadId = req.params.id;
    const lead = await db.queryOne<any>(`
      SELECT l.*, c.name as "campaignName", co.name as "crmCompanyName", ct.name as "crmContactName"
      FROM leads l
      LEFT JOIN campaigns c ON l."campaignId" = c.id
      LEFT JOIN crm_companies co ON l."crmCompanyId" = co.id
      LEFT JOIN crm_contacts ct ON l."contactId" = ct.id
      WHERE l.id = $1 AND l."tenantId" = $2
    `, [leadId, tenantId]);

    if (!lead) {
      res.status(404).json({ error: 'Lead not found in your organization.' });
      return;
    }

    const caller = (req as any).user;
    const canRead = await canReadLead(caller, lead, tenantId);
    if (!canRead) {
      res.status(403).json({ error: 'Forbidden: You do not have permission to view this lead.' });
      return;
    }

    res.json({ success: true, lead });
  } catch (err: any) {
    console.error('Error fetching lead:', err);
    res.status(500).json({ error: 'Internal server error while fetching lead' });
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
      SELECT l.*, c.name as "campaignName", co.name as "crmCompanyName", ct.name as "crmContactName"
      FROM leads l
      LEFT JOIN campaigns c ON l."campaignId" = c.id
      LEFT JOIN crm_companies co ON l."crmCompanyId" = co.id
      LEFT JOIN crm_contacts ct ON l."contactId" = ct.id
      WHERE l.id = $1 AND l."tenantId" = $2
    `, [leadId, tenantId]);

    if (!lead) {
      res.status(404).json({ error: 'Lead not found in your organization.' });
      return;
    }

    const caller = (req as any).user;
    const canRead = await canReadLead(caller, lead, tenantId);
    if (!canRead) {
      res.status(403).json({ error: 'Forbidden: You do not have permission to view this lead profile.' });
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

    const tasks = await db.queryAll<any>(`
      SELECT * FROM crm_tasks
      WHERE "leadId" = $1 AND "tenantId" = $2
      ORDER BY "dueAt" ASC
    `, [leadId, tenantId]);

    const followUps = await db.queryAll<any>(`
      SELECT id, "scheduledAt", status, notes, "assignedAgent"
      FROM crm_follow_ups
      WHERE "leadId" = $1 AND "tenantId" = $2
      ORDER BY "scheduledAt" ASC
    `, [leadId, tenantId]);

    const notes = await db.queryAll<any>(`
      SELECT * FROM crm_notes
      WHERE "entityId" = $1 AND "tenantId" = $2
      ORDER BY "createdAt" DESC
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
        crmCompanyId: lead.crmCompanyId,
        crmCompanyName: lead.crmCompanyName,
        contactId: lead.contactId,
        crmContactName: lead.crmContactName,
        requirement: lead.requirement,
        country: lead.country,
        assignedTo: lead.assignedTo,
        createdAt: lead.createdAt
      },
      activities,
      callLogs,
      tasks,
      followUps,
      notes
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
    const note = (req.body?.note || req.body?.content || req.body?.body || '').trim();
    const category = req.body?.category || 'general';
    if (!note) {
      res.status(400).json({ error: 'Note content is required.' });
      return;
    }

    const lead = await getLead(leadId, tenantId);
    if (!lead) {
      res.status(404).json({ error: 'Lead not found in your organization.' });
      return;
    }
    const canEdit = await canEditLead(user, lead, tenantId);
    if (!canEdit) {
      res.status(403).json({ error: 'Forbidden: You do not have permission to add notes to this lead.' });
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

    const createdNote = await recordCrmNote({
      tenantId,
      entityType: 'lead',
      entityId: leadId,
      category,
      body: note,
      createdByUserId: user.id,
      createdByName: user.username
    });

    res.json({ success: true, message: 'Note recorded successfully.', note: createdNote });
  } catch (err: any) {
    console.error('Error recording note:', err);
    res.status(500).json({ error: 'Internal server error while recording note' });
  }
});

// 5. CRM TASKS & LIFECYCLE WORKFLOWS
// GET /api/crm/tasks
app.get('/api/crm/tasks', requireAuth, requirePermission(['crm:view']), async (req, res) => {
  try {
    const user = (req as any).user;
    const tenantId = user?.tenantId;
    if (!tenantId) {
      res.status(401).json({ error: 'Unauthorized: missing tenant identity' });
      return;
    }

    const { status, taskType, assignedUserId, crmCompanyId, leadId, search } = req.query as Record<string, string>;
    const scopedUserIds = await getScopedCrmUserIds(user, tenantId);

    let sql = `
      SELECT t.*, 
             co.name as "companyName",
             ct.name as "contactName",
             l.name as "leadName",
             l.phone as "leadPhone",
             u.username as "assigneeName"
      FROM crm_tasks t
      LEFT JOIN crm_companies co ON t."crmCompanyId" = co.id
      LEFT JOIN crm_contacts ct ON t."contactId" = ct.id
      LEFT JOIN leads l ON t."leadId" = l.id
      LEFT JOIN users u ON t."assignedUserId" = u.id
      WHERE t."tenantId" = $1
    `;
    const params: any[] = [tenantId];

    if (status && status !== 'all') {
      if (status === 'overdue') {
        sql += ` AND t.status = 'open' AND t."dueAt" < $${params.length + 1}`;
        params.push(new Date().toISOString());
      } else {
        sql += ` AND t.status = $${params.length + 1}`;
        params.push(status);
      }
    }
    if (taskType && taskType !== 'all') {
      sql += ` AND t."taskType" = $${params.length + 1}`;
      params.push(taskType);
    }
    if (assignedUserId) {
      sql += ` AND t."assignedUserId" = $${params.length + 1}`;
      params.push(assignedUserId);
    }
    if (scopedUserIds) {
      const phs = scopedUserIds.map((_, i) => `$${params.length + 1 + i}`).join(', ');
      sql += ` AND (t."assignedUserId" IN (${phs}) OR t."assignedUserId" IS NULL)`;
      params.push(...scopedUserIds);
    }
    if (crmCompanyId) {
      sql += ` AND t."crmCompanyId" = $${params.length + 1}`;
      params.push(crmCompanyId);
    }
    if (leadId) {
      sql += ` AND t."leadId" = $${params.length + 1}`;
      params.push(leadId);
    }
    if (search && search.trim()) {
      const q = `%${search.trim().toLowerCase()}%`;
      sql += ` AND (LOWER(t.title) LIKE $${params.length + 1} OR LOWER(COALESCE(t.description, '')) LIKE $${params.length + 1} OR LOWER(COALESCE(co.name, '')) LIKE $${params.length + 1} OR LOWER(COALESCE(l.name, '')) LIKE $${params.length + 1})`;
      params.push(q);
    }

    sql += ` ORDER BY t."dueAt" ASC LIMIT 200`;
    const tasks = await db.queryAll(sql, params);
    res.json({ tasks });
  } catch (err: any) {
    console.error('Error fetching tasks:', err);
    res.status(500).json({ error: 'Internal server error while fetching tasks' });
  }
});

// POST /api/crm/tasks
app.post('/api/crm/tasks', requireAuth, requirePermission(['crm:edit', 'crm:create']), async (req, res) => {
  try {
    const user = (req as any).user;
    const tenantId = user?.tenantId;
    if (!tenantId) {
      res.status(401).json({ error: 'Unauthorized: missing tenant identity' });
      return;
    }

    const { title, description, taskType, priority, dueAt, crmCompanyId, contactId, leadId, assignedUserId, assignedTeamId } = req.body;
    if (!title || !title.trim() || !dueAt) {
      res.status(400).json({ error: 'Task title and due date/time are required.' });
      return;
    }

    let finalAssignedUserId = assignedUserId || user.id;
    if (finalAssignedUserId) {
      const validTaskUser = await db.queryOne<{ id: string }>(
        `SELECT id FROM users WHERE id = $1 AND "tenantId" = $2 AND LOWER(role) NOT IN ('platform_admin', 'master_admin', 'super_admin')`,
        [finalAssignedUserId, tenantId]
      );
      if (!validTaskUser) {
        if (assignedUserId) {
          res.status(400).json({ error: 'Invalid assigned user: user not found in this workspace or is a platform administrator.' });
          return;
        } else {
          finalAssignedUserId = null;
        }
      }
    }

    const id = `task_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const now = new Date().toISOString();

    await db.execute(`
      INSERT INTO crm_tasks (id, "tenantId", title, description, "taskType", status, priority, "dueAt", "crmCompanyId", "contactId", "leadId", "assignedUserId", "assignedTeamId", "createdByUserId", "createdAt", "updatedAt")
      VALUES ($1, $2, $3, $4, $5, 'open', $6, $7, $8, $9, $10, $11, $12, $13, $14, $14)
    `, [
      id,
      tenantId,
      title.trim(),
      description || null,
      taskType || 'call',
      priority || 'medium',
      new Date(dueAt).toISOString(),
      crmCompanyId || null,
      contactId || null,
      leadId || null,
      finalAssignedUserId || null,
      assignedTeamId || null,
      user.id,
      now
    ]);

    // Also bridge to lead activity if attached to a lead
    if (leadId) {
      await recordLeadActivity({
        leadId,
        tenantId,
        userId: user.id,
        username: user.username,
        eventType: 'TASK_CREATED',
        description: `Task created: ${title} (${taskType || 'call'}) due ${new Date(dueAt).toLocaleString()}`
      });
    }

    const task = await db.queryOne(`SELECT * FROM crm_tasks WHERE id = $1 AND "tenantId" = $2`, [id, tenantId]);
    res.json({ success: true, task });
  } catch (err: any) {
    console.error('Error creating task:', err);
    res.status(500).json({ error: 'Internal server error while creating task' });
  }
});

// POST /api/crm/tasks/:id/close
app.post('/api/crm/tasks/:id/close', requireAuth, requirePermission(['crm:edit', 'calls:log_disposition']), async (req, res) => {
  try {
    const user = (req as any).user;
    const tenantId = user?.tenantId;
    if (!tenantId) {
      res.status(401).json({ error: 'Unauthorized: missing tenant identity' });
      return;
    }
    const taskId = req.params.id;
    const { outcome, outcomeRemarks, nextTask } = req.body;

    const task = await db.queryOne<any>(`SELECT * FROM crm_tasks WHERE id = $1 AND "tenantId" = $2`, [taskId, tenantId]);
    if (!task) {
      res.status(404).json({ error: 'Task not found.' });
      return;
    }

    const now = new Date().toISOString();
    await db.execute(`
      UPDATE crm_tasks
      SET status = 'completed',
          "completedAt" = $1,
          outcome = $2,
          "outcomeRemarks" = $3,
          "updatedAt" = $1
      WHERE id = $4 AND "tenantId" = $5
    `, [now, outcome || 'Completed', outcomeRemarks || null, taskId, tenantId]);

    // Record note / timeline event
    const entityType = task.leadId ? 'lead' : task.crmCompanyId ? 'crm_company' : 'task';
    const entityId = task.leadId || task.crmCompanyId || taskId;
    await recordCrmNote({
      tenantId,
      entityType,
      entityId,
      category: 'task',
      body: `Closed task "${task.title}": Outcome [${outcome || 'Completed'}]${outcomeRemarks ? ' - ' + outcomeRemarks : ''}`,
      createdByUserId: user.id,
      createdByName: user.username
    });

    if (task.leadId) {
      await recordLeadActivity({
        leadId: task.leadId,
        tenantId,
        userId: user.id,
        username: user.username,
        eventType: 'TASK_COMPLETED',
        description: `Closed task "${task.title}": Outcome [${outcome || 'Completed'}]${outcomeRemarks ? ' - ' + outcomeRemarks : ''}`
      });
    }

    // Optional follow-up / chained next action creation
    let createdNextTask: any = null;
    if (nextTask && nextTask.title && nextTask.dueAt) {
      let nextAssignedUserId: string | null = null;
      try {
        nextAssignedUserId = nextTask.assignedUserId ? await validateTenantAssignee(nextTask.assignedUserId, tenantId) : (task.assignedUserId || (!isPlatformRole(user.role) ? user.id : null));
      } catch (e: any) {
        res.status(400).json({ error: e.message });
        return;
      }
      const nextId = `task_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
      await db.execute(`
        INSERT INTO crm_tasks (id, "tenantId", title, description, "taskType", status, priority, "dueAt", "crmCompanyId", "contactId", "leadId", "assignedUserId", "createdByUserId", "createdAt", "updatedAt")
        VALUES ($1, $2, $3, $4, $5, 'open', $6, $7, $8, $9, $10, $11, $12, $13, $13)
      `, [
        nextId,
        tenantId,
        nextTask.title.trim(),
        nextTask.description || `Follow-up from closed task: ${task.title}`,
        nextTask.taskType || 'call',
        nextTask.priority || 'medium',
        new Date(nextTask.dueAt).toISOString(),
        task.crmCompanyId || null,
        task.contactId || null,
        task.leadId || null,
        nextAssignedUserId,
        user.id,
        now
      ]);
      createdNextTask = await db.queryOne(`SELECT * FROM crm_tasks WHERE id = $1 AND "tenantId" = $2`, [nextId, tenantId]);
    }

    const updated = await db.queryOne(`SELECT * FROM crm_tasks WHERE id = $1 AND "tenantId" = $2`, [taskId, tenantId]);
    res.json({ success: true, message: 'Task closed successfully.', task: updated, nextTask: createdNextTask });
  } catch (err: any) {
    console.error('Error closing task:', err);
    res.status(500).json({ error: 'Internal server error while closing task' });
  }
});

// POST /api/crm/tasks/:id/reschedule
app.post('/api/crm/tasks/:id/reschedule', requireAuth, requirePermission(['crm:edit', 'calls:log_disposition']), async (req, res) => {
  try {
    const user = (req as any).user;
    const tenantId = user?.tenantId;
    if (!tenantId) {
      res.status(401).json({ error: 'Unauthorized: missing tenant identity' });
      return;
    }
    const taskId = req.params.id;
    const dueAt = req.body.dueAt || req.body.newDueAt;
    const { taskType, assignedUserId, remarks } = req.body;

    if (!dueAt) {
      res.status(400).json({ error: 'New due date and time is required to reschedule.' });
      return;
    }

    const task = await db.queryOne<any>(`SELECT * FROM crm_tasks WHERE id = $1 AND "tenantId" = $2`, [taskId, tenantId]);
    if (!task) {
      res.status(404).json({ error: 'Task not found.' });
      return;
    }

    let finalAssignedUserId = assignedUserId;
    if (assignedUserId !== undefined && assignedUserId !== null && assignedUserId !== '') {
      try {
        finalAssignedUserId = await validateTenantAssignee(assignedUserId, tenantId);
      } catch (e: any) {
        res.status(400).json({ error: e.message });
        return;
      }
    }

    const now = new Date().toISOString();
    const newDueIso = new Date(dueAt).toISOString();

    await db.execute(`
      UPDATE crm_tasks
      SET "dueAt" = $1,
          "taskType" = COALESCE($2, "taskType"),
          "assignedUserId" = COALESCE($3, "assignedUserId"),
          status = 'open',
          "outcomeRemarks" = COALESCE($4, "outcomeRemarks"),
          "updatedAt" = $5
      WHERE id = $6 AND "tenantId" = $7
    `, [newDueIso, taskType || null, finalAssignedUserId || null, remarks ? `Rescheduled: ${remarks}` : null, now, taskId, tenantId]);

    const entityType = task.leadId ? 'lead' : task.crmCompanyId ? 'crm_company' : 'task';
    const entityId = task.leadId || task.crmCompanyId || taskId;
    await recordCrmNote({
      tenantId,
      entityType,
      entityId,
      category: 'meeting',
      body: `Rescheduled task "${task.title}" to ${new Date(newDueIso).toLocaleString()}${remarks ? ': ' + remarks : ''}`,
      createdByUserId: user.id,
      createdByName: user.username
    });

    if (task.leadId) {
      await recordLeadActivity({
        leadId: task.leadId,
        tenantId,
        userId: user.id,
        username: user.username,
        eventType: 'TASK_RESCHEDULED',
        description: `Rescheduled "${task.title}" to ${new Date(newDueIso).toLocaleString()}${remarks ? ': ' + remarks : ''}`
      });
    }

    const updated = await db.queryOne(`SELECT * FROM crm_tasks WHERE id = $1 AND "tenantId" = $2`, [taskId, tenantId]);
    res.json({ success: true, task: updated, message: 'Task rescheduled successfully.' });
  } catch (err: any) {
    console.error('Error rescheduling task:', err);
    res.status(500).json({ error: 'Internal server error while rescheduling task' });
  }
});

// POST /api/crm/tasks/:id/cancel
app.post('/api/crm/tasks/:id/cancel', requireAuth, requirePermission(['crm:edit', 'calls:log_disposition']), async (req, res) => {
  try {
    const user = (req as any).user;
    const tenantId = user?.tenantId;
    if (!tenantId) {
      res.status(401).json({ error: 'Unauthorized: missing tenant identity' });
      return;
    }
    const taskId = req.params.id;
    const cancellationReason = (req.body.cancellationReason || req.body.reason || '').trim();
    const remarks = req.body.remarks;

    if (!cancellationReason) {
      res.status(400).json({ error: 'Cancellation reason is mandatory.' });
      return;
    }

    const task = await db.queryOne<any>(`SELECT * FROM crm_tasks WHERE id = $1 AND "tenantId" = $2`, [taskId, tenantId]);
    if (!task) {
      res.status(404).json({ error: 'Task not found.' });
      return;
    }

    const now = new Date().toISOString();
    await db.execute(`
      UPDATE crm_tasks
      SET status = 'cancelled',
          "cancellationReason" = $1,
          "outcomeRemarks" = $2,
          "updatedAt" = $3
      WHERE id = $4 AND "tenantId" = $5
    `, [cancellationReason.trim(), remarks || null, now, taskId, tenantId]);

    const entityType = task.leadId ? 'lead' : task.crmCompanyId ? 'crm_company' : 'task';
    const entityId = task.leadId || task.crmCompanyId || taskId;
    await recordCrmNote({
      tenantId,
      entityType,
      entityId,
      category: 'meeting',
      body: `Cancelled task "${task.title}": Reason [${cancellationReason}]${remarks ? ' - ' + remarks : ''}`,
      createdByUserId: user.id,
      createdByName: user.username
    });

    if (task.leadId) {
      await recordLeadActivity({
        leadId: task.leadId,
        tenantId,
        userId: user.id,
        username: user.username,
        eventType: 'TASK_CANCELLED',
        description: `Cancelled task "${task.title}": Reason [${cancellationReason}]${remarks ? ' - ' + remarks : ''}`
      });
    }

    const updated = await db.queryOne(`SELECT * FROM crm_tasks WHERE id = $1 AND "tenantId" = $2`, [taskId, tenantId]);
    res.json({ success: true, message: 'Task cancelled successfully.', task: updated });
  } catch (err: any) {
    console.error('Error cancelling task:', err);
    res.status(500).json({ error: 'Internal server error while cancelling task' });
  }
});

// 6. CROSS-ENTITY NOTES & UNIFIED ACTIVITY TIMELINE
// GET /api/crm/notes
app.get('/api/crm/notes', requireAuth, requirePermission(['crm:view']), async (req, res) => {
  try {
    const user = (req as any).user;
    const tenantId = user?.tenantId;
    if (!tenantId) {
      res.status(401).json({ error: 'Unauthorized: missing tenant identity' });
      return;
    }
    const { entityType, entityId } = req.query as Record<string, string>;
    if (!entityType || !entityId) {
      res.status(400).json({ error: 'entityType and entityId are required.' });
      return;
    }

    const notes = await db.queryAll(`
      SELECT * FROM crm_notes
      WHERE "entityType" = $1 AND "entityId" = $2 AND "tenantId" = $3
      ORDER BY "createdAt" DESC LIMIT 100
    `, [entityType, entityId, tenantId]);

    res.json({ notes });
  } catch (err: any) {
    console.error('Error fetching CRM notes:', err);
    res.status(500).json({ error: 'Internal server error while fetching notes' });
  }
});

// POST /api/crm/notes
app.post('/api/crm/notes', requireAuth, requirePermission(['crm:edit', 'crm:create']), async (req, res) => {
  try {
    const user = (req as any).user;
    const tenantId = user?.tenantId;
    if (!tenantId) {
      res.status(401).json({ error: 'Unauthorized: missing tenant identity' });
      return;
    }

    const { entityType, entityId, category, body } = req.body;
    if (!entityType || !entityId || !body || !body.trim()) {
      res.status(400).json({ error: 'entityType, entityId, and note body are required.' });
      return;
    }

    const note = await recordCrmNote({
      tenantId,
      entityType,
      entityId,
      category: category || 'general',
      body: body.trim(),
      createdByUserId: user.id,
      createdByName: user.username
    });

    res.json({ success: true, note });
  } catch (err: any) {
    console.error('Error saving CRM note:', err);
    res.status(500).json({ error: 'Internal server error while saving note' });
  }
});

// DELETE /api/crm/notes/:id
app.delete('/api/crm/notes/:id', requireAuth, requirePermission(['crm:edit']), async (req, res) => {
  try {
    const user = (req as any).user;
    const tenantId = user?.tenantId;
    if (!tenantId) {
      res.status(401).json({ error: 'Unauthorized: missing tenant identity' });
      return;
    }
    const noteId = req.params.id;
    const note = await db.queryOne<any>(`
      SELECT * FROM crm_notes WHERE id = $1 AND "tenantId" = $2
    `, [noteId, tenantId]);

    if (!note) {
      res.status(404).json({ error: 'Note not found' });
      return;
    }

    const canDelete = isCompanyOwner(user) || isPlatformRole(user.role) || note.createdByUserId === user.id;
    if (!canDelete) {
      res.status(403).json({ error: 'Forbidden: You do not have permission to delete this note' });
      return;
    }

    await db.execute(`DELETE FROM crm_notes WHERE id = $1 AND "tenantId" = $2`, [noteId, tenantId]);
    res.json({ success: true, message: 'Note deleted successfully.' });
  } catch (err: any) {
    console.error('Error deleting CRM note:', err);
    res.status(500).json({ error: 'Internal server error while deleting note' });
  }
});

// GET /api/crm/timeline: Unified activity stream
app.get('/api/crm/timeline', requireAuth, requirePermission(['crm:view']), async (req, res) => {
  try {
    const user = (req as any).user;
    const tenantId = user?.tenantId;
    if (!tenantId) {
      res.status(401).json({ error: 'Unauthorized: missing tenant identity' });
      return;
    }

    const { entityType, entityId, limit } = req.query as Record<string, string>;
    const maxLimit = Math.min(parseInt(limit || '50', 10), 100);

    let timelineItems: any[] = [];

    if (entityType && entityId) {
      // 1. Fetch notes for this specific entity
      const notes = await db.queryAll<any>(`
        SELECT id, category as "eventType", body as description, "createdByName" as username, "createdAt", 'NOTE' as type
        FROM crm_notes
        WHERE "entityType" = $1 AND "entityId" = $2 AND "tenantId" = $3
        ORDER BY "createdAt" DESC LIMIT $4
      `, [entityType, entityId, tenantId, maxLimit]);
      timelineItems.push(...notes);

      // 2. If entity is a lead, also pull lead_activities and call_logs
      if (entityType === 'lead') {
        const activities = await db.queryAll<any>(`
          SELECT id, "eventType", description, username, "createdAt", 'ACTIVITY' as type
          FROM lead_activities
          WHERE "leadId" = $1 AND "tenantId" = $2
          ORDER BY "createdAt" DESC LIMIT $3
        `, [entityId, tenantId, maxLimit]);
        timelineItems.push(...activities);

        const callLogs = await db.queryAll<any>(`
          SELECT id, outcome as "eventType", ('Call outcome: ' || outcome || ' (' || duration || 's)') as description, 'System' as username, timestamp as "createdAt", 'CALL' as type
          FROM call_logs
          WHERE "leadId" = $1 AND "tenantId" = $2
          ORDER BY timestamp DESC LIMIT $3
        `, [entityId, tenantId, maxLimit]);
        timelineItems.push(...callLogs);
      }
    } else {
      // General tenant-wide timeline
      const notes = await db.queryAll<any>(`
        SELECT id, category as "eventType", body as description, "createdByName" as username, "createdAt", 'NOTE' as type, "entityType", "entityId"
        FROM crm_notes
        WHERE "tenantId" = $1
        ORDER BY "createdAt" DESC LIMIT $2
      `, [tenantId, maxLimit]);
      timelineItems.push(...notes);

      const activities = await db.queryAll<any>(`
        SELECT id, "eventType", description, username, "createdAt", 'ACTIVITY' as type, 'lead' as "entityType", "leadId" as "entityId"
        FROM lead_activities
        WHERE "tenantId" = $1
        ORDER BY "createdAt" DESC LIMIT $2
      `, [tenantId, maxLimit]);
      timelineItems.push(...activities);
    }

    // Normalize and sort descending by timestamp
    const normalized = timelineItems.map(item => ({
      ...item,
      timestamp: item.timestamp || item.createdAt,
      itemType: (item.itemType || item.type || item.eventType || 'note').toLowerCase(),
      title: item.title || item.eventType || item.type || 'Activity',
      userName: item.userName || item.username || item.createdByName || 'Operator'
    }));
    normalized.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

    res.json({ timeline: normalized.slice(0, maxLimit), items: normalized.slice(0, maxLimit) });
  } catch (err: any) {
    console.error('Error fetching timeline:', err);
    res.status(500).json({ error: 'Internal server error while fetching timeline' });
  }
});

// REST: Get scheduled follow-ups for tenant (maintained for dialer compatibility)
app.get('/api/crm/follow-ups', requireAuth, requirePermission(['crm:view', 'leads:view']), async (req, res) => {
  try {
    const user = (req as any).user;
    const tenantId = user?.tenantId;
    if (!tenantId) {
      res.status(401).json({ error: 'Unauthorized: missing tenant identity' });
      return;
    }
    const status = req.query.status as string | undefined;
    const isPlatform = user.role === 'platform_admin' || user.role === 'master_admin';
    const isCompanyAdmin = user.role === 'admin';

    let query = `
      SELECT f.* 
      FROM crm_follow_ups f
      JOIN leads l ON f."leadId" = l.id
      WHERE f."tenantId" = $1
    `;
    const params: any[] = [tenantId];
    if (status) {
      query += ` AND f.status = $${params.length + 1}`;
      params.push(status);
    }
    if (!isPlatform && !isCompanyAdmin) {
      const scopedFilter = await getScopedLeadFilterSql(user, tenantId, 'l', params.length + 1);
      query += scopedFilter.sql;
      params.push(...scopedFilter.params);
    }
    query += ` ORDER BY f."scheduledAt" ASC`;
    const followUps = await db.queryAll(query, params);
    res.json({ followUps });
  } catch (err: any) {
    console.error('Error fetching follow-ups:', err);
    res.status(500).json({ error: 'Internal server error while fetching follow-ups' });
  }
});

// REST: Create scheduled follow-up (maintained for dialer compatibility)
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
    const canEdit = await canEditLead(user, lead, tenantId);
    if (!canEdit) {
      res.status(403).json({ error: 'Forbidden: You do not have permission to create follow-ups for this lead.' });
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

// 7. CRM MEETINGS API (Specialized view over crm_tasks where taskType IN ('meeting', 'online_meeting'))
app.get('/api/crm/meetings', requireAuth, requirePermission(['crm:view', 'leads:view']), async (req, res) => {
  try {
    const user = (req as any).user;
    const tenantId = user?.tenantId;
    if (!tenantId) {
      res.status(401).json({ error: 'Unauthorized: missing tenant identity' });
      return;
    }

    const { status, range, assignedUserId, search } = req.query as Record<string, string>;
    const scopedUserIds = await getScopedCrmUserIds(user, tenantId);

    let sql = `
      SELECT t.*, 
             co.name as "companyName", 
             ct.name as "contactName",
             l.name as "leadName",
             l.phone as "leadPhone",
             u.username as "assignedUserName"
      FROM crm_tasks t
      LEFT JOIN crm_companies co ON t."crmCompanyId" = co.id
      LEFT JOIN crm_contacts ct ON t."contactId" = ct.id
      LEFT JOIN leads l ON t."leadId" = l.id
      LEFT JOIN users u ON t."assignedUserId" = u.id
      WHERE t."tenantId" = $1 AND t."taskType" IN ('meeting', 'online_meeting')
    `;
    const params: any[] = [tenantId];

    if (status && status !== 'all') {
      sql += ` AND t.status = $${params.length + 1}`;
      params.push(status);
    }
    if (assignedUserId) {
      sql += ` AND t."assignedUserId" = $${params.length + 1}`;
      params.push(assignedUserId);
    }
    if (scopedUserIds) {
      const phs = scopedUserIds.map((_, i) => `$${params.length + 1 + i}`).join(', ');
      sql += ` AND (t."assignedUserId" IN (${phs}) OR t."assignedUserId" IS NULL)`;
      params.push(...scopedUserIds);
    }

    const now = new Date();
    if (range === 'today') {
      const start = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0).toISOString();
      const end = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999).toISOString();
      sql += ` AND t."dueAt" >= $${params.length + 1} AND t."dueAt" <= $${params.length + 2}`;
      params.push(start, end);
    } else if (range === 'upcoming') {
      sql += ` AND t."dueAt" >= $${params.length + 1} AND t.status = 'open'`;
      params.push(now.toISOString());
    } else if (range === 'past') {
      sql += ` AND (t."dueAt" < $${params.length + 1} OR t.status != 'open')`;
      params.push(now.toISOString());
    }

    if (search && search.trim()) {
      const q = `%${search.trim().toLowerCase()}%`;
      sql += ` AND (LOWER(t.title) LIKE $${params.length + 1} OR LOWER(COALESCE(co.name, '')) LIKE $${params.length + 1} OR LOWER(COALESCE(ct.name, '')) LIKE $${params.length + 1} OR LOWER(COALESCE(l.name, '')) LIKE $${params.length + 1})`;
      params.push(q);
    }

    sql += ` ORDER BY t."dueAt" ASC LIMIT 200`;
    const meetings = await db.queryAll(sql, params);
    res.json({ meetings });
  } catch (err: any) {
    console.error('Error fetching CRM meetings:', err);
    res.status(500).json({ error: 'Internal server error while fetching meetings' });
  }
});

// 8. CRM CLIENT WORK ITEMS (Deliverables, Tickets, Onboarding & Projects)
app.get(['/api/crm/work-items', '/api/crm/work'], requireAuth, requirePermission(['crm:view']), async (req, res) => {
  try {
    const user = (req as any).user;
    const tenantId = user?.tenantId;
    if (!tenantId) {
      res.status(401).json({ error: 'Unauthorized: missing tenant identity' });
      return;
    }

    const { status, category, crmCompanyId, assignedUserId, search } = req.query as Record<string, string>;
    const scopedUserIds = await getScopedCrmUserIds(user, tenantId);

    let sql = `
      SELECT w.*,
             co.name as "companyName",
             ct.name as "contactName",
             l.name as "leadName",
             u.username as "assignedUserName",
             creator.username as "createdByName"
      FROM crm_work_items w
      LEFT JOIN crm_companies co ON w."crmCompanyId" = co.id
      LEFT JOIN crm_contacts ct ON w."contactId" = ct.id
      LEFT JOIN leads l ON w."leadId" = l.id
      LEFT JOIN users u ON w."assignedUserId" = u.id
      LEFT JOIN users creator ON w."createdByUserId" = creator.id
      WHERE w."tenantId" = $1
    `;
    const params: any[] = [tenantId];

    if (status && status !== 'all') {
      sql += ` AND w.status = $${params.length + 1}`;
      params.push(status);
    }
    if (category && category !== 'all') {
      sql += ` AND w.category = $${params.length + 1}`;
      params.push(category);
    }
    if (crmCompanyId) {
      sql += ` AND w."crmCompanyId" = $${params.length + 1}`;
      params.push(crmCompanyId);
    }
    if (assignedUserId) {
      sql += ` AND w."assignedUserId" = $${params.length + 1}`;
      params.push(assignedUserId);
    }
    if (scopedUserIds) {
      const phs = scopedUserIds.map((_, i) => `$${params.length + 1 + i}`).join(', ');
      sql += ` AND (w."assignedUserId" IN (${phs}) OR w."assignedUserId" IS NULL)`;
      params.push(...scopedUserIds);
    }
    if (search && search.trim()) {
      const q = `%${search.trim().toLowerCase()}%`;
      sql += ` AND (LOWER(w.title) LIKE $${params.length + 1} OR LOWER(COALESCE(w.description, '')) LIKE $${params.length + 1} OR LOWER(w.category) LIKE $${params.length + 1} OR LOWER(COALESCE(co.name, '')) LIKE $${params.length + 1})`;
      params.push(q);
    }

    sql += ` ORDER BY CASE w.priority WHEN 'critical' THEN 1 WHEN 'high' THEN 2 WHEN 'normal' THEN 3 ELSE 4 END, w."createdAt" DESC LIMIT 200`;
    const workItems = await db.queryAll(sql, params);
    res.json({ workItems });
  } catch (err: any) {
    console.error('Error fetching work items:', err);
    res.status(500).json({ error: 'Internal server error while fetching work items' });
  }
});

app.post(['/api/crm/work-items', '/api/crm/work'], requireAuth, requirePermission(['crm:create', 'crm:edit']), async (req, res) => {
  try {
    const user = (req as any).user;
    const tenantId = user?.tenantId;
    if (!tenantId) {
      res.status(401).json({ error: 'Unauthorized: missing tenant identity' });
      return;
    }

    const { title, description, category, subcategory, assignedTeamId, assignedUserId, priority, dueAt, crmCompanyId, contactId, leadId, status } = req.body;
    if (!title || !title.trim()) {
      res.status(400).json({ error: 'Title is required for work item.' });
      return;
    }

    let finalAssignedUserId: string | null = null;
    try {
      finalAssignedUserId = assignedUserId ? await validateTenantAssignee(assignedUserId, tenantId) : (!isPlatformRole(user.role) ? user.id : null);
    } catch (e: any) {
      res.status(400).json({ error: e.message });
      return;
    }

    const id = `work_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const now = new Date().toISOString();
    const itemStatus = status || 'TODO';
    const completedAt = itemStatus === 'COMPLETED' ? now : null;

    await db.execute(`
      INSERT INTO crm_work_items (
        id, "tenantId", "crmCompanyId", "contactId", "leadId", title, description,
        category, subcategory, "assignedTeamId", "assignedUserId", priority, status,
        "dueAt", "completedAt", "createdByUserId", "createdAt", "updatedAt"
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $17)
    `, [
      id,
      tenantId,
      crmCompanyId || null,
      contactId || null,
      leadId || null,
      title.trim(),
      description || null,
      category || 'General',
      subcategory || null,
      assignedTeamId || null,
      finalAssignedUserId,
      priority || 'normal',
      itemStatus,
      dueAt ? new Date(dueAt).toISOString() : null,
      completedAt,
      user.id,
      now
    ]);

    const entityType = leadId ? 'lead' : crmCompanyId ? 'crm_company' : null;
    const entityId = leadId || crmCompanyId;
    if (entityType && entityId) {
      await recordCrmNote({
        tenantId,
        entityType,
        entityId,
        category: 'task',
        body: `Created client work item: "${title.trim()}" [${category || 'General'} - Priority: ${priority || 'normal'}]`,
        createdByUserId: user.id,
        createdByName: user.username
      });
    }

    const created = await db.queryOne(`
      SELECT w.*, co.name as "companyName", ct.name as "contactName", l.name as "leadName", u.username as "assignedUserName"
      FROM crm_work_items w
      LEFT JOIN crm_companies co ON w."crmCompanyId" = co.id
      LEFT JOIN crm_contacts ct ON w."contactId" = ct.id
      LEFT JOIN leads l ON w."leadId" = l.id
      LEFT JOIN users u ON w."assignedUserId" = u.id
      WHERE w.id = $1 AND w."tenantId" = $2
    `, [id, tenantId]);

    res.json({ success: true, workItem: created });
  } catch (err: any) {
    console.error('Error creating work item:', err);
    res.status(500).json({ error: 'Internal server error while creating work item' });
  }
});

app.get(['/api/crm/work-items/:id', '/api/crm/work/:id'], requireAuth, requirePermission(['crm:view']), async (req, res) => {
  try {
    const user = (req as any).user;
    const tenantId = user?.tenantId;
    if (!tenantId) {
      res.status(401).json({ error: 'Unauthorized: missing tenant identity' });
      return;
    }
    const id = req.params.id;
    const item = await db.queryOne<any>(`
      SELECT w.*, co.name as "companyName", ct.name as "contactName", l.name as "leadName", u.username as "assignedUserName", creator.username as "createdByName"
      FROM crm_work_items w
      LEFT JOIN crm_companies co ON w."crmCompanyId" = co.id
      LEFT JOIN crm_contacts ct ON w."contactId" = ct.id
      LEFT JOIN leads l ON w."leadId" = l.id
      LEFT JOIN users u ON w."assignedUserId" = u.id
      LEFT JOIN users creator ON w."createdByUserId" = creator.id
      WHERE w.id = $1 AND w."tenantId" = $2
    `, [id, tenantId]);

    if (!item) {
      res.status(404).json({ error: 'Work item not found.' });
      return;
    }

    const notes = await db.queryAll(`
      SELECT * FROM crm_notes 
      WHERE "entityType" = 'crm_company' AND "entityId" = $1 AND "tenantId" = $2
      ORDER BY "createdAt" DESC LIMIT 50
    `, [item.crmCompanyId || id, tenantId]);

    res.json({ workItem: item, notes });
  } catch (err: any) {
    console.error('Error fetching work item:', err);
    res.status(500).json({ error: 'Internal server error while fetching work item' });
  }
});

app.put(['/api/crm/work-items/:id', '/api/crm/work/:id'], requireAuth, requirePermission(['crm:edit']), async (req, res) => {
  try {
    const user = (req as any).user;
    const tenantId = user?.tenantId;
    if (!tenantId) {
      res.status(401).json({ error: 'Unauthorized: missing tenant identity' });
      return;
    }
    const id = req.params.id;
    const { title, description, category, subcategory, assignedTeamId, assignedUserId, priority, status, dueAt, crmCompanyId, contactId, leadId } = req.body;

    const existing = await db.queryOne<any>(`SELECT * FROM crm_work_items WHERE id = $1 AND "tenantId" = $2`, [id, tenantId]);
    if (!existing) {
      res.status(404).json({ error: 'Work item not found.' });
      return;
    }

    let finalAssignedUserId = assignedUserId;
    if (assignedUserId !== undefined && assignedUserId !== null && assignedUserId !== '') {
      try {
        finalAssignedUserId = await validateTenantAssignee(assignedUserId, tenantId);
      } catch (e: any) {
        res.status(400).json({ error: e.message });
        return;
      }
    }

    const now = new Date().toISOString();
    let completedAt = existing.completedAt;
    if (status === 'COMPLETED' && existing.status !== 'COMPLETED') {
      completedAt = now;
    } else if (status && status !== 'COMPLETED') {
      completedAt = null;
    }

    await db.execute(`
      UPDATE crm_work_items
      SET title = COALESCE($1, title),
          description = COALESCE($2, description),
          category = COALESCE($3, category),
          subcategory = COALESCE($4, subcategory),
          "assignedTeamId" = COALESCE($5, "assignedTeamId"),
          "assignedUserId" = COALESCE($6, "assignedUserId"),
          priority = COALESCE($7, priority),
          status = COALESCE($8, status),
          "dueAt" = COALESCE($9, "dueAt"),
          "completedAt" = $10,
          "crmCompanyId" = COALESCE($11, "crmCompanyId"),
          "contactId" = COALESCE($12, "contactId"),
          "leadId" = COALESCE($13, "leadId"),
          "updatedAt" = $14
      WHERE id = $15 AND "tenantId" = $16
    `, [
      title ? title.trim() : null,
      description !== undefined ? description : null,
      category || null,
      subcategory !== undefined ? subcategory : null,
      assignedTeamId !== undefined ? assignedTeamId : null,
      finalAssignedUserId !== undefined ? finalAssignedUserId : null,
      priority || null,
      status || null,
      dueAt ? new Date(dueAt).toISOString() : null,
      completedAt,
      crmCompanyId !== undefined ? crmCompanyId : null,
      contactId !== undefined ? contactId : null,
      leadId !== undefined ? leadId : null,
      now,
      id,
      tenantId
    ]);

    const updated = await db.queryOne(`
      SELECT w.*, co.name as "companyName", ct.name as "contactName", l.name as "leadName", u.username as "assignedUserName"
      FROM crm_work_items w
      LEFT JOIN crm_companies co ON w."crmCompanyId" = co.id
      LEFT JOIN crm_contacts ct ON w."contactId" = ct.id
      LEFT JOIN leads l ON w."leadId" = l.id
      LEFT JOIN users u ON w."assignedUserId" = u.id
      WHERE w.id = $1 AND w."tenantId" = $2
    `, [id, tenantId]);

    res.json({ success: true, workItem: updated });
  } catch (err: any) {
    console.error('Error updating work item:', err);
    res.status(500).json({ error: 'Internal server error while updating work item' });
  }
});

app.delete(['/api/crm/work-items/:id', '/api/crm/work/:id'], requireAuth, requirePermission(['crm:edit']), async (req, res) => {
  try {
    const user = (req as any).user;
    const tenantId = user?.tenantId;
    if (!tenantId) {
      res.status(401).json({ error: 'Unauthorized: missing tenant identity' });
      return;
    }
    const id = req.params.id;
    await db.execute(`DELETE FROM crm_work_items WHERE id = $1 AND "tenantId" = $2`, [id, tenantId]);
    res.json({ success: true, message: 'Work item deleted successfully.' });
  } catch (err: any) {
    console.error('Error deleting work item:', err);
    res.status(500).json({ error: 'Internal server error while deleting work item' });
  }
});

// Default pricing definitions
const DEFAULT_PACKAGES = [
  {
    id: 'pkg_starter',
    name: 'Starter Tier',
    description: 'Essential CRM and calling tools for growing teams',
    priceMonthly: 49.00,
    priceAnnual: 470.00,
    includedUsers: 3,
    maxCallsPerMonth: 1000,
    features: ['Up to 3 Users', 'Basic CRM Pipeline', 'Lead Management', '1,000 Outbound Minutes']
  },
  {
    id: 'pkg_pro',
    name: 'Professional Tier',
    description: 'Advanced sales automation, recording and analytics',
    priceMonthly: 129.00,
    priceAnnual: 1240.00,
    includedUsers: 10,
    maxCallsPerMonth: 5000,
    features: ['Up to 10 Users', 'Full CRM Suite & Work Items', 'Automated Workflows', 'Call Recording', '5,000 Outbound Minutes']
  },
  {
    id: 'pkg_enterprise',
    name: 'Enterprise Tier',
    description: 'Dedicated infrastructure, custom workflows & unlimited volume',
    priceMonthly: 299.00,
    priceAnnual: 2870.00,
    includedUsers: 25,
    maxCallsPerMonth: 25000,
    features: ['Unlimited Users', 'Dedicated IP & Subdomain', 'Custom Pipelines', 'Priority Support', '25,000 Outbound Minutes']
  }
];

const DEFAULT_ADDONS = [
  { id: 'addon_phone', name: 'Extra Dedicated DID Phone Number', priceMonthly: 5.00, priceAnnual: 50.00, unit: 'number' },
  { id: 'addon_ai_transcribe', name: 'AI Voice Transcription & Summary', priceMonthly: 29.00, priceAnnual: 290.00, unit: 'license' },
  { id: 'addon_omnichannel', name: 'WhatsApp & SMS Outreach Gateway', priceMonthly: 49.00, priceAnnual: 490.00, unit: 'gateway' },
  { id: 'addon_custom_domain', name: 'Custom Domain & White-label Portal', priceMonthly: 39.00, priceAnnual: 390.00, unit: 'branding' }
];

async function getOrCreateTenantPricingRules(tenantId: string, userId?: string) {
  let rules = await db.queryOne<any>(`SELECT * FROM crm_pricing_rules WHERE "tenantId" = $1`, [tenantId]);
  if (!rules) {
    const id = `pr_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const now = new Date().toISOString();
    await db.execute(`
      INSERT INTO crm_pricing_rules (
        id, "tenantId", currency, "taxRate", "agentMaxDiscountPct", "teamLeadMaxDiscountPct",
        "packagesJson", "addonsJson", "perUserPriceMonthly", "perUserPriceAnnual", "updatedByUserId", "createdAt", "updatedAt"
      ) VALUES ($1, $2, 'USD', 0, 10, 25, $3, $4, 15.00, 144.00, $5, $6, $6)
    `, [id, tenantId, JSON.stringify(DEFAULT_PACKAGES), JSON.stringify(DEFAULT_ADDONS), userId || null, now]);
    rules = await db.queryOne<any>(`SELECT * FROM crm_pricing_rules WHERE "tenantId" = $1`, [tenantId]);
  }
  return rules;
}

// 9. PRICING RULES APIS
app.get('/api/crm/pricing-rules', requireAuth, requirePermission(['crm:view']), async (req, res) => {
  try {
    const user = (req as any).user;
    const tenantId = user?.tenantId;
    if (!tenantId) {
      res.status(401).json({ error: 'Unauthorized: missing tenant identity' });
      return;
    }
    const rules = await getOrCreateTenantPricingRules(tenantId, user.id);
    let packages = DEFAULT_PACKAGES;
    let addons = DEFAULT_ADDONS;
    try { packages = JSON.parse(rules.packagesJson); } catch {}
    try { addons = JSON.parse(rules.addonsJson); } catch {}

    res.json({
      pricingRules: {
        id: rules.id,
        tenantId: rules.tenantId,
        currency: rules.currency,
        taxRate: Number(rules.taxRate),
        agentMaxDiscountPct: Number(rules.agentMaxDiscountPct),
        teamLeadMaxDiscountPct: Number(rules.teamLeadMaxDiscountPct),
        perUserPriceMonthly: Number(rules.perUserPriceMonthly),
        perUserPriceAnnual: Number(rules.perUserPriceAnnual),
        packages,
        addons,
        updatedAt: rules.updatedAt
      }
    });
  } catch (err: any) {
    console.error('Error getting pricing rules:', err);
    res.status(500).json({ error: 'Internal server error while fetching pricing rules' });
  }
});

app.put('/api/crm/pricing-rules', requireAuth, async (req, res) => {
  try {
    const user = (req as any).user;
    const tenantId = user?.tenantId;
    if (!tenantId) {
      res.status(401).json({ error: 'Unauthorized: missing tenant identity' });
      return;
    }

    // Strictly Company Owner or Platform Admin only!
    const isOwner = isCompanyOwner(user) || isPlatformRole(user.role);
    if (!isOwner) {
      res.status(403).json({ error: 'Forbidden: Only the Company Owner can configure sales pricing rules and discount policies.' });
      return;
    }

    const { currency, taxRate, agentMaxDiscountPct, teamLeadMaxDiscountPct, packages, addons, perUserPriceMonthly, perUserPriceAnnual } = req.body;
    const now = new Date().toISOString();

    await getOrCreateTenantPricingRules(tenantId, user.id);

    await db.execute(`
      UPDATE crm_pricing_rules
      SET currency = COALESCE($1, currency),
          "taxRate" = COALESCE($2, "taxRate"),
          "agentMaxDiscountPct" = COALESCE($3, "agentMaxDiscountPct"),
          "teamLeadMaxDiscountPct" = COALESCE($4, "teamLeadMaxDiscountPct"),
          "packagesJson" = COALESCE($5, "packagesJson"),
          "addonsJson" = COALESCE($6, "addonsJson"),
          "perUserPriceMonthly" = COALESCE($7, "perUserPriceMonthly"),
          "perUserPriceAnnual" = COALESCE($8, "perUserPriceAnnual"),
          "updatedByUserId" = $9,
          "updatedAt" = $10
      WHERE "tenantId" = $11
    `, [
      currency || null,
      taxRate !== undefined ? Number(taxRate) : null,
      agentMaxDiscountPct !== undefined ? Number(agentMaxDiscountPct) : null,
      teamLeadMaxDiscountPct !== undefined ? Number(teamLeadMaxDiscountPct) : null,
      packages ? JSON.stringify(packages) : null,
      addons ? JSON.stringify(addons) : null,
      perUserPriceMonthly !== undefined ? Number(perUserPriceMonthly) : null,
      perUserPriceAnnual !== undefined ? Number(perUserPriceAnnual) : null,
      user.id,
      now,
      tenantId
    ]);

    const updated = await getOrCreateTenantPricingRules(tenantId, user.id);
    let pkgs = DEFAULT_PACKAGES;
    let ads = DEFAULT_ADDONS;
    try { pkgs = JSON.parse(updated.packagesJson); } catch {}
    try { ads = JSON.parse(updated.addonsJson); } catch {}

    res.json({
      success: true,
      pricingRules: {
        id: updated.id,
        tenantId: updated.tenantId,
        currency: updated.currency,
        taxRate: Number(updated.taxRate),
        agentMaxDiscountPct: Number(updated.agentMaxDiscountPct),
        teamLeadMaxDiscountPct: Number(updated.teamLeadMaxDiscountPct),
        perUserPriceMonthly: Number(updated.perUserPriceMonthly),
        perUserPriceAnnual: Number(updated.perUserPriceAnnual),
        packages: pkgs,
        addons: ads,
        updatedAt: updated.updatedAt
      }
    });
  } catch (err: any) {
    console.error('Error updating pricing rules:', err);
    res.status(500).json({ error: 'Internal server error while updating pricing rules' });
  }
});

// Helper to compute quote calculations and enforce discount rules
async function calculateQuoteInternal(tenantId: string, user: any, body: any) {
  const rules = await getOrCreateTenantPricingRules(tenantId, user.id);
  let packages = DEFAULT_PACKAGES;
  let addons = DEFAULT_ADDONS;
  try { packages = JSON.parse(rules.packagesJson); } catch {}
  try { addons = JSON.parse(rules.addonsJson); } catch {}

  const isOwner = isCompanyOwner(user) || isPlatformRole(user.role);
  const isTeamLead = user.role === 'team_lead';
  const maxDiscountPct = isOwner ? 100 : (isTeamLead ? Number(rules.teamLeadMaxDiscountPct) : Number(rules.agentMaxDiscountPct));

  const requestedDiscountPct = Number(body.discountPct || 0);
  if (requestedDiscountPct > maxDiscountPct) {
    throw new Error(`Discount cannot exceed ${maxDiscountPct}% for your role (${user.role}).`);
  }

  const billingCycle = body.billingCycle === 'annual' ? 'annual' : 'monthly';
  const userCount = Math.max(1, parseInt(String(body.userCount || 1), 10));

  const pkg = packages.find((p: any) => p.id === body.packageId) || packages[0];
  const pkgPrice = billingCycle === 'annual' ? Number(pkg.priceAnnual) : Number(pkg.priceMonthly);

  const lineItems: any[] = [];
  lineItems.push({
    itemType: 'package',
    name: `${pkg.name} (${billingCycle})`,
    quantity: 1,
    unitPrice: pkgPrice,
    lineTotal: pkgPrice
  });

  // Additional users above included
  const includedUsers = pkg.includedUsers || 1;
  const extraUsers = Math.max(0, userCount - includedUsers);
  if (extraUsers > 0) {
    const seatPrice = billingCycle === 'annual' ? Number(rules.perUserPriceAnnual) : Number(rules.perUserPriceMonthly);
    const seatTotal = extraUsers * seatPrice;
    lineItems.push({
      itemType: 'seat',
      name: `Additional User Seats (${extraUsers} seat${extraUsers > 1 ? 's' : ''})`,
      quantity: extraUsers,
      unitPrice: seatPrice,
      lineTotal: seatTotal
    });
  }

  // Selected add-ons
  const selectedAddons: any[] = Array.isArray(body.selectedAddons) ? body.selectedAddons : [];
  for (const sel of selectedAddons) {
    const addon = addons.find((a: any) => a.id === sel.addonId || a.id === sel.id);
    if (addon) {
      const qty = Math.max(1, parseInt(String(sel.quantity || 1), 10));
      const uPrice = billingCycle === 'annual' ? Number(addon.priceAnnual) : Number(addon.priceMonthly);
      const lTotal = qty * uPrice;
      lineItems.push({
        itemType: 'addon',
        name: addon.name,
        quantity: qty,
        unitPrice: uPrice,
        lineTotal: lTotal
      });
    }
  }

  const subtotal = lineItems.reduce((acc, item) => acc + item.lineTotal, 0);
  const discountAmount = Math.round((subtotal * (requestedDiscountPct / 100)) * 100) / 100;
  const taxableAmount = Math.max(0, subtotal - discountAmount);
  const taxRate = Number(rules.taxRate || 0);
  const taxAmount = Math.round((taxableAmount * (taxRate / 100)) * 100) / 100;
  const totalAmount = Math.round((taxableAmount + taxAmount) * 100) / 100;

  return {
    package: pkg,
    userCount,
    billingCycle,
    currency: rules.currency,
    subtotal,
    discountPct: requestedDiscountPct,
    maxAllowedDiscountPct: maxDiscountPct,
    discountAmount,
    taxRate,
    taxAmount,
    totalAmount,
    lineItems
  };
}

// POST /api/crm/quotes/calculate
app.post('/api/crm/quotes/calculate', requireAuth, requirePermission(['crm:view']), async (req, res) => {
  try {
    const user = (req as any).user;
    const tenantId = user?.tenantId;
    if (!tenantId) {
      res.status(401).json({ error: 'Unauthorized: missing tenant identity' });
      return;
    }
    const calculation = await calculateQuoteInternal(tenantId, user, req.body);
    res.json(calculation);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// 10. CRM QUOTES CRUD
app.get('/api/crm/quotes', requireAuth, requirePermission(['crm:view']), async (req, res) => {
  try {
    const user = (req as any).user;
    const tenantId = user?.tenantId;
    if (!tenantId) {
      res.status(401).json({ error: 'Unauthorized: missing tenant identity' });
      return;
    }

    const { status, crmCompanyId, assignedUserId, search } = req.query as Record<string, string>;
    const scopedUserIds = await getScopedCrmUserIds(user, tenantId);

    let sql = `
      SELECT q.*,
             co.name as "companyName",
             ct.name as "contactName",
             l.name as "leadName",
             u.username as "assignedUserName",
             creator.username as "createdByName"
      FROM crm_quotes q
      LEFT JOIN crm_companies co ON q."crmCompanyId" = co.id
      LEFT JOIN crm_contacts ct ON q."contactId" = ct.id
      LEFT JOIN leads l ON q."leadId" = l.id
      LEFT JOIN users u ON q."assignedUserId" = u.id
      LEFT JOIN users creator ON q."createdByUserId" = creator.id
      WHERE q."tenantId" = $1
    `;
    const params: any[] = [tenantId];

    if (status && status !== 'all') {
      sql += ` AND q.status = $${params.length + 1}`;
      params.push(status);
    }
    if (crmCompanyId) {
      sql += ` AND q."crmCompanyId" = $${params.length + 1}`;
      params.push(crmCompanyId);
    }
    if (assignedUserId) {
      sql += ` AND q."assignedUserId" = $${params.length + 1}`;
      params.push(assignedUserId);
    }
    if (scopedUserIds) {
      const phs = scopedUserIds.map((_, i) => `$${params.length + 1 + i}`).join(', ');
      sql += ` AND (q."assignedUserId" IN (${phs}) OR q."assignedUserId" IS NULL)`;
      params.push(...scopedUserIds);
    }
    if (search && search.trim()) {
      const q = `%${search.trim().toLowerCase()}%`;
      sql += ` AND (LOWER(q."quoteNumber") LIKE $${params.length + 1} OR LOWER(COALESCE(co.name, '')) LIKE $${params.length + 1} OR LOWER(COALESCE(q.notes, '')) LIKE $${params.length + 1})`;
      params.push(q);
    }

    sql += ` ORDER BY q."createdAt" DESC LIMIT 200`;
    const quotes = await db.queryAll(sql, params);
    res.json({ quotes });
  } catch (err: any) {
    console.error('Error fetching quotes:', err);
    res.status(500).json({ error: 'Internal server error while fetching quotes' });
  }
});

app.post('/api/crm/quotes', requireAuth, requirePermission(['crm:create', 'crm:edit']), async (req, res) => {
  try {
    const user = (req as any).user;
    const tenantId = user?.tenantId;
    if (!tenantId) {
      res.status(401).json({ error: 'Unauthorized: missing tenant identity' });
      return;
    }

    const { crmCompanyId, contactId, leadId, packageId, userCount, billingCycle, selectedAddons, discountPct, notes, validUntil, assignedUserId } = req.body;

    let finalAssignedUserId: string | null = null;
    try {
      finalAssignedUserId = assignedUserId ? await validateTenantAssignee(assignedUserId, tenantId) : (!isPlatformRole(user.role) ? user.id : null);
    } catch (e: any) {
      res.status(400).json({ error: e.message });
      return;
    }

    const calc = await calculateQuoteInternal(tenantId, user, {
      packageId,
      userCount,
      billingCycle,
      selectedAddons,
      discountPct
    });

    const quoteId = `qte_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const quoteNumber = `QTE-${Date.now().toString().slice(-6)}`;
    const now = new Date().toISOString();

    await db.execute(`
      INSERT INTO crm_quotes (
        id, "tenantId", "quoteNumber", "crmCompanyId", "contactId", "leadId",
        "packageId", "packageName", "userCount", "billingCycle", currency,
        subtotal, "discountPct", "discountAmount", "taxAmount", "totalAmount",
        status, notes, "validUntil", "assignedUserId", "createdByUserId", "createdAt", "updatedAt"
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, 'DRAFT', $17, $18, $19, $20, $21, $21)
    `, [
      quoteId,
      tenantId,
      quoteNumber,
      crmCompanyId || null,
      contactId || null,
      leadId || null,
      calc.package.id,
      calc.package.name,
      calc.userCount,
      calc.billingCycle,
      calc.currency,
      calc.subtotal,
      calc.discountPct,
      calc.discountAmount,
      calc.taxAmount,
      calc.totalAmount,
      notes || null,
      validUntil ? new Date(validUntil).toISOString() : null,
      finalAssignedUserId,
      user.id,
      now
    ]);

    // Insert frozen quote items snapshot
    for (const item of calc.lineItems) {
      const itemId = `qi_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
      await db.execute(`
        INSERT INTO crm_quote_items (
          id, "tenantId", "quoteId", "itemType", name, quantity, "unitPrice", "lineTotal", "createdAt"
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      `, [
        itemId,
        tenantId,
        quoteId,
        item.itemType,
        item.name,
        item.quantity,
        item.unitPrice,
        item.lineTotal,
        now
      ]);
    }

    const entityType = leadId ? 'lead' : crmCompanyId ? 'crm_company' : null;
    const entityId = leadId || crmCompanyId;
    if (entityType && entityId) {
      await recordCrmNote({
        tenantId,
        entityType,
        entityId,
        category: 'sales',
        body: `Created Quote #${quoteNumber} for ${calc.package.name} (${calc.currency} ${calc.totalAmount.toFixed(2)})`,
        createdByUserId: user.id,
        createdByName: user.username
      });
    }

    const created = await db.queryOne(`
      SELECT q.*, co.name as "companyName", ct.name as "contactName", l.name as "leadName", u.username as "assignedUserName"
      FROM crm_quotes q
      LEFT JOIN crm_companies co ON q."crmCompanyId" = co.id
      LEFT JOIN crm_contacts ct ON q."contactId" = ct.id
      LEFT JOIN leads l ON q."leadId" = l.id
      LEFT JOIN users u ON q."assignedUserId" = u.id
      WHERE q.id = $1 AND q."tenantId" = $2
    `, [quoteId, tenantId]);

    const items = await db.queryAll(`SELECT * FROM crm_quote_items WHERE "quoteId" = $1 AND "tenantId" = $2`, [quoteId, tenantId]);

    res.json({ success: true, quote: created, items });
  } catch (err: any) {
    console.error('Error creating quote:', err);
    res.status(400).json({ error: err.message || 'Internal server error while creating quote' });
  }
});

app.get('/api/crm/quotes/:id', requireAuth, requirePermission(['crm:view']), async (req, res) => {
  try {
    const user = (req as any).user;
    const tenantId = user?.tenantId;
    if (!tenantId) {
      res.status(401).json({ error: 'Unauthorized: missing tenant identity' });
      return;
    }
    const id = req.params.id;
    const quote = await db.queryOne<any>(`
      SELECT q.*, co.name as "companyName", ct.name as "contactName", l.name as "leadName", u.username as "assignedUserName", creator.username as "createdByName"
      FROM crm_quotes q
      LEFT JOIN crm_companies co ON q."crmCompanyId" = co.id
      LEFT JOIN crm_contacts ct ON q."contactId" = ct.id
      LEFT JOIN leads l ON q."leadId" = l.id
      LEFT JOIN users u ON q."assignedUserId" = u.id
      LEFT JOIN users creator ON q."createdByUserId" = creator.id
      WHERE q.id = $1 AND q."tenantId" = $2
    `, [id, tenantId]);

    if (!quote) {
      res.status(404).json({ error: 'Quote not found.' });
      return;
    }

    const items = await db.queryAll(`SELECT * FROM crm_quote_items WHERE "quoteId" = $1 AND "tenantId" = $2`, [id, tenantId]);
    res.json({ quote, items });
  } catch (err: any) {
    console.error('Error fetching quote:', err);
    res.status(500).json({ error: 'Internal server error while fetching quote' });
  }
});

app.put(['/api/crm/quotes/:id', '/api/crm/quotes/:id/status'], requireAuth, requirePermission(['crm:edit']), async (req, res) => {
  try {
    const user = (req as any).user;
    const tenantId = user?.tenantId;
    if (!tenantId) {
      res.status(401).json({ error: 'Unauthorized: missing tenant identity' });
      return;
    }
    const id = req.params.id;
    const { status } = req.body;
    const allowed = ['DRAFT', 'SENT', 'ACCEPTED', 'REJECTED', 'EXPIRED'];
    if (!allowed.includes(status)) {
      res.status(400).json({ error: `Invalid status. Must be one of: ${allowed.join(', ')}` });
      return;
    }

    const existing = await db.queryOne<any>(`SELECT * FROM crm_quotes WHERE id = $1 AND "tenantId" = $2`, [id, tenantId]);
    if (!existing) {
      res.status(404).json({ error: 'Quote not found.' });
      return;
    }

    const now = new Date().toISOString();
    await db.execute(`
      UPDATE crm_quotes
      SET status = $1, "updatedAt" = $2
      WHERE id = $3 AND "tenantId" = $4
    `, [status, now, id, tenantId]);

    const entityType = existing.leadId ? 'lead' : existing.crmCompanyId ? 'crm_company' : null;
    const entityId = existing.leadId || existing.crmCompanyId;
    if (entityType && entityId) {
      await recordCrmNote({
        tenantId,
        entityType,
        entityId,
        category: 'sales',
        body: `Updated Quote #${existing.quoteNumber} status to [${status}]`,
        createdByUserId: user.id,
        createdByName: user.username
      });
    }

    const updated = await db.queryOne(`SELECT * FROM crm_quotes WHERE id = $1 AND "tenantId" = $2`, [id, tenantId]);
    res.json({ success: true, quote: updated });
  } catch (err: any) {
    console.error('Error updating quote status:', err);
    res.status(500).json({ error: 'Internal server error while updating quote status' });
  }
});

// DELETE /api/crm/quotes/:id
app.delete('/api/crm/quotes/:id', requireAuth, requirePermission(['crm:edit']), async (req, res) => {
  try {
    const user = (req as any).user;
    const tenantId = user?.tenantId;
    if (!tenantId) {
      res.status(401).json({ error: 'Unauthorized: missing tenant identity' });
      return;
    }
    const id = req.params.id;
    const existing = await db.queryOne<any>(`SELECT * FROM crm_quotes WHERE id = $1 AND "tenantId" = $2`, [id, tenantId]);
    if (!existing) {
      res.status(404).json({ error: 'Quote not found.' });
      return;
    }

    await db.execute(`DELETE FROM crm_quote_items WHERE "quoteId" = $1 AND "tenantId" = $2`, [id, tenantId]);
    await db.execute(`DELETE FROM crm_quotes WHERE id = $1 AND "tenantId" = $2`, [id, tenantId]);
    res.json({ success: true, message: 'Quote deleted successfully.' });
  } catch (err: any) {
    console.error('Error deleting quote:', err);
    res.status(500).json({ error: 'Internal server error while deleting quote' });
  }
});

// 11. GENERAL TASK UPDATE (PUT /api/crm/tasks/:id)
app.put('/api/crm/tasks/:id', requireAuth, requirePermission(['crm:edit']), async (req, res) => {
  try {
    const user = (req as any).user;
    const tenantId = user?.tenantId;
    if (!tenantId) {
      res.status(401).json({ error: 'Unauthorized: missing tenant identity' });
      return;
    }
    const id = req.params.id;
    const { title, description, taskType, priority, dueAt, assignedUserId, assignedTeamId, crmCompanyId, contactId, leadId, status } = req.body;

    const existing = await db.queryOne<any>(`SELECT * FROM crm_tasks WHERE id = $1 AND "tenantId" = $2`, [id, tenantId]);
    if (!existing) {
      res.status(404).json({ error: 'Task not found.' });
      return;
    }

    if (assignedUserId) {
      const validTaskUser = await db.queryOne<{ id: string }>(
        `SELECT id FROM users WHERE id = $1 AND "tenantId" = $2 AND LOWER(role) NOT IN ('platform_admin', 'master_admin', 'super_admin')`,
        [assignedUserId, tenantId]
      );
      if (!validTaskUser) {
        res.status(400).json({ error: 'Invalid assigned user: user not found in this workspace or is a platform administrator.' });
        return;
      }
    }

    const now = new Date().toISOString();
    await db.execute(`
      UPDATE crm_tasks
      SET title = COALESCE($1, title),
          description = COALESCE($2, description),
          "taskType" = COALESCE($3, "taskType"),
          priority = COALESCE($4, priority),
          "dueAt" = COALESCE($5, "dueAt"),
          "assignedUserId" = COALESCE($6, "assignedUserId"),
          "assignedTeamId" = COALESCE($7, "assignedTeamId"),
          "crmCompanyId" = COALESCE($8, "crmCompanyId"),
          "contactId" = COALESCE($9, "contactId"),
          "leadId" = COALESCE($10, "leadId"),
          status = COALESCE($11, status),
          "updatedAt" = $12
      WHERE id = $13 AND "tenantId" = $14
    `, [
      title ? title.trim() : null,
      description !== undefined ? description : null,
      taskType || null,
      priority || null,
      dueAt ? new Date(dueAt).toISOString() : null,
      assignedUserId || null,
      assignedTeamId || null,
      crmCompanyId !== undefined ? crmCompanyId : null,
      contactId !== undefined ? contactId : null,
      leadId !== undefined ? leadId : null,
      status || null,
      now,
      id,
      tenantId
    ]);

    const updated = await db.queryOne(`
      SELECT t.*, co.name as "companyName", ct.name as "contactName", l.name as "leadName", u.username as "assignedUserName"
      FROM crm_tasks t
      LEFT JOIN crm_companies co ON t."crmCompanyId" = co.id
      LEFT JOIN crm_contacts ct ON t."contactId" = ct.id
      LEFT JOIN leads l ON t."leadId" = l.id
      LEFT JOIN users u ON t."assignedUserId" = u.id
      WHERE t.id = $1 AND t."tenantId" = $2
    `, [id, tenantId]);

    res.json({ success: true, task: updated });
  } catch (err: any) {
    console.error('Error updating task:', err);
    res.status(500).json({ error: 'Internal server error while updating task' });
  }
});

// DELETE /api/crm/tasks/:id
app.delete('/api/crm/tasks/:id', requireAuth, requirePermission(['crm:edit']), async (req, res) => {
  try {
    const user = (req as any).user;
    const tenantId = user?.tenantId;
    if (!tenantId) {
      res.status(401).json({ error: 'Unauthorized: missing tenant identity' });
      return;
    }
    const id = req.params.id;
    const existing = await db.queryOne<any>(`SELECT * FROM crm_tasks WHERE id = $1 AND "tenantId" = $2`, [id, tenantId]);
    if (!existing) {
      res.status(404).json({ error: 'Task not found.' });
      return;
    }

    await db.execute(`DELETE FROM crm_tasks WHERE id = $1 AND "tenantId" = $2`, [id, tenantId]);
    res.json({ success: true, message: 'Task deleted successfully.' });
  } catch (err: any) {
    console.error('Error deleting task:', err);
    res.status(500).json({ error: 'Internal server error while deleting task' });
  }
});

// 12. CRM LEAD FIELDS UPDATE (PUT /api/crm/leads/:id)
app.put('/api/crm/leads/:id', requireAuth, requirePermission(['leads:edit', 'crm:edit']), async (req, res) => {
  try {
    const user = (req as any).user;
    const tenantId = user?.tenantId;
    if (!tenantId) {
      res.status(401).json({ error: 'Unauthorized: missing tenant identity' });
      return;
    }
    const id = req.params.id;
    const { name, phone, email, address, country, requirement, status, crmCompanyId, contactId, assignedTo } = req.body;

    const existing = await db.queryOne<any>(`SELECT * FROM leads WHERE id = $1 AND "tenantId" = $2`, [id, tenantId]);
    if (!existing) {
      res.status(404).json({ error: 'Lead not found.' });
      return;
    }

    await db.execute(`
      UPDATE leads
      SET name = COALESCE($1, name),
          phone = COALESCE($2, phone),
          address = COALESCE($3, address),
          country = COALESCE($4, country),
          requirement = COALESCE($5, requirement),
          status = COALESCE($6, status),
          "crmCompanyId" = COALESCE($7, "crmCompanyId"),
          "contactId" = COALESCE($8, "contactId"),
          "assignedTo" = COALESCE($9, "assignedTo")
      WHERE id = $10 AND "tenantId" = $11
    `, [
      name ? name.trim() : null,
      phone ? phone.trim() : null,
      address !== undefined ? address : null,
      country !== undefined ? country : null,
      requirement !== undefined ? requirement : null,
      status || null,
      crmCompanyId !== undefined ? crmCompanyId : null,
      contactId !== undefined ? contactId : null,
      assignedTo !== undefined ? assignedTo : null,
      id,
      tenantId
    ]);

    if (email && (contactId || existing.contactId)) {
      await db.execute(`UPDATE crm_contacts SET email = $1 WHERE id = $2 AND "tenantId" = $3`, [email.trim(), contactId || existing.contactId, tenantId]);
    }

    const updated = await db.queryOne(`
      SELECT l.*, co.name as "crmCompanyName", ct.name as "crmContactName", ct.email as "crmContactEmail"
      FROM leads l
      LEFT JOIN crm_companies co ON l."crmCompanyId" = co.id
      LEFT JOIN crm_contacts ct ON l."contactId" = ct.id
      WHERE l.id = $1 AND l."tenantId" = $2
    `, [id, tenantId]);

    res.json({ success: true, lead: updated });
  } catch (err: any) {
    console.error('Error updating lead CRM fields:', err);
    res.status(500).json({ error: 'Internal server error while updating lead' });
  }
});

// 13. CRM PERFORMANCE DASHBOARD (Real KPIs scoped by role)
app.get('/api/crm/performance', requireAuth, requirePermission(['crm:view']), async (req, res) => {
  try {
    const user = (req as any).user;
    const tenantId = user?.tenantId;
    if (!tenantId) {
      res.status(401).json({ error: 'Unauthorized: missing tenant identity' });
      return;
    }

    const { range } = req.query as Record<string, string>;
    const now = new Date();
    let startDate: string | null = null;
    let endDate: string | null = now.toISOString();

    if (range === 'today') {
      startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0).toISOString();
    } else if (range === '7d') {
      startDate = new Date(now.getTime() - 7 * 86400000).toISOString();
    } else if (range === '30d') {
      startDate = new Date(now.getTime() - 30 * 86400000).toISOString();
    } else if (range === 'this_month') {
      startDate = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0).toISOString();
    }

    const isPlatform = user.role === 'platform_admin' || user.role === 'master_admin';
    const isOwner = isPlatform || user.role === 'admin';
    const isTeamLead = user.role === 'team_lead';

    const scopedUserIds = await getScopedCrmUserIds(user, tenantId);

    // Fetch team users for breakdown if owner or team lead
    let agentList: any[] = [];
    if (isOwner) {
      agentList = await db.queryAll(`SELECT id, username, email, role FROM users WHERE "tenantId" = $1 ORDER BY username ASC`, [tenantId]);
    } else if (isTeamLead && scopedUserIds) {
      const phs = scopedUserIds.map((_, i) => `$${2 + i}`).join(', ');
      agentList = await db.queryAll(`SELECT id, username, email, role FROM users WHERE "tenantId" = $1 AND id IN (${phs}) ORDER BY username ASC`, [tenantId, ...scopedUserIds]);
    } else {
      agentList = [{ id: user.id, username: user.username, email: user.email, role: user.role }];
    }

    // Helper to filter by date
    const dateClause = (col: string, params: any[]) => {
      if (!startDate) return '';
      params.push(startDate, endDate);
      return ` AND (${col} >= $${params.length - 1} AND ${col} <= $${params.length})`;
    };

    // Calculate aggregated KPIs for the caller's view scope
    const agentBreakdown: any[] = [];
    let totalLeadsAssigned = 0;
    let totalCalls = 0;
    let totalAnsweredCalls = 0;
    let totalTasksCompleted = 0;
    let totalTasksOverdue = 0;
    let totalMeetingsConducted = 0;
    let totalWorkCompleted = 0;
    let totalQuotesCreated = 0;
    let totalQuotesWon = 0;
    let totalQuotedValue = 0;
    let totalWonValue = 0;

    const nowIso = now.toISOString();

    for (const agent of agentList) {
      // 1. Leads assigned
      const leadParams: any[] = [tenantId, agent.id];
      let lSql = `SELECT COUNT(*) as count FROM leads WHERE "tenantId" = $1 AND "assignedTo" = $2`;
      lSql += dateClause('"createdAt"', leadParams);
      const lRow = await db.queryOne<{ count: string }>(lSql, leadParams);
      const leadsCount = parseInt(lRow?.count || '0', 10);

      // 2. Calls made from call_outcomes
      const callParams: any[] = [tenantId, agent.id];
      let cSql = `SELECT COUNT(*) as count, SUM(CASE WHEN answered = 1 OR duration > 0 THEN 1 ELSE 0 END) as answered FROM call_outcomes WHERE "tenantId" = $1 AND "userId" = $2`;
      cSql += dateClause('"finalizedAt"', callParams);
      const cRow = await db.queryOne<{ count: string; answered: string }>(cSql, callParams);
      const callsCount = parseInt(cRow?.count || '0', 10);
      const answeredCount = parseInt(cRow?.answered || '0', 10);

      // 3. Tasks completed & overdue
      const taskParams: any[] = [tenantId, agent.id];
      let tSql = `
        SELECT 
          COUNT(*) as total,
          SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed,
          SUM(CASE WHEN status = 'open' AND "dueAt" < '${nowIso}' THEN 1 ELSE 0 END) as overdue,
          SUM(CASE WHEN "taskType" IN ('meeting', 'online_meeting') AND status = 'completed' THEN 1 ELSE 0 END) as meetings
        FROM crm_tasks WHERE "tenantId" = $1 AND "assignedUserId" = $2
      `;
      tSql += dateClause('"createdAt"', taskParams);
      const tRow = await db.queryOne<any>(tSql, taskParams);
      const tasksCompleted = parseInt(tRow?.completed || '0', 10);
      const tasksOverdue = parseInt(tRow?.overdue || '0', 10);
      const meetingsConducted = parseInt(tRow?.meetings || '0', 10);

      // 4. Work items completed
      const workParams: any[] = [tenantId, agent.id];
      let wSql = `SELECT COUNT(*) as completed FROM crm_work_items WHERE "tenantId" = $1 AND "assignedUserId" = $2 AND status = 'COMPLETED'`;
      wSql += dateClause('"completedAt"', workParams);
      const wRow = await db.queryOne<any>(wSql, workParams);
      const workCompleted = parseInt(wRow?.completed || '0', 10);

      // 5. Quotes generated & won
      const qParams: any[] = [tenantId, agent.id];
      let qSql = `
        SELECT 
          COUNT(*) as total,
          SUM(CASE WHEN status = 'ACCEPTED' THEN 1 ELSE 0 END) as won,
          COALESCE(SUM("totalAmount"), 0) as quoted_val,
          COALESCE(SUM(CASE WHEN status = 'ACCEPTED' THEN "totalAmount" ELSE 0 END), 0) as won_val
        FROM crm_quotes WHERE "tenantId" = $1 AND "assignedUserId" = $2
      `;
      qSql += dateClause('"createdAt"', qParams);
      const qRow = await db.queryOne<any>(qSql, qParams);
      const quotesCreated = parseInt(qRow?.total || '0', 10);
      const quotesWon = parseInt(qRow?.won || '0', 10);
      const quotedVal = parseFloat(qRow?.quoted_val || '0');
      const wonVal = parseFloat(qRow?.won_val || '0');

      // Accumulate totals
      totalLeadsAssigned += leadsCount;
      totalCalls += callsCount;
      totalAnsweredCalls += answeredCount;
      totalTasksCompleted += tasksCompleted;
      totalTasksOverdue += tasksOverdue;
      totalMeetingsConducted += meetingsConducted;
      totalWorkCompleted += workCompleted;
      totalQuotesCreated += quotesCreated;
      totalQuotesWon += quotesWon;
      totalQuotedValue += quotedVal;
      totalWonValue += wonVal;

      agentBreakdown.push({
        userId: agent.id,
        username: agent.username,
        role: agent.role,
        leadsAssigned: leadsCount,
        callsMade: callsCount,
        callsAnswered: answeredCount,
        tasksCompleted,
        tasksOverdue,
        meetingsConducted,
        workCompleted,
        quotesCreated,
        quotesWon,
        quotedValue: quotedVal,
        wonValue: wonVal,
        conversionRate: quotesCreated > 0 ? Math.round((quotesWon / quotesCreated) * 100) : 0
      });
    }

    res.json({
      role: user.role,
      isOwner,
      isTeamLead,
      period: range || 'all',
      summary: {
        totalLeadsAssigned,
        totalCalls,
        totalAnsweredCalls,
        answerRate: totalCalls > 0 ? Math.round((totalAnsweredCalls / totalCalls) * 100) : 0,
        totalTasksCompleted,
        totalTasksOverdue,
        totalMeetingsConducted,
        totalWorkCompleted,
        totalQuotesCreated,
        totalQuotesWon,
        totalQuotedValue: Math.round(totalQuotedValue * 100) / 100,
        totalWonValue: Math.round(totalWonValue * 100) / 100,
        conversionRate: totalQuotesCreated > 0 ? Math.round((totalQuotesWon / totalQuotesCreated) * 100) : 0
      },
      agentBreakdown: (isOwner || isTeamLead) ? agentBreakdown : []
    });
  } catch (err: any) {
    console.error('Error fetching CRM performance:', err);
    res.status(500).json({ error: 'Internal server error while fetching performance metrics' });
  }
});

// 14. CRM GLOBAL CROSS-ENTITY SEARCH
app.get('/api/crm/search', requireAuth, requirePermission(['crm:view', 'leads:view']), async (req, res) => {
  try {
    const user = (req as any).user;
    const tenantId = user?.tenantId;
    if (!tenantId) {
      res.status(401).json({ error: 'Unauthorized: missing tenant identity' });
      return;
    }

    const query = (req.query.q as string || '').trim();
    if (!query || query.length < 2) {
      res.json({ results: [] });
      return;
    }

    const q = `%${query.toLowerCase()}%`;
    const scopedUserIds = await getScopedCrmUserIds(user, tenantId);

    const results: any[] = [];

    // Helper for role scoping
    const userFilter = (col: string, params: any[]) => {
      if (!scopedUserIds) return '';
      const phs = scopedUserIds.map((_, i) => `$${params.length + 1 + i}`).join(', ');
      params.push(...scopedUserIds);
      return ` AND (${col} IN (${phs}) OR ${col} IS NULL)`;
    };

    // 1. Companies
    const compParams: any[] = [tenantId, q];
    let compSql = `SELECT id, name, industry, phone, email, status FROM crm_companies WHERE "tenantId" = $1 AND (LOWER(name) LIKE $2 OR LOWER(COALESCE(email, '')) LIKE $2 OR LOWER(COALESCE(phone, '')) LIKE $2)`;
    compSql += userFilter('"assignedUserId"', compParams);
    compSql += ` LIMIT 10`;
    const companies = await db.queryAll<any>(compSql, compParams);
    for (const c of companies) {
      results.push({
        type: 'company',
        id: c.id,
        title: c.name,
        subtitle: `${c.industry || 'Company'} • ${c.phone || c.email || 'No contact info'}`,
        status: c.status,
        entityId: c.id
      });
    }

    // 2. Contacts
    const cntParams: any[] = [tenantId, q];
    let cntSql = `SELECT ct.id, ct.name, ct.email, ct.phone, ct."roleTitle", co.name as "companyName" FROM crm_contacts ct LEFT JOIN crm_companies co ON ct."crmCompanyId" = co.id WHERE ct."tenantId" = $1 AND (LOWER(ct.name) LIKE $2 OR LOWER(COALESCE(ct.email, '')) LIKE $2 OR LOWER(COALESCE(ct.phone, '')) LIKE $2)`;
    cntSql += userFilter('ct."assignedUserId"', cntParams);
    cntSql += ` LIMIT 10`;
    const contacts = await db.queryAll<any>(cntSql, cntParams);
    for (const ct of contacts) {
      results.push({
        type: 'contact',
        id: ct.id,
        title: ct.name,
        subtitle: `${ct.roleTitle ? ct.roleTitle + ' at ' : ''}${ct.companyName || 'Individual'} • ${ct.phone || ct.email || ''}`,
        status: 'Active',
        entityId: ct.id
      });
    }

    // 3. Leads
    const leadParams: any[] = [tenantId, q];
    let leadSql = `
      SELECT l.id, l.name, l.phone, l.status, co.name as "companyName", ct.email as "contactEmail"
      FROM leads l
      LEFT JOIN crm_companies co ON l."crmCompanyId" = co.id
      LEFT JOIN crm_contacts ct ON l."contactId" = ct.id
      WHERE l."tenantId" = $1 AND (LOWER(l.name) LIKE $2 OR LOWER(COALESCE(l.phone, '')) LIKE $2 OR LOWER(COALESCE(ct.email, '')) LIKE $2)
    `;
    leadSql += userFilter('l."assignedTo"', leadParams);
    leadSql += ` LIMIT 10`;
    const leads = await db.queryAll<any>(leadSql, leadParams);
    for (const l of leads) {
      results.push({
        type: 'lead',
        id: l.id,
        title: l.name,
        subtitle: `Lead • ${l.companyName || l.phone || l.contactEmail || ''}`,
        status: l.status,
        entityId: l.id
      });
    }

    // 4. Tasks & Meetings
    const taskParams: any[] = [tenantId, q];
    let taskSql = `SELECT id, title, "taskType", priority, status, "dueAt" FROM crm_tasks WHERE "tenantId" = $1 AND (LOWER(title) LIKE $2 OR LOWER(COALESCE(description, '')) LIKE $2)`;
    taskSql += userFilter('"assignedUserId"', taskParams);
    taskSql += ` LIMIT 10`;
    const tasks = await db.queryAll<any>(taskSql, taskParams);
    for (const t of tasks) {
      results.push({
        type: (t.taskType === 'meeting' || t.taskType === 'online_meeting') ? 'meeting' : 'task',
        id: t.id,
        title: t.title,
        subtitle: `${t.taskType.toUpperCase()} • Due: ${new Date(t.dueAt).toLocaleDateString()}`,
        status: t.status,
        entityId: t.id
      });
    }

    // 5. Work Items
    const workParams: any[] = [tenantId, q];
    let workSql = `SELECT id, title, category, priority, status FROM crm_work_items WHERE "tenantId" = $1 AND (LOWER(title) LIKE $2 OR LOWER(COALESCE(description, '')) LIKE $2 OR LOWER(category) LIKE $2)`;
    workSql += userFilter('"assignedUserId"', workParams);
    workSql += ` LIMIT 10`;
    const work = await db.queryAll<any>(workSql, workParams);
    for (const w of work) {
      results.push({
        type: 'work',
        id: w.id,
        title: w.title,
        subtitle: `Client Work • ${w.category} • Priority: ${w.priority}`,
        status: w.status,
        entityId: w.id
      });
    }

    // 6. Quotes
    const qteParams: any[] = [tenantId, q];
    let qteSql = `SELECT id, "quoteNumber", "packageName", "totalAmount", currency, status FROM crm_quotes WHERE "tenantId" = $1 AND (LOWER("quoteNumber") LIKE $2 OR LOWER(COALESCE(notes, '')) LIKE $2 OR LOWER("packageName") LIKE $2)`;
    qteSql += userFilter('"assignedUserId"', qteParams);
    qteSql += ` LIMIT 10`;
    const quotes = await db.queryAll<any>(qteSql, qteParams);
    for (const qte of quotes) {
      results.push({
        type: 'quote',
        id: qte.id,
        title: `Quote #${qte.quoteNumber}`,
        subtitle: `${qte.packageName} • ${qte.currency} ${Number(qte.totalAmount).toFixed(2)}`,
        status: qte.status,
        entityId: qte.id
      });
    }

    res.json({ results: results.slice(0, 30) });
  } catch (err: any) {
    console.error('Error performing global CRM search:', err);
    res.status(500).json({ error: 'Internal server error while searching' });
  }
});

// ============================================================================
// PRODUCT SUPER ADMIN / GLOBAL BACKOFFICE APIS (admin.zestify7.online)
// ============================================================================

export function emitPlatformEvent(event: string, payload: any) {
  try {
    io.to('platform_admins').emit(event, {
      ...payload,
      timestamp: new Date().toISOString()
    });
  } catch (err: any) {
    console.error('[Platform Event] Error broadcasting to platform_admins:', event, err.message);
  }
}

// GET /api/super-admin/overview: Authoritative snapshot of entire SaaS
app.get(['/api/super-admin/overview', '/api/admin/platform/overview', '/admin/platform/overview'], requirePlatformAdmin, async (req, res) => {
  try {
    const overview = await getGlobalPlatformOverview();
    const sessionList = Array.from(getSessions().values());
    const liveCalls = sessionList.filter((s: Session) => s.status === 'CALLING' || s.phoneStatus === 'CONNECTED').length;
    const connectedPhones = sessionList.filter((s: Session) => !!s.phoneSocketId).length;

    let emailJobsRunning = 0;
    let emailJobsFailed = 0;
    tenantEmailerJobs.forEach(j => {
      if (j.running) emailJobsRunning++;
    });

    res.json({
      success: true,
      overview: {
        ...overview,
        callsInProgress: liveCalls,
        activeTelephonySockets: connectedPhones,
        emailJobsRunning,
        emailJobsFailed,
        scraperJobsRunning: 0,
        scraperJobsFailed: 0,
        facebookJobsRunning: 0,
        facebookJobsFailed: 0,
        systemErrorsCount: (overview.pastDueTenants > 0 ? 1 : 0) + (overview.offlineDevices > 0 ? 1 : 0),
        uptimeSeconds: Math.floor(process.uptime())
      }
    });
  } catch (err: any) {
    console.error('[Super Admin] Overview error:', err);
    res.status(500).json({ error: 'Failed to retrieve platform overview', dataUnavailable: true });
  }
});

// GET /api/super-admin/telemetry: Legacy alias for platform telemetry
app.get('/api/super-admin/telemetry', requirePlatformAdmin, async (req, res) => {
  try {
    const metrics = await getGlobalSuperAdminMetrics();
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

// GET /api/super-admin/tenants: List all organizations with search, filtering, and pagination
app.get('/api/super-admin/tenants', requirePlatformAdmin, async (req, res) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 25;
    const search = (req.query.search as string) || '';
    const type = (req.query.type as string) || 'all';
    const status = (req.query.status as string) || 'all';
    const health = (req.query.health as string) || 'all';

    const result = await getDetailedTenantsList({ page, limit, search, type, status, health });
    res.json({
      success: true,
      ...result
    });
  } catch (err: any) {
    console.error('[Super Admin] Get tenants error:', err);
    res.status(500).json({ error: 'Failed to retrieve tenants', dataUnavailable: true });
  }
});

// GET /api/super-admin/tenants/:id and :id/detail: Consolidated tenant detail drawer snapshot
app.get(['/api/super-admin/tenants/:id', '/api/super-admin/tenants/:id/detail'], requirePlatformAdmin, async (req, res) => {
  try {
    const tenantId = req.params.id;
    const detail = await getTenantDetail(tenantId);
    if (!detail) {
      res.status(404).json({ error: 'Tenant organization not found' });
      return;
    }
    res.json({ success: true, detail });
  } catch (err: any) {
    console.error('[Super Admin] Get tenant detail error:', err);
    res.status(500).json({ error: 'Failed to retrieve tenant detail' });
  }
});

// GET /api/super-admin/devices: Global device and handset monitoring
app.get('/api/super-admin/devices', requirePlatformAdmin, async (req, res) => {
  try {
    const dbDevices = await getGlobalDevicesList();
    const sessionList = Array.from(getSessions().values());
    const enriched = dbDevices.map(d => {
      const liveSession = sessionList.find(s => s.phoneDeviceId === d.id || (s.phoneSocketId && s.tenantId === d.tenantId));
      const hasAuthSocket = authenticatedPhoneSockets.has(d.id);
      const activeCs = liveSession ? getCallSessionBySessionId(liveSession.id) : null;
      return {
        ...d,
        isSocketConnected: hasAuthSocket || !!liveSession?.phoneSocketId,
        activeCall: (activeCs && activeCs.state !== 'ENDED') ? activeCs.callId : null
      };
    });
    res.json({ success: true, devices: enriched, count: enriched.length });
  } catch (err: any) {
    console.error('[Super Admin] Get devices error:', err);
    res.status(500).json({ error: 'Failed to retrieve device monitoring' });
  }
});

// GET /api/super-admin/jobs: Global automation job observability
app.get('/api/super-admin/jobs', requirePlatformAdmin, async (req, res) => {
  try {
    const emailJobs: any[] = [];
    tenantEmailerJobs.forEach((job, tenantId) => {
      emailJobs.push({
        module: 'autoEmailer',
        tenantId,
        jobId: `email_${tenantId}`,
        status: job.running ? 'running' : 'idle',
        logsCount: job.logs.length,
        logs: job.logs.slice(-5)
      });
    });

    res.json({
      success: true,
      jobs: {
        scraper: [],
        emailer: emailJobs,
        facebook: []
      },
      summary: {
        totalRunning: emailJobs.filter(j => j.status === 'running').length,
        totalFailed: 0
      }
    });
  } catch (err: any) {
    console.error('[Super Admin] Get jobs error:', err);
    res.status(500).json({ error: 'Failed to retrieve job status' });
  }
});

// GET /api/super-admin/activity: Global operational platform audit feed
app.get('/api/super-admin/activity', requirePlatformAdmin, async (req, res) => {
  try {
    const limit = parseInt(req.query.limit as string) || 50;
    const activities = await getGlobalRecentActivity(limit);
    res.json({ success: true, activities });
  } catch (err: any) {
    console.error('[Super Admin] Get activity error:', err);
    res.status(500).json({ error: 'Failed to retrieve platform activity' });
  }
});

// POST /api/super-admin/provision: 1-click workspace organization provisioning
app.post('/api/super-admin/provision', requirePlatformAdmin, async (req, res) => {
  try {
    const { name, username, email, password, customerType, maxAgents, planId } = req.body;
    if (!name || typeof name !== 'string' || !name.trim()) {
      res.status(400).json({ error: 'Company / Workspace Name is required.' });
      return;
    }
    if (!username || typeof username !== 'string' || !username.trim()) {
      res.status(400).json({ error: 'Primary Owner Username is required.' });
      return;
    }
    if (!password || typeof password !== 'string' || password.length < 6) {
      res.status(400).json({ error: 'Initial password of at least 6 characters is required.' });
      return;
    }

    const { hash } = hashPassword(password);
    const result = await provisionWorkspaceOrganization({
      name: name.trim(),
      username: username.trim().toLowerCase(),
      email: email ? email.trim().toLowerCase() : undefined,
      passwordHash: hash,
      customerType: customerType === 'PERSONAL' ? 'PERSONAL' : 'COMPANY',
      maxAgents: typeof maxAgents === 'number' ? maxAgents : undefined,
      planId: planId || 'plan_starter'
    });

    emitPlatformEvent('platform:tenant-created', {
      tenantId: result.tenantId,
      name: name.trim(),
      username: result.username
    });

    res.status(201).json({
      ...result,
      message: 'Workspace organization created successfully.'
    });
  } catch (err: any) {
    console.error('[Super Admin] Provision error:', err);
    res.status(500).json({ error: err.message || 'Failed to provision workspace' });
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
    emitPlatformEvent('platform:tenant-updated', { tenantId, leadPoolMode });
    res.json({ success: true, message: `Tenant lead pool mode set to ${leadPoolMode}.` });
  } catch (err: any) {
    console.error('[Super Admin] Update mode error:', err);
    res.status(500).json({ error: 'Failed to update lead pool mode' });
  }
});

// PATCH /api/tenant/lead-pool-mode: Customer workspace lead routing mode (Company Owner only)
app.patch(['/api/tenant/lead-pool-mode', '/api/tenant/settings/lead-pool-mode'], requireTenantAdmin, async (req, res) => {
  try {
    const caller = (req as any).user;
    const tenantId = caller.tenantId;
    if (!tenantId) {
      res.status(400).json({ error: 'Tenant identity is required.' });
      return;
    }
    const { leadPoolMode } = req.body;
    if (leadPoolMode !== 'shared' && leadPoolMode !== 'assigned') {
      res.status(400).json({ error: 'Invalid leadPoolMode. Must be "shared" or "assigned".' });
      return;
    }
    await updateTenantLeadPoolMode(tenantId, leadPoolMode);
    emitPlatformEvent('platform:tenant-updated', { tenantId, leadPoolMode });
    res.json({ success: true, message: `Tenant lead pool mode set to ${leadPoolMode}.`, leadPoolMode });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/super-admin/tenants/:id/entitlements: Fetch company module ceiling for tenant
app.get('/api/super-admin/tenants/:id/entitlements', requirePlatformAdmin, async (req, res) => {
  try {
    const tenantId = req.params.id;
    const tenant = await getTenantById(tenantId);
    if (!tenant) {
      res.status(404).json({ error: 'Tenant organization not found.' });
      return;
    }
    const entitlements = await getTenantModuleEntitlements(tenantId);
    res.json({
      success: true,
      tenantId,
      tenantName: tenant.name,
      modules: CANONICAL_MODULES,
      entitlements
    });
  } catch (err: any) {
    console.error('[Super Admin] Get entitlements error:', err);
    res.status(500).json({ error: 'Failed to retrieve company entitlements.' });
  }
});

// PUT /api/super-admin/tenants/:id/entitlements: Update company module ceiling
app.put('/api/super-admin/tenants/:id/entitlements', requirePlatformAdmin, async (req, res) => {
  try {
    const tenantId = req.params.id;
    const caller = (req as any).user;
    const tenant = await getTenantById(tenantId);
    if (!tenant) {
      res.status(404).json({ error: 'Tenant organization not found.' });
      return;
    }

    const { moduleId, enabled, entitlements: bulkMapRaw, modules } = req.body;
    const bulkMap = bulkMapRaw || modules;

    const changes = bulkMap && typeof bulkMap === 'object' && !Array.isArray(bulkMap)
      ? Object.entries(bulkMap) : moduleId !== undefined ? [[moduleId, enabled]] : [];
    if (!changes.length || changes.some(([id, value]) => typeof value !== 'boolean' || !ALL_CANONICAL_MODULES.some(m => m.id === normalizeModuleKey(id)))) {
      res.status(400).json({ error: 'Provide known module IDs with boolean enabled values.' });
      return;
    }
    await db.withTransaction(async () => {
      for (const [id, value] of changes) await setTenantModuleEntitlement(tenantId, id, value as boolean, caller.username);
    });

    const updatedEntitlements = await getTenantModuleEntitlements(tenantId);
    emitPlatformEvent('platform:tenant-entitlements-updated', { tenantId, entitlements: updatedEntitlements });

    res.json({
      success: true,
      message: 'Company module entitlements updated successfully.',
      entitlements: updatedEntitlements
    });
  } catch (err: any) {
    console.error('[Super Admin] Update entitlements error:', err);
    res.status(500).json({ error: 'Failed to update company entitlements.' });
  }
});

// GET /api/super-admin/tenants/:id/access-matrix: Complete effective access inheritance matrix
app.get('/api/super-admin/tenants/:id/access-matrix', requirePlatformAdmin, async (req, res) => {
  try {
    const tenantId = req.params.id;
    const tenant = await getTenantById(tenantId);
    if (!tenant) {
      res.status(404).json({ error: 'Tenant organization not found.' });
      return;
    }
    const matrix = await getTenantAccessMatrix(tenantId);
    const entitlements = await getTenantModuleEntitlements(tenantId);
    res.json({
      success: true,
      tenantId,
      tenantName: tenant.name,
      companyCeiling: CANONICAL_MODULES.filter(m => entitlements[m.id]).map(m => m.id),
      matrix,
      accessMatrix: {
        users: matrix,
        matrix
      }
    });
  } catch (err: any) {
    console.error('[Super Admin] Access matrix error:', err);
    res.status(500).json({ error: 'Failed to retrieve tenant access matrix.' });
  }
});

// GET /api/company/entitlements: Read-only company module ceiling for customer workspace
app.get('/api/company/entitlements', requireAuth, async (req, res) => {
  try {
    const caller = (req as any).user;
    const tenantId = caller.tenantId;
    if (!tenantId) {
      res.status(400).json({ error: 'No tenant organization assigned.' });
      return;
    }
    const entitlements = await getTenantModuleEntitlements(tenantId);
    const enabledModules = CANONICAL_MODULES.filter(m => entitlements[m.id]);

    res.json({
      success: true,
      tenantId,
      modules: CANONICAL_MODULES,
      enabledModules: enabledModules.map(m => m.id),
      entitlements
    });
  } catch (err: any) {
    console.error('[Company] Get entitlements error:', err);
    res.status(500).json({ error: 'Failed to retrieve company entitlements.' });
  }
});

// PUT /api/super-admin/tenants/:id/status: Suspend or reactivate a tenant with required reason
app.put('/api/super-admin/tenants/:id/status', requirePlatformAdmin, async (req, res) => {
  try {
    const tenantId = req.params.id;
    const caller = (req as any).user;
    const { status, reason } = req.body;
    if (status !== 'active' && status !== 'suspended') {
      res.status(400).json({ error: 'Invalid status. Must be "active" or "suspended".' });
      return;
    }

    await updateTenantStatus(tenantId, status);
    const now = new Date().toISOString();
    try {
      await db.execute(`
        INSERT INTO audit_logs_admin (id, username, action, "targetType", "targetId", details, timestamp, "tenantId")
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      `, [
        'audit_' + crypto.randomUUID(),
        caller?.username || 'platform_admin',
        status === 'suspended' ? 'TENANT_SUSPENDED' : 'TENANT_RESTORED',
        'tenant',
        tenantId,
        JSON.stringify({ status, reason: reason || 'Platform Admin Action', performedBy: caller?.username }),
        now,
        tenantId
      ]);
    } catch (auditErr) {
      console.warn('[updateTenantStatus] Audit log error:', auditErr);
    }

    emitPlatformEvent('platform:tenant-suspended', { tenantId, status, reason });
    res.json({ success: true, message: `Tenant status set to ${status}.` });
  } catch (err: any) {
    console.error('[Super Admin] Update status error:', err);
    res.status(500).json({ error: 'Failed to update tenant status' });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// SUPERADMIN ROUTES — Only master account (role: superadmin) can access these
// Can suspend / restore / demote ANY user including platform_admins
// ─────────────────────────────────────────────────────────────────────────────

// GET /api/superadmin/users — list ALL users across the platform (including platform_admins)
app.get('/api/superadmin/users', requireAuth, requireSuperAdmin, async (req, res) => {
  try {
    const rows = await db.queryAll<any>(`
      SELECT id, username, email, role, status, "displayName", "tenantId", "createdAt", "updatedAt"
      FROM users
      ORDER BY
        CASE LOWER(role)
          WHEN 'superadmin'    THEN 0
          WHEN 'platform_admin' THEN 1
          WHEN 'admin'         THEN 2
          ELSE 3
        END,
        username ASC
    `);
    res.json({ users: rows, total: rows.length });
  } catch (err: any) {
    console.error('[Superadmin] List users error:', err);
    res.status(500).json({ error: 'Failed to list users.' });
  }
});

// PUT /api/superadmin/users/:id/status — suspend or restore ANY user (including platform_admins)
app.put('/api/superadmin/users/:id/status', requireAuth, requireSuperAdmin, async (req, res) => {
  try {
    const caller = (req as any).user;
    const { status, reason } = req.body;

    if (!['Active', 'Disabled', 'Suspended'].includes(status)) {
      res.status(400).json({ error: 'Status must be "Active", "Disabled", or "Suspended".' });
      return;
    }

    const target = await db.queryOne<any>(`SELECT id, username, role, status FROM users WHERE id = $1`, [req.params.id]);
    if (!target) {
      res.status(404).json({ error: 'User not found.' });
      return;
    }

    // Superadmin cannot suspend themselves
    if (target.id === caller.id) {
      res.status(400).json({ error: 'You cannot suspend your own master account.' });
      return;
    }

    // Prevent suspending another superadmin
    if (isSuperAdmin(target.role)) {
      res.status(403).json({ error: 'Cannot modify another superadmin account.' });
      return;
    }

    const now = new Date().toISOString();
    await db.execute(`UPDATE users SET status = $1, "updatedAt" = $2 WHERE id = $3`, [status, now, target.id]);

    // Audit log
    try {
      await db.execute(`
        INSERT INTO audit_logs_admin (id, username, action, "targetType", "targetId", details, timestamp, "tenantId")
        VALUES ($1, $2, $3, 'user', $4, $5, $6, NULL)
      `, [
        'audit_' + crypto.randomUUID(),
        caller.username,
        status === 'Active' ? 'SUPERADMIN_USER_RESTORED' : 'SUPERADMIN_USER_SUSPENDED',
        target.id,
        JSON.stringify({ targetUsername: target.username, targetRole: target.role, newStatus: status, reason: reason || 'Superadmin action' }),
        now
      ]);
    } catch { /* audit log is best-effort */ }

    console.log(`[Superadmin] ${caller.username} set ${target.username} (${target.role}) status → ${status}. Reason: ${reason || 'none'}`);
    res.json({ success: true, message: `User ${target.username} status updated to ${status}.`, userId: target.id, status });
  } catch (err: any) {
    console.error('[Superadmin] Update user status error:', err);
    res.status(500).json({ error: 'Failed to update user status.' });
  }
});

// PUT /api/superadmin/users/:id/role — change role of any user (downgrade platform_admin → admin, etc.)
app.put('/api/superadmin/users/:id/role', requireAuth, requireSuperAdmin, async (req, res) => {
  try {
    const caller = (req as any).user;
    const { role, reason } = req.body;

    const allowedRoles = ['platform_admin', 'admin', 'team_lead', 'agent', 'user'];
    if (!role || !allowedRoles.includes(role)) {
      res.status(400).json({ error: `Role must be one of: ${allowedRoles.join(', ')}.` });
      return;
    }

    const target = await db.queryOne<any>(`SELECT id, username, role, "tenantId" FROM users WHERE id = $1`, [req.params.id]);
    if (!target) {
      res.status(404).json({ error: 'User not found.' });
      return;
    }

    // Superadmin cannot demote themselves
    if (target.id === caller.id) {
      res.status(400).json({ error: 'Cannot change your own master role.' });
      return;
    }

    // Cannot promote anyone to superadmin via this endpoint (there can only be one)
    if (isSuperAdmin(target.role)) {
      res.status(403).json({ error: 'Cannot modify another superadmin account.' });
      return;
    }

    const now = new Date().toISOString();
    await db.execute(`UPDATE users SET role = $1, "updatedAt" = $2 WHERE id = $3`, [role, now, target.id]);

    try {
      await db.execute(`
        INSERT INTO audit_logs_admin (id, username, action, "targetType", "targetId", details, timestamp, "tenantId")
        VALUES ($1, $2, 'SUPERADMIN_ROLE_CHANGE', 'user', $3, $4, $5, NULL)
      `, [
        'audit_' + crypto.randomUUID(),
        caller.username,
        target.id,
        JSON.stringify({ targetUsername: target.username, oldRole: target.role, newRole: role, reason: reason || 'Superadmin action' }),
        now
      ]);
    } catch { /* audit log is best-effort */ }

    console.log(`[Superadmin] ${caller.username} changed ${target.username} role: ${target.role} → ${role}`);
    res.json({ success: true, message: `User ${target.username} role changed to ${role}.`, userId: target.id, oldRole: target.role, newRole: role });
  } catch (err: any) {
    console.error('[Superadmin] Change user role error:', err);
    res.status(500).json({ error: 'Failed to change user role.' });
  }
});

// DELETE /api/superadmin/users/:id — permanently delete any non-superadmin user
app.delete('/api/superadmin/users/:id', requireAuth, requireSuperAdmin, async (req, res) => {
  try {
    const caller = (req as any).user;
    const target = await db.queryOne<any>(`SELECT id, username, role FROM users WHERE id = $1`, [req.params.id]);
    if (!target) {
      res.status(404).json({ error: 'User not found.' });
      return;
    }
    if (target.id === caller.id) {
      res.status(400).json({ error: 'Cannot delete your own master account.' });
      return;
    }
    if (isSuperAdmin(target.role)) {
      res.status(403).json({ error: 'Cannot delete another superadmin account.' });
      return;
    }

    const now = new Date().toISOString();
    await db.execute(`DELETE FROM users WHERE id = $1`, [target.id]);

    try {
      await db.execute(`
        INSERT INTO audit_logs_admin (id, username, action, "targetType", "targetId", details, timestamp, "tenantId")
        VALUES ($1, $2, 'SUPERADMIN_USER_DELETED', 'user', $3, $4, $5, NULL)
      `, [
        'audit_' + crypto.randomUUID(),
        caller.username,
        target.id,
        JSON.stringify({ targetUsername: target.username, targetRole: target.role }),
        now
      ]);
    } catch { /* audit log is best-effort */ }

    console.log(`[Superadmin] ${caller.username} deleted user ${target.username} (${target.role})`);
    res.json({ success: true, message: `User ${target.username} permanently deleted.` });
  } catch (err: any) {
    console.error('[Superadmin] Delete user error:', err);
    res.status(500).json({ error: 'Failed to delete user.' });
  }
});

// PUT /api/super-admin/tenants/:id/seats (and /limits): Update tenant seat quota with safety verification
app.put(['/api/super-admin/tenants/:id/seats', '/api/super-admin/tenants/:id/limits'], requirePlatformAdmin, async (req, res) => {
  try {
    const tenantId = req.params.id;
    const caller = (req as any).user;
    const { seatLimit, maxAgents, force } = req.body;
    const parsedLimit = parseInt(String(seatLimit !== undefined ? seatLimit : maxAgents), 10);

    if (isNaN(parsedLimit) || parsedLimit < 1) {
      res.status(400).json({ error: 'Valid positive seat limit integer is required.' });
      return;
    }

    const tenant = await getTenantById(tenantId);
    if (!tenant) {
      res.status(404).json({ error: 'Tenant organization not found.' });
      return;
    }

    const activeUsersCount = await db.queryOne<{ c: string | number }>(`
      SELECT COUNT(*) as c FROM users WHERE "tenantId" = $1 AND LOWER(role) NOT IN ('platform_admin', 'master_admin', 'super_admin')
    `, [tenantId]);
    const activeUsers = Number(activeUsersCount?.c || 0);

    if (parsedLimit < activeUsers && !force) {
      res.status(400).json({
        error: `Cannot reduce seat limit to ${parsedLimit}. Current active usage is ${activeUsers} seats. Set force=true to override.`,
        activeUsers,
        currentLimit: tenant.maxAgents || 10,
        requiresConfirmation: true
      });
      return;
    }

    const result = await updateTenantSeatLimit(tenantId, parsedLimit, caller?.username || 'platform_admin');
    emitPlatformEvent('platform:tenant-updated', { tenantId, maxAgents: parsedLimit });

    res.json({
      success: true,
      message: `Workspace seat limit successfully updated to ${parsedLimit} seats.`,
      seatLimit: parsedLimit,
      activeUsers: result.activeUsers,
      previousLimit: result.previousLimit
    });
  } catch (err: any) {
    console.error('[Super Admin] Update seats error:', err);
    res.status(500).json({ error: 'Failed to update workspace seat limit' });
  }
});

// POST /api/super-admin/tenants/:id/adjust-trial & /extend-trial: Add or reduce trial duration
app.post(['/api/super-admin/tenants/:id/adjust-trial', '/api/super-admin/tenants/:id/extend-trial'], requirePlatformAdmin, async (req, res) => {
  try {
    const tenantId = req.params.id;
    const { action, days, hours, customDate, daysToAdd, daysToReduce } = req.body;
    const tenant = await getTenantById(tenantId);
    if (!tenant) {
      res.status(404).json({ error: 'Tenant organization not found.' });
      return;
    }

    let sub = await db.queryOne<any>(`
      SELECT * FROM subscriptions 
      WHERE "tenantId" = $1 
      ORDER BY "createdAt" DESC LIMIT 1
    `, [tenantId]);

    // Current expiration anchor
    let currentEndMs: number;
    if (sub?.currentPeriodEnd) {
      currentEndMs = new Date(sub.currentPeriodEnd).getTime();
    } else if (sub?.trialEnd) {
      currentEndMs = new Date(sub.trialEnd).getTime();
    } else {
      currentEndMs = new Date(tenant.createdAt).getTime() + 14 * 86400000;
    }

    let newEndTime: number;

    if (action === 'expire_now') {
      newEndTime = Date.now() - 1000; // Expired immediately
    } else if (action === 'set_custom' && customDate) {
      newEndTime = new Date(customDate).getTime();
    } else {
      // Determine delta in milliseconds
      let deltaDays = 0;
      if (typeof days === 'number') deltaDays = days;
      else if (daysToAdd) deltaDays = Number(daysToAdd);
      else if (daysToReduce) deltaDays = -Math.abs(Number(daysToReduce));
      else if (req.body.days) deltaDays = Number(req.body.days);

      let deltaHours = typeof hours === 'number' ? hours : 0;
      const totalDeltaMs = (deltaDays * 86400000) + (deltaHours * 3600000);

      if (totalDeltaMs > 0 && currentEndMs < Date.now()) {
        // If extending an already expired trial, start adding from now
        newEndTime = Date.now() + totalDeltaMs;
      } else {
        newEndTime = currentEndMs + totalDeltaMs;
      }
    }

    const newEndIso = new Date(newEndTime).toISOString();
    const nowIso = new Date().toISOString();
    const isNowExpired = newEndTime <= Date.now();

    if (sub) {
      await db.execute(`
        UPDATE subscriptions 
        SET "currentPeriodEnd" = $1, "trialEnd" = $1, status = 'trialing', "updatedAt" = $2 
        WHERE id = $3
      `, [newEndIso, nowIso, sub.id]);
    } else {
      const newSubId = 'sub_' + crypto.randomUUID().replace(/-/g, '').slice(0, 16);
      await db.execute(`
        INSERT INTO subscriptions (id, "tenantId", "planId", status, "currentPeriodStart", "currentPeriodEnd", "trialStart", "trialEnd", "createdAt", "updatedAt", provider)
        VALUES ($1, $2, 'plan_starter', 'trialing', $3, $4, $3, $4, $3, $3, 'manual')
      `, [newSubId, tenantId, tenant.createdAt || nowIso, newEndIso]);
    }

    await db.execute(`
      UPDATE tenants 
      SET status = 'trial', "updatedAt" = $1 
      WHERE id = $2
    `, [nowIso, tenantId]);

    // Admin audit logging
    try {
      await db.execute(`
        INSERT INTO audit_logs_admin (id, username, action, "targetType", "targetId", details, timestamp, "tenantId")
        VALUES ($1, $2, $3, 'tenant', $4, $5, $6, $4)
      `, [
        'audit_' + crypto.randomUUID(),
        (req as any).user?.username || 'platform_admin',
        'ADJUST_TRIAL',
        tenantId,
        `Adjusted trial for ${tenant.name} (${tenantId}). New expiration: ${newEndIso} (Expired: ${isNowExpired})`,
        nowIso
      ]);
    } catch {}

    res.json({
      success: true,
      message: isNowExpired 
        ? 'Trial expired immediately.' 
        : `Trial duration adjusted successfully. New expiration: ${new Date(newEndTime).toLocaleString()}`,
      newPeriodEnd: newEndIso,
      remainingMs: Math.max(0, newEndTime - Date.now()),
      isExpired: isNowExpired
    });
  } catch (err: any) {
    console.error('[Super Admin] Adjust trial error:', err);
    res.status(500).json({ error: err.message || 'Failed to adjust trial.' });
  }
});

// PUT /api/super-admin/tenants/:id/plan: Authoritative workspace plan and subscription tier update
app.put('/api/super-admin/tenants/:id/plan', requirePlatformAdmin, async (req, res) => {
  try {
    const tenantId = req.params.id;
    const { planId } = req.body;
    if (!planId || typeof planId !== 'string') {
      res.status(400).json({ error: 'Valid planId is required (starter, pro, enterprise).' });
      return;
    }
    const cleanPlan = planId.toLowerCase().replace(/^plan_/, '').trim();
    if (!['starter', 'pro', 'enterprise', 'legacy'].includes(cleanPlan)) {
      res.status(400).json({ error: 'Invalid plan. Allowed: starter, pro, enterprise.' });
      return;
    }

    const tenant = await getTenantById(tenantId);
    if (!tenant) {
      res.status(404).json({ error: 'Tenant organization not found.' });
      return;
    }

    const fullPlanId = 'plan_' + cleanPlan;
    const nowIso = new Date().toISOString();

    // 1. Update tenants table tier
    await db.execute(`UPDATE tenants SET tier = $1, "updatedAt" = $2 WHERE id = $3`, [cleanPlan, nowIso, tenantId]);

    // 2. Update or insert subscription
    const existingSub = await db.queryOne<any>(`
      SELECT id FROM subscriptions 
      WHERE "tenantId" = $1 
      ORDER BY "createdAt" DESC LIMIT 1
    `, [tenantId]);

    if (existingSub) {
      await db.execute(`
        UPDATE subscriptions 
        SET "planId" = $1, "updatedAt" = $2 
        WHERE id = $3
      `, [fullPlanId, nowIso, existingSub.id]);
    } else {
      const newSubId = 'sub_' + crypto.randomUUID().replace(/-/g, '').slice(0, 16);
      const periodEnd = new Date(Date.now() + 30 * 86400000).toISOString();
      await db.execute(`
        INSERT INTO subscriptions (id, "tenantId", "planId", status, "currentPeriodStart", "currentPeriodEnd", "createdAt", "updatedAt", provider)
        VALUES ($1, $2, $3, 'active', $4, $5, $4, $4, 'manual')
      `, [newSubId, tenantId, fullPlanId, nowIso, periodEnd]);
    }

    // 3. Admin audit log
    try {
      await db.execute(`
        INSERT INTO audit_logs_admin (id, username, action, "targetType", "targetId", details, timestamp, "tenantId")
        VALUES ($1, $2, 'UPDATE_PLAN', 'tenant', $3, $4, $5, $3)
      `, [
        'audit_' + crypto.randomUUID(),
        (req as any).user?.username || 'platform_admin',
        tenantId,
        `Changed workspace plan to ${cleanPlan.toUpperCase()}`,
        nowIso
      ]);
    } catch {}

    emitPlatformEvent('platform:tenant-updated', { tenantId, plan: cleanPlan, tier: cleanPlan });

    res.json({
      success: true,
      plan: cleanPlan,
      tier: cleanPlan,
      message: `Workspace plan updated to ${cleanPlan.toUpperCase()}`
    });
  } catch (err: any) {
    console.error('[Super Admin] Update plan error:', err);
    res.status(500).json({ error: 'Failed to update workspace plan' });
  }
});

// GET /api/super-admin/tenants/:id/messages: Fetch direct messages & communication history for a company
app.get('/api/super-admin/tenants/:id/messages', requirePlatformAdmin, async (req, res) => {
  try {
    const tenantId = req.params.id;
    const tenant = await getTenantById(tenantId);
    if (!tenant) {
      res.status(404).json({ error: 'Tenant workspace not found.' });
      return;
    }

    // Ensure company_messages table exists
    await db.execute(`
      CREATE TABLE IF NOT EXISTS company_messages (
        id TEXT PRIMARY KEY,
        "tenantId" TEXT NOT NULL,
        "senderRole" TEXT NOT NULL DEFAULT 'super_admin',
        "senderId" TEXT,
        "senderName" TEXT NOT NULL DEFAULT 'Platform Administrator',
        "senderEmail" TEXT,
        "recipientEmail" TEXT NOT NULL,
        "recipientName" TEXT,
        subject TEXT NOT NULL,
        message TEXT NOT NULL,
        channel TEXT NOT NULL DEFAULT 'email',
        "deliveryStatus" TEXT NOT NULL DEFAULT 'sent',
        "deliveryError" TEXT,
        metadata TEXT,
        "createdAt" TEXT NOT NULL
      )
    `);

    const messages = await db.queryAll<any>(`
      SELECT id, "tenantId", "senderRole", "senderId", "senderName", "senderEmail",
             "recipientEmail", "recipientName", subject, message, channel,
             "deliveryStatus", "deliveryError", metadata, "createdAt"
      FROM company_messages
      WHERE "tenantId" = $1
      ORDER BY "createdAt" ASC
    `, [tenantId]);

    // Discover candidate recipient emails for this tenant
    const usersInTenant = await db.queryAll<any>(`
      SELECT id, username, email, role, "displayName"
      FROM users
      WHERE "tenantId" = $1 AND email IS NOT NULL
      ORDER BY CASE LOWER(role) WHEN 'admin' THEN 0 WHEN 'super_admin' THEN 1 ELSE 2 END, username ASC
    `, [tenantId]);

    const defaultRecipient = tenant.ownerEmail || usersInTenant.find(u => u.role === 'admin')?.email || usersInTenant[0]?.email || '';

    res.json({
      success: true,
      tenantId,
      tenantName: tenant.name,
      ownerEmail: tenant.ownerEmail,
      defaultRecipient,
      recipients: usersInTenant.map(u => ({
        id: u.id,
        username: u.username,
        email: u.email,
        role: u.role,
        displayName: u.displayName || u.username
      })),
      messages
    });
  } catch (err: any) {
    console.error('[Super Admin] Get company messages error:', err);
    res.status(500).json({ error: 'Failed to retrieve company messages' });
  }
});

// POST /api/super-admin/tenants/:id/messages: Send direct email / notice to company and log in chat history
app.post('/api/super-admin/tenants/:id/messages', requirePlatformAdmin, async (req, res) => {
  try {
    const tenantId = req.params.id;
    const caller = (req as any).user;
    const { recipientEmail, subject, message, channel = 'email' } = req.body;

    if (!recipientEmail || !isValidEmailFormat(recipientEmail)) {
      res.status(400).json({ error: 'A valid recipient email address is required.' });
      return;
    }

    if (!subject || !subject.trim()) {
      res.status(400).json({ error: 'Subject line is required.' });
      return;
    }

    if (!message || message.trim().length < 3) {
      res.status(400).json({ error: 'Message content is required (at least 3 characters).' });
      return;
    }

    const tenant = await getTenantById(tenantId);
    if (!tenant) {
      res.status(404).json({ error: 'Tenant workspace not found.' });
      return;
    }

    const now = new Date().toISOString();
    const msgId = 'cmsg_' + crypto.randomUUID();
    const senderName = caller?.displayName || caller?.username || 'Platform Administrator';
    const senderEmail = caller?.email || 'admin@octaldialer.com';

    // 1. Dispatch email via SMTP transporter
    const emailDispatch = await sendAdminCompanyEmail({
      toEmail: recipientEmail.trim().toLowerCase(),
      companyName: tenant.name,
      subject: subject.trim(),
      message: message.trim(),
      senderName,
      replyTo: senderEmail
    });

    const deliveryStatus = emailDispatch.success ? 'sent' : 'failed';
    const deliveryError = emailDispatch.error || null;

    // 2. Persist in company_messages
    await db.execute(`
      CREATE TABLE IF NOT EXISTS company_messages (
        id TEXT PRIMARY KEY,
        "tenantId" TEXT NOT NULL,
        "senderRole" TEXT NOT NULL DEFAULT 'super_admin',
        "senderId" TEXT,
        "senderName" TEXT NOT NULL DEFAULT 'Platform Administrator',
        "senderEmail" TEXT,
        "recipientEmail" TEXT NOT NULL,
        "recipientName" TEXT,
        subject TEXT NOT NULL,
        message TEXT NOT NULL,
        channel TEXT NOT NULL DEFAULT 'email',
        "deliveryStatus" TEXT NOT NULL DEFAULT 'sent',
        "deliveryError" TEXT,
        metadata TEXT,
        "createdAt" TEXT NOT NULL
      )
    `);

    await db.execute(`
      INSERT INTO company_messages (
        id, "tenantId", "senderRole", "senderId", "senderName", "senderEmail",
        "recipientEmail", "recipientName", subject, message, channel,
        "deliveryStatus", "deliveryError", metadata, "createdAt"
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
    `, [
      msgId,
      tenantId,
      'super_admin',
      caller?.id || null,
      senderName,
      senderEmail,
      recipientEmail.trim().toLowerCase(),
      tenant.name,
      subject.trim(),
      message.trim(),
      channel,
      deliveryStatus,
      deliveryError,
      JSON.stringify({
        smtpMessageId: emailDispatch.messageId || null,
        sentByAdminId: caller?.id || null,
        sentByUsername: caller?.username || null
      }),
      now
    ]);

    // 3. Log to audit_logs_admin
    try {
      await db.execute(`
        INSERT INTO audit_logs_admin (id, username, action, "targetType", "targetId", details, timestamp, "tenantId")
        VALUES ($1, $2, 'COMPANY_MESSAGE_SENT', 'tenant', $3, $4, $5, $3)
      `, [
        'audit_' + crypto.randomUUID(),
        caller?.username || 'platform_admin',
        tenantId,
        JSON.stringify({
          recipientEmail,
          subject,
          deliveryStatus,
          deliveryError,
          channel
        }),
        now
      ]);
    } catch {}

    const createdRecord = {
      id: msgId,
      tenantId,
      senderRole: 'super_admin',
      senderId: caller?.id || null,
      senderName,
      senderEmail,
      recipientEmail: recipientEmail.trim().toLowerCase(),
      recipientName: tenant.name,
      subject: subject.trim(),
      message: message.trim(),
      channel,
      deliveryStatus,
      deliveryError,
      createdAt: now
    };

    // 4. Real-time platform event broadcast
    emitPlatformEvent('platform:company-message-sent', {
      tenantId,
      message: createdRecord
    });

    res.json({
      success: true,
      message: emailDispatch.success
        ? `Message sent to ${recipientEmail} and logged successfully.`
        : `Message saved in company history, but SMTP delivery could not dispatch: ${emailDispatch.error}`,
      deliveryStatus,
      data: createdRecord
    });
  } catch (err: any) {
    console.error('[Super Admin] Send company message error:', err);
    res.status(500).json({ error: 'Failed to send company message' });
  }
});

// GET /billing/subscription & /api/company/subscription: Tenant subscription & trial status
app.get(['/billing/subscription', '/api/billing/subscription', '/api/company/subscription'], requireAuth, async (req, res) => {
  try {
    const caller = (req as any).user;
    const tenantId = caller.tenantId;
    if (!tenantId) {
      res.status(400).json({ error: 'No workspace assigned to user.' });
      return;
    }

    const tenant = await getTenantById(tenantId);
    if (!tenant) {
      res.status(404).json({ error: 'Tenant workspace not found.' });
      return;
    }

    const sub = await db.queryOne<any>(`
      SELECT * FROM subscriptions 
      WHERE "tenantId" = $1 
      ORDER BY "createdAt" DESC LIMIT 1
    `, [tenantId]);

    const isTrial = tenant.status === 'trial' || sub?.status === 'trialing';
    const periodEnd = sub?.currentPeriodEnd || sub?.trialEnd || (isTrial ? new Date(new Date(tenant.createdAt).getTime() + 14 * 86400000).toISOString() : null);
    let daysLeft = 14;
    let remainingMs = 0;
    if (periodEnd) {
      remainingMs = Math.max(0, new Date(periodEnd).getTime() - Date.now());
      daysLeft = Math.ceil(remainingMs / (1000 * 60 * 60 * 24));
    }

    const plan = sub?.planId
      ? await db.queryOne<any>(`SELECT id, name, "priceMonthly", "priceYearly" FROM plans WHERE id = $1`, [sub.planId])
      : null;

    res.json({
      success: true,
      tenantId,
      status: tenant.status,
      isTrial,
      daysLeft,
      trialEndsAt: periodEnd,
      trialRemainingMs: remainingMs,
      isExpired: isTrial && remainingMs === 0,
      subscription: sub ? {
        ...sub,
        status: isTrial ? 'trialing' : sub.status,
        currentPeriodEnd: periodEnd || new Date(Date.now() + 14 * 86400000).toISOString(),
        trialEndsAt: periodEnd
      } : {
        id: `sub_${tenantId}`,
        planId: 'plan_starter',
        status: isTrial ? 'trialing' : 'active',
        currentPeriodEnd: periodEnd || new Date(Date.now() + 14 * 86400000).toISOString(),
        trialEndsAt: periodEnd
      },
      plan: plan || { id: 'plan_starter', name: 'Starter Plan', priceMonthly: 29 }
    });
  } catch (err: any) {
    console.error('[Subscription] Error fetching subscription state:', err);
    res.status(500).json({ error: 'Failed to retrieve subscription status.' });
  }
});

// GET /api/super-admin/users: Global cross-tenant customer user directory
app.get('/api/super-admin/users', requirePlatformAdmin, async (req, res) => {
  try {
    const search = (req.query.search as string) || '';
    const role = (req.query.role as string) || 'all';
    const status = (req.query.status as string) || 'all';
    const tenantId = (req.query.tenantId as string) || 'all';

    const users = await getGlobalCustomerUsers({ search, role, status, tenantId });
    res.json({ success: true, users, count: users.length });
  } catch (err: any) {
    console.error('[Super Admin] Get global users error:', err);
    res.status(500).json({ error: 'Failed to retrieve global users directory' });
  }
});

// GET /api/super-admin/system-health: Real-time operational infrastructure health monitoring
app.get('/api/super-admin/system-health', requirePlatformAdmin, async (req, res) => {
  try {
    const startDb = Date.now();
    let dbStatus = 'operational';
    let dbLatencyMs = 0;
    try {
      await db.queryOne(`SELECT 1 as alive`);
      dbLatencyMs = Date.now() - startDb;
      if (dbLatencyMs > 500) dbStatus = 'degraded';
    } catch {
      dbStatus = 'offline';
    }

    const sessionList = Array.from(getSessions().values());
    const connectedPhones = sessionList.filter((s: Session) => !!s.phoneSocketId).length;
    const authenticatedHandsets = authenticatedPhoneSockets.size;
    const mem = process.memoryUsage();

    let runningJobs = 0;
    tenantEmailerJobs.forEach(j => { if (j.running) runningJobs++; });

    const health = {
      status: (dbStatus === 'operational') ? 'operational' : 'degraded',
      timestamp: new Date().toISOString(),
      uptimeSeconds: Math.floor(process.uptime()),
      api: {
        status: 'operational',
        nodeVersion: process.version,
        environment: process.env.NODE_ENV || 'production'
      },
      database: {
        status: dbStatus,
        latencyMs: dbLatencyMs,
        provider: 'PostgreSQL'
      },
      realtime: {
        status: 'operational',
        connectedClients: io.engine ? io.engine.clientsCount : 0,
        activeLaptops: sessionList.length,
        pairedPhones: connectedPhones
      },
      telephony: {
        status: connectedPhones > 0 ? 'operational' : 'idle',
        activeSockets: authenticatedHandsets,
        connectedPhones,
        gsmCalling: 'ready'
      },
      jobs: {
        status: 'operational',
        runningJobs,
        failedJobs: 0
      },
      memory: {
        rssMb: Math.round(mem.rss / 1024 / 1024),
        heapUsedMb: Math.round(mem.heapUsed / 1024 / 1024),
        heapTotalMb: Math.round(mem.heapTotal / 1024 / 1024)
      }
    };

    res.json({ success: true, health });
  } catch (err: any) {
    console.error('[Super Admin] System health error:', err);
    res.status(500).json({ error: 'Failed to retrieve system health' });
  }
});

// POST /api/super-admin/impersonate/exit: Record impersonation termination
app.post('/api/super-admin/impersonate/exit', requireAuth, async (req, res) => {
  try {
    const user = (req as any).user;
    if (!user?.impersonatedBy) {
      res.status(400).json({ error: 'No active impersonation session to exit.' });
      return;
    }
    const now = new Date().toISOString();
    try {
      await db.execute(`
        INSERT INTO audit_logs_admin (id, username, action, "targetType", "targetId", details, timestamp, "tenantId")
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      `, [
        'audit_' + crypto.randomUUID(),
        user?.impersonatedBy || user?.username || 'platform_admin',
        'IMPERSONATION_ENDED',
        'user',
        user?.id || 'unknown',
        JSON.stringify({
          endedBy: user?.impersonatedBy || user?.username,
          targetUser: user?.username,
          tenantId: user?.tenantId,
          endedAt: now
        }),
        now,
        user?.tenantId || null
      ]);
    } catch (auditErr) {
      console.warn('[Impersonate Exit] Audit error:', auditErr);
    }
    res.json({ success: true, message: 'Impersonation session ended.' });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to record impersonation exit' });
  }
});

// POST /api/super-admin/impersonate/:id: Audited support impersonation into tenant workspace
app.post('/api/super-admin/impersonate/:id', requirePlatformAdmin, async (req, res) => {
  try {
    const targetTenantId = req.params.id;
    const caller = (req as any).user;
    const { userId, reason } = req.body || {};
    const tenant = await getTenantById(targetTenantId);
    if (!tenant) {
      res.status(404).json({ error: 'Tenant organization not found.' });
      return;
    }

    let targetUser: any = null;
    if (userId) {
      targetUser = await db.queryOne<any>(`
        SELECT id, username, role, "tenantId", email, "displayName"
        FROM users
        WHERE id = $1 AND "tenantId" = $2
      `, [userId, targetTenantId]);
    }

    if (!targetUser) {
      // Find the primary admin or user for that tenant
      targetUser = await db.queryOne<any>(`
        SELECT id, username, role, "tenantId", email, "displayName"
        FROM users 
        WHERE "tenantId" = $1 
        ORDER BY CASE WHEN role IN ('platform_admin', 'admin') THEN 1 WHEN role = 'team_lead' THEN 2 ELSE 3 END, "createdAt" ASC 
        LIMIT 1
      `, [targetTenantId]);
    }

    if (!targetUser) {
      res.status(400).json({ error: 'No user accounts found under this workspace to impersonate.' });
      return;
    }

    // Role Downgrade Safety: If user has platform_admin role, downgrade strictly to 'admin' (Company Owner)
    const effectiveRole = (targetUser.role === 'platform_admin' || targetUser.role === 'master_admin') ? 'admin' : targetUser.role;
    const jwt = require('jsonwebtoken');
    const secret = process.env.JWT_SECRET || 'octal-dev-secret';
    const auditReason = (reason && typeof reason === 'string' && reason.trim()) ? reason.trim() : 'Platform Support Investigation';

    const payload = {
      sub: targetUser.id,
      username: targetUser.username,
      role: effectiveRole,
      tenantId: targetUser.tenantId,
      impersonatedBy: caller.username,
      impersonatedReason: auditReason
    };
    const impersonationToken = jwt.sign(payload, secret, { expiresIn: 3600 });

    // Immutable Audit Trail Recording
    const now = new Date().toISOString();
    try {
      await db.execute(`
        INSERT INTO audit_logs_admin (id, username, action, "targetType", "targetId", details, timestamp, "tenantId")
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      `, [
        'audit_' + crypto.randomUUID(),
        caller.username,
        'IMPERSONATION_STARTED',
        'user',
        targetUser.id,
        JSON.stringify({
          platformActor: caller.username,
          targetUser: targetUser.username,
          targetUserId: targetUser.id,
          targetRole: effectiveRole,
          tenantId: targetTenantId,
          tenantName: tenant.name,
          reason: auditReason,
          startedAt: now
        }),
        now,
        targetTenantId
      ]);
    } catch (auditErr) {
      console.warn('[Impersonate] Audit log error:', auditErr);
    }

    res.json({
      success: true,
      token: impersonationToken,
      user: {
        id: targetUser.id,
        username: targetUser.username,
        displayName: targetUser.displayName || targetUser.username,
        role: effectiveRole,
        tenantId: targetUser.tenantId,
        email: targetUser.email
      },
      tenant,
      reason: auditReason
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

    const fu = await db.queryOne<{ leadId: string }>(`SELECT "leadId" FROM crm_follow_ups WHERE id = $1 AND "tenantId" = $2`, [id, tenantId]);
    if (!fu) {
      res.status(404).json({ error: 'Follow-up not found in your organization.' });
      return;
    }

    const canEdit = await canEditLead(user, fu.leadId, tenantId);
    if (!canEdit) {
      res.status(403).json({ error: 'Forbidden: You do not have permission to update follow-ups for this lead.' });
      return;
    }

    const updated = await updateFollowUpStatus(id, tenantId, status, notes);
    if (!updated) {
      res.status(404).json({ error: 'Follow-up not found in your organization.' });
      return;
    }

    await recordLeadActivity({
      leadId: fu.leadId,
      tenantId,
      userId: user.id,
      username: user.username,
      eventType: 'FOLLOW_UP_UPDATED',
      description: `Follow-up marked as ${status}${notes ? ': ' + notes : ''}`
    });

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

    const canRead = await canReadLead((req as any).user, lead, tenantId);
    if (!canRead) {
      res.status(403).json({ error: 'Forbidden: You do not have permission to view activities for this lead.' });
      return;
    }

    const activities = await getLeadActivities(leadId, tenantId);
    res.json({ activities });
  } catch (err: any) {
    console.error('Error fetching lead activities:', err);
    res.status(500).json({ error: 'Internal server error while fetching lead activities' });
  }
});

// REST: Delete single lead (protected, strictly Company Owner / Platform Owner)
app.delete(['/api/leads/:id', '/leads/:id'], requireAuth, requireCompanyOwnerOrPlatformAdmin, requirePermission(['leads:delete', 'crm:delete']), async (req, res) => {
  const caller = (req as any).user;
  const tenantId = caller?.tenantId;
  if (!tenantId) {
    res.status(401).json({ error: 'Unauthorized: missing tenant identity' });
    return;
  }
  const canDel = await canDeleteLead(caller, req.params.id, tenantId);
  if (!canDel) {
    res.status(403).json({ error: 'Forbidden: You do not have permission to delete leads.' });
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
app.post('/api/leads/purge-fake', requireAuth, requireCompanyOwnerOrPlatformAdmin, requirePermission('leads:delete'), async (req, res) => {
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
app.delete(['/campaigns/:id/leads', '/api/campaigns/:id/leads'], requireAuth, requireCompanyOwnerOrPlatformAdmin, requirePermission(['leads:delete', 'campaigns:delete']), async (req, res) => {
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
app.post(['/campaigns/:id/reset-status', '/api/campaigns/:id/reset-status'], requireAuth, requireCompanyOwnerOrPlatformAdmin, requirePermission(['leads:edit', 'campaigns:edit']), async (req, res) => {
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

// REST: Call logs history (protected — scoped per actor role)
app.get(['/logs', '/api/logs', '/api/call-logs'], requireAuth, requirePermission(['history:view_logs', 'calls:view_queue']), async (req, res) => {
  const caller = (req as any).user;
  const tenantId = caller?.tenantId;
  if (!tenantId) {
    res.status(401).json({ error: 'Unauthorized: missing tenant identity' });
    return;
  }
  res.json(await getScopedLogs(caller, tenantId));
});

// POST /api/logs/update & /logs/update — Update call disposition & sync CRM (protected)
app.post(['/api/logs/update', '/logs/update'], requireAuth, requirePermission(['calls:log_disposition', 'history:edit_disposition']), async (req, res) => {
  const {
    leadId,
    notes,
    logId,
    leadName,
    companyName,
    email,
    phone,
    pipelineStatus,
    task
  } = req.body as {
    leadId?: string;
    outcome?: string;
    notes?: string;
    disposition?: string;
    logId?: string;
    leadName?: string;
    companyName?: string;
    email?: string;
    phone?: string;
    pipelineStatus?: string;
    task?: {
      title: string;
      description?: string;
      priority?: string;
      dueAt: string;
      taskType?: string;
    };
  };
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

  try {
  const lead = await getLead(leadId, tenantId);
  if (!lead) {
    res.status(404).json({ error: 'Lead not found in your organization.' });
    return;
  }

  // Authorization check: EITHER canEditLead is true OR authoritative call/session/lock/journal proves user handled this lead
  const authorized = await canDispositionLead(user, lead, tenantId);
  if (!authorized) {
    res.status(403).json({ error: 'Forbidden: You do not have authorization to disposition this lead.' });
    return;
  }

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
    let targetCrmCompanyId = (lead as any).crmCompanyId;
    if (companyName && companyName.trim()) {
      const cleanCompName = companyName.trim();
      const existingComp = await db.queryOne<{ id: string }>(
        `SELECT id FROM crm_companies WHERE "tenantId" = $1 AND LOWER(name) = LOWER($2) LIMIT 1`,
        [tenantId, cleanCompName]
      );
      if (existingComp) {
        targetCrmCompanyId = existingComp.id;
      } else {
        const newCompId = 'comp_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7);
        await db.execute(
          `INSERT INTO crm_companies (id, "tenantId", name, status, "createdAt", "updatedAt") VALUES ($1, $2, $3, 'Active', $4, $4)`,
          [newCompId, tenantId, cleanCompName, new Date().toISOString()]
        );
        targetCrmCompanyId = newCompId;
      }
    }

    const newName = leadName?.trim() || lead.name;
    const newPhone = phone ? normalizePhone(phone) : lead.phone;
    const newEmail = email !== undefined ? (email.trim() || null) : (lead as any).email;
    const newStatus = pipelineStatus?.trim() || (outcome === 'INTERESTED' ? 'INTERESTED' : (outcome === 'CALLBACK_REQUESTED' ? 'CALLBACK' : 'COMPLETED'));

    await db.execute(`
      UPDATE leads 
      SET name = $1, phone = $2, "crmCompanyId" = $3, status = $4, email = $5
      WHERE id = $6 AND "tenantId" = $7
    `, [newName, newPhone, targetCrmCompanyId, newStatus, newEmail, leadId, tenantId]);

    // Record review note into CRM notes if provided
    if (notes && notes.trim()) {
      try {
        await recordCrmNote({
          tenantId,
          entityType: 'lead',
          entityId: leadId,
          category: 'call',
          body: notes.trim(),
          createdByUserId: user.id,
          createdByName: user.username
        });
      } catch (e) {
        console.warn('Could not record call note to crm_notes:', e);
      }
    }

    // Record Quick Task if provided
    let createdTaskId: string | null = null;
    if (task && task.title && task.dueAt) {
      const parsedDueAt = new Date(task.dueAt).getTime();
      const safeDueAt = !isNaN(parsedDueAt) ? new Date(parsedDueAt).toISOString() : new Date(Date.now() + 30 * 60000).toISOString();
      createdTaskId = 'task_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7);
      await db.execute(`
        INSERT INTO crm_tasks (id, "tenantId", title, description, "taskType", status, priority, "dueAt", "leadId", "crmCompanyId", "createdByUserId", "assignedUserId", "createdAt", "updatedAt")
        VALUES ($1, $2, $3, $4, $5, 'open', $6, $7, $8, $9, $10, $11, $12, $12)
      `, [
        createdTaskId,
        tenantId,
        task.title.trim(),
        task.description ? task.description.trim() : null,
        task.taskType || 'call',
        task.priority || 'medium',
        safeDueAt,
        leadId,
        targetCrmCompanyId || null,
        user.id,
        user.id,
        new Date().toISOString()
      ]);

      await recordLeadActivity({
        leadId,
        tenantId,
        userId: user.id,
        username: user.username,
        eventType: 'TASK_CREATED',
        description: `Task scheduled: ${task.title} (Due: ${task.dueAt})`
      });
      io.to(`tenant_${tenantId}`).emit('crm:tasks:updated');
    }

    logUserActivity({
      tenantId,
      userId: user.id,
      username: user.username,
      action: 'DISPOSITION_SAVED',
      resourceType: 'lead',
      resourceId: leadId,
      details: { outcome, notes: notes || '', leadName: lead.name, campaignId: lead.campaignId },
      req
    });
    recordAgentCallMetric({
      tenantId,
      userId: user.id,
      username: user.username,
      outcome,
      duration: lead.duration || 0,
      timestamp: new Date().toISOString()
    });

    const nextLead = lead.campaignId ? await getNextPendingLead(lead.campaignId, tenantId, leadId) : null;
    io.to(`tenant_${tenantId}`).emit('leads:updated');
    res.json({
      success: true,
      message: 'Disposition and CRM data synchronized successfully.',
      nextLeadId: nextLead ? nextLead.id : null,
      nextLead: nextLead || null,
      taskId: createdTaskId
    });
  } else {
    res.status(404).json({ error: 'Lead or log record not found in tenant.' });
  }
  } catch (err: any) {
    console.error('Error updating log disposition:', err);
    res.status(500).json({ error: 'Internal server error while updating disposition' });
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

// ─── Activity & Performance Metrics REST Endpoints ─────────────────────────

// GET /api/activity/logs — Granular workspace activity trail (protected)
app.get(['/api/activity/logs', '/activity/logs'], requireAuth, async (req, res) => {
  try {
    const user = (req as any).user;
    const tenantId = user?.tenantId;
    if (!tenantId) {
      res.status(401).json({ error: 'Unauthorized: missing tenant identity' });
      return;
    }
    const { userId, action, limit, page } = req.query as {
      userId?: string;
      action?: string;
      limit?: string;
      page?: string;
    };
    const result = await getUserActivityLogs(tenantId, {
      userId: userId ? String(userId) : undefined,
      action: action ? String(action) : undefined,
      limit: limit ? Number(limit) : undefined,
      page: page ? Number(page) : undefined
    });
    res.json({ success: true, ...result });
  } catch (err: any) {
    console.error('Error fetching activity logs:', err);
    res.status(500).json({ error: 'Internal server error while fetching activity logs' });
  }
});

// GET /api/metrics/agents — Daily agent call & talk time scorecard (protected)
app.get(['/api/metrics/agents', '/metrics/agents'], requireAuth, async (req, res) => {
  try {
    const user = (req as any).user;
    const tenantId = user?.tenantId;
    if (!tenantId) {
      res.status(401).json({ error: 'Unauthorized: missing tenant identity' });
      return;
    }
    const { userId, date, limit } = req.query as {
      userId?: string;
      date?: string;
      limit?: string;
    };
    const metrics = await getAgentDailyMetrics(tenantId, {
      userId: userId ? String(userId) : undefined,
      date: date ? String(date) : undefined,
      limit: limit ? Number(limit) : undefined
    });
    res.json({ success: true, metrics });
  } catch (err: any) {
    console.error('Error fetching agent metrics:', err);
    res.status(500).json({ error: 'Internal server error while fetching agent metrics' });
  }
});

registerScraperRoutes(app, requireAuth, io);

// ─── LEAD GEN Z INTEGRATION BOUNDARY ───────────────────────────────
// POST /api/integrations/leadgen/import — Ingests leads from LEAD GEN Z
app.post('/api/integrations/leadgen/import', requireAuth, async (req: express.Request, res: express.Response) => {
  try {
    const caller = (req as any).user;
    let tenantId: string;
    const username = caller.username || 'lead_gen_z';

    if (isPlatformRole(caller.role)) {
      const targetWorkspaceId = (req.body.workspaceId || '').trim();
      if (!targetWorkspaceId) {
        res.status(400).json({ error: 'Platform Administrator must specify a valid target workspaceId.' });
        return;
      }
      const tenantRow = await db.queryOne<{ id: string }>(`SELECT id FROM tenants WHERE id = $1`, [targetWorkspaceId]);
      if (!tenantRow) {
        res.status(400).json({ error: 'Target workspace not found.' });
        return;
      }
      tenantId = tenantRow.id;
    } else {
      if (!caller.tenantId) {
        res.status(403).json({ error: 'Forbidden: User is not associated with an active workspace.' });
        return;
      }
      if (req.body.workspaceId && req.body.workspaceId.trim() !== caller.tenantId) {
        res.status(403).json({ error: 'Forbidden: Cross-tenant lead injection is strictly prohibited.' });
        return;
      }
      tenantId = caller.tenantId;
    }
    
    const {
      records = [],
      source = 'lead_gen_z',
      campaignName,
      crmCompanyId,
      teamId,
      assignedUserId,
      tags = []
    } = req.body;

    if (!Array.isArray(records) || records.length === 0) {
      res.status(400).json({ error: 'No lead records provided in payload.' });
      return;
    }

    const finalCampaignName = (campaignName || `Lead Gen Z Import - ${new Date().toISOString().slice(0, 10)}`).trim();
    
    // Format and sanitize raw leads
    const validLeads: { name: string; phone: string; address?: string; email?: string }[] = [];
    let skippedCount = 0;
    
    for (const r of records) {
      const rawPhone = String(r.phone || r.telephone || '').trim();
      const digitsOnly = rawPhone.replace(/\D/g, '');
      if (digitsOnly.length < 7) {
        skippedCount++;
        continue;
      }
      validLeads.push({
        name: (r.name || r.businessName || 'Discovered Lead').trim(),
        phone: rawPhone.replace(/[^0-9+]/g, '').trim(),
        address: r.address ? String(r.address).trim() : undefined,
        email: r.email ? String(r.email).trim() : undefined
      });
    }

    if (validLeads.length === 0) {
      res.status(400).json({ error: `No dialable business leads found (Skipped ${skippedCount} nondialable records).` });
      return;
    }

    const result = await createCampaign(
      finalCampaignName,
      `lead_gen_z_${Date.now()}.json`,
      validLeads,
      tenantId,
      {
        allowSharedPhoneBranches: true,
        idempotencyKey: `leadgen_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
      }
    );

    // Broadcast socket events so live Zestify UI updates instantly
    io.to(`tenant_${tenantId}`).emit('leads:updated');
    io.to(`tenant_${tenantId}`).emit('campaigns:updated');

    res.json({
      success: true,
      message: `Successfully imported ${result.finalCount} leads into Zestify campaign "${result.campaign.name}".`,
      campaignId: result.campaign.id,
      campaignName: result.campaign.name,
      importedCount: result.finalCount,
      dedupedCount: result.dedupedCount,
      skippedCount,
      workspaceId: tenantId,
      tenantId: tenantId,
      source,
      tags,
      timestamp: new Date().toISOString()
    });
  } catch (err: any) {
    console.error('[Lead Gen Z Integration Error]:', err);
    res.status(500).json({ error: err.message || 'Lead Gen Z import failed.' });
  }
});


// ─── ADMIN AUTHORITY MASTER CONTROL REST ENDPOINTS ────────────────────────────

// GET /api/admin/overview & /admin/overview
app.get(['/api/admin/overview', '/admin/overview'], requireAuth, requireAdmin, async (req, res) => {
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
const handleGetUsers = async (req: express.Request, res: express.Response) => {
  const user = (req as any).user;
  const isPlatform = isPlatformRole(user.role);
  const targetTenantId = (isPlatform && (req.query.tenantId as string)) || user.tenantId;

  const users = targetTenantId
    ? await db.queryAll(`
        SELECT u.id, u.username, u."displayName", u.phone, u.email, u.role, u.status, u."ipRestrictions", u."tenantId", u."createdAt", u."updatedAt", u."roleId",
               COALESCE(cr."roleName", CASE WHEN LOWER(u.role) = 'admin' THEN 'Administrator' WHEN LOWER(u.role) IN ('agent', 'user') THEN 'Agent' ELSE u.role END) AS "roleName"
        FROM users u
        LEFT JOIN custom_roles cr ON cr.id = u."roleId"
        WHERE u."tenantId" = $1 AND LOWER(u.role) NOT IN ('platform_admin', 'master_admin', 'super_admin')
        ORDER BY u."createdAt" DESC
      `, [targetTenantId]) as any[]
    : isPlatform
      ? await db.queryAll(`
          SELECT u.id, u.username, u."displayName", u.phone, u.email, u.role, u.status, u."ipRestrictions", u."tenantId", u."createdAt", u."updatedAt", u."roleId",
                 COALESCE(cr."roleName", CASE WHEN LOWER(u.role) = 'admin' THEN 'Administrator' WHEN LOWER(u.role) IN ('agent', 'user') THEN 'Agent' ELSE u.role END) AS "roleName"
          FROM users u
          LEFT JOIN custom_roles cr ON cr.id = u."roleId"
          WHERE LOWER(u.role) NOT IN ('platform_admin', 'master_admin', 'super_admin')
          ORDER BY u."createdAt" DESC
        `) as any[]
      : [];

  // Attach module permissions & calculate effective modules for each user
  const perms = targetTenantId
    ? await db.queryAll(`SELECT * FROM user_permissions WHERE "tenantId" = $1`, [targetTenantId]) as any[]
    : isPlatform
      ? await db.queryAll(`SELECT * FROM user_permissions`) as any[]
      : [];

  const permMap = new Map<string, any[]>();
  for (const p of perms) {
    if (!permMap.has(p.userId)) permMap.set(p.userId, []);
    permMap.get(p.userId)!.push(p);
  }

  // Resolve company entitlement ceiling for effective access calculation
  const entitlementCache = new Map<string, Record<string, boolean>>();
  for (const u of users) {
    const userPerms = permMap.get(u.id) || [];
    u.permissions = userPerms;
    if (!entitlementCache.has(u.tenantId)) {
      entitlementCache.set(u.tenantId, await getTenantModuleEntitlements(u.tenantId));
    }
    const ceiling = entitlementCache.get(u.tenantId)!;
    Object.assign(u, await getUserModuleAccess(u, ceiling));
    u.companyCeiling = CANONICAL_MODULES.filter(m => ceiling[m.id]).map(m => m.id);
  }

  res.json(users);
};
app.get(['/api/admin/users', '/admin/users'], requireAuth, requireCompanyOwnerOrPlatformAdmin, requirePermission('users:view'), handleGetUsers);
app.get(['/api/users', '/users'], requireAuth, requireCompanyOwnerOrPlatformAdmin, requirePermission('users:view'), handleGetUsers);

// POST /api/admin/users & /admin/users
const handleCreateUser = async (req: express.Request, res: express.Response) => {
  try {
    const caller = (req as any).user;
    const isPlatform = isPlatformRole(caller.role);
    const isCompanyOwnerRole = isCompanyOwner(caller);

    if (!isPlatform && !isCompanyOwnerRole) {
      res.status(403).json({ error: 'Forbidden: Only Platform Owners and Company Owners can create users.' });
      return;
    }

    const { username, password, email, role, roleId, phone, status = 'Active', ipRestrictions, firstName, lastName, initialPermissions } = req.body;
    if (!username || !password) {
      res.status(400).json({ error: 'Username and password required.' });
      return;
    }

    const roleRaw = (role || 'user').toLowerCase().trim();
    if (isPlatformRole(roleRaw)) {
      res.status(403).json({ error: 'Forbidden: Platform Administrator accounts cannot be created through customer user management.' });
      return;
    }

    let normalizedRole: string;
    if (roleRaw === 'agent' || roleRaw === 'user') {
      normalizedRole = 'user';
    } else if (roleRaw === 'team_lead') {
      normalizedRole = 'team_lead';
    } else if (roleRaw === 'admin') {
      if (!isPlatform) {
        res.status(403).json({ error: 'Forbidden: Company Owners cannot create Admin accounts.' });
        return;
      }
      normalizedRole = 'admin';
    } else {
      res.status(400).json({ error: `Invalid role. Allowed roles: user, agent, team_lead${isPlatform ? ', admin' : ''}.` });
      return;
    }

    const tenantId = isPlatform ? (req.body.tenantId || caller.tenantId) : caller.tenantId;
    if (!tenantId) {
      res.status(400).json({ error: 'Tenant organization identity is required to create a workspace user.' });
      return;
    }

    if (!isPlatform) {
      const seatUsage = await getTenantSeatUsage(tenantId);
      if (seatUsage.availableSeats <= 0) {
        res.status(400).json({
          error: `Seat limit reached for this workspace plan (${seatUsage.activeSeats + seatUsage.pendingInvitations} of ${seatUsage.maxSeats} seats committed). Upgrade plan to add more members.`
        });
        return;
      }
    }

    if (roleId) {
      const isValidRole = await validateRoleBelongsToTenant(roleId, tenantId);
      if (!isValidRole) {
        res.status(403).json({ error: 'Forbidden: Selected role does not belong to your organization.' });
        return;
      }
    }
    // Pre-validate initial module permissions if provided with company ceiling validation BEFORE creating user
    const rawModules = req.body.modules !== undefined ? req.body.modules : initialPermissions;
    let requestedMods: string[] = [];
    if (Array.isArray(rawModules)) {
      requestedMods = rawModules;
    } else if (rawModules && typeof rawModules === 'object') {
      requestedMods = Object.entries(rawModules)
        .filter(([_, v]) => Boolean(v))
        .map(([k, _]) => k);
    }

    requestedMods = [...new Set(requestedMods.map(normalizeModuleKey))];
    if (requestedMods.some(id => !ALL_CANONICAL_MODULES.some(m => m.id === id))) {
      res.status(400).json({ error: 'Unknown module assignment.' });
      return;
    }
    if (requestedMods.length > 0) {
      const companyEntitlements = await getTenantModuleEntitlements(tenantId);
      for (const modId of requestedMods) {
        const canonical = normalizeModuleKey(modId);
        if (!companyEntitlements || !companyEntitlements[canonical]) {
          res.status(403).json({
            error: `Forbidden: Cannot grant module '${canonical}'. It is not included in your company's platform entitlements ceiling.`
          });
          return;
        }
      }
    }

    let result: any;
    const computedDisplayName = (req.body.displayName || `${firstName || ''} ${lastName || ''}`.trim()) || username;
    const now = new Date().toISOString();

    await db.withTransaction(async () => {
      await lockWorkspaceForMembershipChange(tenantId);
      if ((await getTenantSeatUsage(tenantId)).availableSeats <= 0) throw new Error('Workspace seat limit reached.');
      result = await registerPublicUser({
        username,
        password,
        email,
        requestedRole: normalizedRole,
        tenantId
      });
      if (normalizedRole !== 'user') {
        await db.execute(`UPDATE users SET role = $1 WHERE id = $2`, [normalizedRole, result.user.id]);
      }

      // Save extended fields: displayName, phone, status, ipRestrictions, roleId
      await db.execute(
        `UPDATE users SET "displayName" = $1, phone = $2, status = $3, "ipRestrictions" = $4, "roleId" = $5 WHERE id = $6`,
        [computedDisplayName, phone || '', status || 'Active', ipRestrictions || '', roleId || null, result.user.id]
      );

      // Insert initial module permissions inside transaction
      for (const modId of rawModules !== undefined ? ALL_CANONICAL_MODULES.map(m => m.id) : requestedMods) {
        const canonical = normalizeModuleKey(modId);
        const permId = 'p_' + Math.random().toString(36).substring(2, 11);
        await db.execute(
          `INSERT INTO user_permissions (id, "userId", "moduleId", enabled, "grantedBy", "grantedAt", "tenantId")
           VALUES ($1, $2, $3, $7, $4, $5, $6)`,
          [permId, result.user.id, canonical, caller.username, now, tenantId, requestedMods.includes(canonical) ? 1 : 0]
        );
      }
    });

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
};
app.post(['/api/admin/users', '/admin/users'], requireAuth, requireCompanyOwnerOrPlatformAdmin, requirePermission('users:add'), handleCreateUser);
app.post(['/api/users', '/users'], requireAuth, requireCompanyOwnerOrPlatformAdmin, requirePermission('users:add'), handleCreateUser);

// PUT /api/admin/users/:id & /admin/users/:id (Unified update for role, password, and permissions)
app.put(['/api/admin/users/:id', '/admin/users/:id'], requireAuth, requireCompanyOwnerOrPlatformAdmin, requirePermission('users:edit'), async (req, res) => {
  try {
    const caller = (req as any).user;
    const isPlatform = isPlatformRole(caller.role);
    const targetUser = await db.queryOne(`SELECT id, role, status, "tenantId" FROM users WHERE id = $1`, [req.params.id]) as any;

    if (!targetUser) {
      res.status(404).json({ error: 'User not found.' });
      return;
    }

  if (!isPlatform && targetUser.tenantId !== caller.tenantId) {
    res.status(403).json({ error: 'Forbidden: Cannot edit a user from another organization.' });
    return;
  }

  if (isPlatformRole(targetUser.role)) {
    res.status(403).json({ error: 'Forbidden: Cannot modify platform administrator account through customer API.' });
    return;
  }

  const { role, roleId, newPassword, password, permissions, displayName, firstName, lastName, email, phone, status, ipRestrictions } = req.body;

  if (role && isPlatformRole(role)) {
    res.status(403).json({ error: 'Forbidden: Cannot promote user to platform administrator through customer API.' });
    return;
  }

  // Validate roleId if provided
  if (roleId) {
    const targetTenantId = targetUser.tenantId || caller.tenantId;
    const isValidRole = await validateRoleBelongsToTenant(roleId, targetTenantId);
    if (!isValidRole) {
      res.status(400).json({ error: 'Invalid role: Selected role does not belong to user\'s organization.' });
      return;
    }
  }

  // Owner Protection: Prevent disabling or demoting the final active Company Owner
  if (targetUser.role === 'admin' && ((status && status !== 'Active') || (role && role !== 'admin'))) {
    const remainingOwners = await db.queryOne<{ count: string | number }>(
      `SELECT COUNT(*) as count FROM users WHERE "tenantId" = $1 AND role = 'admin' AND id != $2 AND status = 'Active'`,
      [targetUser.tenantId, targetUser.id]
    );
    if (parseInt(String(remainingOwners?.count || '0'), 10) === 0) {
      res.status(400).json({ error: 'Cannot disable or demote the final active Company Owner of this workspace.' });
      return;
    }
  }

  // Seat Limit: Prevent activating inactive user beyond plan seat capacity
  if (status !== undefined && isActiveUserStatus(status) && !isActiveUserStatus(targetUser.status)) {
    const seatUsage = await getTenantSeatUsage(targetUser.tenantId);
    if (seatUsage.availableSeats <= 0) {
      res.status(400).json({ error: `Cannot activate user. Workspace plan seat limit reached (${seatUsage.activeSeats + seatUsage.pendingInvitations} of ${seatUsage.maxSeats} seats committed).` });
      return;
    }
  }

  // Pre-validate permissions map BEFORE any mutations if provided
  const rawPerms = req.body.modules !== undefined ? req.body.modules : permissions;
  let permMap: Record<string, boolean> | null = null;
  const tenantId = targetUser.tenantId || caller.tenantId;

  if (rawPerms && typeof rawPerms === 'object') {
    const activePermMap: Record<string, boolean> = Array.isArray(rawPerms)
      ? { ...Object.fromEntries(ALL_CANONICAL_MODULES.map(m => [m.id, false])), ...Object.fromEntries(rawPerms.map((k: string) => [normalizeModuleKey(k), true])) }
      : rawPerms;
    permMap = activePermMap;

    const companyEntitlements = await getTenantModuleEntitlements(tenantId);
    // Validate that caller cannot enable any module that is disabled in company entitlements
    for (const [modId, enabled] of Object.entries(activePermMap)) {
      if (typeof enabled !== 'boolean' || !ALL_CANONICAL_MODULES.some(m => m.id === normalizeModuleKey(modId))) {
        res.status(400).json({ error: 'Assignments require known module IDs and boolean values.' });
        return;
      }
      if (Boolean(enabled)) {
        const canonical = normalizeModuleKey(modId);
        if (companyEntitlements[canonical] !== true) {
          res.status(403).json({
            error: `Forbidden: Cannot enable module '${canonical}'. It is not included in your company's platform entitlements ceiling.`
          });
          return;
        }
      }
    }
  }

  const pwdToSet = newPassword || password;
  const computedDisplayName = displayName || (firstName || lastName ? `${firstName || ''} ${lastName || ''}`.trim() : undefined);
  const updates: string[] = [];
  const updateParams: any[] = [];
  let idx = 1;

  if (computedDisplayName !== undefined) { updates.push(`"displayName" = $${idx++}`); updateParams.push(computedDisplayName); }
  if (email !== undefined) { updates.push(`email = $${idx++}`); updateParams.push(email); }
  if (phone !== undefined) { updates.push(`phone = $${idx++}`); updateParams.push(phone); }
  if (status !== undefined) { updates.push(`status = $${idx++}`); updateParams.push(status); }
  if (ipRestrictions !== undefined) { updates.push(`"ipRestrictions" = $${idx++}`); updateParams.push(ipRestrictions); }
  if (roleId !== undefined && roleId !== null && roleId !== '') {
    const roleExists = await db.queryOne('SELECT id FROM custom_roles WHERE id = $1 AND "tenantId" = $2', [roleId, tenantId]);
    if (!roleExists) {
      res.status(400).json({ error: 'Custom role does not exist in this company workspace.' });
      return;
    }
    updates.push(`"roleId" = $${idx++}`);
    updateParams.push(roleId);
  } else if (roleId === null || roleId === '') {
    updates.push(`"roleId" = $${idx++}`);
    updateParams.push(null);
  }

  const now = new Date().toISOString();

  await db.withTransaction(async () => {
    await lockWorkspaceForMembershipChange(tenantId);
    const current = await db.queryOne<any>('SELECT role, status FROM users WHERE id = $1 FOR UPDATE', [req.params.id]);
    if (!current) throw new Error('User no longer exists.');
    if (status !== undefined && isActiveUserStatus(status) && !isActiveUserStatus(current.status) && (await getTenantSeatUsage(tenantId)).availableSeats <= 0) throw new Error('Workspace seat limit reached.');
    if (current.role === 'admin' && ((status !== undefined && !isActiveUserStatus(status)) || (role && role !== 'admin'))) {
      const owners = await db.queryOne<any>(`SELECT COUNT(*) as count FROM users WHERE "tenantId" = $1 AND role = 'admin' AND id <> $2 AND LOWER(status) = 'active'`, [tenantId, req.params.id]);
      if (Number(owners?.count || 0) === 0) throw new Error('Cannot disable or demote the final active Company Owner.');
    }
    // 1. Update role if provided — enforce canonical role transition matrix
    if (role) {
      await updateUserRole(caller, req.params.id, role);
    }

    // 2. Update password if provided
    if (pwdToSet && typeof pwdToSet === 'string' && pwdToSet.length >= 4) {
      await changePassword(req.params.id, pwdToSet);
    }

    // 3. Update user profile fields (displayName, phone, status, ipRestrictions, email, roleId)
    if (updates.length > 0) {
      updateParams.push(req.params.id);
      await db.execute(`UPDATE users SET ${updates.join(', ')} WHERE id = $${idx}`, updateParams);
    }

    // 4. Update permissions map
    if (permMap) {
      for (const [modId, enabled] of Object.entries(permMap)) {
        const canonical = normalizeModuleKey(modId);
        const enabledVal = enabled ? 1 : 0;
        const existing = await db.queryOne(
          `SELECT id FROM user_permissions WHERE "userId" = $1 AND "moduleId" = $2`,
          [req.params.id, canonical]
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
            [permId, req.params.id, canonical, enabledVal, caller.username, now, tenantId]
          );
        }
      }
    }
  });

    // Audit log
    try {
      await db.execute(`
        INSERT INTO audit_logs_admin (id, username, action, "targetType", "targetId", details, timestamp, "tenantId")
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      `, [
        'audit_' + crypto.randomUUID(),
        caller.username || 'admin',
        'USER_MODULE_PERMISSIONS_CHANGED',
        'user',
        req.params.id,
        JSON.stringify({ caller: caller.username, changes: permissions }),
        now,
        tenantId
      ]);
    } catch {}

    res.json({ success: true, message: 'User updated successfully.' });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
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
    const targetUser = await db.queryOne(`SELECT id, role, "tenantId" FROM users WHERE id = $1`, [userId]) as any;
    if (!targetUser) {
      res.status(404).json({ error: 'User not found.' });
      return;
    }
    if (!isPlatform && targetUser.tenantId !== caller.tenantId) {
      res.status(403).json({ error: 'Forbidden: Cannot alter permissions for users in another organization.' });
      return;
    }
    if (!isPlatform && (targetUser.role === 'platform_admin' || targetUser.role === 'master_admin')) {
      res.status(403).json({ error: 'Forbidden: Cannot alter permissions for platform administrators.' });
      return;
    }

    const tenantId = targetUser.tenantId || caller.tenantId;
    const canonical = normalizeModuleKey(moduleId);
    if (typeof enabled !== 'boolean' || !ALL_CANONICAL_MODULES.some(m => m.id === canonical)) {
      res.status(400).json({ error: 'A known module ID and boolean enabled value are required.' });
      return;
    }

    // Validate against company entitlement ceiling
    if (Boolean(enabled)) {
      const companyEntitlements = await getTenantModuleEntitlements(tenantId);
      if (companyEntitlements[canonical] !== true) {
        res.status(403).json({
          error: `Forbidden: Cannot enable module '${canonical}'. It is not included in your company's platform entitlements ceiling.`
        });
        return;
      }
    }

    const enabledVal = enabled ? 1 : 0;
    const now = new Date().toISOString();

    const existing = await db.queryOne(
      `SELECT id FROM user_permissions WHERE "userId" = $1 AND "moduleId" = $2`,
      [userId, canonical]
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
        [permId, userId, canonical, enabledVal, caller.username, now, tenantId]
      );
    }

    // Audit log
    try {
      await db.execute(`
        INSERT INTO audit_logs_admin (id, username, action, "targetType", "targetId", details, timestamp, "tenantId")
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      `, [
        'audit_' + crypto.randomUUID(),
        caller.username || 'admin',
        'USER_MODULE_PERMISSIONS_CHANGED',
        'user',
        userId,
        JSON.stringify({ caller: caller.username, moduleId: canonical, enabled: enabledVal }),
        now,
        tenantId
      ]);
    } catch {}

    res.json({ success: true, message: `Permission updated for module ${canonical}.` });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/admin/users/:id/role
app.put(['/api/admin/users/:id/role', '/admin/users/:id/role'], requireAuth, requireCompanyOwnerOrPlatformAdmin, requirePermission('users:edit'), async (req, res) => {
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
app.post(['/api/admin/users/:id/password', '/admin/users/:id/password'], requireAuth, requireCompanyOwnerOrPlatformAdmin, requirePermission('users:edit'), async (req, res) => {
  const caller = (req as any).user;
  const isPlatform = isPlatformRole(caller.role);
  const targetUser = await db.queryOne(`SELECT id, role, "tenantId" FROM users WHERE id = $1`, [req.params.id]) as any;

  if (!targetUser) {
    res.status(404).json({ error: 'User not found.' });
    return;
  }

  if (!isPlatform && targetUser.tenantId !== caller.tenantId) {
    res.status(403).json({ error: 'Forbidden: Cannot reset password for a user from another organization.' });
    return;
  }

  if (isPlatformRole(targetUser.role)) {
    res.status(403).json({ error: 'Forbidden: Cannot reset password for platform administrators through customer API.' });
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
app.delete(['/api/admin/users/:id', '/admin/users/:id'], requireAuth, requireCompanyOwnerOrPlatformAdmin, requirePermission('users:delete'), async (req, res) => {
  const caller = (req as any).user;
  const isPlatform = isPlatformRole(caller.role);
  const targetUser = await db.queryOne(`SELECT id, role, "tenantId" FROM users WHERE id = $1`, [req.params.id]) as any;

  if (!targetUser) {
    res.status(404).json({ error: 'User not found.' });
    return;
  }

  if (!isPlatform && targetUser.tenantId !== caller.tenantId) {
    res.status(403).json({ error: 'Forbidden: Cannot delete a user from another organization.' });
    return;
  }

  if (isPlatformRole(targetUser.role)) {
    res.status(403).json({ error: 'Forbidden: Cannot delete platform administrators through customer API.' });
    return;
  }

  // Owner Protection: A COMPANY workspace must retain at least one active Company Owner
  if (targetUser.role === 'admin') {
    const remainingOwners = await db.queryOne<{ count: string | number }>(
      `SELECT COUNT(*) as count FROM users WHERE "tenantId" = $1 AND role = 'admin' AND id != $2 AND status = 'Active'`,
      [targetUser.tenantId, req.params.id]
    );
    if (parseInt(String(remainingOwners?.count || '0'), 10) === 0) {
      res.status(400).json({ error: 'Cannot delete the final Company Owner of this workspace. Assign another Company Owner first.' });
      return;
    }
  }

  let info;
  try {
    info = await db.withTransaction(async () => {
      await lockWorkspaceForMembershipChange(targetUser.tenantId);
      const current = await db.queryOne<any>('SELECT role FROM users WHERE id = $1 FOR UPDATE', [req.params.id]);
      if (current?.role === 'admin') {
        const owners = await db.queryOne<any>(`SELECT COUNT(*) as count FROM users WHERE "tenantId" = $1 AND id <> $2 AND role = 'admin' AND LOWER(status) = 'active'`, [targetUser.tenantId, req.params.id]);
        if (Number(owners?.count || 0) === 0) throw new Error('Cannot delete the final active Company Owner.');
      }
      await db.execute('DELETE FROM user_permissions WHERE "userId" = $1', [req.params.id]);
      return await db.execute('DELETE FROM users WHERE id = $1 AND "tenantId" = $2', [req.params.id, targetUser.tenantId]);
    });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
    return;
  }
  if (info.rowCount > 0) {
    res.json({ success: true, message: 'User deleted.' });
  } else {
    res.status(404).json({ error: 'User not found.' });
  }
});

// ─── Customer Workspace Onboarding Endpoints ─────────────────────────────────

// POST /api/onboarding/complete & /onboarding/complete — Completes customer onboarding
app.post(['/api/onboarding/complete', '/onboarding/complete'], requireAuth, async (req, res) => {
  try {
    const caller = (req as any).user;
    const dbUser = await db.queryOne<any>(`SELECT * FROM users WHERE id = $1`, [caller.id]);
    if (!dbUser) {
      res.status(404).json({ error: 'User identity not found.' });
      return;
    }

    if (isPlatformRole(caller.role) || isPlatformRole(dbUser.role)) {
      res.status(403).json({ error: 'Forbidden: Platform administrators cannot complete customer onboarding or own tenant workspaces.' });
      return;
    }

    // 1. Inactive or disabled accounts are strictly ineligible
    if (!isActiveUserStatus(dbUser.status)) {
      res.status(403).json({ error: 'Forbidden: Disabled or inactive accounts cannot complete onboarding.' });
      return;
    }

    // 2. Existing workspace members cannot create another workspace
    if (dbUser.tenantId) {
      res.status(403).json({ error: 'Forbidden: Account already belongs to a workspace and cannot create another workspace.' });
      return;
    }

    // 3. Explicit server-controlled onboarding eligibility check
    if (dbUser.onboardingStatus !== 'PENDING') {
      res.status(403).json({ error: 'Forbidden: Account is not eligible for company onboarding. Contact your organization administrator or accept an invitation.' });
      return;
    }

    const {
      workspaceType = 'COMPANY', // 'COMPANY' | 'PERSONAL'
      companyName,
      workspaceName,
      fullName,
      country = 'US',
      timezone: _timezone = 'America/New_York',
      teamSize: _teamSize,
      phone,
      industry: _industry,
      planId = 'plan_starter'
    } = req.body;

    const rawName = workspaceType === 'COMPANY' ? companyName : (workspaceName || `${dbUser.username}'s Workspace`);
    if (!rawName || !rawName.trim()) {
      res.status(400).json({ error: 'Workspace / Organization name is required.' });
      return;
    }

    const tenantId = 'tenant_' + crypto.randomBytes(8).toString('hex');
    const slug = rawName.toLowerCase().replace(/[^a-z0-9]/g, '-').slice(0, 30) + '_' + crypto.randomBytes(3).toString('hex');
    const now = new Date().toISOString();
    const maxAgents = planId === 'plan_enterprise' ? 1000 : (planId === 'plan_pro' ? 20 : 5);

    await db.withTransaction(async () => {
      const currentIdentity = await db.queryOne<any>('SELECT "tenantId", "onboardingStatus" FROM users WHERE id = $1 FOR UPDATE', [dbUser.id]);
      if (!currentIdentity || currentIdentity.tenantId || currentIdentity.onboardingStatus !== 'PENDING') {
        throw new Error('Onboarding already completed or in progress.');
      }
      // 1. Create tenant with trial status
      await db.execute(`
        INSERT INTO tenants (id, name, slug, country, "ownerEmail", status, "leadPoolMode", "maxAgents", tier, "customerType", "createdAt", "updatedAt")
        VALUES ($1, $2, $3, $4, $5, 'trial', 'shared', $6, $7, $8, $9, $10)
      `, [tenantId, rawName.trim(), slug, country, dbUser.email || '', maxAgents, planId.replace('plan_', ''), workspaceType, now, now]);

      // 2. Create subscription with trialing status
      const subId = 'sub_' + crypto.randomBytes(8).toString('hex');
      const periodEnd = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString();
      await db.execute(`
        INSERT INTO subscriptions (id, "tenantId", "planId", status, "currentPeriodStart", "currentPeriodEnd", "createdAt", "updatedAt")
        VALUES ($1, $2, $3, 'trialing', $4, $5, $6, $7)
      `, [subId, tenantId, planId, now, periodEnd, now, now]);

      // 3. Initialize Authoritative Tenant Module Entitlements
      // Core Zestify products: CRM, OCTAL Dialer, Email Manager, Facebook Auto Poster
      // Scrapers: STRICTLY 0 (Never granted to new Zestify workspaces)
      const allowedModules = [
        { id: 'crm', enabled: 1 },
        { id: 'octalDialer', enabled: 1 },
        { id: 'reports', enabled: 1 },
        { id: 'leads', enabled: 1 },
        { id: 'campaigns', enabled: 1 },
        { id: 'autoEmailer', enabled: 1 },
        { id: 'facebookPoster', enabled: 1 },
        { id: 'googleScraper', enabled: 0 },
        { id: 'facebookScraper', enabled: 0 }
      ];

      for (const mod of allowedModules) {
        await db.execute(`
          INSERT INTO tenant_module_entitlements (id, "tenantId", "moduleId", enabled, "updatedBy", "updatedAt")
          VALUES ($1, $2, $3, $4, 'onboarding_system', $5)
          ON CONFLICT ("tenantId", "moduleId") DO UPDATE SET enabled = $4, "updatedAt" = $5
        `, [`tme_${tenantId}_${mod.id}`, tenantId, mod.id, mod.enabled, now]);
      }

      // 4. Update user to role 'admin' (Company Owner)
      const updatedDisplayName = fullName?.trim() || dbUser.displayName || dbUser.username;
      await db.execute(`
        UPDATE users 
        SET "tenantId" = $1, role = 'admin', "roleId" = NULL, "displayName" = $2, phone = COALESCE($3, phone), "needsProfileSetup" = 0, "onboardingStatus" = 'COMPLETED', "updatedAt" = $4
        WHERE id = $5
      `, [tenantId, updatedDisplayName, phone || null, now, dbUser.id]);

      // 5. Grant user permissions for enabled modules
      for (const mod of allowedModules) {
        if (mod.enabled === 1) {
          await db.execute(`
            INSERT INTO user_permissions (id, "userId", "moduleId", enabled, "grantedBy", "tenantId", "grantedAt")
            VALUES ($1, $2, $3, 1, 'ONBOARDING', $4, $5)
            ON CONFLICT ("id") DO UPDATE SET enabled = 1
          `, [`perm_${dbUser.id}_${mod.id}`, dbUser.id, mod.id, tenantId, now]);
        }
      }

      // 6. Record audit log
      await db.execute(`
        INSERT INTO audit_logs (id, action, "entityType", "entityId", "performedBy", details, "timestamp", "tenantId")
        VALUES ($1, 'WORKSPACE_CREATED', 'tenant', $2, $3, $4, $5, $6)
      `, ['aud_' + crypto.randomBytes(8).toString('hex'), tenantId, dbUser.username, JSON.stringify({ workspaceType, planId, finalName: rawName.trim() }), now, tenantId]);
    });

    const updatedUser = {
      id: dbUser.id,
      username: dbUser.username,
      displayName: fullName?.trim() || dbUser.displayName,
      role: 'admin',
      tenantId,
      email: dbUser.email,
      onboardingStatus: 'COMPLETED'
    };
    const newToken = issueAuthToken(updatedUser);
    const updatedTenant = await getTenantById(tenantId);

    res.json({
      success: true,
      token: newToken,
      tenant: updatedTenant,
      user: updatedUser
    });
  } catch (err: any) {
    console.error('[Onboarding Complete Error]:', err);
    res.status(500).json({ error: err.message || 'Failed to complete workspace onboarding.' });
  }
});

// ─── Workspace Invitations REST Endpoints ─────────────────────────────────────

// GET /api/admin/invitations & /admin/invitations — List invitations & seat usage
app.get(['/api/admin/invitations', '/admin/invitations', '/api/invitations', '/invitations'], requireAuth, requireCompanyOwnerOrPlatformAdmin, async (req, res) => {
  try {
    const caller = (req as any).user;
    const isPlatform = caller.role === 'platform_admin' || caller.role === 'master_admin';
    const tenantId = isPlatform ? (req.query.tenantId as string || caller.tenantId) : caller.tenantId;

    if (!tenantId) {
      res.status(400).json({ error: 'Tenant identity required.' });
      return;
    }

    const invitations = await getWorkspaceInvitations(tenantId);
    const seatUsage = await getTenantSeatUsage(tenantId);

    res.json({
      invitations,
      seatUsage
    });
  } catch (err: any) {
    console.error('[Get Invitations Error]:', err);
    res.status(500).json({ error: 'Failed to retrieve workspace invitations.' });
  }
});

// POST /api/admin/invitations & /admin/invitations — Create workspace invitation
app.post(['/api/admin/invitations', '/admin/invitations', '/api/invitations', '/invitations'], requireAuth, requireCompanyOwnerOrPlatformAdmin, async (req, res) => {
  try {
    const caller = (req as any).user;
    const isPlatform = caller.role === 'platform_admin' || caller.role === 'master_admin';
    const tenantId = isPlatform ? (req.body.tenantId || caller.tenantId) : caller.tenantId;

    if (!tenantId) {
      res.status(400).json({ error: 'Tenant identity required.' });
      return;
    }

    const { email, role = 'user', teamId, initialModules } = req.body;
    if (!email || !isValidEmailFormat(email)) {
      res.status(400).json({ error: 'A valid employee email address is required.' });
      return;
    }

    const cleanRole = (role === 'team_lead' ? 'team_lead' : 'user');

    if (teamId) {
      const validTeam = await db.queryOne('SELECT id FROM teams WHERE id = $1 AND "tenantId" = $2', [teamId, tenantId]);
      if (!validTeam) {
        res.status(400).json({ error: 'Team does not belong to this workspace.' });
        return;
      }
    }

    // Seat limit enforcement: Check available seats before issuing invitation
    const seatUsage = await getTenantSeatUsage(tenantId);
    if (seatUsage.availableSeats <= 0) {
      res.status(400).json({
        error: `Workspace plan seat limit reached (${seatUsage.activeSeats + seatUsage.pendingInvitations} of ${seatUsage.maxSeats} seats committed). Upgrade plan to invite more members.`
      });
      return;
    }

    // Prevent duplicate pending invitation for same email in this tenant
    const existing = await getPendingInvitationForEmail(email);
    if (existing && existing.tenantId === tenantId) {
      res.status(400).json({ error: 'A pending invitation for this email already exists in this workspace.' });
      return;
    }

    // Generate secure cryptographic invitation token and hash
    const rawToken = crypto.randomBytes(32).toString('hex');
    const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
    const invId = 'inv_' + crypto.randomBytes(8).toString('hex');
    const now = new Date().toISOString();
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

    const invitation = await createWorkspaceInvitation({
      id: invId,
      tenantId,
      email,
      role: cleanRole,
      teamId: teamId || null,
      invitedByUserId: caller.id,
      tokenHash,
      initialModules: initialModules ? JSON.stringify(initialModules) : null,
      expiresAt,
      createdAt: now
    });

    const origin = req.headers.origin || `${req.protocol}://${req.get('host')}`;
    const inviteUrl = `${origin}/?invite=${rawToken}`;

    // Record audit log
    await db.execute(`
      INSERT INTO audit_logs (id, action, "entityType", "entityId", "performedBy", details, "timestamp", "tenantId")
      VALUES ($1, 'INVITATION_CREATED', 'workspace_invitation', $2, $3, $4, $5, $6)
    `, ['aud_' + crypto.randomBytes(8).toString('hex'), invId, caller.username, JSON.stringify({ email, role: cleanRole, teamId }), now, tenantId]);

    res.status(201).json({
      success: true,
      token: rawToken,
      inviteUrl,
      invitation: {
        ...invitation,
        token: rawToken,
        inviteUrl
      }
    });
  } catch (err: any) {
    console.error('[Create Invitation Error]:', err);
    res.status(500).json({ error: err.message || 'Failed to create invitation.' });
  }
});

// DELETE /api/admin/invitations/:id & /admin/invitations/:id — Revoke invitation
app.delete(['/api/admin/invitations/:id', '/admin/invitations/:id'], requireAuth, requireCompanyOwnerOrPlatformAdmin, async (req, res) => {
  try {
    const caller = (req as any).user;
    const isPlatform = caller.role === 'platform_admin' || caller.role === 'master_admin';
    const tenantId = isPlatform ? (req.query.tenantId as string || caller.tenantId) : caller.tenantId;

    const revoked = await revokeWorkspaceInvitation(req.params.id, tenantId);
    if (!revoked) {
      res.status(404).json({ error: 'Invitation not found or already processed.' });
      return;
    }

    res.json({ success: true, message: 'Invitation revoked successfully.' });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to revoke invitation.' });
  }
});

// GET /api/invitations/resolve & /invitations/resolve — Public invitation query
app.get(['/api/invitations/resolve', '/invitations/resolve'], async (req, res) => {
  try {
    const token = req.query.token as string;
    const email = req.query.email as string;

    let invitation: any = null;
    if (token) {
      const tokenHash = crypto.createHash('sha256').update(token.trim()).digest('hex');
      invitation = await getWorkspaceInvitationByTokenHash(tokenHash);
    } else if (email) {
      invitation = await getPendingInvitationForEmail(email.trim());
    }

    if (!invitation) {
      res.status(404).json({ error: 'Invitation not found or has expired.' });
      return;
    }

    if (invitation.status !== 'PENDING') {
      res.status(400).json({ error: `This invitation is ${invitation.status.toLowerCase()}.` });
      return;
    }

    if (new Date(invitation.expiresAt) <= new Date()) {
      res.status(400).json({ error: 'This invitation has expired. Please ask the company owner for a new invite.' });
      return;
    }

    const tenant = await getTenantById(invitation.tenantId);
    const inviter = await db.queryOne<any>(`SELECT "displayName", username FROM users WHERE id = $1`, [invitation.invitedByUserId]);

    res.json({
      success: true,
      invitation: {
        id: invitation.id,
        email: invitation.email,
        role: invitation.role,
        teamId: invitation.teamId,
        tenantId: invitation.tenantId,
        tenantName: tenant?.name || 'Workspace',
        inviterName: inviter?.displayName || inviter?.username || 'Team Owner'
      }
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to resolve invitation.' });
  }
});

// POST /api/invitations/accept & /invitations/accept — Attach user to invited workspace
app.post(['/api/invitations/accept', '/invitations/accept'], requireAuth, async (req, res) => {
  try {
    const caller = (req as any).user;
    const { token, invitationId } = req.body;

    let invitation: any = null;
    if (token) {
      const tokenHash = crypto.createHash('sha256').update(token.trim()).digest('hex');
      invitation = await getWorkspaceInvitationByTokenHash(tokenHash);
    } else if (invitationId) {
      invitation = await db.queryOne<any>(`SELECT * FROM workspace_invitations WHERE id = $1`, [invitationId]);
    } else if (caller.email) {
      invitation = await getPendingInvitationForEmail(caller.email);
    }

    if (!invitation || invitation.status !== 'PENDING') {
      res.status(400).json({ error: 'Valid pending invitation not found.' });
      return;
    }

    if (new Date(invitation.expiresAt) <= new Date()) {
      res.status(400).json({ error: 'This invitation has expired.' });
      return;
    }

    // Platform Role Guard: Platform Admins cannot accept workspace invitations
    if (isPlatformRole(caller.role)) {
      res.status(403).json({ error: 'Forbidden: Platform administrators cannot accept workspace invitations.' });
      return;
    }

    // Invitation Identity Binding: Caller email MUST match the invitation recipient email
    if (!caller.email || caller.email.toLowerCase().trim() !== invitation.email.toLowerCase().trim()) {
      res.status(403).json({ error: 'Forbidden: Invitation email does not match authenticated user email.' });
      return;
    }

    // Cross-tenant Protection: Users already belonging to a different tenant cannot switch tenants via invitation
    if (caller.tenantId) {
      res.status(403).json({ error: 'Forbidden: Account is already associated with another workspace.' });
      return;
    }

    // Team Tenant Validation: Ensure assigned team strictly belongs to the target workspace
    if (invitation.teamId) {
      const teamCheck = await db.queryOne<{ id: string }>(
        `SELECT id FROM teams WHERE id = $1 AND "tenantId" = $2`,
        [invitation.teamId, invitation.tenantId]
      );
      if (!teamCheck) {
        res.status(400).json({ error: 'Assigned team does not belong to the target workspace or does not exist.' });
        return;
      }
    }

    // Seat limit enforcement: Check seat limit at moment of acceptance
    const seatUsage = await getTenantSeatUsage(invitation.tenantId);
    if (seatUsage.activeSeats >= seatUsage.maxSeats) {
      res.status(400).json({ error: 'Workspace has reached its maximum active seat capacity.' });
      return;
    }

    const now = new Date().toISOString();
    const assignedRole = (invitation.role === 'team_lead' ? 'team_lead' : 'user');

    await db.withTransaction(async () => {
      await lockWorkspaceForMembershipChange(invitation.tenantId);
      const identity = await db.queryOne<any>('SELECT "tenantId" FROM users WHERE id = $1 FOR UPDATE', [caller.id]);
      if (!identity || identity.tenantId) throw new Error('This identity already belongs to a workspace.');
      if ((await getTenantSeatUsage(invitation.tenantId)).activeSeats >= seatUsage.maxSeats) throw new Error('Workspace seat limit reached.');
      // 1. Mark invitation accepted
      if (!(await acceptWorkspaceInvitation(invitation.id, caller.id))) throw new Error('Invitation already used, revoked, or expired.');

      // 2. Attach user to tenant with assigned role (NO SELF-ELEVATION)
      await db.execute(`
        UPDATE users 
        SET "tenantId" = $1, role = $2, "roleId" = NULL, "onboardingStatus" = 'COMPLETED', "updatedAt" = $3
        WHERE id = $4
      `, [invitation.tenantId, assignedRole, now, caller.id]);

      // 3. If team assignment specified in invitation, assign to team
      if (invitation.teamId) {
        const existingMember = await db.queryOne(`SELECT id FROM team_members WHERE "teamId" = $1 AND "userId" = $2`, [invitation.teamId, caller.id]);
        const teamRole = assignedRole === 'team_lead' ? 'leader' : 'member';
        if (existingMember) {
          await db.execute(`UPDATE team_members SET "roleInTeam" = $1 WHERE id = $2`, [teamRole, (existingMember as any).id]);
        } else {
          const teamMemberId = 'tm_' + crypto.randomBytes(8).toString('hex');
          await db.execute(`
            INSERT INTO team_members (id, "teamId", "userId", "tenantId", "roleInTeam", "joinedAt")
            VALUES ($1, $2, $3, $4, $5, $6)
          `, [teamMemberId, invitation.teamId, caller.id, invitation.tenantId, teamRole, now]);
        }
      }

      // 4. Provision assigned member permissions (honor initialModules chosen by Company Owner, bounded by tenant entitlements)
      let targetModules: string[] = ['crm', 'octalDialer', 'campaigns', 'leads', 'reports'];
      if (invitation.initialModules) {
        try {
          const parsed = JSON.parse(invitation.initialModules);
          if (Array.isArray(parsed)) {
            targetModules = parsed;
          } else if (typeof parsed === 'object' && parsed !== null) {
            targetModules = Object.keys(parsed).filter(k => !!parsed[k]);
          }
        } catch {
          // fallback to default if parsing failed
        }
      }

      // Authoritative tenant entitlements ceiling (fail-closed)
      const tenantEntitlements = await getTenantModuleEntitlements(invitation.tenantId);

      for (const mod of ALL_CANONICAL_MODULES.map(m => m.id)) {
        const canonical = normalizeModuleKey(mod);
        const enabled = tenantEntitlements[canonical] === true && targetModules.map(normalizeModuleKey).includes(canonical);
          await db.execute(`
            INSERT INTO user_permissions (id, "userId", "moduleId", enabled, "grantedBy", "tenantId", "grantedAt")
            VALUES ($1, $2, $3, $6, 'INVITATION_ACCEPT', $4, $5)
            ON CONFLICT ("id") DO UPDATE SET enabled = EXCLUDED.enabled
          `, [`perm_${caller.id}_${canonical}`, caller.id, canonical, invitation.tenantId, now, enabled ? 1 : 0]);
      }

      // 5. Record audit log
      await db.execute(`
        INSERT INTO audit_logs (id, action, "entityType", "entityId", "performedBy", details, "timestamp", "tenantId")
        VALUES ($1, 'INVITATION_ACCEPTED', 'workspace_invitation', $2, $3, $4, $5, $6)
      `, ['aud_' + crypto.randomBytes(8).toString('hex'), invitation.id, caller.username, JSON.stringify({ invitationId: invitation.id, tenantId: invitation.tenantId, role: assignedRole }), now, invitation.tenantId]);
    });

    const updatedUser = {
      id: caller.id,
      username: caller.username,
      displayName: caller.displayName,
      role: assignedRole,
      tenantId: invitation.tenantId,
      email: caller.email
    };
    const newToken = issueAuthToken(updatedUser);
    const updatedTenant = await getTenantById(invitation.tenantId);

    res.json({
      success: true,
      message: 'Workspace joined successfully.',
      token: newToken,
      tenant: updatedTenant,
      user: updatedUser
    });
  } catch (err: any) {
    console.error('[Accept Invitation Error]:', err);
    res.status(500).json({ error: err.message || 'Failed to accept invitation.' });
  }
});

// ─── Custom Roles Endpoints ──────────────────────────────────────────────────

// GET /api/admin/roles & /admin/roles
app.get(['/api/admin/roles', '/admin/roles'], requireAuth, requireCompanyOwnerOrPlatformAdmin, requirePermission('roles:view'), async (req, res) => {
  const user = (req as any).user;
  const isPlatform = isPlatformRole(user.role);
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
        WHERE r."tenantId" = $1
        GROUP BY r.id, r."roleName", r.description, r.permissions, r.status, r."createdBy", r."createdAt", r."tenantId"
        ORDER BY r."createdAt" ASC
      `, [user.tenantId]) as any[];

  // If no custom roles exist yet, seed and return the standard roles matching the UI mock
  if (roles.length === 0) {
    const tenant = user.tenantId;
    if (!tenant) {
      return res.json([]);
    }
    const now = new Date().toISOString();
    const defaults = [
      { id: `${tenant}_1`, roleName: 'Administrator', description: 'Full access to organization and settings', permissions: JSON.stringify(['all']), status: 'Active', createdBy: 'system', createdAt: now, tenantId: tenant, userCount: 1 },
      { id: `${tenant}_2`, roleName: 'Supervisor', description: 'Campaign oversight, lead queue and call monitoring', permissions: JSON.stringify(['campaigns:view', 'campaigns:create', 'campaigns:edit', 'leads:view', 'leads:import', 'reports:cdr_view']), status: 'Active', createdBy: 'system', createdAt: now, tenantId: tenant, userCount: 0 },
      { id: `${tenant}_3`, roleName: 'Agent', description: 'Direct dialing and call disposition logging', permissions: JSON.stringify(['calls:view_queue', 'calls:dial_outbound', 'calls:manual_keypad', 'calls:log_disposition']), status: 'Active', createdBy: 'system', createdAt: now, tenantId: tenant, userCount: 0 },
      { id: `${tenant}_4`, roleName: 'Auditor', description: 'Read-only access to audit records and reporting', permissions: JSON.stringify(['reports:cdr_view', 'reports:cdr_export']), status: 'Active', createdBy: 'system', createdAt: now, tenantId: tenant, userCount: 0 },
      { id: `${tenant}_5`, roleName: 'Custom', description: 'Custom tenant configuration', permissions: JSON.stringify([]), status: 'Inactive', createdBy: 'system', createdAt: now, tenantId: tenant, userCount: 0 }
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
app.post(['/api/admin/roles', '/admin/roles'], requireAuth, requireCompanyOwnerOrPlatformAdmin, requirePermission('roles:add'), async (req, res) => {
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
app.put(['/api/admin/roles/:id', '/admin/roles/:id'], requireAuth, requireCompanyOwnerOrPlatformAdmin, requirePermission('roles:edit'), async (req, res) => {
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
app.delete(['/api/admin/roles/:id', '/admin/roles/:id'], requireAuth, requireCompanyOwnerOrPlatformAdmin, requirePermission('roles:delete'), async (req, res) => {
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
app.get(['/api/admin/teams', '/admin/teams', '/api/teams', '/teams'], requireAuth, requireCompanyOwnerOrPlatformAdmin, requirePermission(['teams:view', 'users:view', 'settings:view']), async (req, res) => {
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

// GET /api/teams/my-teams: Returns teams led by current Team Lead or all teams for Admin
app.get(['/api/teams/my-teams', '/teams/my-teams'], requireAuth, async (req, res) => {
  try {
    const caller = (req as any).user;
    const isPlatform = caller.role === 'platform_admin' || caller.role === 'master_admin';
    const tenantId = caller.tenantId;

    if (caller.role !== 'team_lead' && caller.role !== 'admin' && !isPlatform) {
      res.status(403).json({ error: 'Forbidden: Access restricted to Team Leads and Administrators.' });
      return;
    }

    let teams: any[];
    if (caller.role === 'admin' || isPlatform) {
      teams = await getTeams(tenantId);
    } else {
      teams = await getTeamsLedByUser(caller.id, tenantId);
    }

    const tenant = await getTenantById(tenantId);
    const companyMaxVisibility = tenant?.maxTeamVisibility || 'TEAM_COLLABORATE';

    const enriched = await Promise.all(teams.map(async (t) => {
      const members = await getTeamMembers(t.id, tenantId);
      const campaigns = await getTeamCampaigns(t.id, tenantId);
      const settings = await getTeamSettings(t.id, tenantId);
      const effectiveVisibility = await getTeamEffectiveVisibility(tenantId, t.id);
      return {
        ...t,
        members,
        campaigns,
        settings,
        effectiveVisibility,
        companyMaxVisibility,
        memberCount: members.length,
        campaignCount: campaigns.length
      };
    }));

    res.json(enriched);
  } catch (err: any) {
    console.error('[TEAMS API] GET my-teams error:', err);
    res.status(500).json({ error: 'Failed to retrieve user teams: ' + err.message });
  }
});

// GET /api/admin/teams/:id & /admin/teams/:id
app.get(['/api/admin/teams/:id', '/admin/teams/:id', '/api/teams/:id', '/teams/:id'], requireAuth, requireCompanyOwnerOrPlatformAdmin, requirePermission(['teams:view', 'users:view', 'settings:view']), async (req, res) => {
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
app.post(['/api/admin/teams', '/admin/teams', '/api/teams', '/teams'], requireAuth, requireCompanyOwnerOrPlatformAdmin, requirePermission(['teams:edit', 'users:edit', 'users:add']), async (req, res) => {
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

    if (leaderId) {
      try {
        await validateTenantAssignee(leaderId, tenantId);
      } catch (e: any) {
        res.status(400).json({ error: e.message });
        return;
      }
    }
    if (Array.isArray(memberIds) && memberIds.length > 0) {
      for (const mId of memberIds) {
        try {
          await validateTenantAssignee(mId, tenantId);
        } catch (e: any) {
          res.status(400).json({ error: e.message });
          return;
        }
      }
    }

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
    const status = err.message && (err.message.includes('not found') || err.message.includes('cannot be assigned')) ? 400 : 500;
    res.status(status).json({ error: 'Failed to create team: ' + err.message });
  }
});

// PUT /api/admin/teams/:id & /admin/teams/:id
app.put(['/api/admin/teams/:id', '/admin/teams/:id', '/api/teams/:id', '/teams/:id'], requireAuth, requireCompanyOwnerOrPlatformAdmin, requirePermission(['teams:edit', 'users:edit']), async (req, res) => {
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

    if (leaderId) {
      try {
        await validateTenantAssignee(leaderId, effectiveTenantId);
      } catch (e: any) {
        res.status(400).json({ error: e.message });
        return;
      }
    }
    if (Array.isArray(memberIds) && memberIds.length > 0) {
      for (const mId of memberIds) {
        try {
          await validateTenantAssignee(mId, effectiveTenantId);
        } catch (e: any) {
          res.status(400).json({ error: e.message });
          return;
        }
      }
    }

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
    const status = err.message && (err.message.includes('not found') || err.message.includes('cannot be assigned')) ? 400 : 500;
    res.status(status).json({ error: 'Failed to update team: ' + err.message });
  }
});

// DELETE /api/admin/teams/:id & /admin/teams/:id
app.delete(['/api/admin/teams/:id', '/admin/teams/:id', '/api/teams/:id', '/teams/:id'], requireAuth, requireCompanyOwnerOrPlatformAdmin, requirePermission(['teams:delete', 'users:delete']), async (req, res) => {
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
app.get(['/api/admin/teams/:id/members', '/admin/teams/:id/members', '/api/teams/:id/members', '/teams/:id/members'], requireAuth, requireCompanyOwnerOrPlatformAdmin, requirePermission(['teams:view', 'users:view']), async (req, res) => {
  try {
    const caller = (req as any).user;
    const members = await getTeamMembers(req.params.id, caller.tenantId);
    res.json(members);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/admin/teams/:id/members
app.post(['/api/admin/teams/:id/members', '/admin/teams/:id/members', '/api/teams/:id/members', '/teams/:id/members'], requireAuth, requireCompanyOwnerOrPlatformAdmin, requirePermission(['teams:edit', 'users:edit']), async (req, res) => {
  try {
    const caller = (req as any).user;
    const { userIds, leaderId } = req.body;
    if (!Array.isArray(userIds)) {
      res.status(400).json({ error: 'userIds must be an array.' });
      return;
    }
    if (leaderId) {
      try {
        await validateTenantAssignee(leaderId, caller.tenantId);
      } catch (e: any) {
        res.status(400).json({ error: e.message });
        return;
      }
    }
    if (Array.isArray(userIds) && userIds.length > 0) {
      for (const uId of userIds) {
        try {
          await validateTenantAssignee(uId, caller.tenantId);
        } catch (e: any) {
          res.status(400).json({ error: e.message });
          return;
        }
      }
    }
    await setTeamMembers(req.params.id, caller.tenantId, userIds, leaderId);
    const members = await getTeamMembers(req.params.id, caller.tenantId);
    res.json({ success: true, members });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/admin/teams/:id/campaigns
app.get(['/api/admin/teams/:id/campaigns', '/admin/teams/:id/campaigns'], requireAuth, requireCompanyOwnerOrPlatformAdmin, requirePermission(['teams:view', 'campaigns:view']), async (req, res) => {
  try {
    const caller = (req as any).user;
    const campaigns = await getTeamCampaigns(req.params.id, caller.tenantId);
    res.json(campaigns);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/admin/teams/:id/campaigns
app.post(['/api/admin/teams/:id/campaigns', '/admin/teams/:id/campaigns'], requireAuth, requireCompanyOwnerOrPlatformAdmin, requirePermission(['teams:edit', 'campaigns:edit']), async (req, res) => {
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

// ─── SaaS Structure v2: Team Lead & Team Policy Endpoints ────────────────────

// GET /api/teams/:id/settings: Retrieves team visibility policy
app.get(['/api/teams/:id/settings', '/teams/:id/settings'], requireAuth, async (req, res) => {
  try {
    const caller = (req as any).user;
    const tenantId = caller.tenantId;
    const teamId = req.params.id;

    const hasAccess = await canAccessTeam(caller, teamId, tenantId);
    if (!hasAccess) {
      res.status(403).json({ error: 'Forbidden: Access to team settings denied.' });
      return;
    }

    const settings = await getTeamSettings(teamId, tenantId);
    const effectiveVisibility = await getTeamEffectiveVisibility(tenantId, teamId);
    const tenant = await getTenantById(tenantId);

    res.json({
      ...settings,
      effectiveVisibility,
      companyMaxVisibility: tenant?.maxTeamVisibility || 'TEAM_COLLABORATE'
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/teams/:id/settings: Updates team visibility policy with Company Maximum enforcement
app.put(['/api/teams/:id/settings', '/teams/:id/settings'], requireAuth, async (req, res) => {
  try {
    const caller = (req as any).user;
    const tenantId = caller.tenantId;
    const teamId = req.params.id;
    const { leadVisibility } = req.body;

    const validVisibilities = ['OWN', 'TEAM_READ', 'TEAM_COLLABORATE'];
    if (!leadVisibility || !validVisibilities.includes(leadVisibility)) {
      res.status(400).json({ error: `Invalid leadVisibility. Must be one of: ${validVisibilities.join(', ')}` });
      return;
    }

    // Only Company Owner (admin), Platform Owner, or Team Leader of THIS team can update settings
    let isAuthorized = false;
    if (caller.role === 'platform_admin' || caller.role === 'master_admin' || caller.role === 'admin') {
      isAuthorized = true;
    } else if (caller.role === 'team_lead') {
      isAuthorized = await isTeamLeader(caller.id, teamId, tenantId);
    }

    if (!isAuthorized) {
      res.status(403).json({ error: 'Forbidden: Only Team Lead or Company Admin can update team settings.' });
      return;
    }

    // COMPANY POLICY RULE: Lower levels may restrict access, NEVER escalate access
    const tenant = await getTenantById(tenantId);
    const companyMax = tenant?.maxTeamVisibility || 'TEAM_COLLABORATE';

    const rank = (val: string): number => {
      if (val === 'TEAM_COLLABORATE') return 3;
      if (val === 'TEAM_READ') return 2;
      return 1;
    };

    if (rank(leadVisibility) > rank(companyMax)) {
      res.status(403).json({
        error: `Forbidden: Team visibility (${leadVisibility}) cannot exceed Company Maximum Policy (${companyMax}).`
      });
      return;
    }

    const updated = await upsertTeamSettings(teamId, tenantId, leadVisibility);
    const effectiveVisibility = await getTeamEffectiveVisibility(tenantId, teamId);

    res.json({
      success: true,
      settings: updated,
      effectiveVisibility
    });
  } catch (err: any) {
    console.error('[TEAMS API] PUT team settings error:', err);
    res.status(500).json({ error: 'Failed to update team settings: ' + err.message });
  }
});

// PUT /api/admin/company/policy & /api/admin/company/profile: Company Owner defines tenant-wide policies and company profile
app.put(['/api/admin/company/policy', '/admin/company/policy', '/api/admin/company/profile', '/admin/company/profile'], requireAuth, requireTenantAdmin, async (req, res) => {
  try {
    const caller = (req as any).user;
    const tenantId = caller.tenantId;
    const { maxTeamVisibility, customerType, name, country, logoUrl, ownerEmail, timezone, phone, website, address } = req.body;

    const updates: string[] = [];
    const params: any[] = [];
    let idx = 1;

    if (name && typeof name === 'string') {
      updates.push(`"name" = $${idx++}`);
      params.push(name.trim());
    }

    if (country && typeof country === 'string') {
      updates.push(`"country" = $${idx++}`);
      params.push(country.trim());
    }

    if (logoUrl !== undefined) {
      updates.push(`"logoUrl" = $${idx++}`);
      params.push(logoUrl || null);
    }

    if (ownerEmail !== undefined) {
      updates.push(`"ownerEmail" = $${idx++}`);
      params.push(ownerEmail ? ownerEmail.trim() : null);
    }

    if (maxTeamVisibility) {
      const valid = ['OWN', 'TEAM_READ', 'TEAM_COLLABORATE'];
      if (!valid.includes(maxTeamVisibility)) {
        res.status(400).json({ error: `Invalid maxTeamVisibility. Allowed: ${valid.join(', ')}` });
        return;
      }
      updates.push(`"maxTeamVisibility" = $${idx++}`);
      params.push(maxTeamVisibility);
    }

    if (customerType) {
      const validTypes = ['COMPANY', 'PERSONAL'];
      if (!validTypes.includes(customerType)) {
        res.status(400).json({ error: `Invalid customerType. Allowed: ${validTypes.join(', ')}` });
        return;
      }
      updates.push(`"customerType" = $${idx++}`);
      params.push(customerType);
    }

    if (updates.length > 0) {
      params.push(tenantId);
      await db.execute(`UPDATE tenants SET ${updates.join(', ')} WHERE id = $${idx}`, params);
    }

    // Save extended profile fields in system_settings if provided
    if (timezone || phone || website || address) {
      try {
        const metaKey = `tenant_${tenantId}_profile_meta`;
        const existingRow = await db.queryOne<{ settingValue: string }>(`SELECT "settingValue" FROM system_settings WHERE "settingKey" = $1`, [metaKey]);
        let metaObj: any = {};
        if (existingRow?.settingValue) {
          try { metaObj = JSON.parse(existingRow.settingValue); } catch {}
        }
        if (timezone !== undefined) metaObj.timezone = timezone;
        if (phone !== undefined) metaObj.phone = phone;
        if (website !== undefined) metaObj.website = website;
        if (address !== undefined) metaObj.address = address;

        const valStr = JSON.stringify(metaObj);
        if (existingRow) {
          await db.execute(`UPDATE system_settings SET "settingValue" = $1 WHERE "settingKey" = $2`, [valStr, metaKey]);
        } else {
          await db.execute(`INSERT INTO system_settings ("settingKey", "settingValue") VALUES ($1, $2)`, [metaKey, valStr]);
        }
      } catch (metaErr) {
        console.warn('[CompanyProfile] Meta storage notice:', metaErr);
      }
    }

    const updatedTenant = await getTenantById(tenantId);
    // Merge meta if present
    let finalProfile: any = { ...updatedTenant };
    try {
      const metaKey = `tenant_${tenantId}_profile_meta`;
      const metaRow = await db.queryOne<{ settingValue: string }>(`SELECT "settingValue" FROM system_settings WHERE "settingKey" = $1`, [metaKey]);
      if (metaRow?.settingValue) {
        const parsed = JSON.parse(metaRow.settingValue);
        finalProfile = { ...finalProfile, ...parsed };
      }
    } catch {}

    res.json({ success: true, tenant: finalProfile, profile: finalProfile });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/admin/company/profile: Returns company profile for Company Owner
app.get(['/api/admin/company/profile', '/admin/company/profile'], requireAuth, requireTenantAdmin, async (req, res) => {
  try {
    const caller = (req as any).user;
    const tenantId = caller.tenantId;
    const tenant = await getTenantById(tenantId);
    let finalProfile: any = { ...tenant };
    try {
      const metaKey = `tenant_${tenantId}_profile_meta`;
      const metaRow = await db.queryOne<{ settingValue: string }>(`SELECT "settingValue" FROM system_settings WHERE "settingKey" = $1`, [metaKey]);
      if (metaRow?.settingValue) {
        const parsed = JSON.parse(metaRow.settingValue);
        finalProfile = { ...finalProfile, ...parsed };
      }
    } catch {}
    res.json({ success: true, profile: finalProfile });
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

// REST: Serve Mobile APK file download — dynamically resolves freshest build
const serveApkHandler = (_req: express.Request, res: express.Response): void => {
  const candidatePaths = [
    '/var/www/octal-frontend/OctalDialer.apk',
    path.resolve(__dirname, '../data/OctalDialer.apk'),
    path.resolve(__dirname, '../../application_octal_dialer/build/app/outputs/flutter-apk/app-debug.apk'),
    path.resolve(__dirname, '../../application_octal_dialer/build/app/outputs/flutter-apk/app-release.apk'),
    path.resolve(__dirname, '../../frontend/public/OctalDialer.apk')
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

// Helper to structurally authorize manual lead imports per SaaS Structure V2
async function authorizeLeadImport(user: any, tenantId: string, campaignId?: string): Promise<{ authorized: boolean; error?: string; status?: number }> {
  if (!user || !tenantId) {
    return { authorized: false, status: 401, error: 'Unauthorized: missing tenant identity' };
  }

  const isPlatform = user.role === 'platform_admin' || user.role === 'master_admin';
  const isCompanyAdmin = user.role === 'admin';

  if (isPlatform || isCompanyAdmin) {
    if (campaignId) {
      const c = await getCampaignById(campaignId, tenantId);
      if (!c) {
        return { authorized: false, status: 404, error: 'Campaign not found in your organization.' };
      }
    }
    return { authorized: true };
  }

  if (user.role === 'team_lead') {
    const perms = await getEffectivePermissions(user);
    if (!perms.has('*') && !perms.has('all') && !perms.has('leads:import') && !perms.has('leads:add')) {
      return { authorized: false, status: 403, error: 'Forbidden: Team Leads require leads:import permission.' };
    }

    if (!campaignId) {
      return { authorized: false, status: 403, error: 'Forbidden: Team Leads cannot create company-wide campaigns. Provide a campaignId assigned to your led team.' };
    }

    const c = await getCampaignById(campaignId, tenantId);
    if (!c) {
      return { authorized: false, status: 404, error: 'Campaign not found in your organization.' };
    }

    const ledCampaignIds = await getCampaignIdsForLedTeams(user.id, tenantId);
    if (!ledCampaignIds.includes(campaignId)) {
      return { authorized: false, status: 403, error: 'Forbidden: Team Leads may only import leads into campaigns assigned to teams they lead.' };
    }

    return { authorized: true };
  }

  // Member / Agent: deny manual import for this release
  return { authorized: false, status: 403, error: 'Forbidden: Manual lead import is restricted to Company Owners and Team Leads.' };
}

// REST: Manual leads import (protected)
app.post('/api/leads/import', requireAuth, async (req, res) => {
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

    const authCheck = await authorizeLeadImport(user, tenantId, campaignId);
    if (!authCheck.authorized) {
      res.status(authCheck.status || 403).json({ error: authCheck.error });
      return;
    }

    const result = campaignId
      ? await appendLeadsToCampaign(campaignId, leads, tenantId)
      : await createCampaign(campaignName || 'Imported Campaign', fileName || 'Manual Import', leads, tenantId);

    io.to(`tenant_${tenantId}`).emit('leads:updated');
    io.to(`tenant_${tenantId}`).emit('campaigns:updated');

    logUserActivity({
      tenantId,
      userId: user.id,
      username: user.username,
      action: 'LEADS_IMPORTED',
      resourceType: 'campaign',
      resourceId: result.campaign.id,
      details: {
        campaignName: result.campaign.name,
        count: result.finalCount,
        dedupedCount: result.dedupedCount,
        dncSkippedCount: result.dncSkippedCount,
        fileName: fileName || 'Manual Import'
      },
      req
    });

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

    const authCheck = await authorizeLeadImport(user, tenantId, campaignId);
    if (!authCheck.authorized) {
      res.status(authCheck.status || 403).json({ error: authCheck.error });
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

// REST: Export logs to CSV (strictly Company Owner or Platform Admin)
app.get(['/api/logs/export', '/logs/export'], requireAuth, requireCompanyOwnerOrPlatformAdmin, async (req, res) => {
  try {
    const caller = (req as any).user;
    const tenantId = caller?.tenantId || (isPlatformRole(caller?.role) ? 'tenant_default' : null);
    if (!tenantId) {
      res.status(401).json({ error: 'Unauthorized: missing tenant identity' });
      return;
    }
    const logs = await getScopedLogs(caller, tenantId);

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

    logUserActivity({
      tenantId,
      userId: caller.id,
      username: caller.username,
      action: 'CALL_LOGS_EXPORTED',
      resourceType: 'call_logs',
      details: { rowCount: logs.length },
      req
    });

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="octal_dialer_call_logs.csv"');
    res.send(csv);
  } catch (err: any) {
    console.error('CSV Export error:', err);
    res.status(500).json({ error: err.message });
  }
});

// REST: Export leads to CSV (strictly Company Owner or Platform Admin)
app.get(['/api/leads/export', '/leads/export'], requireAuth, requireCompanyOwnerOrPlatformAdmin, async (req, res) => {
  try {
    const caller = (req as any).user;
    const tenantId = caller?.tenantId || (isPlatformRole(caller?.role) ? 'tenant_default' : null);
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

    const isPlatform = isPlatformRole(caller.role);
    const isCompanyAdmin = isCompanyOwner(caller.role);

    if (!isPlatform && !isCompanyAdmin) {
      const scopedFilter = await getScopedLeadFilterSql(caller, tenantId, 'l', params.length + 1);
      query += scopedFilter.sql;
      params.push(...scopedFilter.params);
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

    logUserActivity({
      tenantId,
      userId: caller.id,
      username: caller.username,
      action: 'LEADS_EXPORTED',
      resourceType: 'leads',
      details: { rowCount: leads.length, source: source || 'all', status: status || 'all' },
      req
    });

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

  if (socket.data.user && (socket.data.user.role === 'platform_admin' || socket.data.user.role === 'master_admin')) {
    socket.join('platform_admins');
  }

  // ─── PLATFORM ADMIN OBSERVABILITY SUBSCRIBER ────────────────────────────────
  socket.on('platform:subscribe', async (data: { authToken: string }) => {
    if (!data?.authToken) return;
    try {
      const user = await validateToken(data.authToken);
      if (user && (user.role === 'platform_admin' || user.role === 'master_admin')) {
        socket.join('platform_admins');
        socket.emit('platform:subscribed', { success: true, timestamp: new Date().toISOString() });
        console.log(`[Platform Socket] Socket ${socket.id} joined platform_admins live room.`);
      } else {
        socket.emit('platform:error', { error: 'Master / Platform Admin privilege required.' });
      }
    } catch (err: any) {
      socket.emit('platform:error', { error: err.message });
    }
  });

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
    if (!user.tenantId) {
      socket.emit('phone:auth-error', { error: 'Account does not belong to a valid workspace.' });
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
              await createLog(effectiveLeadId, effectiveReason, effectiveDuration, effectiveTenantId, userId || undefined);
              await updateLeadStatus(effectiveLeadId, 'COMPLETED', effectiveReason, effectiveDuration, effectiveTenantId);
            } else {
              await createManualLog(effectivePhone, effectiveName || 'Manual Quick Dial', effectiveReason, effectiveDuration, effectiveTenantId, userId || undefined);
            }

            if (userId) {
              await recordAgentCallMetric({
                tenantId: effectiveTenantId,
                userId,
                username: 'agent',
                outcome: effectiveReason,
                duration: effectiveDuration,
                timestamp: finalizedAt
              });
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
app.get(['/email/leads', '/api/email/leads'], requireAuth, requirePermission(['autoEmailer', 'autoEmailer:view', 'autoEmailer:manage']), async (req: express.Request, res: express.Response): Promise<void> => {
  const tenantId = (req as any).user?.tenantId;
  if (!tenantId) {
    res.status(401).json({ error: 'Unauthorized: missing tenant identity' });
    return;
  }
  const rows = await db.queryAll('SELECT * FROM email_leads WHERE "tenantId" = $1 ORDER BY "createdAt" ASC', [tenantId]);
  res.json(rows);
});

// ── POST /email/upload
app.post(['/email/upload', '/api/email/upload'], requireAuth, requirePermission(['autoEmailer', 'autoEmailer:manage', 'leads:import']), async (req: express.Request, res: express.Response): Promise<void> => {
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
app.delete(['/email/leads', '/api/email/leads'], requireAuth, requirePermission(['autoEmailer', 'autoEmailer:manage']), async (req: express.Request, res: express.Response): Promise<void> => {
  const tenantId = (req as any).user?.tenantId;
  if (!tenantId) {
    res.status(401).json({ error: 'Unauthorized: missing tenant identity' });
    return;
  }
  await db.execute('DELETE FROM email_leads WHERE "tenantId" = $1', [tenantId]);
  res.json({ success: true });
});

// ── GET /email/accounts
app.get(['/email/accounts', '/api/email/accounts'], requireAuth, requirePermission(['autoEmailer', 'autoEmailer:view', 'autoEmailer:manage']), async (req: express.Request, res: express.Response): Promise<void> => {
  const tenantId = (req as any).user?.tenantId;
  if (!tenantId) {
    res.status(401).json({ error: 'Unauthorized: missing tenant identity' });
    return;
  }
  const rows = await db.queryAll('SELECT id, email, "senderName", "smtpHost", "smtpPort", status FROM email_accounts WHERE "tenantId" = $1', [tenantId]);
  res.json(rows);
});

// POST /email/accounts/:accountId/verify — validates SMTP connectivity without sending mail.
app.post(['/email/accounts/:accountId/verify', '/api/email/accounts/:accountId/verify'], requireAuth, requirePermission(['autoEmailer', 'autoEmailer:manage']), async (req: express.Request, res: express.Response): Promise<void> => {
  const tenantId = (req as any).user?.tenantId;
  if (!tenantId) {
    res.status(401).json({ error: 'Unauthorized: missing tenant identity' });
    return;
  }

  const account = await db.queryOne<{ email: string; password: string; smtpHost: string; smtpPort: number }>(
    'SELECT email, password, "smtpHost", "smtpPort" FROM email_accounts WHERE id = $1 AND "tenantId" = $2 AND status = \'active\'',
    [req.params.accountId, tenantId]
  );
  if (!account) {
    res.status(404).json({ error: 'Active SMTP account not found.' });
    return;
  }

  const { default: nodemailer } = await import('nodemailer');
  const transporter = nodemailer.createTransport({
    host: account.smtpHost,
    port: account.smtpPort,
    secure: false,
    auth: { user: account.email, pass: account.password },
    tls: { rejectUnauthorized: SMTP_REJECT_UNAUTHORIZED }
  });

  try {
    await transporter.verify();
    res.json({ success: true, message: 'SMTP connection and authentication succeeded.' });
  } catch (err: unknown) {
    const code = (err as { code?: unknown })?.code;
    const safeCode = typeof code === 'string' && /^[A-Z0-9_]{1,40}$/.test(code) ? code : 'SMTP_VERIFY_FAILED';
    console.warn(`[SMTP Verify] Account ${account.email} verification failed (${safeCode}).`);
    res.status(502).json({ success: false, error: 'SMTP connection or authentication failed.', code: safeCode });
  } finally {
    transporter.close();
  }
});

// ── POST /email/accounts
app.post(['/email/accounts', '/api/email/accounts'], requireAuth, requirePermission(['autoEmailer', 'autoEmailer:manage']), async (req: express.Request, res: express.Response): Promise<void> => {
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
app.get(['/email/templates', '/api/email/templates'], requireAuth, requirePermission(['autoEmailer', 'autoEmailer:view', 'autoEmailer:manage']), async (req: express.Request, res: express.Response): Promise<void> => {
  const tenantId = (req as any).user?.tenantId;
  if (!tenantId) {
    res.status(401).json({ error: 'Unauthorized: missing tenant identity' });
    return;
  }
  const rows = await db.queryAll('SELECT * FROM email_templates WHERE ("tenantId" = $1 OR "systemTemplate" = 1) ORDER BY stage ASC, id ASC', [tenantId]);
  res.json(rows);
});

// ── POST /email/templates
app.post(['/email/templates', '/api/email/templates'], requireAuth, requirePermission(['autoEmailer', 'autoEmailer:manage']), async (req: express.Request, res: express.Response): Promise<void> => {
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
app.post(['/email/start', '/api/email/start'], requireAuth, requirePermission(['autoEmailer', 'autoEmailer:manage', 'email:send']), (req: express.Request, res: express.Response): void => {
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
          tls: { rejectUnauthorized: SMTP_REJECT_UNAUTHORIZED }
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
app.post(['/emailer/stop', '/api/emailer/stop'], requireAuth, requirePermission(['autoEmailer', 'autoEmailer:manage']), (req: express.Request, res: express.Response): void => {
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
app.get(['/emailer/status', '/api/emailer/status'], requireAuth, requirePermission(['autoEmailer', 'autoEmailer:view', 'autoEmailer:manage']), (req: express.Request, res: express.Response): void => {
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

// ─── HEALTH & READINESS PROBES ────────────────────────────────────────────────
app.get(['/health', '/api/health'], (_req: express.Request, res: express.Response): void => {
  res.status(200).json({
    status: 'ok',
    uptime: process.uptime(),
    timestamp: new Date().toISOString()
  });
});

app.get(['/ready', '/api/ready'], async (_req: express.Request, res: express.Response): Promise<void> => {
  try {
    await db.queryOne('SELECT 1');
    res.status(200).json({
      status: 'ready',
      database: 'connected',
      timestamp: new Date().toISOString()
    });
  } catch (err: any) {
    res.status(503).json({
      status: 'not_ready',
      database: 'disconnected',
      error: err?.message || 'Database unavailable'
    });
  }
});

// Serve frontend SPA from backend port 3000
const frontendDistPath = path.resolve(__dirname, '../../frontend/dist');
if (fs.existsSync(frontendDistPath)) {
  app.use(express.static(frontendDistPath));
  app.get('*', (req, res, next) => {
    if (
      req.path.startsWith('/api') ||
      req.path.startsWith('/auth') ||
      req.path.startsWith('/admin') ||
      req.path.startsWith('/email') ||
      req.path.startsWith('/emailer') ||
      req.path.startsWith('/download') ||
      req.path.startsWith('/info') ||
      req.path.startsWith('/health') ||
      req.path.startsWith('/ready') ||
      req.path.startsWith('/join') ||
      req.path.startsWith('/campaigns') ||
      req.path.startsWith('/leads') ||
      req.path.startsWith('/logs') ||
      req.path.startsWith('/billing') ||
      req.path.startsWith('/teams') ||
      req.path.startsWith('/users') ||
      req.path.startsWith('/invitations') ||
      req.path.startsWith('/activity') ||
      req.path.startsWith('/metrics') ||
      req.path.startsWith('/onboarding') ||
      req.path.startsWith('/socket.io')
    ) {
      return next();
    }
    res.sendFile(path.join(frontendDistPath, 'index.html'));
  });
}

// ─── TERMINAL API 404 HANDLER ────────────────────────────────────────────────
// Any request reaching this point that was intended for an API or backend namespace
// MUST receive a clean JSON 404 response, NEVER an Express default HTML page.
app.use((req: express.Request, res: express.Response) => {
  res.status(404).json({
    success: false,
    error: 'Route not found',
    message: `Cannot ${req.method} ${req.path}`,
    path: req.path
  });
});

// ─── GLOBAL EXPRESS ERROR HANDLER ────────────────────────────────────────────
// Catches unhandled exceptions, next(err), and middleware errors.
// Guarantees all errors return Content-Type: application/json; charset=utf-8.
app.use((err: any, req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error('[Unhandled Express Error]:', err?.message || err);
  const status = typeof err.status === 'number' && err.status >= 400 && err.status < 600 ? err.status : 500;
  res.status(status).json({
    success: false,
    error: err?.message || (status >= 500 ? 'Internal Server Error' : 'Request Error')
  });
});

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
    // Public exposure must be explicitly enabled; never launch tunnels during tests/startup by default.
    if (process.env.ENABLE_PUBLIC_TUNNEL === 'true' && process.env.NODE_ENV !== 'test') tunnelManager.init(PORT);

    // 4. Start HTTP listener
    if ((process.env.NODE_ENV !== 'test' || process.env.TEST_LISTEN === 'true') && !process.env.SKIP_LISTEN) {
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
