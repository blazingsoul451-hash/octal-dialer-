import { fork, ChildProcess, execFile, execSync } from 'child_process';
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

export function isPidAlive(pid?: number | null): boolean {
  if (!pid || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (err: any) {
    return err.code === 'EPERM'; // process exists but caller lacks permission to signal
  }
}

export function getDescendantPids(parentPid?: number | null): number[] {
  if (!parentPid || parentPid <= 0) return [];
  try {
    if (process.platform === 'win32') {
      const out = execSync(
        `powershell -NoProfile -NonInteractive -Command "Get-CimInstance Win32_Process -Filter 'ParentProcessId = ${parentPid}' | Select-Object -ExpandProperty ProcessId"`,
        { encoding: 'utf8', timeout: 3000 }
      );
      const pids = out.split(/\r?\n/).map(s => parseInt(s.trim(), 10)).filter(n => !isNaN(n) && n > 0);
      const all = [...pids];
      for (const p of pids) {
        all.push(...getDescendantPids(p));
      }
      return all;
    } else {
      const out = execSync(`pgrep -P ${parentPid}`, { encoding: 'utf8', timeout: 3000 });
      const pids = out.split(/\r?\n/).map(s => parseInt(s.trim(), 10)).filter(n => !isNaN(n) && n > 0);
      const all = [...pids];
      for (const p of pids) {
        all.push(...getDescendantPids(p));
      }
      return all;
    }
  } catch (_) {
    return [];
  }
}

export async function killProcessTree(pid: number, extraPids?: Set<number> | number[]): Promise<boolean> {
  const targetPids = new Set<number>();
  if (pid > 0) targetPids.add(pid);
  if (extraPids) {
    for (const p of extraPids) {
      if (p > 0) targetPids.add(p);
    }
  }

  // Discover OS descendants of all target PIDs
  for (const p of Array.from(targetPids)) {
    const children = getDescendantPids(p);
    for (const c of children) targetPids.add(c);
  }

  for (const p of targetPids) {
    if (!isPidAlive(p)) continue;
    try {
      if (process.platform === 'win32') {
        await new Promise<void>((resolve) => {
          execFile('taskkill', ['/pid', String(p), '/T', '/F'], () => resolve());
        });
      } else {
        try {
          process.kill(-p, 'SIGKILL');
        } catch (_) {
          try {
            process.kill(p, 'SIGKILL');
          } catch (_) {}
        }
      }
    } catch (_) {}
  }

  for (const p of targetPids) {
    if (isPidAlive(p)) return false;
  }
  return true;
}

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
  isExited?: boolean;
  quarantined?: boolean;
  ownedPids?: Set<number>;
  messageQueue?: Promise<void>;
}

// In-memory runtime state (not serialized to disk)
const activeRuntimes = new Map<string, ActiveJobRuntime>();
const jobQueue: { jobId: string; options: ScraperJobOptions }[] = [];

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
  if (!tenantId || !/^[a-zA-Z0-9_-]+$/.test(tenantId)) throw new Error('Unauthorized: Invalid tenant identity.');
  const safeTenant = tenantId;
  const dir = path.resolve(OUTPUT_DIR, safeTenant);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return dir;
}

export function getTenantJobsDir(tenantId: string): string {
  if (!tenantId || !/^[a-zA-Z0-9_-]+$/.test(tenantId)) throw new Error('Unauthorized: Invalid tenant identity.');
  const safeTenant = tenantId;
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

  const realDir = fs.realpathSync(tenantDir);
  const realFile = fs.realpathSync(resolved);
  const realRel = path.relative(realDir, realFile);
  if (realRel.startsWith('..') || path.isAbsolute(realRel) || !fs.statSync(realFile).isFile()) {
    throw new Error('Forbidden: Invalid scraper file.');
  }
  if (!/\.(xlsx|csv)$/i.test(realFile)) throw new Error('Forbidden: Unsupported export format.');
  return realFile;
}

// ─── PERSISTENCE HELPERS ─────────────────────────────────────────────────────

