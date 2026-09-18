/**
 * profile_scraper_processes.cjs
 * ─────────────────────────────────────────────────────────────────────────────
 * Cross-process memory and process tree profiler for Windows environments.
 * Measures:
 * 1. Node.js runtime memory (RSS, Heap Used, Heap Total, External).
 * 2. Recursive Child Process tree (Playwright / Chromium worker, GPU process, renderers)
 *    via PowerShell Win32_Process queries.
 *
 * Usage:
 *   node tests/profile_scraper_processes.cjs [targetPid]
 *   If targetPid is omitted, profiles the current Node process and checks for any
 *   active scraperWorker / chrome child processes.
 * ─────────────────────────────────────────────────────────────────────────────
 */

const { execSync } = require('child_process');
const os = require('os');

function formatBytes(bytes) {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return (bytes / Math.pow(k, i)).toFixed(2) + ' ' + sizes[i];
}

function getNodeMemory() {
  const mem = process.memoryUsage();
  return {
    rss: mem.rss,
    heapTotal: mem.heapTotal,
    heapUsed: mem.heapUsed,
    external: mem.external,
    arrayBuffers: mem.arrayBuffers
  };
}

function getAllProcessesWindows() {
  if (os.platform() !== 'win32') {
    return [];
  }

  try {
    const psCmd = `Get-CimInstance Win32_Process | Select-Object ProcessId, ParentProcessId, Name, WorkingSetSize | ConvertTo-Json -Compress`;
    const stdout = execSync(`powershell.exe -NoProfile -NonInteractive -Command "${psCmd}"`, {
      encoding: 'utf8',
      maxBuffer: 10 * 1024 * 1024,
      timeout: 10000
    });

    if (!stdout || !stdout.trim()) return [];
    const parsed = JSON.parse(stdout.trim());
    return Array.isArray(parsed) ? parsed : [parsed];
  } catch (err) {
    // Fallback to wmic if CIM fails
    try {
      const wmicOutput = execSync(`wmic process get ProcessId,ParentProcessId,Name,WorkingSetSize /format:csv`, {
        encoding: 'utf8',
        maxBuffer: 10 * 1024 * 1024,
        timeout: 10000
      });
      const lines = wmicOutput.trim().split('\n').slice(1);
      const list = [];
      for (const line of lines) {
        const parts = line.trim().split(',');
        if (parts.length >= 5) {
          list.push({
            Name: parts[1],
            ParentProcessId: parseInt(parts[2], 10),
            ProcessId: parseInt(parts[3], 10),
            WorkingSetSize: parseInt(parts[4], 10)
          });
        }
      }
      return list;
    } catch (wmicErr) {
      console.warn('Could not query Windows process table:', err.message);
      return [];
    }
  }
}

function buildProcessTree(allProcesses, rootPid) {
  const childrenMap = new Map();
  const processById = new Map();

  for (const proc of allProcesses) {
    processById.set(proc.ProcessId, proc);
    if (!childrenMap.has(proc.ParentProcessId)) {
      childrenMap.set(proc.ParentProcessId, []);
    }
    childrenMap.get(proc.ParentProcessId).push(proc);
  }

  const tree = [];
  function collectDescendants(pid, depth = 0) {
    const children = childrenMap.get(pid) || [];
    for (const child of children) {
      tree.push({
        pid: child.ProcessId,
        parentPid: child.ParentProcessId,
        name: child.Name,
        workingSetBytes: parseInt(child.WorkingSetSize || 0, 10),
        depth
      });
      collectDescendants(child.ProcessId, depth + 1);
    }
  }

  const rootProc = processById.get(rootPid);
  if (rootProc) {
    tree.unshift({
      pid: rootProc.ProcessId,
      parentPid: rootProc.ParentProcessId,
      name: rootProc.Name,
      workingSetBytes: parseInt(rootProc.WorkingSetSize || 0, 10),
      depth: 0
    });
    collectDescendants(rootPid, 1);
  } else {
    collectDescendants(rootPid, 0);
  }

  return tree;
}

function profileProcess(targetPid) {
  console.log(`================================================================`);
  console.log(`OCTAL DIALER PROCESS & MEMORY INSTRUMENTATION PROFILER`);
  console.log(`Target Root PID : ${targetPid}`);
  console.log(`Host Platform   : ${os.platform()} (${os.arch()})`);
  console.log(`CPU Cores       : ${os.cpus().length}`);
  console.log(`System Memory   : ${formatBytes(os.freemem())} free / ${formatBytes(os.totalmem())} total`);
  console.log(`================================================================\n`);

  if (targetPid === process.pid) {
    const nodeMem = getNodeMemory();
    console.log(`--- [1] Node.js Process V8 Heap Metrics ---`);
    console.log(`  RSS          : ${formatBytes(nodeMem.rss)}`);
    console.log(`  Heap Total   : ${formatBytes(nodeMem.heapTotal)}`);
    console.log(`  Heap Used    : ${formatBytes(nodeMem.heapUsed)}`);
    console.log(`  External     : ${formatBytes(nodeMem.external)}`);
    console.log(`  ArrayBuffers : ${formatBytes(nodeMem.arrayBuffers || 0)}\n`);
  }

  console.log(`--- [2] Process Tree & Chromium Subprocess Hierarchy ---`);
  const allProcs = getAllProcessesWindows();
  const tree = buildProcessTree(allProcs, targetPid);

  if (tree.length === 0) {
    console.log(`  No processes found for PID ${targetPid} (process may have completed or terminated).`);
  } else {
    let totalWorkingSet = 0;
    console.log(`  ${'PID'.padEnd(10)} | ${'Parent'.padEnd(10)} | ${'Memory (RSS)'.padEnd(15)} | ${'Process Name'}`);
    console.log(`  ${'-'.repeat(10)}-+-${'-'.repeat(10)}-+-${'-'.repeat(15)}-+-${'-'.repeat(25)}`);

    for (const node of tree) {
      totalWorkingSet += node.workingSetBytes;
      const indent = '  '.repeat(node.depth);
      const name = `${indent}${node.name}`;
      console.log(
        `  ${String(node.pid).padEnd(10)} | ${String(node.parentPid).padEnd(10)} | ${formatBytes(node.workingSetBytes).padEnd(15)} | ${name}`
      );
    }

    console.log(`  ${'-'.repeat(10)}-+-${'-'.repeat(10)}-+-${'-'.repeat(15)}-+-${'-'.repeat(25)}`);
    console.log(`  Total Processes In Tree : ${tree.length}`);
    console.log(`  Aggregate Working Set   : ${formatBytes(totalWorkingSet)}\n`);
  }

  console.log(`================================================================\n`);
  return tree;
}

// CLI Execution
const args = process.argv.slice(2);
const targetPid = args[0] ? parseInt(args[0], 10) : process.pid;

if (isNaN(targetPid)) {
  console.error(`Invalid PID provided: "${args[0]}"`);
  process.exit(1);
}

profileProcess(targetPid);
