import { chromium, Browser, Page } from 'playwright';
import ExcelJS from 'exceljs';
import fs from 'fs';
import path from 'path';
import {
  ScraperJobOptions,
  ScrapedLead,
  ScraperJobCounters,
  WorkerParentMessage,
  WorkerChildMessage
} from './scraperTypes';
import { enrichCompanyWebsite } from './websiteEnricher';

declare const document: any;
declare const window: any;

let isStopRequested = false;
let activeBrowser: Browser | null = null;
let currentJobId = '';
let currentExecutionId = 0;

function sendToParent(msg: WorkerChildMessage) {
  if (process.send) {
    process.send(msg);
  }
}

function log(msg: string) {
  const timestamp = new Date().toLocaleTimeString();
  const formatted = `[${timestamp}] ${msg}`;
  console.log(`[ScraperWorker] ${formatted}`);
  sendToParent({
    type: 'LOG',
    jobId: currentJobId,
    executionId: currentExecutionId,
    message: formatted
  });
}

export function sanitizeSpreadsheetValue(val: any): any {
  if (typeof val !== 'string') return val;
  const trimmed = val.trim();
  // Protect against CSV/Excel formula injection (=, +, -, @, \t, \r)
  if (/^[=+\-@\t\r]/.test(val) || /^[=+\-@\t\r]/.test(trimmed)) {
    // Preserve valid E.164 phone numbers like +1234567890
    if (/^\+\d[\d\s\-()]{6,20}$/.test(trimmed)) {
      return trimmed;
    }
    return `'${val}`;
  }
  return val;
}

export async function writeLeadsToExcel(leads: ScrapedLead[], targetPath: string): Promise<void> {
  const dir = path.dirname(targetPath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  const tmpPath = `${targetPath}.tmp_${Date.now()}`;
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet('Scraped Leads', {
    views: [{ state: 'frozen', ySplit: 1 }]
  });

  worksheet.columns = [
    { header: 'Business Name', key: 'businessName', width: 35 },
    { header: 'Phone Number', key: 'phone', width: 22 },
    { header: 'Category', key: 'category', width: 25 },
    { header: 'Address', key: 'address', width: 45 },
    { header: 'Search Location', key: 'searchLocation', width: 20 },
    { header: 'Website', key: 'website', width: 30 },
    { header: 'Email', key: 'email', width: 30 },
    { header: 'Rating', key: 'rating', width: 10 },
    { header: 'Reviews Count', key: 'reviewsCount', width: 15 },
    { header: 'Maps URL', key: 'mapsUrl', width: 50 },
    { header: 'Discovered At', key: 'discoveredAt', width: 24 }
  ];

  worksheet.getRow(1).font = { name: 'Segoe UI', size: 11, bold: true, color: { argb: 'FFFFFFFF' } };
  worksheet.getRow(1).fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FFD97706' } // Amber-600
  };
  worksheet.getRow(1).alignment = { vertical: 'middle', horizontal: 'center' };

  for (const lead of leads) {
    worksheet.addRow({
      businessName: sanitizeSpreadsheetValue(lead.businessName),
      phone: sanitizeSpreadsheetValue(lead.phone),
      category: sanitizeSpreadsheetValue(lead.category),
      address: sanitizeSpreadsheetValue(lead.address),
      searchLocation: sanitizeSpreadsheetValue(lead.searchLocation),
      website: sanitizeSpreadsheetValue(lead.website),
      email: sanitizeSpreadsheetValue(lead.email || 'N/A'),
      rating: sanitizeSpreadsheetValue(lead.rating || 'N/A'),
      reviewsCount: sanitizeSpreadsheetValue(lead.reviewsCount || '0'),
      mapsUrl: sanitizeSpreadsheetValue(lead.mapsUrl),
      discoveredAt: sanitizeSpreadsheetValue(lead.discoveredAt)
    });
  }

  await workbook.xlsx.writeFile(tmpPath);
  // Atomic rename to publish completed file
  fs.renameSync(tmpPath, targetPath);
}

