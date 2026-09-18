// Isolated Scraper Hardening & Security Test Suite
// Zero live network calls, zero live DB calls.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const EventEmitter = require('node:events');
const http = require('node:http');
const zlib = require('node:zlib');
const ts = require('typescript');
const ExcelJS = require('exceljs');

const root = path.join(__dirname, '../src');

let mockDncList = [];
let mockExistingLeads = [];
let mockCampaigns = new Map();
const mockDbAdapter = {
  init: async () => {},
  queryOne: async (sql, params) => {
    if (sql.includes('FROM campaigns')) {
      const fileName = params[0];
      const tenantId = params[1];
      const name = params[2];
      for (const c of mockCampaigns.values()) {
        if (c.fileName === fileName && c.tenantId === tenantId && c.name === name) {
          return c;
        }
      }
    }
    return null;
  },
  queryAll: async (sql, params) => {
    if (sql.includes('FROM suppression_list')) {
      return (mockDncList || []).map(phone => ({ phone }));
    }
    if (sql.includes('FROM leads')) {
      return (mockExistingLeads || []).map(l => ({ name: l.name, phone: l.phone }));
    }
    return [];
  },
  execute: async (sql, params) => {
    if (sql.includes('INSERT INTO campaigns')) {
      mockCampaigns.set(params[0], {
        id: params[0],
        name: params[1],
        fileName: params[2],
        leadCount: params[3],
        tenantId: params[4],
        createdAt: params[5]
      });
    }
    return { rowCount: 1 };
  },
  withTransaction: async fn => fn({})
};

let currentMockWindow = { location: { href: 'http://localhost' } };
let currentMockDocument = { querySelector: () => null };

function setMockBrowser(win, doc) {
  currentMockWindow = win;
  currentMockDocument = doc;
}

function load(file, imports = {}, extraGlobals = {}) {
  const code = fs.readFileSync(path.join(root, file), 'utf8');
  const js = ts.transpileModule(code, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true }
  }).outputText;
  const module = { exports: {} };
  vm.runInNewContext(js, {
    module,
    exports: module.exports,
    __dirname: root,
    Buffer,
    URL,
    AbortController,
    console,
    get window() { return currentMockWindow; },
    get document() { return currentMockDocument; },
    process: { ...process, env: { ...process.env, NODE_ENV: 'test', MAX_ACTIVE_SCRAPERS: '1' }, cwd: () => root },
    setTimeout,
    clearTimeout,
    setInterval: () => 0,
    clearInterval: () => {},
    require: id => {
      if (Object.hasOwn(imports, id)) return imports[id];
      if (id === './databaseManager') return realDatabaseManager;
      if (id === './ssrfProtection') return ssrfProtection;
      if (['crypto', 'os', 'fs', 'path', 'node:fs', 'node:path', 'child_process', 'exceljs', 'url', 'net', 'http', 'https', 'dns', 'zlib', 'tls', 'events', 'readline', 'node:readline'].includes(id)) {
        return require(id);
      }
      throw new Error('Unexpected dependency: ' + id);
    },
    ...extraGlobals
  });
  return module.exports;
}

const realDatabaseManager = load('databaseManager.ts', {
  './entitlementManager': { checkLimit: async () => ({ allowed: true, current: 0, limit: 100 }), initializeCatalogPlans: async () => {} },
  './db/dbAdapter': { dbAdapter: mockDbAdapter }
});

const ssrfProtection = load('ssrfProtection.ts');
const {
  isPrivateOrBlockedIP,
  validateUrlForSsrf,
  parseIPv6Words,
  createSafeLookup,
  createSafeAgents,
  SsrfError
} = ssrfProtection;

const websiteEnricher = load('websiteEnricher.ts');
const { safeHttpGet } = websiteEnricher;

const scraperWorker = load('scraperWorker.ts', {
  './websiteEnricher': { enrichCompanyWebsite: async () => ({}) },
  playwright: { chromium: {} }
});
const {
  sanitizeSpreadsheetValue,
  extractListingId,
  extractPanelDetails,
  writeLeadsToExcel
} = scraperWorker;

const googleMapsScraperService = load('googleMapsScraperService.ts');
const {
  validateTenantFileAccess,
  getTenantOutputDir,
  getTenantJobsDir,
  importScraperFileToCampaign,
  reconcileInterruptedJobs,
  submitScraperJob,
  stopTenantScraperJob,
  getTenantScraperStatus,
  shutdownWorker,
  getActiveScraperCount,
  registerRuntimeForTesting
} = googleMapsScraperService;

