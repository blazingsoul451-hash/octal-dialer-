import { Router, Request, Response } from 'express';
import { spawn, ChildProcess } from 'child_process';
import path from 'path';
import fs from 'fs';

export const facebookPosterRouter = Router();

// ─── DIRECTORY CONSTANTS & MULTI-TENANT HELPERS ──────────────────────────────

const BASE_DATA_DIR = path.resolve(__dirname, '../data/facebook_poster');
const BASE_PROFILES_DIR = path.resolve(__dirname, '../data/facebook_profiles');

if (!fs.existsSync(BASE_DATA_DIR)) fs.mkdirSync(BASE_DATA_DIR, { recursive: true });
if (!fs.existsSync(BASE_PROFILES_DIR)) fs.mkdirSync(BASE_PROFILES_DIR, { recursive: true });

function sanitizeTenantId(id: string): string {
  if (!id || typeof id !== 'string') return 'default';
  return id.replace(/[^a-zA-Z0-9_-]/g, '_');
}

function getTenantId(req: Request): string {
  const user = (req as any).user;
  const raw = user?.tenantId || user?.id || (user && typeof user === 'object' && 'workspaceId' in user ? (user as any).workspaceId : null);
  return sanitizeTenantId(raw || 'default');
}

function getTenantDataDir(tenantId: string): string {
  const dir = path.resolve(BASE_DATA_DIR, tenantId);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function getTenantProfilesDir(tenantId: string): string {
  const dir = path.resolve(BASE_PROFILES_DIR, tenantId);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return dir;
}

// ─── ACTIVE JOBS STATE (TENANT ISOLATED) ─────────────────────────────────────

interface ActivePosterJob {
  tenantId: string;
  account: string;
  mode: string;
  process: ChildProcess;
  startTime: string;
  logs: string[];
}

const activeJobs = new Map<string, ActivePosterJob>(); // key: tenantId

function appendJobLog(tenantId: string, message: string): void {
  const job = activeJobs.get(tenantId);
  if (job) {
    const timestamp = new Date().toLocaleTimeString();
    job.logs.push(`[${timestamp}] ${message}`);
    if (job.logs.length > 500) {
      job.logs.splice(0, job.logs.length - 500);
    }
  }
}

function resolvePosterScriptPath(): string {
  const candidates = [
    path.resolve(__dirname, 'facebook_modules', 'facebook_poster.js'),
    path.resolve(__dirname, '../src/facebook_modules', 'facebook_poster.js'),
    path.resolve(process.cwd(), 'src/facebook_modules', 'facebook_poster.js'),
    path.resolve(__dirname, '../../src/facebook_modules', 'facebook_poster.js')
  ];
  for (const c of candidates) {
    if (fs.existsSync(c)) return c;
  }
  return candidates[0];
}

// ─── ENDPOINTS ───────────────────────────────────────────────────────────────

/**
 * GET /accounts - List accounts for tenant
 */
facebookPosterRouter.get('/accounts', (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const accountsFile = path.join(getTenantDataDir(tenantId), 'accounts.json');
    if (!fs.existsSync(accountsFile)) {
      return res.json([]);
    }
    const accounts = JSON.parse(fs.readFileSync(accountsFile, 'utf8'));
    res.json(Array.isArray(accounts) ? accounts : []);
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to list accounts' });
  }
});

/**
 * POST /accounts/add - Validate & store account cookies/profile
 */
