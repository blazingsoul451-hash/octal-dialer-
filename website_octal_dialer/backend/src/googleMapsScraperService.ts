import { fork, ChildProcess } from 'child_process';
import crypto from 'crypto';
import ExcelJS from 'exceljs';
import fs from 'fs';
import path from 'path';
import { db, createCampaign } from './databaseManager';
import {
  ScraperJobOptions,
  ScraperJobRecord,
  ScraperJobStatus,
  ScrapedLead,
  WorkerChildMessage,
  WorkerParentMessage
} from './scraperTypes';

const JOBS_DIR = path.resolve(__dirname, '../data/scraper_jobs');
const OUTPUT_DIR = path.resolve(__dirname, '../data/scraper_output');

if (!fs.existsSync(JOBS_DIR)) fs.mkdirSync(JOBS_DIR, { recursive: true });
if (!fs.existsSync(OUTPUT_DIR)) fs.mkdirSync(OUTPUT_DIR, { recursive: true });

// Global Concurrency Governor: Maximum active browser workers across entire system (Telephony safety)
const MAX_GLOBAL_CONCURRENT_SCRAPERS = Math.max(1, parseInt(process.env.MAX_ACTIVE_SCRAPERS || '1', 10));

interface ActiveJobRuntime {
  jobId: string;
  tenantId: string;
  executionId: number;
  workerProcess: ChildProcess | null;
  abortController: AbortController;
  record: ScraperJobRecord;
  hasReceivedDone?: boolean;
  isShuttingDown?: boolean;
  shutdownPromise?: Promise<void>;
  exitCode?: number | null;
}

// In-memory runtime state (not serialized to disk)
const activeRuntimes = new Map<string, ActiveJobRuntime>();
const jobQueue: ScraperJobOptions[] = [];

// Optional socket.io broadcaster instance
let ioBroadcaster: any = null;

export function setScraperSocketBroadcaster(io: any) {
  ioBroadcaster = io;
}

function broadcastToTenant(tenantId: string, event: string, payload: any) {
  if (ioBroadcaster) {
    ioBroadcaster.to(`tenant_${tenantId}`).emit(event, payload);
  }
}

// ─── FILE PATH SECURITY HELPERS ──────────────────────────────────────────────

export function getTenantOutputDir(tenantId: string): string {
  const safeTenant = tenantId.replace(/[^a-zA-Z0-9_-]/g, '_');
  const dir = path.resolve(OUTPUT_DIR, safeTenant);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return dir;
}

export function getTenantJobsDir(tenantId: string): string {
  const safeTenant = tenantId.replace(/[^a-zA-Z0-9_-]/g, '_');
  const dir = path.resolve(JOBS_DIR, safeTenant);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return dir;
}

export function validateTenantFileAccess(tenantId: string, targetPath: string): string {
  const resolved = path.resolve(targetPath);
  const tenantDir = getTenantOutputDir(tenantId);
  const rel = path.relative(tenantDir, resolved);

  if (rel.startsWith('..') || path.isAbsolute(rel)) {
    throw new Error('Forbidden: Path traversal or unauthorized cross-tenant file access detected.');
  }

  if (!fs.existsSync(resolved)) {
    throw new Error('Requested scraper file not found.');
  }

  return resolved;
}

// ─── PERSISTENCE HELPERS ─────────────────────────────────────────────────────

function saveJobRecord(record: ScraperJobRecord): void {
  try {
    const dir = getTenantJobsDir(record.tenantId);
    const filePath = path.join(dir, `${record.jobId}.json`);
    fs.writeFileSync(filePath, JSON.stringify(record, null, 2), 'utf8');
  } catch (err: any) {
    console.error(`[ScraperService] Failed to save job record ${record.jobId}:`, err.message);
  }
}

