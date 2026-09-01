import { chromium, Browser, BrowserContext, Page } from 'playwright';
import ExcelJS from 'exceljs';
import fs from 'fs';
import path from 'path';
import { db } from './databaseManager';

export interface ScraperJobOptions {
  keyword: string;
  location?: string;
  maxLeads?: number;
  requirePhone?: boolean;
  requireEmail?: boolean;
  tenantId: string;
  username: string;
}

export interface ScrapedLead {
  businessName: string;
  phone: string;
  address: string;
  website: string;
  rating?: string;
  reviewsCount?: string;
  category?: string;
  mapsUrl: string;
  city?: string;
}

export interface ScraperJobStatus {
  status: 'idle' | 'running' | 'completed' | 'failed';
  keyword: string;
  location: string;
  totalFound: number;
  extractedCount: number;
  maxLimit: number;
  outputFile?: string;
  logs: string[];
  startedAt?: string;
  completedAt?: string;
  error?: string;
}

const OUTPUT_DIR = path.resolve(__dirname, '../data/scraper_output');
if (!fs.existsSync(OUTPUT_DIR)) {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
}

let activeBrowser: Browser | null = null;
let isStopRequested = false;

let activeStatus: ScraperJobStatus = {
  status: 'idle',
  keyword: '',
  location: '',
  totalFound: 0,
  extractedCount: 0,
  maxLimit: 0,
  logs: []
};

function addLog(msg: string) {
  const timestamp = new Date().toLocaleTimeString();
  const entry = `[${timestamp}] ${msg}`;
  activeStatus.logs.push(entry);
  if (activeStatus.logs.length > 500) {
    activeStatus.logs.shift();
  }
  console.log(`[GoogleMapsScraper] ${entry}`);
}

export function getScraperStatus(): ScraperJobStatus {
  return { ...activeStatus };
}

export async function stopScraperJob(): Promise<boolean> {
  if (activeStatus.status !== 'running') return false;
  isStopRequested = true;
  addLog('🛑 Stop requested by user. Closing browser session...');
  if (activeBrowser) {
    try {
      await activeBrowser.close();
    } catch (_) {}
    activeBrowser = null;
  }
  activeStatus.status = 'failed';
  activeStatus.error = 'Stopped by user';
  activeStatus.completedAt = new Date().toISOString();
  return true;
}