facebookPosterRouter.post('/accounts/add', (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const { profileId, name = '', cookiesStr = '', note = '' } = req.body;

    if (!profileId || typeof profileId !== 'string') {
      return res.status(400).json({ error: 'Valid profileId is required.' });
    }
    const safeProfileId = profileId.replace(/[^a-zA-Z0-9_-]/g, '_');
    if (!cookiesStr || typeof cookiesStr !== 'string') {
      return res.status(400).json({ error: 'Cookies JSON string is required.' });
    }

    let parsedCookies: any;
    try {
      parsedCookies = JSON.parse(cookiesStr.trim());
      if (!Array.isArray(parsedCookies)) {
        if (typeof parsedCookies === 'object' && parsedCookies !== null) {
          parsedCookies = [parsedCookies];
        } else {
          throw new Error('Cookies must be a JSON array or cookie object.');
        }
      }
    } catch (e: any) {
      return res.status(400).json({ error: `Invalid cookies JSON: ${e.message}` });
    }

    // Save cookies to tenant profile folder
    const profileDir = path.resolve(getTenantProfilesDir(tenantId), safeProfileId);
    if (!fs.existsSync(profileDir)) fs.mkdirSync(profileDir, { recursive: true });
    fs.writeFileSync(path.join(profileDir, 'cookies.json'), JSON.stringify(parsedCookies, null, 2), 'utf8');

    // Health heuristic: check presence of c_user or xs
    const hasCUser = parsedCookies.some((c: any) => c && (c.name === 'c_user' || c.name === 'xs'));
    const initialStatus = hasCUser ? 'valid' : 'checking';

    // Update tenant accounts list
    const accountsFile = path.join(getTenantDataDir(tenantId), 'accounts.json');
    let accounts: any[] = [];
    if (fs.existsSync(accountsFile)) {
      try { accounts = JSON.parse(fs.readFileSync(accountsFile, 'utf8')); } catch (_) {}
    }

    const updatedAccount = {
      profileId: safeProfileId,
      name: name.trim() || safeProfileId,
      status: initialStatus,
      note: note.trim()
    };

    const existingIdx = accounts.findIndex((a: any) => a.profileId === safeProfileId);
    if (existingIdx >= 0) {
      accounts[existingIdx] = updatedAccount;
    } else {
      accounts.push(updatedAccount);
    }

    fs.writeFileSync(accountsFile, JSON.stringify(accounts, null, 2), 'utf8');

    res.json({
      loggedIn: hasCUser,
      account: updatedAccount
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to save account' });
  }
});

/**
 * DELETE /accounts/:id & POST /accounts/delete - Delete account
 */
const handleDeleteAccount = (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const targetId = (req.params.id || req.body.profileId || '').trim();
    if (!targetId) {
      return res.status(400).json({ error: 'Profile ID is required for deletion.' });
    }
    const safeProfileId = targetId.replace(/[^a-zA-Z0-9_-]/g, '_');

    const accountsFile = path.join(getTenantDataDir(tenantId), 'accounts.json');
    if (fs.existsSync(accountsFile)) {
      try {
        let accounts = JSON.parse(fs.readFileSync(accountsFile, 'utf8'));
        accounts = accounts.filter((a: any) => a.profileId !== safeProfileId);
        fs.writeFileSync(accountsFile, JSON.stringify(accounts, null, 2), 'utf8');
      } catch (_) {}
    }

    // Clean profile folder
    const profileDir = path.resolve(getTenantProfilesDir(tenantId), safeProfileId);
    if (fs.existsSync(profileDir)) {
      try {
        fs.rmSync(profileDir, { recursive: true, force: true });
      } catch (_) {}
    }

    res.json({ success: true, message: `Profile ${safeProfileId} deleted successfully.` });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to delete account' });
  }
};

facebookPosterRouter.delete('/accounts/:id', handleDeleteAccount);
facebookPosterRouter.post('/accounts/delete', handleDeleteAccount);

/**
 * GET /config & POST /config - Post templates & destination URLs
 */
facebookPosterRouter.get('/config', (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const configFile = path.join(getTenantDataDir(tenantId), 'fb_config.json');
    if (!fs.existsSync(configFile)) {
      return res.json({ caption: '', postUrls: [] });
    }
    const config = JSON.parse(fs.readFileSync(configFile, 'utf8'));
    res.json(config);
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to load campaign config' });
  }
});