function saveJobRecord(record: ScraperJobRecord): void {
  try {
    const dir = getTenantJobsDir(record.tenantId);
    const filePath = path.join(dir, `${record.jobId}.json`);
    const tmp = `${filePath}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(record, null, 2), 'utf8');
    fs.renameSync(tmp, filePath);
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

  const next = jobQueue.shift();
  if (!next) return;
  launchWorkerJob(next.jobId, next.options);
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
      qualified: 0,
      skippedPhone: 0,
      skippedEmail: 0,
      failed: 0
    },
    maxLimit: Math.max(1, Math.min(options.maxLeads || 50, 1000)),
    outputFile: outputPath,
    checkpointFile: checkpointFileName,
    checkpointPath,
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

  const ownedPids = new Set<number>();
  if (worker.pid) ownedPids.add(worker.pid);

  const runtime: ActiveJobRuntime = {
    jobId,
    tenantId: options.tenantId,
    executionId,
    workerProcess: worker,
    abortController,
    record,
    hasReceivedDone: false,
    isShuttingDown: false,
    ownedPids
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

  attachWorkerEventHandlers(runtime);
  worker.send(startMsg);
}

export function attachWorkerEventHandlers(runtime: ActiveJobRuntime): void {
  const { jobId, workerProcess: worker } = runtime;
  if (!worker) return;

  const handleMessage = async (msg: WorkerChildMessage) => {
    if (!msg || typeof msg !== 'object') return;

    // 1. Generation & identity check: verify executionId & jobId match current generation to prevent stale events
    if (msg.executionId !== runtime.executionId || msg.jobId !== jobId) {
      console.warn(`[ScraperService] Rejecting message with mismatched jobId/executionId: expected ${jobId}:${runtime.executionId}, got ${msg.jobId}:${msg.executionId}`);
      return;
    }

    // 2. Terminal state guard: once a job enters a terminal status, no subsequent message can overwrite it
    const currentStatus = runtime.record.status;
    const TERMINAL_STATUSES: ScraperJobStatus[] = ['completed', 'completed_partial', 'stopped', 'failed', 'paused_challenge'];
    if (TERMINAL_STATUSES.includes(currentStatus)) {
      return;
    }

    // 3. Counter validation: if counters object is supplied, ensure non-negative numbers
    if ('counters' in msg && msg.counters) {
      const { extracted, discovered, failed } = msg.counters;
      if ([extracted, discovered, failed, msg.counters.qualified ?? 0].some(value => !Number.isSafeInteger(value) || value < 0)) {
        console.warn(`[ScraperService] Rejecting message with invalid counters from worker:`, msg.counters);
        return;
      }
    }

    if (msg.type === 'LOG') {
      runtime.record.logs.push(msg.message);
      if (runtime.record.logs.length > 300) runtime.record.logs.shift();
      saveJobRecord(runtime.record);
      broadcastToTenant(runtime.tenantId, 'scraper:log', { jobId, message: msg.message });
    } else if (msg.type === 'PROGRESS') {
      if (!msg.counters) return;
      runtime.record.counters = msg.counters;
      saveJobRecord(runtime.record);
      broadcastToTenant(runtime.tenantId, 'scraper:progress', {
        jobId,
        lead: msg.lead,
        counters: msg.counters
      });
    } else if (msg.type === 'CHALLENGE') {
      runtime.record.status = 'paused_challenge';
      if (msg.counters) runtime.record.counters = msg.counters;
      runtime.record.errorMessage = msg.reason;
      saveJobRecord(runtime.record);
      broadcastToTenant(runtime.tenantId, 'scraper:challenge', {
        jobId,
        reason: msg.reason,
        counters: msg.counters
      });
      await shutdownWorker(jobId, 'challenge');
    } else if (msg.type === 'DONE') {
      // Validate execution provenance
      if (msg.executionId !== runtime.executionId) {
        console.warn(`[ScraperService] Ignoring DONE with mismatched executionId (got ${msg.executionId}, active ${runtime.executionId})`);
        return;
      }

      // Validate allowed terminal status
      const allowedStatuses: ScraperJobStatus[] = ['completed', 'completed_partial', 'stopped'];
      if (!allowedStatuses.includes(msg.status)) {
        runtime.record.status = 'failed';
        runtime.record.errorMessage = `Worker reported invalid completion status: ${msg.status}`;
        runtime.record.completedAt = new Date().toISOString();
        saveJobRecord(runtime.record);
        await shutdownWorker(jobId, 'invalid_status');
        return;
      }

      const qualifiedCount = msg.counters?.qualified !== undefined
        ? msg.counters.qualified
        : (msg.counters?.extracted ?? 0);

      // Reject zero-result completed unless reachedEnd is explicitly confirmed
      if (msg.status === 'completed' && qualifiedCount === 0 && !msg.reachedEnd) {
        runtime.record.status = 'failed';
        runtime.record.errorMessage = 'Worker reported completed with 0 qualified results without explicit end-of-results evidence.';
        runtime.record.completedAt = new Date().toISOString();
        saveJobRecord(runtime.record);
        broadcastToTenant(runtime.tenantId, 'scraper:failed', {
          jobId,
          error: runtime.record.errorMessage
        });
        await shutdownWorker(jobId, 'fabricated_zero_result');
        return;
      }

      // Validate checkpoint JSONL on disk
      let validCheckpointRecords = 0;
      if (runtime.record.checkpointPath && fs.existsSync(runtime.record.checkpointPath)) {
        try {
          const content = fs.readFileSync(runtime.record.checkpointPath, 'utf8');
          const lines = content.split('\n').filter(l => l.trim().length > 0);
          for (const line of lines) {
            try {
              const lead = JSON.parse(line);
              if (lead && typeof lead.listingId === 'string' && lead.listingId && typeof lead.businessName === 'string' && lead.businessName) validCheckpointRecords++;
            } catch (_) {}
          }
        } catch (_) {}
      }

      // Open the ZIP/workbook rather than accepting a four-byte PK prefix.
      let isValidXlsx = false;
      if (runtime.record.outputFile && fs.existsSync(runtime.record.outputFile)) {
        try {
          const workbook = new ExcelJS.Workbook();
          await workbook.xlsx.readFile(runtime.record.outputFile);
          const sheet = workbook.worksheets[0];
          isValidXlsx = !!sheet && sheet.getRow(1).getCell(1).text === 'Listing ID' &&
            sheet.actualRowCount - 1 === qualifiedCount;
        } catch (_) {}
      }
      // Cancellation may have arrived during asynchronous artifact validation.
      if (runtime.record.status !== 'running') return;

      // Artifact and record integrity validation
      if (qualifiedCount > 0) {
        if (!isValidXlsx) {
          if (validCheckpointRecords > 0) {
            // Output XLSX failed or is corrupt, but recoverable checkpoint exists
            runtime.record.status = 'completed_partial';
            runtime.record.errorMessage = `XLSX export file invalid or missing; recovered ${validCheckpointRecords} valid checkpoint records.`;
          } else {
            runtime.record.status = 'failed';
            runtime.record.errorMessage = `Worker reported ${qualifiedCount} extracted leads, but neither output artifact nor checkpoint file exists with valid data on disk.`;
            runtime.record.completedAt = new Date().toISOString();
            saveJobRecord(runtime.record);
            broadcastToTenant(runtime.tenantId, 'scraper:failed', {
              jobId,
              error: runtime.record.errorMessage
            });
            await shutdownWorker(jobId, 'invalid_artifact');
            return;
          }
        } else if (validCheckpointRecords !== qualifiedCount) {
          // Committed count mismatch
          runtime.record.status = 'completed_partial';
          runtime.record.errorMessage = `Committed record count mismatch (expected ${qualifiedCount}, found ${validCheckpointRecords} in checkpoint).`;
        } else {
          runtime.record.status = msg.status;
        }
      } else {
        runtime.record.status = msg.status;
      }

      runtime.hasReceivedDone = true;
      if (msg.counters) runtime.record.counters = msg.counters;
      runtime.record.completedAt = new Date().toISOString();
      saveJobRecord(runtime.record);
      broadcastToTenant(runtime.tenantId, 'scraper:completed', {
        jobId,
        status: runtime.record.status,
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
  };
  worker.on('message', (msg: WorkerChildMessage) => {
    runtime.messageQueue = (runtime.messageQueue || Promise.resolve()).then(() => handleMessage(msg)).catch(async err => {
      if (!['stopped', 'failed', 'completed', 'completed_partial', 'paused_challenge'].includes(runtime.record.status)) {
        runtime.record.status = 'failed';
        runtime.record.errorMessage = `Worker message failed: ${err.message}`;
        saveJobRecord(runtime.record);
        await shutdownWorker(jobId, 'message_error');
      }
    });
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
        active.isExited = true;
        await active.messageQueue;
        // P1 Requirement 3: Exit code is NOT a completion acknowledgement.
        // Exit without DONE must be marked failed or partial, NEVER completed.
        if (!active.hasReceivedDone && active.record.status === 'running') {
          // Verify actual durable flushed leads in checkpoint file
          let flushedCount = 0;
          if (active.record.checkpointPath && fs.existsSync(active.record.checkpointPath)) {
            try {
              const stat = fs.statSync(active.record.checkpointPath);
              if (stat.size > 0) {
                const lines = fs.readFileSync(active.record.checkpointPath, 'utf8').split('\n').filter(l => l.trim().length > 0);
                for (const l of lines) {
                  try {
                    JSON.parse(l);
                    flushedCount++;
                  } catch (_) {}
                }
              }
            } catch (_) {}
          }

          if (flushedCount > 0) {
            active.record.status = 'completed_partial';
            active.record.counters.extracted = flushedCount;
            active.record.errorMessage = `Worker process exited (code: ${code}, signal: ${signal}) without explicit DONE acknowledgment; recovered ${flushedCount} flushed checkpoint leads.`;
          } else {
            active.record.status = 'failed';
            active.record.errorMessage = `Worker process terminated unexpectedly (code: ${code}, signal: ${signal}) without completion acknowledgment and no flushed checkpoint found.`;
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
 * 2. Observe worker exit and confirm all owned descendants are terminated
 * 3. Bounded escalation (SIGTERM, then process tree termination)
 * 4. Only release execution slot and trigger drainQueue after worker and all descendants have fully terminated.
 *    If any process cannot be confirmed dead, quarantine the slot and retain capacity.
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
    const workerPid = worker?.pid;

    if (!runtime.ownedPids) runtime.ownedPids = new Set<number>();
    if (workerPid) {
      runtime.ownedPids.add(workerPid);
      for (const p of getDescendantPids(workerPid)) {
        runtime.ownedPids.add(p);
      }
    }

    const isTreeDead = (): boolean => {
      if (workerPid && isPidAlive(workerPid)) return false;
      if (runtime.ownedPids) {
        for (const p of runtime.ownedPids) {
          if (isPidAlive(p)) return false;
        }
      }
      return true;
    };

    // If already confirmed dead across entire process tree
    if (!worker || (runtime.isExited && isTreeDead())) {
      activeRuntimes.delete(jobId);
      drainQueue();
      return;
    }

    // Phase 1: Graceful cancellation request via IPC
    try {
      if (worker.connected) {
        worker.send({ type: 'STOP', jobId, executionId: runtime.executionId });
      }
    } catch (_) {}

    try {
      runtime.abortController.abort();
    } catch (_) {}

    // Helper to await process exit with timeout and actual PID liveness check
    const waitForExit = (timeoutMs: number): Promise<boolean> => {
      if (runtime.isExited && isTreeDead()) {
        return Promise.resolve(true);
      }
      return new Promise<boolean>(resolve => {
        let timer: NodeJS.Timeout | null = null;
        const checkDead = () => {
          if (timer) clearTimeout(timer);
          resolve(isTreeDead());
        };

        timer = setTimeout(() => {
          if (runtime.workerProcess) {
            runtime.workerProcess.removeListener('exit', onExit);
          }
          resolve(isTreeDead());
        }, timeoutMs);

        const onExit = () => {
          runtime.isExited = true;
          checkDead();
        };

        if (runtime.workerProcess && !runtime.isExited) {
          runtime.workerProcess.once('exit', onExit);
        } else {
          checkDead();
        }
      });
    };

    const isTestEnv = process.env.NODE_ENV === 'test';
    const tGraceful = isTestEnv ? 600 : 2500;
    const tSigterm = isTestEnv ? 300 : 1500;
    const tSigkill = isTestEnv ? 200 : 1000;

    // Wait up to 2500 ms for graceful exit
    let exited = await waitForExit(tGraceful);

    // Phase 2: Escalation to SIGTERM (never treat worker.killed as dead)
    if (!exited && workerPid && isPidAlive(workerPid)) {
      try {
        worker.kill('SIGTERM');
      } catch (_) {}
      exited = await waitForExit(tSigterm);
    }

    // Phase 3: Hard termination via process tree kill
    if (!isTreeDead()) {
      await killProcessTree(workerPid || 0, runtime.ownedPids);
      exited = await waitForExit(tSigkill);
    }

    // Verify if worker OR any owned descendant is still alive
    if (!isTreeDead()) {
      // Process could not be confirmed terminated!
      // Quarantine execution slot so capacity is NOT released to drainQueue.
      runtime.quarantined = true;
      runtime.shutdownPromise = undefined; // allow subsequent reconciliation retry
      runtime.record.errorMessage = `Worker PID ${workerPid} or descendant process failed to exit; slot quarantined to protect system resources.`;
      saveJobRecord(runtime.record);
      console.error(`[ScraperService] CRITICAL: Worker process tree for job ${jobId} failed to terminate. Slot quarantined.`);
      return; // DO NOT delete from activeRuntimes, DO NOT call drainQueue!
    }

    runtime.workerProcess = null;
    activeRuntimes.delete(jobId);

    // Only release capacity and drain queue after actual shutdown completes
    drainQueue();
  })();

  return runtime.shutdownPromise;
}

export async function reconcileQuarantinedSlots(): Promise<{ recoveredCount: number; stillQuarantinedCount: number }> {
  let recoveredCount = 0;
  let stillQuarantinedCount = 0;

  for (const [jobId, runtime] of Array.from(activeRuntimes.entries())) {
    if (!runtime.quarantined) continue;

    const workerPid = runtime.workerProcess?.pid;
    const pidsToCheck = new Set<number>(runtime.ownedPids || []);
    if (workerPid) pidsToCheck.add(workerPid);

    // Attempt termination on remaining living PIDs
    await killProcessTree(workerPid || 0, pidsToCheck);

    let allDead = true;
    for (const p of pidsToCheck) {
      if (isPidAlive(p)) {
        allDead = false;
        break;
      }
    }

    if (allDead) {
      console.log(`[ScraperService] Quarantined slot for job ${jobId} successfully reconciled: all descendant processes terminated.`);
      runtime.quarantined = false;
      runtime.workerProcess = null;
      activeRuntimes.delete(jobId);
      recoveredCount++;
      drainQueue();
    } else {
      stillQuarantinedCount++;
    }
  }

  return { recoveredCount, stillQuarantinedCount };
}

export function getActiveScraperCount(): number {
  return activeRuntimes.size;
}

export function registerRuntimeForTesting(runtime: any): void {
  if (!runtime.ownedPids) {
    runtime.ownedPids = new Set<number>();
    if (runtime.workerProcess?.pid) runtime.ownedPids.add(runtime.workerProcess.pid);
  }
  activeRuntimes.set(runtime.jobId, runtime);
  if (runtime.workerProcess) {
    attachWorkerEventHandlers(runtime);
  }
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
  getTenantJobsDir(tenantId);
  if (jobQueue.length >= 100 || jobQueue.filter(job => job.options.tenantId === tenantId).length >= 5) {
    throw new Error('Scraper queue is full. Try again later.');
  }
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
      counters: { discovered: 0, extracted: 0, enriched: 0, qualified: 0, skippedPhone: 0, skippedEmail: 0, failed: 0 },
      maxLimit: Math.max(1, Math.min(options.maxLeads || 50, 1000)),
      logs: ['Job placed in global concurrency queue. Waiting for available worker slot...'],
      executionId: 0
    };
    saveJobRecord(queuedRecord);
    jobQueue.push({ jobId, options });

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
    return loadJobRecord(tenantId, jobId);
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
    const queuedIdx = jobQueue.findIndex(job => job.jobId === jobId && job.options.tenantId === tenantId);
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
  size: number;
  lastModified: string;
  mtime: Date;
  countEstimate: number;
}> {
  const dir = getTenantOutputDir(tenantId);
  if (!fs.existsSync(dir)) return [];

  const files = fs.readdirSync(dir).filter(f => {
    if (!/\.(xlsx|csv)$/i.test(f)) return false;
    try { validateTenantFileAccess(tenantId, path.join(dir, f)); return true; } catch { return false; }
  });
  return files.map(name => {
    const fullPath = path.join(dir, name);
    const stats = fs.statSync(fullPath);
    return {
      name,
      path: fullPath,
      sizeBytes: stats.size,
      size: stats.size,
      lastModified: stats.mtime.toISOString(),
      mtime: stats.mtime,
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
  name: string;
}> {
  const safeFilePath = validateTenantFileAccess(tenantId, filePath);

  const workbook = new ExcelJS.Workbook();
  if (path.extname(safeFilePath).toLowerCase() === '.csv') await workbook.csv.readFile(safeFilePath);
  else await workbook.xlsx.readFile(safeFilePath);
  const worksheet = workbook.worksheets[0];
  if (!worksheet) {
    throw new Error('Workbook contains no valid sheets.');
  }

  const fileName = path.basename(safeFilePath);
  const finalCampaignName = campaignName.trim() || `Scraped: ${path.basename(safeFilePath, path.extname(safeFilePath))}`;
  const validLeads: { name: string; phone: string; address?: string; listingId?: string }[] = [];
  let skippedCount = 0;

  const headerMap: Record<string, number> = {};
  const headerRow = worksheet.getRow(1);
  headerRow.eachCell((cell, colNumber) => {
    const header = String(cell.value || '').trim().toLowerCase();
    headerMap[header] = colNumber;
  });

  const findColumn = (names: string[]) => names.map(name => headerMap[name]).find(Boolean);
  const nameCol = findColumn(['business name', 'name', 'businessname']);
  const phoneCol = findColumn(['phone number', 'phone', 'telephone']);
  const addressCol = findColumn(['address']);
  const listingCol = findColumn(['listing id', 'listingid']);
  if (!nameCol || !phoneCol) throw new Error('Export must contain business name and phone headers.');
  const cellText = (row: ExcelJS.Row, column?: number) => column ? row.getCell(column).text.trim() : '';

  worksheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return;
    const name = cellText(row, nameCol) || 'Scraped Business';
    const rawPhone = cellText(row, phoneCol);
    const address = cellText(row, addressCol);
    const listingId = cellText(row, listingCol);

    // Digits validation: require at least 7 dialable digits
    const digitsOnly = rawPhone.replace(/\D/g, '');
    if (digitsOnly.length < 7) {
      skippedCount++;
      return;
    }

    const cleanPhone = rawPhone.replace(/[^0-9+]/g, '').trim();
    validLeads.push({
      name: name || 'Scraped Business',
      phone: cleanPhone,
      address,
      listingId
    });
  });

  if (validLeads.length === 0) {
    throw new Error(`No dialable business leads found in file (Skipped ${skippedCount} nondialable records).`);
  }

  const result = await createCampaign(finalCampaignName, fileName, validLeads, tenantId, {
    allowSharedPhoneBranches: true,
    idempotencyKey: safeFilePath
  });

  return {
    success: true,
    campaignId: result.campaign.id,
    importedCount: result.finalCount,
    name: result.campaign.name,
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

// Legacy compatibility exports
export const runGoogleMapsScraper = submitScraperJob;
export const getScraperStatus = getTenantScraperStatus;
export const stopScraperJob = stopTenantScraperJob;
export const listScraperOutputFiles = listTenantScraperFiles;