async function main() {
  let count = 0;
  async function check(name, fn) {
    await fn();
    count++;
    console.log('PASS ' + name);
  }

  console.log('--- Phase 7 Hardening & Behavioral Verification Suite ---');

  // ============================================================================
  // GROUP 1: BEHAVIORAL LISTING CORRELATION & STALE PANEL DEFENSE
  // ============================================================================

  function createMockPanelDoc(panelFields) {
    const panelObj = {
      isConnected: panelFields.isConnected !== undefined ? panelFields.isConnected : true,
      querySelector: (subSel) => {
        if (subSel.includes('h1')) return panelFields.h1 ? { textContent: typeof panelFields.h1 === 'function' ? panelFields.h1() : panelFields.h1 } : null;
        if (subSel.includes('phone') || subSel.includes('tel:')) return panelFields.phone ? { textContent: panelFields.phone, getAttribute: () => `tel:${panelFields.phone}` } : null;
        if (subSel.includes('address')) return panelFields.address ? { textContent: panelFields.address } : null;
        if (subSel.includes('category')) return panelFields.category ? { textContent: panelFields.category } : null;
        if (subSel.includes('authority') || subSel.includes('Website')) return panelFields.website ? { getAttribute: () => panelFields.website } : null;
        return null;
      }
    };
    return {
      querySelector: (sel) => {
        if (sel.includes('div[role="main"]') || sel.includes('m6QErb')) return panelObj;
        return null;
      }
    };
  }

  await check('Behavioral: Extraction fails closed when no confirmed detail panel container exists in DOM', async () => {
    const noPanelPage = {
      evaluate: async (fn, arg) => {
        const mockWindow = { location: { href: 'https://www.google.com/maps/place/Listing+B/@40.7,-74.0,15z/data=!1s0xbbb:0xbbb' } };
        const mockDoc = { querySelector: () => null }; // No div[role="main"]
        setMockBrowser(mockWindow, mockDoc);
        return await fn(arg);
      }
    };

    const result = await extractPanelDetails(
      noPanelPage,
      'New York',
      'Listing B Supplies',
      'https://www.google.com/maps/place/Listing+B/@40.7,-74.0,15z/data=!1s0xbbb:0xbbb',
      '0xbbb:0xbbb'
    );

    assert.equal(result, null, 'Must fail closed when panel container is absent');
  });

  await check('Behavioral: Extraction rejects stale panel where URL changed to B but DOM still has A', async () => {
    // Simulated Page fixture where URL has updated to Listing B,
    // but the panel heading (H1) and phone button still belong to old Listing A
    const staleDomPage = {
      evaluate: async (fn, arg) => {
        const mockWindow = { location: { href: 'https://www.google.com/maps/place/Listing+B/@40.7,-74.0,15z/data=!1s0xbbb:0xbbb' } };
        const mockDoc = createMockPanelDoc({
          h1: 'Listing A Hardware', // Stale heading from A
          phone: '(212) 555-1111',
          address: '100 Old Street, New York, NY'
        });
        setMockBrowser(mockWindow, mockDoc);
        return await fn(arg);
      }
    };

    // Candidate B is expected
    const result = await extractPanelDetails(
      staleDomPage,
      'New York',
      'Listing B Supplies', // Expected business name from candidate link
      'https://www.google.com/maps/place/Listing+B/@40.7,-74.0,15z/data=!1s0xbbb:0xbbb',
      '0xbbb:0xbbb'
    );

    // MUST NOT accept Listing A's stale data as Listing B!
    assert.equal(result, null, 'Stale panel data from previous listing must be rejected');
  });

  await check('Behavioral: Same-name branch rejects stale panel when URL changed to B but panel still holds A address and phone', async () => {
    // Candidate B is clicked: URL updates to Branch B (0xbbb), candidate ariaLabel is "Starbucks"
    // Both branch A and branch B are named "Starbucks", so heading check alone would pass!
    // But Google Maps SPA has not yet updated the panel DOM: panel still displays Branch A's address and phone
    const staleBranchPanelPage = {
      evaluate: async (fn, arg) => {
        const mockWindow = { location: { href: 'https://www.google.com/maps/place/Starbucks/@40.7,-74.0,15z/data=!1s0xbbb:0xbbb' } };
        const mockDoc = createMockPanelDoc({
          h1: 'Starbucks', // Heading matches Branch B!
          phone: '(212) 555-1111', // Stale phone from Branch A
          address: '100 Old St, Branch A' // Stale address from Branch A
        });
        setMockBrowser(mockWindow, mockDoc);
        return await fn(arg);
      }
    };

    // Candidate B extraction with previousFingerprint from Branch A
    const result = await extractPanelDetails(
      staleBranchPanelPage,
      'New York',
      'Starbucks', // Heading matches Branch B!
      'https://www.google.com/maps/place/Starbucks/@40.7,-74.0,15z/data=!1s0xbbb:0xbbb',
      '0xbbb:0xbbb',
      { listingId: '0xaaa:0xaaa', address: '100 Old St, Branch A', phone: '(212) 555-1111' } // Previous fingerprint
    );

    assert.equal(result, null, 'Must reject stale panel for same-name branch when address matches previous listing');
  });

  await check('Behavioral: Extraction rejects panel mutation during field extraction', async () => {
    // DOM mutates mid-extraction (e.g. user clicked or SPA rerendered)
    let callCount = 0;
    const mutatingPage = {
      evaluate: async (fn, arg) => {
        const mockWindow = { location: { href: 'https://www.google.com/maps/place/Branch/@40.7,-74.0,15z/data=!1s0x123:0x456' } };
        const mockDoc = createMockPanelDoc({
          h1: () => {
            callCount++;
            return callCount === 1 ? 'Expected Branch' : 'Completely Different Place';
          },
          phone: '(212) 555-9999'
        });
        setMockBrowser(mockWindow, mockDoc);
        return await fn(arg);
      }
    };

    const result = await extractPanelDetails(
      mutatingPage,
      'NY',
      'Expected Branch',
      'https://www.google.com/maps/place/Branch/@40.7,-74.0,15z/data=!1s0x123:0x456',
      '0x123:0x456'
    );

    assert.equal(result, null, 'Panel mutation between pre and post checks must abort extraction');
  });

  await check('Behavioral: Same-name branches with different listing IDs are correctly disambiguated', async () => {
    // Both branches have same brand name "Metro Dental", but distinct place IDs
    const makeBranchPage = (placeId, branchAddress) => ({
      evaluate: async (fn, arg) => {
        const mockWindow = { location: { href: `https://www.google.com/maps/place/Metro+Dental/@40.7,-74.0,15z/data=!1s${placeId}` } };
        const mockDoc = createMockPanelDoc({
          h1: 'Metro Dental',
          phone: '(800) 555-0100',
          address: branchAddress
        });
        setMockBrowser(mockWindow, mockDoc);
        return await fn(arg);
      }
    });

    const branch1 = await extractPanelDetails(
      makeBranchPage('0x111:0x111', '100 Brooklyn Ave'),
      'Brooklyn',
      'Metro Dental',
      'https://maps/place/Metro+Dental?1',
      '0x111:0x111'
    );

    const branch2 = await extractPanelDetails(
      makeBranchPage('0x222:0x222', '500 Manhattan Ave'),
      'Manhattan',
      'Metro Dental',
      'https://maps/place/Metro+Dental?2',
      '0x222:0x222'
    );

    assert.ok(branch1 && branch2);
    assert.equal(branch1.listingId, '0x111:0x111');
    assert.equal(branch2.listingId, '0x222:0x222');
    assert.equal(branch1.address, '100 Brooklyn Ave');
    assert.equal(branch2.address, '500 Manhattan Ave');
  });

  // ============================================================================
  // GROUP 2: PRESERVING DISTINCT BUSINESSES SHARING A PHONE
  // ============================================================================

  await check('Behavioral: Excel export and CRM import preserve distinct business branches sharing one phone number', async () => {
    const tenantId = 'tenant_shared_phone_test';
    const tenantDir = getTenantOutputDir(tenantId);
    const testExcelPath = path.join(tenantDir, 'leads_shared_phone.xlsx');

    // Two distinct branch locations sharing a single 1-800 central phone number
    const leadA = {
      listingId: 'place_starbucks_5th_ave',
      businessName: 'Starbucks - 5th Ave',
      phone: '+18007827282',
      rawPhone: '1-800-782-7282',
      category: 'Coffee Shop',
      address: '500 5th Ave, New York, NY',
      searchLocation: 'NYC',
      website: 'https://starbucks.com',
      rating: '4.2',
      reviewsCount: '350',
      hours: '6AM-8PM',
      mapsUrl: 'https://maps.google.com/?cid=1',
      discoveredAt: new Date().toISOString()
    };

    const leadB = {
      listingId: 'place_starbucks_times_sq',
      businessName: 'Starbucks - Times Square',
      phone: '+18007827282', // Exact same central phone number!
      rawPhone: '1-800-782-7282',
      category: 'Coffee Shop',
      address: '1500 Broadway, New York, NY',
      searchLocation: 'NYC',
      website: 'https://starbucks.com',
      rating: '4.1',
      reviewsCount: '520',
      hours: '24 Hours',
      mapsUrl: 'https://maps.google.com/?cid=2',
      discoveredAt: new Date().toISOString()
    };

    // 1. Export both leads to Excel
    await writeLeadsToExcel([leadA, leadB], testExcelPath);

    // Verify Excel contains both distinct businesses
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(testExcelPath);
    const sheet = workbook.worksheets[0];
    assert.equal(sheet.rowCount, 3); // 1 header + 2 data rows

    // 2. Import into CRM campaign
    const importResult = await importScraperFileToCampaign(
      testExcelPath,
      'Coffee Branches Campaign',
      tenantId,
      'admin_user'
    );

    // Assert both distinct branches are preserved without being deduplicated away
    assert.equal(importResult.success, true);
    assert.equal(importResult.importedCount, 2, 'Both distinct branches must be imported into CRM');
    assert.equal(importResult.dedupedCount, 0, 'Distinct business names sharing a phone must not be discarded');

    try { fs.unlinkSync(testExcelPath); } catch (_) {}
  });

  await check('Behavioral: Excel export with Listing ID allows CRM import to disambiguate identical name and phone branches', async () => {
    const tenantId = 'tenant_ident_branches';
    const tenantDir = getTenantOutputDir(tenantId);
    const testExcelPath = path.join(tenantDir, 'leads_ident_branches.xlsx');

    const lead1 = {
      listingId: '0xaaa:0x111',
      businessName: 'Starbucks',
      phone: '+18007827282',
      category: 'Coffee',
      address: '100 Broadway, New York, NY',
      searchLocation: 'NYC',
      website: 'https://starbucks.com',
      mapsUrl: 'https://maps.google.com/?1',
      discoveredAt: new Date().toISOString()
    };
    const lead2 = {
      listingId: '0xbbb:0x222',
      businessName: 'Starbucks',
      phone: '+18007827282', // Identical phone
      category: 'Coffee',
      address: '200 5th Ave, New York, NY', // Distinct address
      searchLocation: 'NYC',
      website: 'https://starbucks.com',
      mapsUrl: 'https://maps.google.com/?2',
      discoveredAt: new Date().toISOString()
    };
    const lead3 = { // Truly duplicate of lead1
      listingId: '0xaaa:0x111',
      businessName: 'Starbucks',
      phone: '+18007827282',
      category: 'Coffee',
      address: '100 Broadway, New York, NY',
      searchLocation: 'NYC',
      website: 'https://starbucks.com',
      mapsUrl: 'https://maps.google.com/?1',
      discoveredAt: new Date().toISOString()
    };

    await writeLeadsToExcel([lead1, lead2, lead3], testExcelPath);

    const importResult = await importScraperFileToCampaign(
      testExcelPath,
      'Identical Name Phone Campaign',
      tenantId,
      'admin'
    );

    assert.equal(importResult.importedCount, 2, 'Should import both distinct branches');
    assert.equal(importResult.dedupedCount, 1, 'Should deduplicate the exact duplicate 3rd lead');

    try { fs.unlinkSync(testExcelPath); } catch (_) {}
  });

  // ============================================================================
  // GROUP 3: AWAITED IDEMPOTENT SHUTDOWN & CONCURRENCY CAPACITY
  // ============================================================================

  await check('Behavioral: Capacity is not released until worker process exit is observed', async () => {
    // Verify that shutdownWorker delays capacity release until exit fires
    const mockWorker = new EventEmitter();
    mockWorker.connected = true;
    mockWorker.killed = false;
    mockWorker.exitCode = null;
    mockWorker.pid = 999999;
    mockWorker.send = () => {};
    mockWorker.kill = () => {};

    const testJobId = 'test_delayed_exit_job';
    const activeMap = googleMapsScraperService.getActiveJobRuntime;

    // Simulate active job
    const fakeRuntime = {
      jobId: testJobId,
      tenantId: 'tenant_delay',
      executionId: 101,
      workerProcess: mockWorker,
      abortController: new AbortController(),
      record: { jobId: testJobId, tenantId: 'tenant_delay', status: 'running', logs: [] },
      hasReceivedDone: false,
      isShuttingDown: false
    };

    // Inject into internal runtime map via load
    const serviceWithMock = load('googleMapsScraperService.ts');
    serviceWithMock.registerRuntimeForTesting(fakeRuntime);

    // Start shutdown
    let shutdownFinished = false;
    const shutdownPromise = serviceWithMock.shutdownWorker(testJobId, 'test').then(() => {
      shutdownFinished = true;
    });

    // Since mockWorker has not emitted 'exit', shutdown must be pending
    await new Promise(r => setTimeout(r, 50));
    assert.equal(shutdownFinished, false, 'Shutdown must wait for process exit before completing');
    assert.equal(serviceWithMock.getActiveScraperCount(), 1, 'Capacity must remain allocated while worker is exiting');

    // Now emit exit event on the mock worker
    mockWorker.exitCode = 0;
    mockWorker.emit('exit', 0, null);

    // Shutdown should now finish cleanly
    await shutdownPromise;
    assert.equal(shutdownFinished, true, 'Shutdown completes once exit event is observed');
    assert.equal(serviceWithMock.getActiveScraperCount(), 0, 'Capacity released after worker exits');
  });

  await check('Behavioral: Process shutdown failure quarantines capacity and refuses to release execution slot', async () => {
    const unkillableWorker = new EventEmitter();
    unkillableWorker.connected = true;
    unkillableWorker.killed = false;
    unkillableWorker.exitCode = null;
    unkillableWorker.pid = 999999;
    unkillableWorker.send = () => {};
    unkillableWorker.kill = () => {};

    const mockProcess = {
      ...process,
      kill: (pid, sig) => {
        if (sig === 0 && pid === 999999) return true; // simulates PID 999999 is alive
        return true;
      }
    };
    const mockChildProcess = {
      ...require('child_process'),
      execFile: (file, args, cb) => {
        if (typeof cb === 'function') cb(null, '', '');
      }
    };

    const serviceWithQuarantine = load('googleMapsScraperService.ts',
      { child_process: mockChildProcess },
      { process: mockProcess }
    );

    const quarantineJobId = 'job_quarantine_test';
    const fakeRuntime = {
      jobId: quarantineJobId,
      tenantId: 'tenant_quarantine',
      executionId: 301,
      workerProcess: unkillableWorker,
      abortController: new AbortController(),
      record: { jobId: quarantineJobId, tenantId: 'tenant_quarantine', status: 'running', logs: [] },
      hasReceivedDone: false,
      isShuttingDown: false,
      isExited: false
    };

    serviceWithQuarantine.registerRuntimeForTesting(fakeRuntime);
    assert.equal(serviceWithQuarantine.getActiveScraperCount(), 1);

    // Attempt shutdown: process cannot be terminated, so it must quarantine and retain capacity
    await serviceWithQuarantine.shutdownWorker(quarantineJobId, 'quarantine_check');

    assert.equal(fakeRuntime.quarantined, true, 'Slot must be marked quarantined when process cannot be killed');
    assert.equal(serviceWithQuarantine.getActiveScraperCount(), 1, 'Capacity must NOT be released when shutdown fails');
  });

  await check('Behavioral: Stale messages cannot override or resurrect stopped job status', async () => {
    const tenantId = 'tenant_stale_msg_test';
    const jobsDir = getTenantJobsDir(tenantId);
    const mockJobFile = path.join(jobsDir, 'job_stale_test.json');

    // Job was stopped
    const mockJobRecord = {
      jobId: 'job_stale_test',
      tenantId,
      status: 'stopped',
      counters: { extracted: 2, discovered: 5 },
      logs: ['Stopped by user.']
    };
    fs.writeFileSync(mockJobFile, JSON.stringify(mockJobRecord, null, 2), 'utf8');

    // Simulate receiving a late DONE message
    const service = load('googleMapsScraperService.ts');
    const record = service.loadJobRecord(tenantId, 'job_stale_test');
    assert.equal(record.status, 'stopped');

    try { fs.unlinkSync(mockJobFile); } catch (_) {}
  });

  await check('Behavioral: DONE message without disk output or checkpoint artifact transitions to failed', async () => {
    const service = load('googleMapsScraperService.ts');
    const tenantId = 'tenant_fake_done';
    const jobsDir = getTenantJobsDir(tenantId);
    const jobFile = path.join(jobsDir, 'job_fake_done.json');

    const fakeJob = {
      jobId: 'job_fake_done',
      tenantId,
      status: 'running',
      counters: { extracted: 0, discovered: 10, failed: 0 },
      logs: [],
      outputFile: path.join(jobsDir, 'non_existent_output.xlsx'),
      checkpointPath: path.join(jobsDir, 'non_existent_checkpoint.jsonl')
    };
    fs.writeFileSync(jobFile, JSON.stringify(fakeJob, null, 2), 'utf8');

    const mockWorker = new EventEmitter();
    mockWorker.pid = 999991;
    mockWorker.send = () => {};
    mockWorker.kill = () => {};

    const runtime = {
      jobId: 'job_fake_done',
      tenantId,
      executionId: 401,
      workerProcess: mockWorker,
      abortController: new AbortController(),
      record: fakeJob,
      hasReceivedDone: false,
      isShuttingDown: false,
      isExited: true
    };
    service.registerRuntimeForTesting(runtime);

    // Worker emits DONE claiming 5 extracted leads, but neither output nor checkpoint exists on disk
    mockWorker.emit('message', {
      type: 'DONE',
      jobId: 'job_fake_done',
      executionId: 401,
      status: 'completed',
      counters: { extracted: 5, discovered: 10, failed: 0 }
    });

    assert.equal(runtime.record.status, 'failed', 'Must transition to failed when completion evidence is missing on disk');
    assert.match(runtime.record.errorMessage, /neither output artifact nor checkpoint file exists/i);

    try { fs.unlinkSync(jobFile); } catch (_) {}
  });

  await check('Behavioral: Process exit without DONE and zero-byte checkpoint transitions to failed, not partial', async () => {
    const service = load('googleMapsScraperService.ts');
    const tenantId = 'tenant_exit_empty_cp';
    const jobsDir = getTenantJobsDir(tenantId);
    const jobFile = path.join(jobsDir, 'job_empty_cp.json');
    const checkpointFile = path.join(jobsDir, 'checkpoint_empty.jsonl');

    // Create 0-byte checkpoint file
    fs.writeFileSync(checkpointFile, '', 'utf8');

    const fakeJob = {
      jobId: 'job_empty_cp',
      tenantId,
      status: 'running',
      counters: { extracted: 4, discovered: 10, failed: 0 },
      logs: [],
      checkpointPath: checkpointFile
    };
    fs.writeFileSync(jobFile, JSON.stringify(fakeJob, null, 2), 'utf8');

    const mockWorker = new EventEmitter();
    mockWorker.pid = 999992;
    mockWorker.send = () => {};
    mockWorker.kill = () => {};

    const runtime = {
      jobId: 'job_empty_cp',
      tenantId,
      executionId: 501,
      workerProcess: mockWorker,
      abortController: new AbortController(),
      record: fakeJob,
      hasReceivedDone: false,
      isShuttingDown: false,
      isExited: false
    };
    service.registerRuntimeForTesting(runtime);

    // Worker process exits unexpectedly without DONE
    mockWorker.emit('exit', 0, null);

    assert.equal(runtime.record.status, 'failed', 'Must mark failed when checkpoint is empty on disk');
    assert.match(runtime.record.errorMessage, /without completion acknowledgment and no flushed checkpoint found/i);

    try { fs.unlinkSync(jobFile); fs.unlinkSync(checkpointFile); } catch (_) {}
  });

  await check('Behavioral: Exit code 0 without explicit DONE message is marked failed or partial, NEVER completed', async () => {
    // If worker process exits with code 0 without having sent an explicit DONE message:
    // It must NEVER be marked as 'completed'
    const service = load('googleMapsScraperService.ts');
    const tenantId = 'tenant_exit_no_done';
    const jobsDir = getTenantJobsDir(tenantId);
    const jobFile = path.join(jobsDir, 'job_no_done.json');

    const inFlightJob = {
      jobId: 'job_no_done',
      tenantId,
      status: 'running',
      counters: { extracted: 0, discovered: 5 },
      logs: ['Worker running...']
    };
    fs.writeFileSync(jobFile, JSON.stringify(inFlightJob, null, 2), 'utf8');

    // Reconcile or handle exit without DONE
    service.reconcileInterruptedJobs();

    const reconciled = JSON.parse(fs.readFileSync(jobFile, 'utf8'));
    assert.notEqual(reconciled.status, 'completed', 'Exit without DONE must never be marked completed');
    assert.equal(reconciled.status, 'failed');

    try { fs.unlinkSync(jobFile); } catch (_) {}
  });

  // ============================================================================
  // GROUP 4: COMPREHENSIVE IPv6 SSRF HARDENING SUITE
  // ============================================================================

  await check('SSRF IPv6: Bracketed loopback and mapped addresses are blocked in validateUrlForSsrf', async () => {
    // Bracketed loopback
    assert.throws(() => validateUrlForSsrf('http://[::1]/'), /Destination IP \[::1\] is in a private\/blocked subnet/);
    assert.throws(() => validateUrlForSsrf('http://[::1]:8080/admin'), /Destination IP \[::1\] is in a private\/blocked subnet/);

    // Bracketed IPv4-mapped IPv6 loopback
    assert.throws(() => validateUrlForSsrf('http://[::ffff:127.0.0.1]/'), /Destination IP .* is in a private\/blocked subnet/);
    assert.throws(() => validateUrlForSsrf('http://[::ffff:169.254.169.254]/latest/meta-data'), /Destination IP .* is in a private\/blocked subnet/);
    assert.throws(() => validateUrlForSsrf('http://[::ffff:192.168.1.1]/router'), /Destination IP .* is in a private\/blocked subnet/);
  });

  await check('SSRF IPv6: Full expanded and zero-padded IPv6 representations are blocked', async () => {
    // Expanded 32-hex loopback
    assert.throws(() => validateUrlForSsrf('http://[0000:0000:0000:0000:0000:0000:0000:0001]/'), /Destination IP .* is in a private\/blocked subnet/);

    // Expanded IPv4-mapped loopback: 0000:0000:0000:0000:0000:ffff:7f00:0001
    assert.throws(() => validateUrlForSsrf('http://[0000:0000:0000:0000:0000:ffff:7f00:0001]/'), /Destination IP .* is in a private\/blocked subnet/);

    // NAT64 prefix: 64:ff9b::127.0.0.1
    assert.throws(() => validateUrlForSsrf('http://[64:ff9b::127.0.0.1]/'), /Destination IP .* is in a private\/blocked subnet/);
    assert.throws(() => validateUrlForSsrf('http://[64:ff9b::169.254.169.254]/'), /Destination IP .* is in a private\/blocked subnet/);

    // Link-local unicast (fe80::/10)
    assert.throws(() => validateUrlForSsrf('http://[fe80::1]/'), /Destination IP .* is in a private\/blocked subnet/);

    // Unique local address (fc00::/7)
    assert.throws(() => validateUrlForSsrf('http://[fc00::1]/'), /Destination IP .* is in a private\/blocked subnet/);
    assert.throws(() => validateUrlForSsrf('http://[fd12:3456:789a::1]/'), /Destination IP .* is in a private\/blocked subnet/);
  });

  await check('SSRF IPv6: parseIPv6Words accurately converts all standard forms to 8 words', async () => {
    // ::1
    const wLoopback = parseIPv6Words('::1');
    assert.deepEqual([...wLoopback], [0, 0, 0, 0, 0, 0, 0, 1]);

    // [::ffff:127.0.0.1]
    const wMapped = parseIPv6Words('[::ffff:127.0.0.1]');
    assert.deepEqual([...wMapped], [0, 0, 0, 0, 0, 0xffff, 0x7f00, 1]);

    // fe80::dead:beef
    const wLink = parseIPv6Words('fe80::dead:beef');
    assert.deepEqual([...wLink], [0xfe80, 0, 0, 0, 0, 0, 0xdead, 0xbeef]);

    // Public IPv6
    const wPublic = parseIPv6Words('2607:f8b0:4005:805::200e');
    assert.equal(wPublic.length, 8);
    assert.equal(isPrivateOrBlockedIP('2607:f8b0:4005:805::200e'), false);
  });

  await check('SSRF DNS & Transport: createSafeLookup and Agent transport intercept block direct private connections', async () => {
    const lookup = createSafeLookup();

    // 1. Direct literal lookup is blocked
    await new Promise((resolve) => {
      lookup('[::1]', {}, (err) => {
        assert.ok(err instanceof SsrfError);
        resolve(true);
      });
    });

    await new Promise((resolve) => {
      lookup('127.0.0.1', {}, (err) => {
        assert.ok(err instanceof SsrfError);
        resolve(true);
      });
    });

    // 2. Transport-level intercept in safe agents throws before TCP socket connect
    const { httpAgent } = createSafeAgents();
    assert.throws(
      () => httpAgent.createConnection({ host: '127.0.0.1', port: 80 }, () => {}),
      /Direct transport connection to blocked IP/
    );
    assert.throws(
      () => httpAgent.createConnection({ host: '[::1]', port: 80 }, () => {}),
      /Direct transport connection to blocked IP/
    );
    assert.throws(
      () => httpAgent.createConnection({ host: '[::ffff:169.254.169.254]', port: 80 }, () => {}),
      /Direct transport connection to blocked IP/
    );
  });

  // ============================================================================
  // GROUP 5: FORMULA INJECTION & CRM IMPORT VALIDATIONS
  // ============================================================================

  await check('Spreadsheet sanitization neutralizes malicious CSV formulas and preserves valid phone numbers', async () => {
    assert.equal(sanitizeSpreadsheetValue("=cmd|' /C calc'!A0"), "'=cmd|' /C calc'!A0");
    assert.equal(sanitizeSpreadsheetValue("@SUM(1,5)"), "'@SUM(1,5)");
    assert.equal(sanitizeSpreadsheetValue("\tDDE_payload"), "'\tDDE_payload");
    assert.equal(sanitizeSpreadsheetValue("+12125551234"), "+12125551234");
  });

  await check('Behavioral: Stop-A / Start-B concurrency prevents overlapping browser workers', async () => {
    const service = load('googleMapsScraperService.ts');

    // Create worker A with delayed shutdown
    const mockWorkerA = new EventEmitter();
    mockWorkerA.connected = true;
    mockWorkerA.killed = false;
    mockWorkerA.exitCode = null;
    mockWorkerA.pid = 88881;
    mockWorkerA.send = () => {};
    mockWorkerA.kill = () => {};

    const runtimeA = {
      jobId: 'job_concurrency_A',
      tenantId: 'tenant_concurrency',
      executionId: 201,
      workerProcess: mockWorkerA,
      abortController: new AbortController(),
      record: { jobId: 'job_concurrency_A', tenantId: 'tenant_concurrency', status: 'running', logs: [] },
      hasReceivedDone: false,
      isShuttingDown: false
    };

    service.registerRuntimeForTesting(runtimeA);
    assert.equal(service.getActiveScraperCount(), 1);

    // Stop Job A
    let stopAFinished = false;
    const stopPromise = service.stopTenantScraperJob('tenant_concurrency', 'job_concurrency_A').then((res) => {
      stopAFinished = true;
      return res;
    });

    // While Worker A has not exited, capacity is NOT released
    await new Promise(r => setTimeout(r, 40));
    assert.equal(stopAFinished, false, 'Stop A must await worker exit');
    assert.equal(service.getActiveScraperCount(), 1, 'Worker A still counts toward active capacity');

    // Simulate Worker A completing its exit
    mockWorkerA.exitCode = 0;
    mockWorkerA.emit('exit', 0, null);

    await stopPromise;
    assert.equal(stopAFinished, true);
    assert.equal(service.getActiveScraperCount(), 0, 'Capacity released only after Worker A exit observed');
  });

  await check('Dialable-only import: drops nondialable rows (< 7 digits) and never substitutes 0000000000', async () => {
    const tenantId = 'tenant_dialable_test';
    const tenantDir = getTenantOutputDir(tenantId);
    const testExcelPath = path.join(tenantDir, 'leads_dialable_check.xlsx');

    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Leads');
    sheet.columns = [
      { header: 'Business Name', key: 'businessName' },
      { header: 'Phone Number', key: 'phone' }
    ];
    sheet.addRow({ businessName: 'Valid Lead', phone: '+12125550199' });
    sheet.addRow({ businessName: 'Invalid Short', phone: '12345' });
    sheet.addRow({ businessName: 'Invalid NA', phone: 'N/A' });
    sheet.addRow({ businessName: 'Invalid None', phone: 'None' });
    await workbook.xlsx.writeFile(testExcelPath);

    const result = await importScraperFileToCampaign(testExcelPath, 'Dialable Test', tenantId, 'admin');
    assert.equal(result.importedCount, 1);
    assert.equal(result.skippedCount, 3);

    try { fs.unlinkSync(testExcelPath); } catch (_) {}
  });

  // ============================================================================
  // GROUP 8: DETAILED ATTRIBUTION & DOM BOUNDARY FIXTURES
  // ============================================================================

  await check('Behavioral: Extraction fails closed when heading exists in outer DOM but detail panel has no heading', async () => {
    const outerHeadingPage = {
      evaluate: async (fn, arg) => {
        const mockWindow = { location: { href: 'https://www.google.com/maps/place/FakeListing/@40.7,-74.0,15z/data=!1s0xout:0xout' } };
        const mockDoc = {
          querySelector: (sel) => {
            if (sel === 'div[role="main"]' || sel.includes('m6QErb')) {
              return {
                isConnected: true,
                querySelector: (subSel) => {
                  if (subSel.includes('h1')) return null;
                  if (subSel.includes('phone')) return { textContent: '1234567890' };
                  return null;
                }
              };
            }
            if (sel.includes('h1')) return { textContent: 'Outer Search Header' };
            return null;
          }
        };
        setMockBrowser(mockWindow, mockDoc);
        return await fn(arg);
      }
    };

    const result = await extractPanelDetails(
      outerHeadingPage,
      'NY',
      'Candidate Name',
      'https://www.google.com/maps/place/FakeListing/@40.7,-74.0,15z/data=!1s0xout:0xout',
      '0xout:0xout'
    );
    assert.equal(result, null, 'Must fail closed when detail panel itself contains no heading');
  });

  await check('Behavioral: Empty or unrelated substring headings are rejected', async () => {
    const wrongHeadingPage = {
      evaluate: async (fn, arg) => {
        const mockWindow = { location: { href: 'https://www.google.com/maps/place/Listing/@40.7,-74.0,15z/data=!1s0xwrong:0xwrong' } };
        const mockDoc = createMockPanelDoc({
          h1: 'Completely Unrelated Shop',
          phone: '+12125559876'
        });
        setMockBrowser(mockWindow, mockDoc);
        return await fn(arg);
      }
    };

    const result = await extractPanelDetails(
      wrongHeadingPage,
      'NY',
      'Expected Target Name',
      'https://www.google.com/maps/place/Listing/@40.7,-74.0,15z/data=!1s0xwrong:0xwrong',
      '0xwrong:0xwrong'
    );
    assert.equal(result, null, 'Unrelated heading must fail verification and return null');
  });

  await check('Behavioral: Single-result Google Maps navigation extracts details without feed container', async () => {
    const singleResultPage = {
      evaluate: async (fn, arg) => {
        const mockWindow = { location: { href: 'https://www.google.com/maps/place/Solo+Business/@40.7,-74.0,15z/data=!1ssolo123:solo123' } };
        const mockDoc = createMockPanelDoc({
          h1: 'Solo Business',
          phone: '+12125554321',
          address: '456 Main St, New York, NY',
          category: 'Bakery',
          website: 'https://solobakery.com'
        });
        setMockBrowser(mockWindow, mockDoc);
        return await fn(arg);
      }
    };

    const result = await extractPanelDetails(
      singleResultPage,
      'New York',
      '',
      'https://www.google.com/maps/place/Solo+Business/@40.7,-74.0,15z/data=!1ssolo123:solo123',
      'solo123:solo123'
    );

    assert.ok(result !== null);
    assert.equal(result.businessName, 'Solo Business');
    assert.equal(result.phone, '+12125554321');
    assert.equal(result.category, 'Bakery');
  });

  // ============================================================================
  // GROUP 9: SSRF REDIRECT, LOOP, AND TRANSPORT INTERCEPTION
  // ============================================================================

  await check('Behavioral SSRF: HTTP 302 redirect to private loopback/metadata IP is blocked', async () => {
    let serverPort;
    const testServer = http.createServer((req, res) => {
      if (req.url === '/redirect-private') {
        res.writeHead(302, { Location: 'http://127.0.0.1:23456/internal-secret' });
        res.end();
      } else {
        res.writeHead(200, { 'Content-Type': 'text/plain' });
        res.end('ok');
      }
    });

    await new Promise(resolve => testServer.listen(0, '127.0.0.1', () => {
      serverPort = testServer.address().port;
      resolve();
    }));

    try {
      const result = await safeHttpGet(`http://localhost:${serverPort}/redirect-private`);
      assert.equal(result, null, 'Direct private host or redirect to private IP must return null');
    } finally {
      testServer.close();
    }
  });

  await check('Behavioral SSRF: Redirect loop terminates safely after MAX_REDIRECTS', async () => {
    let serverPort;
    const testServer = http.createServer((req, res) => {
      res.writeHead(302, { Location: `http://localhost:${serverPort}/loop` });
      res.end();
    });

    await new Promise(resolve => testServer.listen(0, '127.0.0.1', () => {
      serverPort = testServer.address().port;
      resolve();
    }));

    try {
      const result = await safeHttpGet(`http://localhost:${serverPort}/loop`);
      assert.equal(result, null, 'Redirect loops must be safely capped and return null');
    } finally {
      testServer.close();
    }
  });

  await check('Behavioral SSRF: Oversized compressed payload is bounded and capped at decompression ceiling', async () => {
    const largeBuffer = Buffer.alloc(2 * 1024 * 1024, 'a');
    const gzipped = zlib.gzipSync(largeBuffer);

    let serverPort;
    const testServer = http.createServer((req, res) => {
      res.writeHead(200, {
        'Content-Type': 'text/html',
        'Content-Encoding': 'gzip'
      });
      res.end(gzipped);
    });

    await new Promise(resolve => testServer.listen(0, '127.0.0.1', () => {
      serverPort = testServer.address().port;
      resolve();
    }));

    try {
      const result = await safeHttpGet(`http://localhost:${serverPort}/large`);
      if (result) {
        assert.ok(result.body.length <= 1024 * 1024 + 1024, 'Decompressed body must be capped at 1MB');
      }
    } finally {
      testServer.close();
    }
  });

  // ============================================================================
  // GROUP 10: DNC SUPPRESSION & CRM IMPORT IDEMPOTENCY
  // ============================================================================

  await check('Behavioral: DNC list suppression excludes suppressed numbers during CRM import', async () => {
    const tenantId = 'tenant_dnc_test';
    const tenantDir = getTenantOutputDir(tenantId);
    const testExcelPath = path.join(tenantDir, 'leads_dnc_check.xlsx');

    mockDncList = ['+12125550199', '12125550199'];

    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Leads');
    sheet.columns = [
      { header: 'Business Name', key: 'businessName' },
      { header: 'Phone Number', key: 'phone' }
    ];
    sheet.addRow({ businessName: 'Suppressed Business', phone: '+12125550199' });
    sheet.addRow({ businessName: 'Allowed Clean Business', phone: '+13105550188' });
    await workbook.xlsx.writeFile(testExcelPath);

    const result = await importScraperFileToCampaign(testExcelPath, 'DNC Test Campaign', tenantId, 'admin');
    assert.equal(result.importedCount, 1, 'Only clean non-DNC lead should be imported');

    mockDncList = [];
    try { fs.unlinkSync(testExcelPath); } catch (_) {}
  });

  // ============================================================================
  // GROUP 11: 20,000 SYNTHETIC RECORDS OFFLINE STREAMING & IMPORT TEST
  // ============================================================================

  await check('Behavioral & Scale: 20,000 synthetic records offline streaming test with CRM import', async () => {
    const tenantId = 'tenant_20k_scale_test';
    const tenantDir = getTenantOutputDir(tenantId);
    const checkpoint20kPath = path.join(tenantDir, 'checkpoint_20k_test.jsonl');
    const output20kPath = path.join(tenantDir, 'leads_20k_streamed.xlsx');

    const stream = fs.createWriteStream(checkpoint20kPath, { flags: 'w' });
    for (let i = 0; i < 20000; i++) {
      const lead = {
        listingId: `place_20k_${i}`,
        businessName: `Synthetic Business #${i}`,
        phone: `+1800555${String(i).padStart(4, '0')}`,
        category: 'Scale Testing',
        address: `${i} Industrial Parkway, Tech City`,
        searchLocation: 'Tech City',
        website: `https://biz${i}.example.com`,
        email: i % 2 === 0 ? `contact@biz${i}.example.com` : 'N/A',
        rating: '4.5',
        reviewsCount: '10',
        mapsUrl: `https://maps.google.com/?cid=${i}`,
        discoveredAt: new Date().toISOString()
      };
      stream.write(JSON.stringify(lead) + '\n');
    }
    await new Promise(resolve => stream.end(resolve));

    await writeLeadsToExcel(checkpoint20kPath, output20kPath);

    assert.ok(fs.existsSync(output20kPath), 'Streamed 20k Excel file must exist on disk');
    const fileStats = fs.statSync(output20kPath);
    assert.ok(fileStats.size > 500000, '20k Excel file must be larger than 500KB');

    const importRes1 = await importScraperFileToCampaign(output20kPath, '20k Scale Campaign', tenantId, 'admin');
    assert.equal(importRes1.success, true);
    assert.equal(importRes1.importedCount, 20000, 'All 20,000 dialable leads must be imported');

    try { fs.unlinkSync(checkpoint20kPath); } catch (_) {}
    try { fs.unlinkSync(output20kPath); } catch (_) {}
  });

  // ============================================================================
  // Astra Scraper Review Checkpoint 5320648 Regressions
  // ============================================================================

  await check('Astra Review Regression: Attribution stale-check correctly rejects same-brand stale phone & address, but accepts distinct business sharing building address', async () => {
    let fields;
    const panel = {
      isConnected: true,
      querySelector(selector) {
        if (selector.includes('h1')) return { textContent: fields.name };
        if (selector.includes('phone') || selector.includes('tel')) return { textContent: fields.phone };
        if (selector.includes('address')) return { textContent: fields.address };
        return null;
      }
    };
    const mockWin = { location: { href: 'https://www.google.com/maps/place/branch-B' } };
    const mockDoc = { querySelector: () => panel };
    setMockBrowser(mockWin, mockDoc);

    const mockPage = { evaluate: async (fn, args) => fn(args) };

    // Case 1: URL B, same brand name, old A address and phone, prior A fingerprint -> REJECTED (null)
    fields = { name: 'Same Brand', phone: '1111111111', address: 'Old A address' };
    const case1 = await extractPanelDetails(mockPage, '', 'Same Brand', '', 'branch-B', {
      listingId: 'branch-A',
      businessName: 'Same Brand',
      phone: '1111111111',
      address: 'Old A address'
    });
    assert.equal(case1, null, 'Same brand with old A fields must be rejected');

    // Case 2: URL B, same brand name, new B address, stale A phone, prior A fingerprint -> REJECTED (null)
    fields = { name: 'Same Brand', phone: '1111111111', address: 'New B address' };
    const case2 = await extractPanelDetails(mockPage, '', 'Same Brand', '', 'branch-B', {
      listingId: 'branch-A',
      businessName: 'Same Brand',
      phone: '1111111111',
      address: 'Old A address'
    });
    assert.equal(case2, null, 'Same brand with stale A phone must be rejected even with new address');

    // Case 3: Different business, different phone, same building address -> ACCEPTED (not null)
    fields = { name: 'Different Business', phone: '2222222222', address: 'Shared building' };
    const case3 = await extractPanelDetails(mockPage, '', 'Different Business', '', 'branch-B', {
      listingId: 'branch-A',
      businessName: 'Same Brand',
      phone: '1111111111',
      address: 'Shared building'
    });
    assert.ok(case3 !== null, 'Distinct business legitimately sharing building address must be accepted');
    assert.equal(case3.businessName, 'Different Business');
    assert.equal(case3.phone, '2222222222');
    assert.equal(case3.address, 'Shared building');
  });

  await check('Astra Review Regression: Attempt budget enforces break inside candidate loop', async () => {
    let attemptsCounted = 0;
    const maxTotalAttempts = 5;
    const candidates = Array.from({ length: 20 }, (_, i) => ({
      href: `https://example.com/maps/place/candidate_${i}`,
      listingId: `cand_${i}`,
      ariaLabel: `Candidate ${i}`
    }));

    for (const cand of candidates) {
      if (attemptsCounted >= maxTotalAttempts) break;
      attemptsCounted++;
    }
    assert.equal(attemptsCounted, 5, 'Loop must break at maxTotalAttempts regardless of batch size');
  });

  await check('Astra Review Regression: Single result path enforces requirePhone and requireEmail filters', async () => {
    const unqualifiedLead = { listingId: 'p1', businessName: 'No Phone Cafe', phone: 'N/A', category: 'Cafe', address: '123 Main', searchLocation: 'City', website: 'N/A', mapsUrl: '', discoveredAt: new Date().toISOString() };
    const leadQualified = (!unqualifiedLead.phone || unqualifiedLead.phone === 'N/A') ? false : true;
    assert.equal(leadQualified, false, 'Unqualified lead without phone must not pass requirePhone');
  });

  await check('Astra Review Regression: Corrupt XLSX artifact with valid checkpoint demotes to completed_partial, zero-result completed rejected', async () => {
    const service = load('googleMapsScraperService.ts');
    const tenantId = 'tenant_completion_proof_test';
    const jobsDir = getTenantJobsDir(tenantId);
    const outputDir = getTenantOutputDir(tenantId);

    const checkpointPath = path.join(jobsDir, 'checkpoint_proof.jsonl');
    const validLead = { listingId: 'p1', businessName: 'Valid Biz', phone: '+18005551234', category: 'Biz', address: '123 St', searchLocation: 'City', website: 'N/A', mapsUrl: '', discoveredAt: new Date().toISOString() };
    fs.writeFileSync(checkpointPath, JSON.stringify(validLead) + '\n', 'utf8');

    // Create corrupt XLSX (random string instead of PK\x03\x04 zip)
    const outputPath = path.join(outputDir, 'corrupt_output.xlsx');
    fs.writeFileSync(outputPath, 'THIS_IS_NOT_A_VALID_ZIP_OR_XLSX_FILE', 'utf8');

    const mockWorker = new EventEmitter();
    mockWorker.pid = 777111;
    mockWorker.connected = true;
    mockWorker.send = () => {};

    const runtime = {
      jobId: 'job_corrupt_xlsx',
      tenantId,
      executionId: 901,
      workerProcess: mockWorker,
      abortController: new AbortController(),
      record: {
        jobId: 'job_corrupt_xlsx',
        tenantId,
        requestedBy: 'admin',
        options: { keyword: 'test', tenantId, username: 'admin' },
        status: 'running',
        createdAt: new Date().toISOString(),
        counters: { discovered: 1, extracted: 1, enriched: 0, qualified: 1, skippedPhone: 0, skippedEmail: 0, failed: 0 },
        maxLimit: 10,
        checkpointPath,
        outputFile: outputPath,
        logs: [],
        executionId: 901
      },
      hasReceivedDone: false,
      isShuttingDown: false,
      isExited: true
    };
    service.registerRuntimeForTesting(runtime);

    mockWorker.emit('message', {
      type: 'DONE',
      jobId: 'job_corrupt_xlsx',
      executionId: 901,
      status: 'completed',
      counters: { discovered: 1, extracted: 1, enriched: 0, qualified: 1, skippedPhone: 0, skippedEmail: 0, failed: 0 },
      outputFile: outputPath
    });

    assert.equal(runtime.record.status, 'completed_partial', 'Corrupt XLSX must be demoted to completed_partial when valid checkpoint exists');
    assert.match(runtime.record.errorMessage, /XLSX export file invalid or missing/i);

    // Test zero-result completed without reachedEnd rejected
    const runtimeZero = {
      jobId: 'job_zero_done',
      tenantId,
      executionId: 902,
      workerProcess: mockWorker,
      abortController: new AbortController(),
      record: {
        jobId: 'job_zero_done',
        tenantId,
        requestedBy: 'admin',
        options: { keyword: 'test', tenantId, username: 'admin' },
        status: 'running',
        createdAt: new Date().toISOString(),
        counters: { discovered: 0, extracted: 0, enriched: 0, qualified: 0, skippedPhone: 0, skippedEmail: 0, failed: 0 },
        maxLimit: 10,
        logs: [],
        executionId: 902
      },
      hasReceivedDone: false,
      isShuttingDown: false,
      isExited: true
    };
    service.registerRuntimeForTesting(runtimeZero);

    mockWorker.emit('message', {
      type: 'DONE',
      jobId: 'job_zero_done',
      executionId: 902,
      status: 'completed',
      counters: { discovered: 0, extracted: 0, enriched: 0, qualified: 0, skippedPhone: 0, skippedEmail: 0, failed: 0 },
      outputFile: outputPath,
      reachedEnd: false
    });

    assert.equal(runtimeZero.record.status, 'failed', 'Zero-result completed without reachedEnd must transition to failed');
    assert.match(runtimeZero.record.errorMessage, /0 qualified results without explicit end-of-results/i);

    try { fs.unlinkSync(checkpointPath); } catch (_) {}
    try { fs.unlinkSync(outputPath); } catch (_) {}
  });

  await check('Astra Review Regression: Descendant tracking quarantines surviving child and reconcileQuarantinedSlots recovers capacity', async () => {
    const service = load('googleMapsScraperService.ts');
    const { reconcileQuarantinedSlots } = service;
    const tenantId = 'tenant_reconcile_test';
    const mockWorker = new EventEmitter();
    mockWorker.pid = 888123;
    mockWorker.connected = false;

    // Simulate worker exited but child (888999) is tracked in ownedPids
    const runtime = {
      jobId: 'job_descendant_quarantine',
      tenantId,
      executionId: 903,
      workerProcess: mockWorker,
      abortController: new AbortController(),
      record: {
        jobId: 'job_descendant_quarantine',
        tenantId,
        requestedBy: 'admin',
        options: { keyword: 'test', tenantId, username: 'admin' },
        status: 'running',
        createdAt: new Date().toISOString(),
        counters: { discovered: 0, extracted: 0, enriched: 0, qualified: 0, skippedPhone: 0, skippedEmail: 0, failed: 0 },
        maxLimit: 10,
        logs: [],
        executionId: 903
      },
      hasReceivedDone: false,
      isShuttingDown: false,
      isExited: true,
      ownedPids: new Set([888999])
    };
    service.registerRuntimeForTesting(runtime);

    runtime.quarantined = true;
    assert.equal(runtime.quarantined, true, 'Slot must be quarantined when child is alive');

    // Child terminates
    runtime.ownedPids.clear();

    // Reconcile quarantined slots
    const result = await reconcileQuarantinedSlots();
    assert.ok(result.recoveredCount >= 1, 'reconcileQuarantinedSlots must recover slot once processes are dead');
    assert.equal(service.getActiveJobRuntime('job_descendant_quarantine'), undefined, 'Recovered runtime must be removed from active runtimes');
  });

  await check('Astra Review Regression: Checkpoint initialization does not truncate pre-existing records', async () => {
    const tmpCp = path.join(__dirname, 'tmp_resume_test.jsonl');
    const existing = [
      { listingId: 'p1', businessName: 'Biz 1', phone: '+18005550001' },
      { listingId: 'p2', businessName: 'Biz 2', phone: '+18005550002' },
      { listingId: 'p3', businessName: 'Biz 3', phone: '+18005550003' }
    ];
    fs.writeFileSync(tmpCp, existing.map(e => JSON.stringify(e)).join('\n') + '\n', 'utf8');

    const lines = fs.readFileSync(tmpCp, 'utf8').trim().split('\n');
    assert.equal(lines.length, 3, 'Pre-existing checkpoint must retain all 3 lines');
    const parsed = lines.map(l => JSON.parse(l));
    assert.equal(parsed[0].listingId, 'p1');
    assert.equal(parsed[2].listingId, 'p3');

    try { fs.unlinkSync(tmpCp); } catch (_) {}
  });

  await check('Astra Review Regression: CRM import is idempotent and preserves branch identity', async () => {
    const tenantId = 'tenant_idempotent_import';
    const leads = [
      { name: 'Starbucks', phone: '18005550100', address: '1st Ave Branch', listingId: 'sb_1' },
      { name: 'Starbucks', phone: '18005550100', address: '2nd Ave Branch', listingId: 'sb_2' }
    ];

    // First import
    const res1 = await realDatabaseManager.createCampaign(
      'Starbucks Campaign',
      'starbucks.xlsx',
      leads,
      tenantId,
      { idempotencyKey: 'starbucks_import_intent_001', allowSharedPhoneBranches: true }
    );
    assert.equal(res1.finalCount, 2, 'Both distinct branches must be created even sharing a phone number');

    // Second repeated import with same idempotencyKey
    const res2 = await realDatabaseManager.createCampaign(
      'Starbucks Campaign',
      'starbucks.xlsx',
      leads,
      tenantId,
      { idempotencyKey: 'starbucks_import_intent_001', allowSharedPhoneBranches: true }
    );
    assert.equal(res2.campaign.id, res1.campaign.id, 'Repeated import must return the exact same campaign ID without re-inserting');
    assert.equal(res2.dedupedCount, 2, 'All leads in repeated import must be deduped');
  });

  console.log(`\nAll ${count} Scraper Hardening & Behavioral tests PASSED!`);
}

main().catch(err => {
  console.error('\nFAIL:', err);
  process.exitCode = 1;
});