export async function runGoogleMapsScraper(
  options: ScraperJobOptions,
  onProgress?: (lead: ScrapedLead, count: number) => void
): Promise<{ success: boolean; count: number; filePath: string; fileName: string }> {
  if (activeStatus.status === 'running') {
    throw new Error('A scraping task is already actively running.');
  }

  const { keyword, location = '', maxLeads = 50, requirePhone = false, tenantId, username } = options;
  const targetLimit = Math.max(1, Math.min(maxLeads, 1000));
  const query = location ? `${keyword} in ${location}` : keyword;

  const safeKeyword = keyword.replace(/[^a-zA-Z0-9]/g, '_').toLowerCase();
  const safeLocation = (location || 'general').replace(/[^a-zA-Z0-9]/g, '_').toLowerCase();
  const timestamp = Date.now();
  const fileName = `leads_${safeKeyword}_${safeLocation}_${timestamp}.xlsx`;
  const filePath = path.join(OUTPUT_DIR, fileName);

  isStopRequested = false;
  activeStatus = {
    status: 'running',
    keyword,
    location,
    totalFound: 0,
    extractedCount: 0,
    maxLimit: targetLimit,
    outputFile: fileName,
    logs: [],
    startedAt: new Date().toISOString()
  };

  addLog(`🚀 Starting Google Maps Lead Extractor for: "${query}"`);
  addLog(`🎯 Target Limit: ${targetLimit} leads | Tenant: ${tenantId}`);

  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet('Scraped Leads');

  worksheet.columns = [
    { header: 'Business Name', key: 'businessName', width: 35 },
    { header: 'Phone Number', key: 'phone', width: 22 },
    { header: 'Category', key: 'category', width: 25 },
    { header: 'Address', key: 'address', width: 45 },
    { header: 'Website', key: 'website', width: 30 },
    { header: 'Rating', key: 'rating', width: 10 },
    { header: 'Reviews Count', key: 'reviewsCount', width: 15 },
    { header: 'City', key: 'city', width: 20 },
    { header: 'Maps URL', key: 'mapsUrl', width: 50 }
  ];

  // Style header row
  worksheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
  worksheet.getRow(1).fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FFD97706' } // Amber-600
  };

  const seenUrls = new Set<string>();
  const seenPhones = new Set<string>();
  let extractedCount = 0;

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
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
      viewport: { width: 1280, height: 800 },
      locale: 'en-US'
    });

    const page = await context.newPage();
    page.setDefaultNavigationTimeout(30000);
    page.setDefaultTimeout(15000);

    const searchUrl = `https://www.google.com/maps/search/${encodeURIComponent(query)}?hl=en`;
    addLog(`🌐 Navigating to Google Maps search...`);
    await page.goto(searchUrl, { waitUntil: 'domcontentloaded' });

    // Handle Google Consent Dialog if present
    try {
      const consentBtn = await page.$('button[aria-label*="Accept all"], form[action*="consent"] button');
      if (consentBtn) {
        await consentBtn.click();
        await page.waitForTimeout(1000);
      }
    } catch (_) {}

    // Wait for feed container
    try {
      await page.waitForSelector('div[role="feed"], div[role="main"]', { timeout: 10000 });
    } catch (e) {
      addLog('⚠️ Search feed did not appear within 10s, inspecting page content...');
    }

    addLog('🔍 Feed detected. Beginning intelligent scrolling & lead extraction...');

    let scrollAttempts = 0;
    const maxScrollAttempts = 30;

    while (extractedCount < targetLimit && scrollAttempts < maxScrollAttempts && !isStopRequested) {
      // Find all place items
      const placeLinks = await page.$$('a[href*="/maps/place/"]');
      addLog(`📊 Feed scan found ${placeLinks.length} potential listings...`);

      for (let i = 0; i < placeLinks.length; i++) {
        if (isStopRequested || extractedCount >= targetLimit) break;

        try {
          const link = placeLinks[i];
          const href = await link.getAttribute('href');
          if (!href || seenUrls.has(href)) continue;
          seenUrls.add(href);

          // Click on the listing to load detail panel
          await link.scrollIntoViewIfNeeded();
          await link.click({ timeout: 4000 });
          await page.waitForTimeout(1200);

          // Extract Details
          let businessName = '';
          const nameEl = await page.$('h1.DUwDvf, h1[class*="header"], h1');
          if (nameEl) {
            businessName = (await nameEl.innerText()).trim();
          }

          if (!businessName) continue;

          // Extract Phone
          let phone = '';
          const phoneBtn = await page.$('button[data-tooltip*="phone" i], button[aria-label*="Phone" i], button[data-item-id*="phone:tel:"]');
          if (phoneBtn) {
            phone = (await phoneBtn.innerText()).replace(/[^0-9+\s\-()]/g, '').trim();
          }

          // Fallback Phone extraction via text content
          if (!phone) {
            const pageText = await page.content();
            const phoneMatch = pageText.match(/(?:\+?\d{1,3}[-.\s]?)?\(?\d{2,4}\)?[-.\s]?\d{3,4}[-.\s]?\d{3,4}/);
            if (phoneMatch && phoneMatch[0].length >= 7) {
              phone = phoneMatch[0].trim();
            }
          }

          if (requirePhone && !phone) {
            continue;
          }

          if (phone && seenPhones.has(phone)) {
            continue; // Deduplicate identical numbers
          }
          if (phone) seenPhones.add(phone);

          // Extract Category
          let category = '';
          const catEl = await page.$('button.DkEaL, span[class*="category"], button[jsaction*="category"]');
          if (catEl) {
            category = (await catEl.innerText()).trim();
          }

          // Extract Address
          let address = '';
          const addressBtn = await page.$('button[data-item-id*="address"], button[aria-label*="Address" i]');
          if (addressBtn) {
            address = (await addressBtn.innerText()).trim();
          }

          // Extract Website
          let website = '';
          const webBtn = await page.$('a[data-item-id*="authority"], a[aria-label*="Website" i]');
          if (webBtn) {
            website = (await webBtn.getAttribute('href')) || '';
          }

          // Extract Rating & Reviews
          let rating = '';
          let reviewsCount = '';
          const ratingEl = await page.$('div.F7nice span[aria-hidden="true"]');
          if (ratingEl) {
            rating = (await ratingEl.innerText()).trim();
          }
          const reviewsEl = await page.$('div.F7nice span[aria-label*="reviews"]');
          if (reviewsEl) {
            reviewsCount = (await reviewsEl.innerText()).replace(/[^0-9]/g, '').trim();
          }

          const lead: ScrapedLead = {
            businessName,
            phone: phone || 'N/A',
            category: category || keyword,
            address: address || location,
            website: website || 'N/A',
            rating: rating || 'N/A',
            reviewsCount: reviewsCount || '0',
            city: location || 'General',
            mapsUrl: href
          };

          worksheet.addRow(lead);
          extractedCount++;
          activeStatus.extractedCount = extractedCount;

          addLog(`✅ [#${extractedCount}/${targetLimit}] ${businessName} | 📞 ${lead.phone} | 📍 ${lead.city}`);
          if (onProgress) onProgress(lead, extractedCount);

        } catch (itemErr: any) {
          // Continue to next listing
        }
      }

      // Scroll the results feed downward
      try {
        const feed = await page.$('div[role="feed"]');
        if (feed) {
          await feed.evaluate(el => el.scrollBy(0, 1500));
        } else {
          await page.mouse.wheel(0, 1500);
        }
        await page.waitForTimeout(1800);
        scrollAttempts++;
      } catch (scrollErr) {
        break;
      }
    }

    await workbook.xlsx.writeFile(filePath);
    addLog(`💾 Successfully saved ${extractedCount} leads to Excel: ${fileName}`);

    if (activeBrowser) {
      await activeBrowser.close();
      activeBrowser = null;
    }

    activeStatus.status = 'completed';
    activeStatus.completedAt = new Date().toISOString();
    addLog(`🎉 Scraping finished! Extracted ${extractedCount} verified business leads.`);

    return {
      success: true,
      count: extractedCount,
      filePath,
      fileName
    };

  } catch (err: any) {
    console.error('[GoogleMapsScraper Error]:', err);
    if (activeBrowser) {
      try { await activeBrowser.close(); } catch (_) {}
      activeBrowser = null;
    }
    activeStatus.status = 'failed';
    activeStatus.error = err.message || 'Scraping failed unexpectedly';
    activeStatus.completedAt = new Date().toISOString();
    addLog(`❌ Scraper encountered an error: ${err.message}`);
    throw err;
  }
}

