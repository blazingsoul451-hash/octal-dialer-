// Load environment variables FIRST before any other imports
import dotenv from 'dotenv';
dotenv.config();

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
  updateHeartbeat
} from './sessionManager';

import {
  ensureDefaultAdmin,
  login,
  logout,
  validateToken,
  changePassword,
  requireAdmin,
  hashPassword
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

const app = express();

const checkOrigin = (origin: string | undefined, callback: (err: Error | null, allow?: boolean) => void) => {
  // Allow all localhost and 127.0.0.1 origins with any port for development
  if (!origin) {
    callback(null, true);
  } else if (origin.startsWith('http://localhost:') || origin.startsWith('http://127.0.0.1:')) {
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

// Set request timeout to 30 seconds to prevent slowloris attacks
app.use((req, res, next) => {
  req.socket.setTimeout(30000);
  next();
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

// ─── Auth REST Endpoints (no requireAuth — public) ──────────────────────────

// POST /auth/login
app.post('/auth/login', (req, res) => {
  const { username, password } = req.body as { username: string; password: string };
  if (!username || !password) {
    res.status(400).json({ error: 'Username and password required.' });
    return;
  }
  const token = login(username, password);
  if (!token) {
    res.status(401).json({ error: 'Invalid username or password.' });
    return;
  }
  res.json({ token, username });
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

// GET /auth/verify — verify token validity
app.get('/auth/verify', requireAuth, (req, res) => {
  res.json({ valid: true, user: (req as any).user });
});

// ═══════════════════════════════════════════════════════════════════════════
// ADMIN ENDPOINTS — User & Permission Management
// ═══════════════════════════════════════════════════════════════════════════

// GET /admin/users — list all users in the current tenant with their permissions
app.get('/admin/users', requireAdmin, (req, res) => {
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

// POST /admin/users — create new user in the current tenant
app.post('/admin/users', requireAdmin, (req, res) => {
  const { username, password, role = 'agent' } = req.body as {
    username: string;
    password: string;
    role?: string
  };

  if (!username || !password) {
    res.status(400).json({ error: 'Username and password required.' });
    return;
  }

  if (password.length < 6) {
    res.status(400).json({ error: 'Password must be at least 6 characters.' });
    return;
  }

  if (!['admin', 'agent'].includes(role)) {
    res.status(400).json({ error: 'Role must be admin or agent.' });
    return;
  }

  try {
    const adminUser = (req as any).user;
    const tenantId = adminUser.tenantId;

    // Check if username already exists
    const existing = db.prepare(`SELECT id FROM users WHERE username = ?`).get(username);
    if (existing) {
      res.status(400).json({ error: 'Username already exists.' });
      return;
    }

    const userId = 'user_' + crypto.randomBytes(8).toString('hex');
    const { hash } = hashPassword(password);

    db.prepare(`
      INSERT INTO users (id, username, passwordHash, role, tenantId, createdAt)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(userId, username, hash, role, tenantId, new Date().toISOString());

    // Grant all permissions by default for new users within this tenant
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
        adminUser.username,
        tenantId,
        new Date().toISOString()
      );
    }

    res.json({
      success: true,
      userId,
      message: `User ${username} created successfully.`
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /admin/users/:userId — update user role or password within the current tenant
app.put('/admin/users/:userId', requireAdmin, (req, res) => {
  const { userId } = req.params;
  const { role, newPassword } = req.body as { role?: string; newPassword?: string };
  const adminUser = (req as any).user;
  const tenantId = adminUser.tenantId;

  try {
    const user = db.prepare(`SELECT * FROM users WHERE id = ? AND tenantId = ?`).get(userId, tenantId);
    if (!user) {
      res.status(404).json({ error: 'User not found.' });
      return;
    }

    if (role !== undefined) {
      if (!['admin', 'agent'].includes(role)) {
        res.status(400).json({ error: 'Role must be admin or agent.' });
        return;
      }
      db.prepare(`UPDATE users SET role = ? WHERE id = ? AND tenantId = ?`).run(role, userId, tenantId);
    }

    if (newPassword !== undefined) {
      if (newPassword.length < 6) {
        res.status(400).json({ error: 'Password must be at least 6 characters.' });
        return;
      }
      const { hash } = hashPassword(newPassword);
      db.prepare(`UPDATE users SET passwordHash = ? WHERE id = ? AND tenantId = ?`).run(hash, userId, tenantId);
    }

    res.json({ success: true, message: 'User updated successfully.' });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /admin/users/:userId — delete user within the current tenant
app.delete('/admin/users/:userId', requireAdmin, (req, res) => {
  const { userId } = req.params;
  const adminUser = (req as any).user;
  const tenantId = adminUser.tenantId;

  // Prevent self-deletion
  if (userId === adminUser.id) {
    res.status(400).json({ error: 'Cannot delete your own account.' });
    return;
  }

  try {
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

// POST /admin/permissions — update user module permissions
app.post('/admin/permissions', requireAdmin, (req, res) => {
  const { userId, moduleId, enabled } = req.body as {
    userId: string;
    moduleId: string;
    enabled: boolean
  };

  if (!userId || !moduleId || typeof enabled !== 'boolean') {
    res.status(400).json({ error: 'userId, moduleId, and enabled (boolean) required.' });
    return;
  }

  const validModules = ['octalDialer', 'googleScraper', 'autoEmailer', 'facebookScraper', 'facebookPoster'];
  if (!validModules.includes(moduleId)) {
    res.status(400).json({ error: 'Invalid moduleId.' });
    return;
  }

  try {
    const adminUser = (req as any).user;

    db.prepare(`
      INSERT INTO user_permissions (id, userId, moduleId, enabled, grantedBy, grantedAt)
      VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(userId, moduleId) DO UPDATE SET
        enabled = excluded.enabled,
        grantedBy = excluded.grantedBy,
        grantedAt = excluded.grantedAt
    `).run(
      `perm_${userId}_${moduleId}`,
      userId,
      moduleId,
      enabled ? 1 : 0,
      adminUser.username,
      new Date().toISOString()
    );

    res.json({ success: true, message: 'Permission updated.' });
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

// GET /auth/permissions — get permissions for current logged-in user
app.get('/auth/permissions', requireAuth, (req, res) => {
  try {
    const user = (req as any).user;

    // Admins have access to everything
    if (user.role === 'admin') {
      res.json({
        octalDialer: true,
        googleScraper: true,
        autoEmailer: true,
        facebookScraper: true,
        facebookPoster: true
      });
      return;
    }

    const permissions = db.prepare(`
      SELECT moduleId, enabled
      FROM user_permissions
      WHERE userId = ?
    `).all(user.id);

    const permMap: Record<string, boolean> = {
      octalDialer: false,
      googleScraper: false,
      autoEmailer: false,
      facebookScraper: false,
      facebookPoster: false
    };

    for (const perm of permissions as any[]) {
      permMap[perm.moduleId] = perm.enabled === 1;
    }

    res.json(permMap);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// ADMIN ENDPOINTS — Tool-Level Permissions
// ═══════════════════════════════════════════════════════════════════════════

// GET /admin/tools — list all registered tools
app.get('/admin/tools', requireAdmin, (req, res) => {
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

// POST /admin/tools — register a new tool
app.post('/admin/tools', requireAdmin, (req, res) => {
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

// PATCH /admin/tools/:toolId — toggle global kill-switch
app.patch('/admin/tools/:toolId', requireAdmin, (req, res) => {
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

// POST /admin/tool-permissions — set per-user tool access
app.post('/admin/tool-permissions', requireAdmin, (req, res) => {
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

// GET /leads — list leads with filters and pagination
app.get('/leads', requireAuth, (req, res) => {
  try {
    const { source, status, campaignId, page = '1', limit = '50' } = req.query;
    const pageNum = parseInt(page as string, 10);
    const limitNum = parseInt(limit as string, 10);
    const offset = (pageNum - 1) * limitNum;

    let query = `SELECT * FROM scraped_leads WHERE 1=1`;
    const params: any[] = [];

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
    let countQuery = `SELECT COUNT(*) as total FROM scraped_leads WHERE 1=1`;
    const countParams: any[] = [];
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

// POST /leads — bulk insert from scraper output
app.post('/leads', requireAuth, (req, res) => {
  const { leads } = req.body as { leads: any[] };

  if (!Array.isArray(leads) || leads.length === 0) {
    res.status(400).json({ error: 'leads array required.' });
    return;
  }

  try {
    const user = (req as any).user;
    const stmt = db.prepare(`
      INSERT INTO scraped_leads (
        id, source, campaignId, businessName, phone, email, address, website,
        socialLinks, rawData, status, scrapedBy, scrapedAt
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'new', ?, ?)
      ON CONFLICT(source, phone, businessName) DO UPDATE SET
        email = excluded.email,
        address = excluded.address,
        website = excluded.website,
        socialLinks = excluded.socialLinks,
        rawData = excluded.rawData
    `);

    const insertMany = db.transaction((leadsArray: any[]) => {
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
          new Date().toISOString()
        );
      }
    });

    insertMany(leads);

    res.json({ success: true, inserted: leads.length });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
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

// DELETE /leads/:id — delete a lead
app.delete('/leads/:id', requireAuth, (req, res) => {
  const { id } = req.params;
  const user = (req as any).user;

  try {
    // Allow deletion if: admin OR the user scraped it
    const lead = db.prepare(`SELECT scrapedBy FROM scraped_leads WHERE id = ?`).get(id) as any;

    if (!lead) {
      res.status(404).json({ error: 'Lead not found.' });
      return;
    }

    if (user.role !== 'admin' && lead.scrapedBy !== user.username) {
      res.status(403).json({ error: 'You can only delete leads you scraped.' });
      return;
    }

    db.prepare(`DELETE FROM scraped_leads WHERE id = ?`).run(id);
    res.json({ success: true, message: 'Lead deleted.' });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET /leads/export — export filtered leads as CSV
app.get('/leads/export', requireAuth, (req, res) => {
  try {
    const { source, status, campaignId, format = 'csv' } = req.query;

    if (format !== 'csv') {
      res.status(400).json({ error: 'Only CSV format supported currently.' });
      return;
    }

    let query = `SELECT * FROM scraped_leads WHERE 1=1`;
    const params: any[] = [];

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

// REST: Run Scraper (protected)
app.post('/api/scraper/run', requireAuth, (req, res) => {
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

// REST: Facebook Scraper endpoints
app.post('/api/facebook-scraper/run', requireAuth, (req, res) => {
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

app.get('/api/facebook-scraper/status', requireAuth, (req, res) => {
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

app.post('/api/facebook-scraper/stop', requireAuth, (req, res) => {
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

app.get('/api/facebook-scraper/download', requireAuth, (req, res) => {
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

// REST: Facebook Poster endpoints
app.get('/api/facebook-poster/accounts', requireAuth, (req, res) => {
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

app.post('/api/facebook-poster/accounts/add', requireAuth, async (req, res) => {
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

app.post('/api/facebook-poster/accounts/delete', requireAuth, (req, res) => {
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

app.get('/api/facebook-poster/config', requireAuth, (req, res) => {
  res.json(readFbJson(FB_CONFIG_FILE, { postUrls: [], caption: '' }));
});

app.post('/api/facebook-poster/config', requireAuth, (req, res) => {
  const { postUrls, caption } = req.body as { postUrls: string[]; caption: string };
  writeFbJson(FB_CONFIG_FILE, { postUrls: postUrls || [], caption: caption || '' });
  res.json({ success: true, message: 'Campaign configuration saved.' });
});

app.get('/api/facebook-poster/join-config', requireAuth, (req, res) => {
  res.json(readFbJson(FB_JOIN_CONFIG_FILE, { keywords: [], joinsPerSession: 5 }));
});

app.post('/api/facebook-poster/join-config', requireAuth, (req, res) => {
  const { keywords, joinsPerSession } = req.body as { keywords: string[]; joinsPerSession: number };
  writeFbJson(FB_JOIN_CONFIG_FILE, { keywords: keywords || [], joinsPerSession: joinsPerSession || 5 });
  res.json({ success: true, message: 'Auto Joiner configuration saved.' });
});

app.get('/api/facebook-poster/groups', requireAuth, (req, res) => {
  res.json(readFbJson(FB_GROUPS_FILE, []));
});

app.get('/api/facebook-poster/activity-log', requireAuth, (req, res) => {
  res.json(readFbJson(FB_ACTIVITY_FILE, []));
});

app.get('/api/facebook-poster/status', requireAuth, (req, res) => {
  res.json(activeFbPosterTask);
});

app.post('/api/facebook-poster/toggle', requireAuth, (req, res) => {
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

// ── GET /email/leads
app.get('/email/leads', requireAuth, (req: express.Request, res: express.Response): void => {
  const user = (req as any).user;
  const tenantId = user.tenantId;
  const rows = emailDb.prepare('SELECT * FROM email_leads WHERE tenantId = ? ORDER BY createdAt ASC').all(tenantId);
  res.json(rows);
});

// ── POST /email/upload
app.post('/email/upload', requireAuth, (req: express.Request, res: express.Response): void => {
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

// ── DELETE /email/leads
app.delete('/email/leads', requireAuth, (req: express.Request, res: express.Response): void => {
  const user = (req as any).user;
  const tenantId = user.tenantId;
  emailDb.prepare('DELETE FROM email_leads WHERE tenantId = ?').run(tenantId);
  res.json({ success: true });
});

// ── GET /email/accounts
app.get('/email/accounts', requireAuth, (req: express.Request, res: express.Response): void => {
  const user = (req as any).user;
  const tenantId = user.tenantId;
  const rows = emailDb.prepare('SELECT id, email, senderName, smtpHost, smtpPort, status, tenantId FROM email_accounts WHERE tenantId = ?').all(tenantId);
  res.json(rows);
});

// ── POST /email/accounts
app.post('/email/accounts', requireAuth, (req: express.Request, res: express.Response): void => {
  const user = (req as any).user;
  const tenantId = user.tenantId;
  const { accounts } = req.body as { accounts: { email: string; password: string; senderName?: string; smtpHost?: string; smtpPort?: number; status?: string }[] };
  if (!Array.isArray(accounts)) {
    res.status(400).json({ error: 'accounts array required' });
    return;
  }
  const upsert = emailDb.prepare(`
    INSERT INTO email_accounts (email, password, senderName, smtpHost, smtpPort, status, tenantId)
    VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(email) DO UPDATE SET
      password = CASE WHEN excluded.password = '***keep***' THEN password ELSE excluded.password END,
      senderName = excluded.senderName,
      smtpHost = excluded.smtpHost,
      smtpPort = excluded.smtpPort,
      status = excluded.status,
      tenantId = excluded.tenantId
  `);
  for (const acc of accounts) {
    upsert.run(
      acc.email.toLowerCase(),
      acc.password,
      acc.senderName || null,
      acc.smtpHost || 'smtp.office365.com',
      acc.smtpPort || 587,
      acc.status || 'active',
      tenantId
    );
  }
  res.json({ success: true });
});

// ── GET /email/templates
app.get('/email/templates', requireAuth, (req: express.Request, res: express.Response): void => {
  const user = (req as any).user;
  const tenantId = user.tenantId;
  const rows = emailDb.prepare('SELECT * FROM email_templates WHERE tenantId = ? ORDER BY stage ASC, id ASC').all(tenantId);
  res.json(rows);
});

// ── POST /email/templates
app.post('/email/templates', requireAuth, (req: express.Request, res: express.Response): void => {
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

// ── POST /email/start — tenant-isolated campaign runner
app.post('/email/start', requireAuth, (req: express.Request, res: express.Response): void => {
  if (emailerJob.running) {
    res.json({ success: true, message: 'Campaign already running.' });
    return;
  }
  const user = (req as any).user;
  const tenantId = user.tenantId;
  const { limit = 300 } = req.body as { limit?: number };

  emailerJob.running = true;
  emailerJob.stop = false;

  (async () => {
    try {
      const { default: nodemailer } = await import('nodemailer');
      const leads = emailDb.prepare(`SELECT * FROM email_leads WHERE tenantId = ? AND status IN ('pending','sent')`).all(tenantId) as any[];
      const accounts = emailDb.prepare(`SELECT * FROM email_accounts WHERE tenantId = ? AND status = 'active'`).all(tenantId) as any[];
      const templates = emailDb.prepare(`SELECT * FROM email_templates WHERE tenantId = ? ORDER BY stage ASC, id ASC`).all(tenantId) as any[];

      emailLog(`=== Campaign Started [Tenant: ${tenantId}]: ${leads.length} eligible leads, ${accounts.length} accounts, ${templates.length} templates ===`);

      if (!accounts.length) { emailLog('❌ No active SMTP accounts for this tenant!'); return; }
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


// ═══════════════════════════════════════════════════════════════════════════
// ADMIN DASHBOARD ENDPOINTS (Phase 4)
// ═══════════════════════════════════════════════════════════════════════════

// Analytics: Overview KPIs
app.get('/admin/analytics/overview', requireAdmin, (req, res) => {
  try {
    const totalUsers = db.prepare('SELECT COUNT(*) as count FROM users').get() as { count: number };
    const activeSessions = db.prepare('SELECT COUNT(*) as count FROM sessions_store WHERE expiresAt > datetime("now")').get() as { count: number };
    const todaysCalls = db.prepare(`SELECT COUNT(*) as count FROM call_logs WHERE date(timestamp) = date('now')`).get() as { count: number };
    const todaysLeads = db.prepare(`SELECT COUNT(*) as count FROM scraped_leads WHERE date(scrapedAt) = date('now')`).get() as { count: number };

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

// Analytics: Usage trends (last 30 days)
app.get('/admin/analytics/usage-trends', requireAdmin, (req, res) => {
  try {
    const trends = db.prepare(`
      SELECT
        date(timestamp) as date,
        COUNT(*) as callCount
      FROM call_logs
      WHERE timestamp > datetime('now', '-30 days')
      GROUP BY date(timestamp)
      ORDER BY date ASC
    `).all() as Array<{ date: string; callCount: number }>;

    res.json({ trends });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Analytics: Module usage stats
app.get('/admin/analytics/module-usage', requireAdmin, (req, res) => {
  try {
    const modules = [
      { moduleId: 'octalDialer', label: 'Octal Dialer' },
      { moduleId: 'googleScraper', label: 'Google Scraper' },
      { moduleId: 'autoEmailer', label: 'Auto Emailer' },
      { moduleId: 'facebookScraper', label: 'Facebook Scraper' },
      { moduleId: 'facebookPoster', label: 'Facebook Poster' }
    ];

    const stats = modules.map(m => {
      const enabledUsers = db.prepare(`
        SELECT COUNT(DISTINCT userId) as count FROM user_permissions
        WHERE moduleId = ? AND enabled = 1
      `).get({ 1: m.moduleId }) as { count: number };
      return { module: m.label, enabledUsers: enabledUsers.count };
    });

    res.json({ stats });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Audit Logs: Get paginated logs
app.get('/admin/audit-logs', requireAdmin, (req, res) => {
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

// System Settings: Get all settings grouped by category
app.get('/admin/system-settings', requireAdmin, (req, res) => {
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

// System Settings: Update settings
app.put('/admin/system-settings', requireAdmin, (req, res) => {
  try {
    const { settings } = req.body as { settings: Array<{ id: string; settingValue: string }> };
    if (!Array.isArray(settings)) {
      res.status(400).json({ error: 'settings array required' });
      return;
    }

    const user = (req as any).user;
    const update = db.prepare('UPDATE system_settings SET settingValue = ?, updatedBy = ?, updatedAt = datetime("now") WHERE id = ?');

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

// Custom Roles: List roles
app.get('/admin/roles', requireAdmin, (req, res) => {
  try {
    const roles = db.prepare('SELECT * FROM custom_roles ORDER BY createdAt DESC').all() as any[];
    res.json({ roles });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Custom Roles: Create role
app.post('/admin/roles', requireAdmin, (req, res) => {
  try {
    const { roleName, description, permissions } = req.body as { roleName: string; description: string; permissions: any };
    const user = (req as any).user;
    const id = crypto.randomUUID();

    db.prepare(`
      INSERT INTO custom_roles (id, roleName, description, permissions, createdBy)
      VALUES (?, ?, ?, ?, ?)
    `).run(id, roleName, JSON.stringify(permissions), user.username);

    res.json({ success: true, id });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Custom Roles: Update role
app.put('/admin/roles/:roleId', requireAdmin, (req, res) => {
  try {
    const { roleName, description, permissions } = req.body as { roleName: string; description: string; permissions: any };
    const { roleId } = req.params;

    db.prepare(`
      UPDATE custom_roles SET roleName = ?, description = ?, permissions = ? WHERE id = ?
    `).run(roleName, description, JSON.stringify(permissions), roleId);

    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// API Keys: List all keys for current tenant
app.get('/admin/api-keys', requireAdmin, (req, res) => {
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

// API Keys: Generate new key for current tenant
app.post('/admin/api-keys', requireAdmin, (req, res) => {
  try {
    const adminUser = (req as any).user;
    const tenantId = adminUser.tenantId;

    const { keyName, userId, scopes, expiresAt } = req.body as { keyName: string; userId: string; scopes: string[]; expiresAt?: string };
    const id = crypto.randomUUID();
    const keyValue = crypto.randomBytes(32).toString('hex');
    const keyHash = crypto.createHash('sha256').update(keyValue).digest('hex');

    db.prepare(`
      INSERT INTO api_keys (id, keyName, keyHash, userId, scopes, expiresAt, tenantId)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(id, keyName, keyHash, userId, JSON.stringify(scopes), expiresAt || null, tenantId);

    res.json({ success: true, id, keyValue, message: 'Save this key — it will not be shown again' });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// API Keys: Revoke key within current tenant
app.delete('/admin/api-keys/:keyId', requireAdmin, (req, res) => {
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

// System Health: Get current metrics
app.get('/admin/health/status', requireAdmin, (req, res) => {
  try {
    const uptime = process.uptime();
    const memUsage = process.memoryUsage();
    const activeSessions = db.prepare('SELECT COUNT(*) as count FROM sessions_store WHERE expiresAt > datetime("now")').get() as { count: number };

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

httpServer.listen(PORT, '0.0.0.0', () => {
  console.log(`[Octal Backend] Server running on http://0.0.0.0:${PORT}`);
  console.log(`[Local IP Address] Detected: http://${getLocalIP()}:${PORT}`);
  console.log(`[Phone must use this URL] http://${getLocalIP()}:${PORT}`);
  console.log(`[QR will auto-encode this URL in the pairing link]`);
});