export function loadJobRecord(tenantId: string, jobId: string): ScraperJobRecord | null {
  const safeJobId = path.basename(jobId);
  const dir = getTenantJobsDir(tenantId);
  const filePath = path.join(dir, `${safeJobId}.json`);
  if (!fs.existsSync(filePath)) return null;

  try {
    const raw = fs.readFileSync(filePath, 'utf8');
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function listTenantJobs(tenantId: string): ScraperJobRecord[] {
  const dir = getTenantJobsDir(tenantId);
  if (!fs.existsSync(dir)) return [];

  const files = fs.readdirSync(dir).filter(f => f.endsWith('.json'));
  const jobs: ScraperJobRecord[] = [];

  for (const file of files) {
    try {
      const raw = fs.readFileSync(path.join(dir, file), 'utf8');
      jobs.push(JSON.parse(raw));
    } catch (_) {}
  }

  return jobs.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
}

// ─── QUEUE & WORKER LIFECYCLE MANAGEMENT ─────────────────────────────────────

function drainQueue(): void {
  if (activeRuntimes.size >= MAX_GLOBAL_CONCURRENT_SCRAPERS) {
    return; // System is at maximum concurrency capacity
  }

  if (jobQueue.length === 0) {
    return;
  }

  const nextOptions = jobQueue.shift();
  if (!nextOptions) return;

  const existingRecord = listTenantJobs(nextOptions.tenantId).find(
    j => j.status === 'queued' && j.options.keyword === nextOptions.keyword
  );

  const jobId = existingRecord ? existingRecord.jobId : generateJobId(nextOptions.tenantId);
  launchWorkerJob(jobId, nextOptions);
}

function generateJobId(tenantId: string): string {
  const safeTenant = tenantId.replace(/[^a-zA-Z0-9]/g, '').slice(0, 12);
  const randomSuffix = crypto.randomBytes(3).toString('hex');
  return `job_${safeTenant}_${Date.now()}_${randomSuffix}`;
}

function launchWorkerJob(jobId: string, options: ScraperJobOptions): void {
  const tenantDir = getTenantOutputDir(options.tenantId);
  const safeKeyword = options.keyword.replace(/[^a-zA-Z0-9]/g, '_').toLowerCase();
  const safeLocation = (options.location || 'general').replace(/[^a-zA-Z0-9]/g, '_').toLowerCase();
  const outputFileName = `leads_${safeKeyword}_${safeLocation}_${jobId}.xlsx`;
  const checkpointFileName = `checkpoint_${jobId}.jsonl`;

  const outputPath = path.join(tenantDir, outputFileName);
  const checkpointPath = path.join(tenantDir, checkpointFileName);

  const executionId = Date.now();
  const abortController = new AbortController();

  const record: ScraperJobRecord = {
    jobId,
    tenantId: options.tenantId,
    requestedBy: options.username,
    options,
    status: 'running',
    createdAt: new Date().toISOString(),
    startedAt: new Date().toISOString(),
    counters: {
      discovered: 0,
      extracted: 0,
      enriched: 0,
      skippedPhone: 0,
      skippedEmail: 0,
      failed: 0
    },
    maxLimit: Math.max(1, Math.min(options.maxLeads || 50, 1000)),
    outputFile: outputFileName,
    checkpointFile: checkpointFileName,
    logs: [`🚀 Scraper job started for: "${options.keyword}" in "${options.location || 'Any'}"`],
    executionId
  };

  saveJobRecord(record);

  // Spawn isolated worker process
  const workerTs = path.resolve(__dirname, 'scraperWorker.ts');
  const workerJs = path.resolve(__dirname, 'scraperWorker.js');
  const isTsx = !fs.existsSync(workerJs);

  let worker: ChildProcess;
  if (isTsx) {
    // Development mode via tsx
    worker = fork(workerTs, [], {
      execArgv: ['--import', 'tsx'],
      env: { ...process.env, FORCE_COLOR: '0' }
    });
  } else {
    // Production compiled javascript
    worker = fork(workerJs, [], {
      env: { ...process.env, FORCE_COLOR: '0' }
    });
  }

  const runtime: ActiveJobRuntime = {
    jobId,
    tenantId: options.tenantId,
    executionId,
    workerProcess: worker,
    abortController,
    record,
    hasReceivedDone: false,
    isShuttingDown: false
  };

  activeRuntimes.set(jobId, runtime);

  broadcastToTenant(options.tenantId, 'scraper:started', {
    jobId,
    keyword: options.keyword,
    location: options.location,
    targetLimit: record.maxLimit
  });

  const startMsg: WorkerParentMessage = {
    type: 'START',
    jobId,
    executionId,
    options,
    checkpointPath,
    outputPath
  };

  worker.send(startMsg);

  worker.on('message', async (msg: WorkerChildMessage) => {
    // 1. Generation check: verify executionId matches current generation to prevent stale events
    if (msg.executionId !== runtime.executionId) return;

    // 2. Terminal state guard: once a job enters stopped, failed, or paused_challenge,
    // subsequent messages from the worker process cannot resurrect or overwrite terminal status!
    const currentStatus = runtime.record.status;
    if (currentStatus === 'stopped' || currentStatus === 'failed' || currentStatus === 'paused_challenge') {
      return;
    }

    if (msg.type === 'LOG') {
      runtime.record.logs.push(msg.message);
      if (runtime.record.logs.length > 300) runtime.record.logs.shift();
      saveJobRecord(runtime.record);
      broadcastToTenant(runtime.tenantId, 'scraper:log', { jobId, message: msg.message });
    } else if (msg.type === 'PROGRESS') {
      runtime.record.counters = msg.counters;
      saveJobRecord(runtime.record);
      broadcastToTenant(runtime.tenantId, 'scraper:progress', {
        jobId,
        lead: msg.lead,
        counters: msg.counters
      });
    } else if (msg.type === 'CHALLENGE') {
      runtime.record.status = 'paused_challenge';
      runtime.record.counters = msg.counters;
      runtime.record.errorMessage = msg.reason;
      saveJobRecord(runtime.record);
      broadcastToTenant(runtime.tenantId, 'scraper:challenge', {
        jobId,
        reason: msg.reason,
        counters: msg.counters
      });
      await shutdownWorker(jobId, 'challenge');
    } else if (msg.type === 'DONE') {
      // Require explicit valid DONE confirmation
      runtime.hasReceivedDone = true;
      runtime.record.status = msg.status;
      runtime.record.counters = msg.counters;
      runtime.record.completedAt = new Date().toISOString();
      saveJobRecord(runtime.record);
      broadcastToTenant(runtime.tenantId, 'scraper:completed', {
        jobId,
        status: msg.status,
        counters: msg.counters,
        outputFile: runtime.record.outputFile
      });
      await shutdownWorker(jobId, 'done');
    } else if (msg.type === 'ERROR') {
      runtime.record.status = 'failed';
      runtime.record.errorMessage = msg.error;
      runtime.record.completedAt = new Date().toISOString();
      saveJobRecord(runtime.record);
      broadcastToTenant(runtime.tenantId, 'scraper:failed', {
        jobId,
        error: msg.error
      });
      await shutdownWorker(jobId, 'error');
    }
  });

  worker.on('error', async (err) => {
    console.error(`[ScraperWorker Process Error for ${jobId}]:`, err.message);
    if (runtime.record.status === 'running') {
      runtime.record.status = 'failed';
      runtime.record.errorMessage = `Worker process error: ${err.message}`;
      runtime.record.completedAt = new Date().toISOString();
      saveJobRecord(runtime.record);
      broadcastToTenant(runtime.tenantId, 'scraper:failed', { jobId, error: err.message });
    }
    await shutdownWorker(jobId, 'process_error');
  });

  worker.on('exit', async (code, signal) => {
    if (activeRuntimes.has(jobId)) {
      const active = activeRuntimes.get(jobId);
      if (active) {
        active.exitCode = code;
        // P1 Requirement 3: Exit code is NOT a completion acknowledgement.
        // Exit without DONE must be marked interrupted/failed/partial, never automatically successful.
        if (!active.hasReceivedDone && active.record.status === 'running') {
          if (active.record.counters.extracted > 0) {
            active.record.status = 'completed_partial';
            active.record.errorMessage = `Worker process exited (code: ${code}, signal: ${signal}) without explicit DONE acknowledgment; preserved ${active.record.counters.extracted} checkpointed leads.`;
          } else {
            active.record.status = 'failed';
            active.record.errorMessage = `Worker process terminated unexpectedly (code: ${code}, signal: ${signal}) without completion acknowledgment`;
          }
          active.record.completedAt = new Date().toISOString();
          saveJobRecord(active.record);
        }
      }
      await shutdownWorker(jobId, 'exit');
    }
  });
}

/**
 * Awaited, idempotent shutdown:
 * 1. Request graceful cancellation via IPC / AbortController
 * 2. Observe worker exit
 * 3. Bounded escalation (SIGTERM, then process tree termination)
 * 4. Only release execution slot and trigger drainQueue after worker has fully terminated.
 */
export async function shutdownWorker(jobId: string, reason: string = 'shutdown'): Promise<void> {
  const runtime = activeRuntimes.get(jobId);
  if (!runtime) return;

  if (runtime.isShuttingDown && runtime.shutdownPromise) {
    return runtime.shutdownPromise;
  }

  runtime.isShuttingDown = true;

  runtime.shutdownPromise = (async () => {
    const worker = runtime.workerProcess;
    if (!worker || worker.killed || worker.exitCode !== null) {
      activeRuntimes.delete(jobId);
      drainQueue();
      return;
    }

    const workerPid = worker.pid;

    // Phase 1: Graceful cancellation request via IPC
    try {
      if (worker.connected) {
        worker.send({ type: 'STOP', jobId, executionId: runtime.executionId });
      }
    } catch (_) {}

    try {
      runtime.abortController.abort();
    } catch (_) {}

    // Helper to await process exit with timeout
    const waitForExit = (timeoutMs: number): Promise<boolean> => {
      if (!runtime.workerProcess || runtime.workerProcess.exitCode !== null || runtime.workerProcess.killed) {
        return Promise.resolve(true);
      }
      return new Promise<boolean>(resolve => {
        let timer: NodeJS.Timeout | null = null;
        const onExit = () => {
          if (timer) clearTimeout(timer);
          resolve(true);
        };
        timer = setTimeout(() => {
          if (runtime.workerProcess) {
            runtime.workerProcess.removeListener('exit', onExit);
          }
          resolve(false);
        }, timeoutMs);

        if (runtime.workerProcess) {
          runtime.workerProcess.once('exit', onExit);
        } else {
          if (timer) clearTimeout(timer);
          resolve(true);
        }
      });
    };

    // Wait up to 2500 ms for graceful exit
    let exited = await waitForExit(2500);

    // Phase 2: Escalation to SIGTERM
    if (!exited && worker && !worker.killed && worker.exitCode === null) {
      try {
        worker.kill('SIGTERM');
      } catch (_) {}
      exited = await waitForExit(1500);
    }

    // Phase 3: Hard termination via process tree kill
    if (!exited && workerPid) {
      try {
        if (process.platform === 'win32') {
          const { exec } = require('child_process');
          exec(`taskkill /pid ${workerPid} /T /F`, () => {});
        } else {
          worker.kill('SIGKILL');
        }
      } catch (_) {}
      await waitForExit(1000);
    }

    runtime.workerProcess = null;
    activeRuntimes.delete(jobId);

    // Only release capacity and drain queue after actual shutdown completes
    drainQueue();
  })();

  return runtime.shutdownPromise;
}

export function getActiveScraperCount(): number {
  return activeRuntimes.size;
}

export function registerRuntimeForTesting(runtime: any): void {
  activeRuntimes.set(runtime.jobId, runtime);
}

export function getActiveJobRuntime(jobId: string): ActiveJobRuntime | undefined {
  return activeRuntimes.get(jobId);
}

// ─── PUBLIC API METHODS ──────────────────────────────────────────────────────

export async function submitScraperJob(options: ScraperJobOptions): Promise<{
  success: boolean;
  jobId: string;
  status: ScraperJobStatus;
  message: string;
}> {
  const { tenantId, keyword } = options;
  if (!keyword || !keyword.trim()) {
    throw new Error('Search keyword is required.');
  }

  // Check if tenant already has an active or queued job
  const existingActive = Array.from(activeRuntimes.values()).find(r => r.tenantId === tenantId);
  if (existingActive) {
    return {
      success: false,
      jobId: existingActive.jobId,
      status: existingActive.record.status,
      message: 'Your organization already has an active scraper job in progress.'
    };
  }

  const jobId = generateJobId(tenantId);
  const isSlotAvailable = activeRuntimes.size < MAX_GLOBAL_CONCURRENT_SCRAPERS;

  if (isSlotAvailable) {
    launchWorkerJob(jobId, options);
    return {
      success: true,
      jobId,
      status: 'running',
      message: 'Scraper engine launched successfully.'
    };
  } else {
    // Queue job
    const queuedRecord: ScraperJobRecord = {
      jobId,
      tenantId,
      requestedBy: options.username,
      options,
      status: 'queued',
      createdAt: new Date().toISOString(),
      counters: { discovered: 0, extracted: 0, enriched: 0, skippedPhone: 0, skippedEmail: 0, failed: 0 },
      maxLimit: Math.max(1, Math.min(options.maxLeads || 50, 1000)),
      logs: ['Job placed in global concurrency queue. Waiting for available worker slot...'],
      executionId: 0
    };
    saveJobRecord(queuedRecord);
    jobQueue.push(options);

    return {
      success: true,
      jobId,
      status: 'queued',
      message: 'Global scraper worker limit reached. Job queued safely.'
    };
  }
}

export function getTenantScraperStatus(tenantId: string, jobId?: string): ScraperJobRecord | null {
  if (jobId) {
    const record = loadJobRecord(tenantId, jobId);
    if (record) return record;
  }

  // If no jobId specified, return current active runtime or most recent job
  for (const runtime of activeRuntimes.values()) {
    if (runtime.tenantId === tenantId) {
      return runtime.record;
    }
  }

  const jobs = listTenantJobs(tenantId);
  return jobs.length > 0 ? jobs[0] : null;
}

export async function stopTenantScraperJob(tenantId: string, jobId?: string): Promise<boolean> {
  let targetRuntime: ActiveJobRuntime | undefined;

  if (jobId) {
    targetRuntime = activeRuntimes.get(jobId);
    if (targetRuntime && targetRuntime.tenantId !== tenantId) {
      throw new Error('Unauthorized: You cannot stop another tenant’s job.');
    }
  } else {
    targetRuntime = Array.from(activeRuntimes.values()).find(r => r.tenantId === tenantId);
  }

  // Case 1: Job is actively running
  if (targetRuntime) {
    const id = targetRuntime.jobId;
    targetRuntime.record.status = 'stopped';
    targetRuntime.record.completedAt = new Date().toISOString();
    targetRuntime.record.logs.push('🛑 Job stopped by user request.');
    saveJobRecord(targetRuntime.record);

    broadcastToTenant(tenantId, 'scraper:stopped', { jobId: id });

    // Await actual worker process termination and release of execution slot
    await shutdownWorker(id, 'user_stopped');
    return true;
  }

  // Case 2: Job is in the pending queue
  if (jobId) {
    const queuedIdx = jobQueue.findIndex(opt => opt.tenantId === tenantId);
    if (queuedIdx !== -1) {
      jobQueue.splice(queuedIdx, 1);
      const record = loadJobRecord(tenantId, jobId);
      if (record && record.status === 'queued') {
        record.status = 'stopped';
        record.completedAt = new Date().toISOString();
        record.logs.push('🛑 Queued job cancelled before execution.');
        saveJobRecord(record);
      }
      broadcastToTenant(tenantId, 'scraper:stopped', { jobId });
      return true;
    }
  }

  return false;
}

export function listTenantScraperFiles(tenantId: string): Array<{
  name: string;
  path: string;
  sizeBytes: number;
  lastModified: string;
  countEstimate: number;
}> {
  const dir = getTenantOutputDir(tenantId);
  if (!fs.existsSync(dir)) return [];

  const files = fs.readdirSync(dir).filter(f => f.endsWith('.xlsx') || f.endsWith('.csv'));
  return files.map(name => {
    const fullPath = path.join(dir, name);
    const stats = fs.statSync(fullPath);
    return {
      name,
      path: fullPath,
      sizeBytes: stats.size,
      lastModified: stats.mtime.toISOString(),
      countEstimate: Math.max(1, Math.round(stats.size / 450))
    };
  }).sort((a, b) => new Date(b.lastModified).getTime() - new Date(a.lastModified).getTime());
}

/**
 * Imports leads from a completed scraper Excel file into a Campaign.
 * Enforces:
 * 1. Strict tenant scoping.
 * 2. Skipping nondialable records (less than 7 digits), NO 0000000000 substitution.
 * 3. Sanitizing inputs.
 */
export async function importScraperFileToCampaign(
  filePath: string,
  campaignName: string,
  tenantId: string,
  assignedUserId: string = 'admin'
): Promise<{
  success: boolean;
  campaignId: string;
  importedCount: number;
  skippedCount: number;
  dedupedCount: number;
}> {
  const safeFilePath = validateTenantFileAccess(tenantId, filePath);

  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(safeFilePath);
  const worksheet = workbook.worksheets[0];
  if (!worksheet) {
    throw new Error('Workbook contains no valid sheets.');
  }

  const fileName = path.basename(safeFilePath);
  const finalCampaignName = campaignName.trim() || `Scraped Campaign ${new Date().toLocaleDateString()}`;
  const validLeads: { name: string; phone: string }[] = [];
  let skippedCount = 0;

  worksheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return; // skip header row

    const rowValues: any = row.values;
    const name = String(rowValues[1] || rowValues['businessName'] || 'Scraped Business').trim();
    const rawPhone = String(rowValues[2] || rowValues['phone'] || '').trim();

    // Digits validation: require at least 7 dialable digits
    const digitsOnly = rawPhone.replace(/\D/g, '');
    if (digitsOnly.length < 7) {
      skippedCount++;
      return;
    }

    const cleanPhone = rawPhone.replace(/[^0-9+]/g, '').trim();
    validLeads.push({
      name: name || 'Scraped Business',
      phone: cleanPhone
    });
  });

  if (validLeads.length === 0) {
    throw new Error(`No dialable business leads found in file (Skipped ${skippedCount} nondialable records).`);
  }

  const result = await createCampaign(finalCampaignName, fileName, validLeads, tenantId);

  return {
    success: true,
    campaignId: result.campaign.id,
    importedCount: result.finalCount,
    skippedCount,
    dedupedCount: result.dedupedCount
  };
}