facebookPosterRouter.post('/config', (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const { caption = '', postUrls = [] } = req.body;
    const config = {
      caption: typeof caption === 'string' ? caption.trim() : '',
      postUrls: Array.isArray(postUrls) ? postUrls.map((u: any) => String(u).trim()).filter(Boolean) : []
    };
    const configFile = path.join(getTenantDataDir(tenantId), 'fb_config.json');
    fs.writeFileSync(configFile, JSON.stringify(config, null, 2), 'utf8');
    res.json({ success: true, message: 'Campaign configuration saved.' });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to save campaign config' });
  }
});

/**
 * GET /join-config & POST /join-config - Group join settings
 */
facebookPosterRouter.get('/join-config', (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const joinConfigFile = path.join(getTenantDataDir(tenantId), 'fb_join_config.json');
    if (!fs.existsSync(joinConfigFile)) {
      return res.json({ keywords: [], joinsPerSession: 5 });
    }
    const config = JSON.parse(fs.readFileSync(joinConfigFile, 'utf8'));
    res.json(config);
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to load join config' });
  }
});

facebookPosterRouter.post('/join-config', (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const { keywords = [], joinsPerSession = 5 } = req.body;
    const config = {
      keywords: Array.isArray(keywords) ? keywords.map((k: any) => String(k).trim()).filter(Boolean) : [],
      joinsPerSession: Math.max(1, Math.min(20, parseInt(joinsPerSession, 10) || 5))
    };
    const joinConfigFile = path.join(getTenantDataDir(tenantId), 'fb_join_config.json');
    fs.writeFileSync(joinConfigFile, JSON.stringify(config, null, 2), 'utf8');
    res.json({ success: true, message: 'Join configuration saved.' });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to save join config' });
  }
});

/**
 * GET /groups & POST /groups - Extracted target groups
 */
facebookPosterRouter.get('/groups', (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const groupsFile = path.join(getTenantDataDir(tenantId), 'fb_groups.json');
    if (!fs.existsSync(groupsFile)) {
      return res.json([]);
    }
    const groups = JSON.parse(fs.readFileSync(groupsFile, 'utf8'));
    res.json(Array.isArray(groups) ? groups : []);
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to load groups' });
  }
});

facebookPosterRouter.post('/groups', (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const { name, url, status = 'pending' } = req.body;
    if (!url || typeof url !== 'string') {
      return res.status(400).json({ error: 'Group url is required.' });
    }
    const groupsFile = path.join(getTenantDataDir(tenantId), 'fb_groups.json');
    let groups: any[] = [];
    if (fs.existsSync(groupsFile)) {
      try { groups = JSON.parse(fs.readFileSync(groupsFile, 'utf8')); } catch (_) {}
    }
    if (!groups.some((g: any) => g.url === url.trim())) {
      groups.push({
        name: name ? String(name).trim() : 'Facebook Group',
        url: url.trim(),
        status: status.trim(),
        joinedAt: new Date().toISOString()
      });
      fs.writeFileSync(groupsFile, JSON.stringify(groups, null, 2), 'utf8');
    }
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to update groups' });
  }
});

/**
 * GET /activity & GET /activity-log - History of successful & failed posts
 */
const handleGetActivity = (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const activityFile = path.join(getTenantDataDir(tenantId), 'fb_activity_log.json');
    if (!fs.existsSync(activityFile)) {
      return res.json([]);
    }
    const activities = JSON.parse(fs.readFileSync(activityFile, 'utf8'));
    res.json(Array.isArray(activities) ? activities : []);
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to load activity logs' });
  }
};

facebookPosterRouter.get('/activity', handleGetActivity);
facebookPosterRouter.get('/activity-log', handleGetActivity);

/**
 * POST /run & POST /toggle & POST /stop - Job process management
 */