export function extractListingId(url: string): string {
  if (!url) return '';
  // Try extracting hex place ID (!1s0x...:0x...)
  const hexMatch = url.match(/!1s(0x[0-9a-f]+:(?:0x)?[0-9a-f]+)/i);
  if (hexMatch && hexMatch[1]) return hexMatch[1];

  // Try extracting place path segment: /maps/place/Name/@lat,lng...
  const placeMatch = url.match(/\/place\/([^/@?]+)/);
  if (placeMatch && placeMatch[1]) return decodeURIComponent(placeMatch[1].replace(/\+/g, ' '));

  return url.split('?')[0];
}

async function cancelableSleep(ms: number): Promise<boolean> {
  const step = 100;
  let elapsed = 0;
  while (elapsed < ms) {
    if (isStopRequested) return false;
    await new Promise(r => setTimeout(r, Math.min(step, ms - elapsed)));
    elapsed += step;
  }
  return true;
}

export async function executeScraperRun(
  jobId: string,
  executionId: number,
  options: ScraperJobOptions,
  checkpointPath: string,
  outputPath: string
): Promise<void> {
  currentJobId = jobId;
  currentExecutionId = executionId;
  isStopRequested = false;

  const { keyword, location = '', maxLeads = 50, requirePhone = false, requireEmail = false, enrichWebsite = false } = options;
  const targetLimit = Math.max(1, Math.min(maxLeads, 1000));
  const query = location ? `${keyword} in ${location}` : keyword;

  const counters: ScraperJobCounters = {
    discovered: 0,
    extracted: 0,
    enriched: 0,
    skippedPhone: 0,
    skippedEmail: 0,
    failed: 0
  };

  const leads: ScrapedLead[] = [];
  const seenListingIds = new Set<string>();

  // Ensure directories exist
  const outputDir = path.dirname(outputPath);
  if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });

  const checkpointDir = path.dirname(checkpointPath);
  if (!fs.existsSync(checkpointDir)) fs.mkdirSync(checkpointDir, { recursive: true });

  // Initialize empty checkpoint log
  fs.writeFileSync(checkpointPath, '', 'utf8');

  log(`🚀 Starting Google Maps scraper worker for: "${query}" (Target: ${targetLimit})`);

  try {
    activeBrowser = await chromium.launch({
      headless: true,
      args: [
        '--disable-blink-features=AutomationControlled',
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-accelerated-2d-canvas',
        '--no-first-run',
        '--no-zygote',
        '--disable-gpu'
      ]
    });

    const context = await activeBrowser.newContext({
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
      viewport: { width: 1280, height: 800 },
      locale: 'en-US'
    });

    const page = await context.newPage();
    page.setDefaultNavigationTimeout(30000);
    page.setDefaultTimeout(15000);

    // Block heavy fonts and media to save memory, while preserving scripts and XHR
    await page.route('**/*.{png,jpg,jpeg,gif,svg,webp,woff,woff2,ttf,mp4}', route => route.abort());

    const searchUrl = `https://www.google.com/maps/search/${encodeURIComponent(query)}?hl=en`;
    log(`🌐 Navigating to search URL...`);
    await page.goto(searchUrl, { waitUntil: 'domcontentloaded' });

    // 1. Consent dialog check
    try {
      const consentBtn = await page.$('button[aria-label*="Accept all"], form[action*="consent"] button');
      if (consentBtn) {
        await consentBtn.click();
        await cancelableSleep(1000);
      }
    } catch (_) {}

    // 2. Access Challenge / CAPTCHA check
    const currentUrl = page.url();
    const pageText = await page.evaluate(() => document.body?.innerText || '');
    if (
      currentUrl.includes('/sorry/') ||
      pageText.includes('unusual traffic from your computer network') ||
      pageText.includes('Our systems have detected unusual traffic') ||
      (await page.$('iframe[src*="recaptcha"]')) !== null
    ) {
      log('🛑 Google access challenge or CAPTCHA detected.');
      sendToParent({
        type: 'CHALLENGE',
        jobId,
        executionId,
        reason: 'Google access challenge / unusual traffic detected',
        counters
      });
      await activeBrowser.close();
      activeBrowser = null;
      return;
    }

    // 3. Detect result type: single business profile vs. search feed
    let isSingleResult = false;
    try {
      await page.waitForSelector('div[role="feed"], div[role="main"], h1.DUwDvf', { timeout: 10000 });
      const singleH1 = await page.$('h1.DUwDvf');
      const feedExists = await page.$('div[role="feed"]');
      if (singleH1 && !feedExists) {
        isSingleResult = true;
      }
    } catch (e) {
      log('⚠️ Neither feed nor profile appeared within 10s. Halting gracefully.');
      sendToParent({
        type: 'DONE',
        jobId,
        executionId,
        status: 'completed_partial',
        counters,
        outputFile: outputPath
      });
      await activeBrowser.close();
      activeBrowser = null;
      return;
    }

    // Handle single business result directly
    if (isSingleResult) {
      const singleListingId = extractListingId(page.url());
      const singleLead = await extractPanelDetails(page, location, '', page.url(), singleListingId);
      if (singleLead) {
        counters.discovered = 1;
        counters.extracted = 1;
        leads.push(singleLead);
        fs.appendFileSync(checkpointPath, JSON.stringify(singleLead) + '\n', 'utf8');
        sendToParent({
          type: 'PROGRESS',
          jobId,
          executionId,
          lead: singleLead,
          counters
        });
      }
    } else {
      // Feed iteration loop
      let scrollAttempts = 0;
      const maxScrollAttempts = 30;
      let consecutiveNoProgress = 0;

      while (counters.extracted < targetLimit && scrollAttempts < maxScrollAttempts && !isStopRequested) {
        // Collect plain URLs and identifiers from feed
        const rawPlaceItems = await page.$$eval('a[href*="/maps/place/"]', els =>
          els.map(el => ({
            href: el.getAttribute('href') || '',
            ariaLabel: el.getAttribute('aria-label') || ''
          }))
        );

        let newInThisBatch = 0;
        const candidateItems: { href: string; listingId: string; ariaLabel: string }[] = [];

        for (const item of rawPlaceItems) {
          if (!item.href) continue;
          const lid = extractListingId(item.href);
          if (!lid || seenListingIds.has(lid)) continue;
          seenListingIds.add(lid);
          candidateItems.push({ href: item.href, listingId: lid, ariaLabel: item.ariaLabel });
          newInThisBatch++;
        }

        counters.discovered = seenListingIds.size;
        log(`📊 Feed scan found ${newInThisBatch} new unvisited listings (${seenListingIds.size} total discovered)...`);

        for (const candidate of candidateItems) {
          if (isStopRequested || counters.extracted >= targetLimit) break;

          try {
            // Find specific element by href to avoid stale ElementHandle issues
            const targetLink = await page.$(`a[href="${candidate.href}"]`);
            if (targetLink) {
              await targetLink.scrollIntoViewIfNeeded();
              await targetLink.click({ timeout: 4000 });
            } else {
              // Direct navigation fallback
              await page.goto(candidate.href, { waitUntil: 'domcontentloaded', timeout: 15000 });
            }

            // Intentional pacing sleep (minimum 1,200 ms between listing actions)
            const proceed = await cancelableSleep(1200);
            if (!proceed || isStopRequested) break;

            // Confirm panel identity:
            // 1. URL must reflect candidate listing identity
            // 2. Heading must match candidate ariaLabel (if ariaLabel is present)
            // 3. Reject any stale heading or leftover panel from previous listing
            const isConfirmed = await page.waitForFunction(
              ({ expectedId, expectedName }) => {
                const url = window.location.href;
                const h1 = document.querySelector('h1.DUwDvf, h1[class*="header"], h1')?.textContent?.trim() || '';

                // URL check: URL must contain expectedId
                const urlMatches = expectedId ? url.includes(expectedId) : false;
                if (!urlMatches) return false;

                // Heading check: if expectedName is provided, h1 must match or contain it
                if (expectedName) {
                  const normH1 = h1.toLowerCase();
                  const normName = expectedName.toLowerCase();
                  const nameMatches = normH1.includes(normName) || normName.includes(normH1);
                  if (!nameMatches) return false;
                } else if (!h1) {
                  return false;
                }

                return true;
              },
              { expectedId: candidate.listingId, expectedName: candidate.ariaLabel },
              { timeout: 5000 }
            ).catch(() => false);

            if (!isConfirmed) {
              log(`⚠️ Could not confirm panel readiness/identity for listing: ${candidate.listingId} ("${candidate.ariaLabel}"). Skipping.`);
              counters.failed++;
              continue;
            }

            // Extract fields atomically with double-checked identity verification
            const lead = await extractPanelDetails(page, location, candidate.ariaLabel, candidate.href, candidate.listingId);
            if (!lead || !lead.businessName) {
              log(`⚠️ Panel extraction failed or identity mismatch for: ${candidate.listingId}. Skipping.`);
              counters.failed++;
              continue;
            }

            // Enforce requirePhone
            if (requirePhone && (!lead.phone || lead.phone === 'N/A')) {
              counters.skippedPhone++;
              continue;
            }

            // Optional Website Enrichment (Phase 5)
            if (enrichWebsite && lead.website && lead.website !== 'N/A') {
              log(`🌐 Enriching website contacts for: ${lead.businessName} (${lead.website})`);
              try {
                const enrichment = await enrichCompanyWebsite(lead.website);
                lead.enrichmentStatus = enrichment.status;
                if (enrichment.contactInfo.emails.length > 0) {
                  lead.email = enrichment.contactInfo.emails[0];
                  counters.enriched++;
                }
                lead.socialLinks = enrichment.contactInfo.socialLinks;
              } catch (e: any) {
                lead.enrichmentStatus = 'failed';
              }
            }

            // Enforce requireEmail
            if (requireEmail && (!lead.email || lead.email === 'N/A')) {
              counters.skippedEmail++;
              continue;
            }

            leads.push(lead);
            counters.extracted++;

            // Durable incremental write (Phase 4)
            fs.appendFileSync(checkpointPath, JSON.stringify(lead) + '\n', 'utf8');

            log(`✅ [#${counters.extracted}/${targetLimit}] ${lead.businessName} | 📞 ${lead.phone} | ✉️ ${lead.email || 'None'}`);

            sendToParent({
              type: 'PROGRESS',
              jobId,
              executionId,
              lead,
              counters
            });

          } catch (cardErr: any) {
            counters.failed++;
          }
        }

        // Virtualized Feed Scroll Handling
        if (newInThisBatch === 0) {
          consecutiveNoProgress++;
        } else {
          consecutiveNoProgress = 0;
        }

        // Check for "Reached the end of list"
        const reachedEnd = await page.evaluate(() => {
          const body = document.body?.innerText || '';
          return body.includes("You've reached the end of the list") || body.includes("No more results");
        });

        if (reachedEnd || consecutiveNoProgress >= 5) {
          log('🏁 Reached end of Google Maps results feed.');
          break;
        }

        // Perform scroll
        try {
          const feed = await page.$('div[role="feed"]');
          if (feed) {
            await feed.evaluate(el => el.scrollBy(0, 1500));
          } else {
            await page.mouse.wheel(0, 1500);
          }
          // Intentional pacing sleep (minimum 1,800 ms between scrolls)
          const proceed = await cancelableSleep(1800);
          if (!proceed || isStopRequested) break;
          scrollAttempts++;
        } catch (_) {
          break;
        }
      }
    }

    // Write final Excel file atomically
    if (leads.length > 0) {
      await writeLeadsToExcel(leads, outputPath);
      log(`💾 Saved ${leads.length} validated leads to Excel: ${path.basename(outputPath)}`);
    }

    if (activeBrowser) {
      await activeBrowser.close();
      activeBrowser = null;
    }

    const finalStatus = isStopRequested
      ? 'stopped'
      : (counters.extracted >= targetLimit ? 'completed' : 'completed_partial');

    sendToParent({
      type: 'DONE',
      jobId,
      executionId,
      status: finalStatus,
      counters,
      outputFile: outputPath
    });

  } catch (err: any) {
    log(`❌ Scraper worker exception: ${err.message}`);
    if (activeBrowser) {
      try { await activeBrowser.close(); } catch (_) {}
      activeBrowser = null;
    }
    sendToParent({
      type: 'ERROR',
      jobId,
      executionId,
      error: err.message,
      counters
    });
  }
}