/**
 * Server startup reconciliation:
 * Scans all tenant job files. Any job left in 'running' or 'queued' or 'stopping'
 * is honestly updated to 'failed' (or 'completed_partial') with a clear explanation.
 */
export function reconcileInterruptedJobs(): void {
  if (!fs.existsSync(JOBS_DIR)) return;

  try {
    const tenantFolders = fs.readdirSync(JOBS_DIR);
    for (const folder of tenantFolders) {
      const folderPath = path.join(JOBS_DIR, folder);
      if (!fs.statSync(folderPath).isDirectory()) continue;

      const jobFiles = fs.readdirSync(folderPath).filter(f => f.endsWith('.json'));
      for (const jf of jobFiles) {
        const fullPath = path.join(folderPath, jf);
        try {
          const raw = fs.readFileSync(fullPath, 'utf8');
          const job: ScraperJobRecord = JSON.parse(raw);
          if (job.status === 'running' || job.status === 'queued' || job.status === 'stopping') {
            job.status = job.counters && job.counters.extracted > 0 ? 'completed_partial' : 'failed';
            job.errorMessage = 'Server restarted while job was in flight.';
            job.completedAt = new Date().toISOString();
            job.logs.push('⚠️ Job reconciled as interrupted due to server restart.');
            fs.writeFileSync(fullPath, JSON.stringify(job, null, 2), 'utf8');
            console.log(`[ScraperService] Reconciled interrupted job ${job.jobId} -> ${job.status}`);
          }
        } catch (_) {}
      }
    }
  } catch (err: any) {
    console.error('[ScraperService] Error during startup job reconciliation:', err.message);
  }
}

// Automatically run reconciliation on module load
reconcileInterruptedJobs();
