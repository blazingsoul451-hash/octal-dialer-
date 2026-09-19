const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const { createRequire } = require('node:module');
const backendRequire = createRequire(path.resolve('../backend/package.json'));
const { chromium } = backendRequire('playwright');

(async () => {
  const { createServer } = await import('vite');
  const config = require('../scripts/vite-local.cjs')();
  const server = await createServer({ ...config, server: { host: '127.0.0.1', port: 0 } });
  let browser;
  try {
    await server.listen();
    const base = `http://127.0.0.1:${server.httpServer.address().port}`;
    browser = await chromium.launch({ headless: true });
    for (const width of [1280, 390]) {
      const page = await browser.newPage({ viewport: { width, height: 900 } });
      const errors = [];
      page.on('pageerror', err => errors.push(err.message));
      let job = { status: 'idle', logs: [] };
      let started = false;
      let downloaded = false;
      let imported = false;
      await page.route('**/api/**', async route => {
        const request = route.request();
        assert.equal(request.headers().authorization, 'Bearer fixture-token');
        const url = new URL(request.url());
        let body;
        if (url.pathname === '/api/scraper/status') body = job;
        else if (url.pathname === '/api/scraper/run') {
          const options = request.postDataJSON();
          assert.equal(options.enrichWebsite, true);
          assert.equal(options.requireEmail, true);
          started = true;
          job = { jobId: 'fixture-job', status: 'running', logs: ['Started'] };
          body = { success: true, ...job };
        } else if (url.pathname === '/api/scraper/stop') {
          assert.equal(request.postDataJSON().jobId, 'fixture-job');
          job = { ...job, status: 'stopped' };
          body = { success: true, ...job };
        } else if (url.pathname.includes('/download/')) {
          downloaded = true;
          await route.fulfill({ body: 'fixture', contentType: 'application/octet-stream' });
          return;
        } else if (url.pathname === '/api/scraper-files/import') {
          imported = true;
          assert.equal(request.postDataJSON().filePath, '/owned/leads.xlsx');
          body = { success: true, count: 2, name: 'Fixture campaign' };
        } else if (url.pathname === '/api/scraper-files') {
          body = [{ name: 'leads.xlsx', path: '/owned/leads.xlsx', sizeBytes: 2048, lastModified: new Date().toISOString() }];
        } else throw new Error(`Unexpected request: ${url.pathname}`);
        await route.fulfill({ json: body });
      });
      await page.goto(base + '/tests/scraper.html');
      await page.getByLabel('Enrich Websites (Emails & Socials)').check();
      await page.getByLabel('Require Email Address').check();
      await page.locator('button[type="submit"]').click();
      await page.getByText('Job ID: fixture-job').waitFor();
      assert.equal(started, true);
      await page.getByRole('button', { name: /stop/i }).click();
      await page.getByText('STOPPED', { exact: false }).first().waitFor();
      const download = page.waitForEvent('download');
      await page.getByTitle('Download Excel Sheet').click();
      await download;
      assert.equal(downloaded, true);
      await page.getByText('leads.xlsx', { exact: true }).click();
      await page.getByRole('button', { name: 'Import to Dialer Queue' }).click();
      await page.waitForFunction(() => document.title === 'Fixture campaign:2');
      assert.equal(imported, true);
      assert.deepEqual(errors, []);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true);
      fs.mkdirSync('.build-cache/screenshots', { recursive: true });
      await page.screenshot({ path: `.build-cache/screenshots/scraper-${width}.png`, fullPage: true });
      await page.close();
    }
    console.log('PASS desktop/mobile scraper UI: enrichment, job tracking, stop, authenticated download, import, no runtime errors/overflow');
  } finally {
    await browser?.close();
    await server.close();
  }
})().catch(err => { console.error(err); process.exitCode = 1; });