export function listScraperOutputFiles(): Array<{ name: string; path: string; size: number; mtime: Date; countEstimate: number }> {
  if (!fs.existsSync(OUTPUT_DIR)) return [];

  const fileNames = fs.readdirSync(OUTPUT_DIR).filter(f => f.endsWith('.xlsx') || f.endsWith('.csv'));
  return fileNames.map(name => {
    const fullPath = path.join(OUTPUT_DIR, name);
    const stats = fs.statSync(fullPath);
    return {
      name,
      path: fullPath,
      size: stats.size,
      mtime: stats.mtime,
      countEstimate: Math.max(1, Math.round(stats.size / 450))
    };
  }).sort((a, b) => b.mtime.getTime() - a.mtime.getTime());
}

import { createCampaign } from './databaseManager';

export async function importScraperFileToCampaign(
  filePath: string,
  campaignName: string,
  tenantId: string = 'tenant_default',
  assignedUserId: string = 'admin'
): Promise<{ success: boolean; campaignId: string; importedCount: number }> {
  if (!fs.existsSync(filePath)) {
    throw new Error('Scraper file does not exist.');
  }

  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(filePath);
  const worksheet = workbook.worksheets[0];
  if (!worksheet) {
    throw new Error('Excel workbook contains no valid sheets.');
  }

  const fileName = path.basename(filePath);
  const finalName = campaignName.trim() || `Scraped Campaign ${new Date().toLocaleDateString()}`;
  const leads: { name: string; phone: string }[] = [];

  worksheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return; // skip header

    const rowValues: any = row.values;
    const name = String(rowValues[1] || rowValues['businessName'] || '').trim();
    let phone = String(rowValues[2] || rowValues['phone'] || '').replace(/[^0-9+]/g, '').trim();

    if (!name && !phone) return;
    if (!phone) phone = '0000000000';

    leads.push({
      name: name || 'Scraped Business',
      phone
    });
  });

  if (leads.length === 0) {
    throw new Error('No valid business leads with phone numbers were found in the file.');
  }

  const result = await createCampaign(finalName, fileName, leads, tenantId);

  return {
    success: true,
    campaignId: result.campaign.id,
    importedCount: result.finalCount
  };
}