function spawnPosterJob(tenantId: string, mode: string, account: string): void {
  const posterScript = resolvePosterScriptPath();
  const profileDir = path.resolve(getTenantProfilesDir(tenantId), account);
  const dataDir = getTenantDataDir(tenantId);

  const child = spawn(process.execPath, [
    posterScript,
    '--mode', mode,
    '--profile', account,
    '--tenant', tenantId,
    '--profileDir', profileDir,
    '--dataDir', dataDir
  ], {
    cwd: path.dirname(posterScript),
    env: { ...process.env },
    stdio: ['ignore', 'pipe', 'pipe']
  });

  const jobRecord: ActivePosterJob = {
    tenantId,
    account,
    mode,
    process: child,
    startTime: new Date().toISOString(),
    logs: [`🚀 Initialized Facebook Auto-Poster [${mode.toUpperCase()}] on profile ${account}`]
  };

  activeJobs.set(tenantId, jobRecord);

  child.stdout?.on('data', (chunk: Buffer) => {
    const lines = chunk.toString('utf8').split(/\r?\n/).filter(Boolean);
    for (const l of lines) appendJobLog(tenantId, l);
  });

  child.stderr?.on('data', (chunk: Buffer) => {
    const lines = chunk.toString('utf8').split(/\r?\n/).filter(Boolean);
    for (const l of lines) appendJobLog(tenantId, `[STDERR] ${l}`);
  });

  child.on('close', (code: number | null) => {
    appendJobLog(tenantId, `🏁 Job finished with exit code: ${code ?? 0}`);
    if (activeJobs.get(tenantId)?.process === child) {
      activeJobs.delete(tenantId);
    }
  });

  child.on('error', (err: Error) => {
    appendJobLog(tenantId, `❌ Process error: ${err.message}`);
    if (activeJobs.get(tenantId)?.process === child) {
      activeJobs.delete(tenantId);
    }
  });
}

function terminatePosterJob(tenantId: string): boolean {
  const job = activeJobs.get(tenantId);
  if (!job) return false;

  appendJobLog(tenantId, '🛑 Stopping Facebook Auto-Poster process...');
  try {
    if (process.platform === 'win32' && job.process.pid) {
      spawn('taskkill', ['/pid', String(job.process.pid), '/T', '/F']);
    } else {
      job.process.kill('SIGTERM');
    }
  } catch (_) {
    try { job.process.kill('SIGKILL'); } catch (_) {}
  }

  activeJobs.delete(tenantId);
  return true;
}

facebookPosterRouter.post('/run', (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const { mode = 'share', account = '', profileId = '' } = req.body;
    const targetAccount = (account || profileId || '').trim();

    if (!targetAccount) {
      return res.status(400).json({ error: 'Target account profile is required.' });
    }

    if (activeJobs.has(tenantId)) {
      return res.status(409).json({ error: 'A Facebook poster job is already running for this workspace.' });
    }

    spawnPosterJob(tenantId, mode === 'join' ? 'join' : 'share', targetAccount);
    res.json({ status: 'running', message: 'Facebook poster job started.' });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to start poster job' });
  }
});

facebookPosterRouter.post('/stop', (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    terminatePosterJob(tenantId);
    res.json({ status: 'stopped', message: 'Facebook poster job stopped.' });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to stop poster job' });
  }
});

facebookPosterRouter.post('/toggle', (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const { mode = 'share', account = '' } = req.body;

    if (activeJobs.has(tenantId)) {
      terminatePosterJob(tenantId);
      return res.json({ status: 'stopped', message: 'Facebook poster job stopped.' });
    }

    if (!account.trim()) {
      return res.status(400).json({ error: 'Please select an account to run the campaign.' });
    }

    spawnPosterJob(tenantId, mode === 'join' ? 'join' : 'share', account.trim());
    res.json({ status: 'running', message: 'Facebook poster job started.' });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to toggle poster job' });
  }
});

/**
 * GET /status & GET /logs - Live job streaming/poll
 */
const handleGetStatus = (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const job = activeJobs.get(tenantId);
    if (!job) {
      return res.json({ status: 'idle', logs: [] });
    }
    res.json({
      status: 'running',
      mode: job.mode,
      account: job.account,
      startTime: job.startTime,
      logs: job.logs
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to fetch status' });
  }
};

facebookPosterRouter.get('/status', handleGetStatus);
facebookPosterRouter.get('/logs', handleGetStatus);
