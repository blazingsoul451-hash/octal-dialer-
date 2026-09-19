const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const vm = require('node:vm');
const { EventEmitter } = require('node:events');
const ts = require('typescript');
const ExcelJS = require('exceljs');
const root = path.join(__dirname, '../src');
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'octal-contract-'));
const children = [];
function load(file, imports) {
  const js = ts.transpileModule(fs.readFileSync(path.join(root, file), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true }
  }).outputText;
  const module = { exports: {} };
  vm.runInNewContext(js, { module, exports: module.exports, __dirname: path.join(temp, 'src'),
    Buffer, AbortController, console, setTimeout, clearTimeout, setInterval: () => 0, clearInterval() {},
    process: { env: { NODE_ENV: 'test' }, platform: process.platform, kill() { throw { code: 'ESRCH' }; } },
    require: id => Object.hasOwn(imports, id) ? imports[id] : require(id) });
  return module.exports;
}
const service = load('googleMapsScraperService.ts', {
  './databaseManager': {}, exceljs: ExcelJS,
  child_process: { fork() {
    const worker = new EventEmitter();
    worker.connected = true;
    worker.send = msg => { worker.lastMessage = msg; };
    worker.kill = () => { worker.emit('exit', 0, null); return true; };
    children.push(worker);
    return worker;
  } }
});
const routeModule = load('scraperRoutes.ts', { './googleMapsScraperService': service });
const routes = new Map();
const events = [];
const io = { to(tenant) { return { emit: (event, data) => events.push({ tenant, event, data }) }; } };
routeModule.registerScraperRoutes({
  get: (url, ...handlers) => routes.set('GET ' + url, handlers),
  post: (url, ...handlers) => routes.set('POST ' + url, handlers)
}, (req, res, next) => req.user ? next() : res.status(401).json({ error: 'Unauthorized' }), io, service);
async function request(method, url, body = {}, tenantId = 'tenant-a', query = {}, params = {}) {
  const req = { body, query, params, user: tenantId === null ? undefined : { tenantId, username: 'tester' } };
  const res = { code: 200, done: false, status(code) { this.code = code; return this; },
    json(body) { this.body = body; this.done = true; }, download(file) { this.file = file; this.done = true; } };
  for (const handler of routes.get(method + ' ' + url)) {
    if (res.done) break;
    await handler(req, res, () => {});
  }
  return res;
}
async function main() {
  assert.equal((await request('GET', '/api/scraper/status', {}, null)).code, 401);
  assert.equal((await request('GET', '/api/scraper/status', {}, '')).code, 401);
  assert.equal((await request('GET', '/api/scraper/status')).body.status, 'idle');
  assert.equal((await request('POST', '/api/scraper/run', { keyword: 4 })).code, 400);
  const start = await request('POST', '/api/scraper/run', { keyword: 'Dentists', requireEmail: true });
  assert.equal(start.code, 202);
  assert.equal(start.body.status, 'running');
  const jobId = start.body.jobId;
  const worker = children[0];
  assert.equal(worker.lastMessage.options.tenantId, 'tenant-a');
  assert.equal(worker.lastMessage.options.enrichWebsite, true);
  assert.equal(events.some(e => e.event === 'scraper:completed'), false);
  const record = service.getTenantScraperStatus('tenant-a', jobId);
  assert.equal(record.outputFile, worker.lastMessage.outputPath);
  assert.equal(record.checkpointPath, worker.lastMessage.checkpointPath);
  assert.equal((await request('GET', '/api/scraper/status', {}, 'tenant-b', { jobId })).code, 404);
  assert.equal((await request('POST', '/api/scraper/stop', { jobId }, 'tenant-b')).code, 403);
  assert.equal((await request('GET', '/api/scraper/status', {}, 'tenant-a', { jobId: 'unknown' })).code, 404);

  const first = await request('POST', '/api/scraper/run', { keyword: 'Same' }, 'tenant-b');
  const second = await request('POST', '/api/scraper/run', { keyword: 'Same' }, 'tenant-b');
  assert.equal(first.body.status, 'queued');
  assert.equal(second.body.status, 'queued');
  assert.equal((await request('POST', '/api/scraper/stop', { jobId: second.body.jobId }, 'tenant-b')).code, 200);
  assert.equal(service.getTenantScraperStatus('tenant-b', first.body.jobId).status, 'queued');
  assert.equal(service.getTenantScraperStatus('tenant-b', second.body.jobId).status, 'stopped');
  const runtime = service.getActiveJobRuntime(jobId);
  runtime.isExited = true;
  await request('POST', '/api/scraper/stop', { jobId });
  assert.equal(children[1].lastMessage.jobId, first.body.jobId);

  const foreign = path.join(service.getTenantOutputDir('tenant-b'), 'foreign.xlsx');
  fs.writeFileSync(foreign, 'not an export');
  const denied = await request('POST', '/api/scraper-files/import', { filePath: foreign });
  assert.equal(denied.code, 403);
  assert.equal((await request('GET', '/api/scraper-files')).body.length, 0);
  const missing = await request('GET', '/api/scraper-files/download/:filename', {}, 'tenant-a', {}, { filename: 'foreign.xlsx' });
  assert.equal(missing.code, 404);
  assert.throws(() => service.getTenantOutputDir('../tenant-b'), /Unauthorized/);
  console.log('PASS scraper API authentication, tenant isolation, options, job contract, artifact paths, duplicate-keyword queue identity, exact cancellation, and file isolation');
}
main().catch(err => { console.error(err); process.exitCode = 1; }).finally(() => fs.rmSync(temp, { recursive: true, force: true }));