export async function extractPanelDetails(
  page: Page,
  searchLocation: string,
  expectedName: string = '',
  href: string = '',
  listingId: string = ''
): Promise<ScrapedLead | null> {
  return await page.evaluate(({ searchLocation, expectedName, href, listingId }) => {
    // 1. Panel Identity Verification BEFORE reading fields
    const urlBefore = window.location.href;
    const nameElBefore = document.querySelector('h1.DUwDvf, h1[class*="header"], h1');
    const h1Before = (nameElBefore?.textContent || '').trim();

    if (!h1Before) return null;

    // Check URL correlates with expected listing identifier
    if (listingId && !urlBefore.includes(listingId)) {
      return null;
    }

    // Check heading matches expected name (prevents accepting previous listing's panel when URL changed to B but panel still has A)
    if (expectedName) {
      const normH1 = h1Before.toLowerCase();
      const normExp = expectedName.toLowerCase();
      if (!normH1.includes(normExp) && !normExp.includes(normH1)) {
        return null;
      }
    }

    // 2. Phone (Strictly from verified button/anchor nodes, NO full page regex)
    let phone = '';
    const phoneBtn = document.querySelector('button[data-tooltip*="phone" i], button[aria-label*="Phone" i], button[data-item-id*="phone:tel:"]');
    if (phoneBtn) {
      phone = (phoneBtn.textContent || '').replace(/[^0-9+\s\-()]/g, '').trim();
    }
    if (!phone) {
      const telLink = document.querySelector('a[href^="tel:"]');
      if (telLink) {
        phone = (telLink.getAttribute('href') || '').replace('tel:', '').replace(/[^0-9+\s\-()]/g, '').trim();
      }
    }

    // Validate phone has at least 7 dialable digits
    const digitsOnly = phone.replace(/\D/g, '');
    const validPhone = digitsOnly.length >= 7 ? phone : 'N/A';

    // 3. Category
    const catEl = document.querySelector('button.DkEaL, span[class*="category"], button[jsaction*="category"]');
    const category = (catEl?.textContent || '').trim();

    // 4. Address (separate from searchLocation)
    const addressBtn = document.querySelector('button[data-item-id*="address"], button[aria-label*="Address" i]');
    const address = (addressBtn?.textContent || '').trim();

    // 5. Website
    const webBtn = document.querySelector('a[data-item-id*="authority"], a[aria-label*="Website" i]');
    const website = (webBtn?.getAttribute('href') || 'N/A').trim();

    // 6. Rating & Reviews
    const ratingEl = document.querySelector('div.F7nice span[aria-hidden="true"]');
    const rating = (ratingEl?.textContent || 'N/A').trim();

    const reviewsEl = document.querySelector('div.F7nice span[aria-label*="reviews"]');
    const reviewsCount = (reviewsEl?.textContent || '0').replace(/[^0-9]/g, '').trim();

    // 7. Hours
    const hoursEl = document.querySelector('div[aria-label*="Hours"], div[data-item-id*="oh"]');
    const hours = (hoursEl?.textContent || '').slice(0, 100).trim();

    // 8. Panel Identity Verification AFTER reading fields
    const urlAfter = window.location.href;
    const nameElAfter = document.querySelector('h1.DUwDvf, h1[class*="header"], h1');
    const h1After = (nameElAfter?.textContent || '').trim();

    // Abort if panel mutated or changed identity during extraction
    if (urlBefore !== urlAfter || h1Before !== h1After) {
      return null;
    }

    return {
      listingId: listingId || urlAfter,
      businessName: h1Before,
      phone: validPhone,
      rawPhone: phone,
      phoneSource: validPhone !== 'N/A' ? 'maps_button' : undefined,
      category: category || 'Business',
      address: address || 'N/A',
      searchLocation: searchLocation || 'General',
      website: website || 'N/A',
      rating,
      reviewsCount,
      hours,
      mapsUrl: href || urlAfter,
      discoveredAt: new Date().toISOString()
    };
  }, { searchLocation, expectedName, href, listingId });
}

// IPC listener when invoked as forked child process
if (process.send) {
  process.on('message', async (msg: WorkerParentMessage) => {
    if (msg.type === 'START') {
      await executeScraperRun(msg.jobId, msg.executionId, msg.options, msg.checkpointPath, msg.outputPath);
    } else if (msg.type === 'STOP') {
      log('🛑 Stop message received from parent process.');
      isStopRequested = true;
      if (activeBrowser) {
        try { await activeBrowser.close(); } catch (_) {}
        activeBrowser = null;
      }
    }
  });
}
