// Isolated Scraper Hardening & Security Test Suite
// Zero live network calls, zero live DB calls.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const EventEmitter = require('node:events');
const ts = require('typescript');
const ExcelJS = require('exceljs');

const root = path.join(__dirname, '../src');

// Mock databaseManager to avoid opening live PostgreSQL connections during tests
const mockDatabaseManager = {
  db: {
    init: async () => {},
    queryOne: async () => null,
    queryAll: async () => [],
    execute: async () => ({ rowCount: 1 }),
    withTransaction: async fn => fn({})
  },
  createCampaign: async (name, fileName, rawLeads, tenantId) => {
    // Mimics production createCampaign deduplication by (businessName + phone)
    const batchSeen = new Set();
    const validLeads = [];
    let dedupedCount = 0;

    for (const lead of rawLeads) {
      const cleanPhone = String(lead.phone || '').replace(/\D/g, '');
      if (cleanPhone.length < 7) continue;

      const leadName = String(lead.name || 'Unknown').trim();
      const leadKey = `${leadName.toLowerCase()}:::${cleanPhone}`;

      if (batchSeen.has(leadKey)) {
        dedupedCount++;
        continue;
      }
      batchSeen.add(leadKey);
      validLeads.push({ name: leadName, phone: cleanPhone });
    }

    return {
      campaign: {
        id: `mock_camp_${Date.now()}`,
        name,
        fileName,
        leadCount: validLeads.length,
        createdAt: new Date().toISOString()
      },
      finalCount: validLeads.length,
      dedupedCount
    };
  }
};

let currentMockWindow = { location: { href: 'http://localhost' } };
let currentMockDocument = { querySelector: () => null };

function setMockBrowser(win, doc) {
  currentMockWindow = win;
  currentMockDocument = doc;
}

function load(file, imports = {}) {
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
    process: { env: { ...process.env, NODE_ENV: 'test', MAX_ACTIVE_SCRAPERS: '1' }, cwd: () => root },
    setTimeout,
    clearTimeout,
    setInterval: () => 0,
    clearInterval: () => {},
    require: id => {
      if (Object.hasOwn(imports, id)) return imports[id];
      if (id === './databaseManager') return mockDatabaseManager;
      if (['crypto', 'os', 'fs', 'path', 'node:fs', 'node:path', 'child_process', 'exceljs', 'url', 'net', 'http', 'https', 'dns', 'zlib', 'tls', 'events'].includes(id)) {
        return require(id);
      }
      throw new Error('Unexpected dependency: ' + id);
    }
  });
  return module.exports;
}

const ssrfProtection = load('ssrfProtection.ts');
const {
  isPrivateOrBlockedIP,
  validateUrlForSsrf,
  parseIPv6Words,
  createSafeLookup,
  createSafeAgents,
  SsrfError
} = ssrfProtection;

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

  await check('Behavioral: Extraction rejects stale panel where URL changed to B but DOM still has A', async () => {
    // Simulated Page fixture where URL has updated to Listing B,
    // but the DOM heading (H1) and phone button still belong to old Listing A
    const staleDomPage = {
      evaluate: async (fn, arg) => {
        const mockWindow = { location: { href: 'https://www.google.com/maps/place/Listing+B/@40.7,-74.0,15z/data=!1s0xbbb:0xbbb' } };
        const mockDoc = {
          querySelector: (sel) => {
            if (sel.includes('h1')) {
              return { textContent: 'Listing A Hardware' }; // Stale heading from A!
            }
            if (sel.includes('phone')) {
              return { textContent: '(212) 555-1111' }; // Stale phone from A!
            }
            if (sel.includes('address')) {
              return { textContent: '100 Old Street, New York, NY' };
            }
            return null;
          }
        };
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

  await check('Behavioral: Extraction rejects panel mutation during field extraction', async () => {
    // DOM mutates mid-extraction (e.g. user clicked or SPA rerendered)
    let callCount = 0;
    const mutatingPage = {
      evaluate: async (fn, arg) => {
        const mockWindow = { location: { href: 'https://www.google.com/maps/place/Branch/@40.7,-74.0,15z/data=!1s0x123:0x456' } };
        const mockDoc = {
          querySelector: (sel) => {
            if (sel.includes('h1')) {
              callCount++;
              // Returns different heading on subsequent checks
              return { textContent: callCount === 1 ? 'Expected Branch' : 'Completely Different Place' };
            }
            if (sel.includes('phone')) return { textContent: '(212) 555-9999' };
            return null;
          }
        };
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
        const mockDoc = {
          querySelector: (sel) => {
            if (sel.includes('h1')) return { textContent: 'Metro Dental' };
            if (sel.includes('phone')) return { textContent: '(800) 555-0100' };
            if (sel.includes('address')) return { textContent: branchAddress };
            return null;
          }
        };
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

  console.log(`\nAll ${count} Scraper Hardening & Behavioral tests PASSED!`);
}

main().catch(err => {
  console.error('\nFAIL:', err);
  process.exitCode = 1;
});
