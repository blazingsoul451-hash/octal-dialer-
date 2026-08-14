'use strict';

const { chromium } = require('playwright');
const ExcelJS = require('exceljs');
const fs = require('fs');
const path = require('path');

// ─────────────────────────────────────────────────────────────
//  SETTINGS & ARGUMENT PARSING
// ─────────────────────────────────────────────────────────────
let keyword = '';
let country = '';
let profileName = '';
let maxLeads = 200;

const args = process.argv.slice(2);
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--keyword') keyword = args[++i];
  else if (args[i] === '--country') country = args[++i];
  else if (args[i] === '--profile') profileName = args[++i];
  else if (args[i] === '--max-leads') maxLeads = parseInt(args[++i]) || 200;
}

if (!keyword || !profileName) {
  console.error('❌ Error: --keyword and --profile are required parameters.');
  process.exit(1);
}

// In website_octal_dialer, the profiles reside in backend/fb_profiles
const profileDir = path.resolve(__dirname, '..', '..', 'fb_profiles', profileName);
const leadsDir = path.resolve(__dirname, '..', '..', 'data', 'facebook_leads');
const currentLeadsFile = path.join(leadsDir, 'current_leads.json');

// Ensure directories exist
if (!fs.existsSync(leadsDir)) fs.mkdirSync(leadsDir, { recursive: true });

// Reset current leads file
fs.writeFileSync(currentLeadsFile, '[]', 'utf8');

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

// Regular expression patterns
const PHONE_RX = /(?:\+92|0092)?[-.\s]?(?:3\d{2}|2[1-9]|4[1-9]|5[1-9]|6[1-9]|7[1-9])[-.\s]?\d{3}[-.\s]?\d{4}|\b0\d{2,3}[- ]?\d{6,8}\b|(?:\+?\d{1,3}[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/g;
const EMAIL_RX = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;

function cleanPhone(raw) {
  if (!raw) return '';
  let clean = raw.replace(/[\s\-\(\)]/g, '');
  if (clean.length >= 7) return clean;
  return '';
}

function saveLeadsFile(leads) {
  fs.writeFileSync(currentLeadsFile, JSON.stringify(leads, null, 2), 'utf8');
}

async function scrollAndCollect(page, searchUrl) {
  console.log(`Visiting search: ${searchUrl}`);
  try {
    await page.goto(searchUrl, { waitUntil: 'domcontentloaded', timeout: 35000 });
  } catch (_) {
    console.log('Page load slow, proceeding anyway...');
  }
  await sleep(4000);

  // Scroll 6 times to fetch dynamic results
  for (let i = 0; i < 6; i++) {
    await page.evaluate(() => window.scrollBy(0, window.innerHeight * 2));
    await sleep(1500);
  }

  return await page.$$eval('a[href]', els => {
    const seen = new Set();
    const out = [];
    for (const a of els) {
      const href = a.href.split('?')[0].replace(/\/$/, '');
      const text = (a.innerText || '').trim().slice(0, 100);
      const part = href.split('facebook.com/')[1] || '';
      if (
        href.includes('facebook.com/') &&
        part.length > 3 &&
        !href.match(/facebook\.com\/(search|login|home\.php|groups|events|marketplace|watch|gaming|help|policies|photos|videos|reel|stories)\b/) &&
        !href.match(/facebook\.com\/?$/) &&
        !seen.has(href)
      ) {
        seen.add(href);
        out.push({ url: href, name: text || 'Unknown' });
      }
    }
    return out;
  });
}

async function getPhonesAndEmails(page, profileUrl, type) {
  const urlsToTry = type === 'pages'
    ? [profileUrl + '/about', profileUrl]
    : [profileUrl + '/about_contact_and_basic_info', profileUrl + '/about', profileUrl];

  for (const tryUrl of urlsToTry) {
    try {
      console.log(`Visiting: ${tryUrl}`);
      await page.goto(tryUrl, { waitUntil: 'domcontentloaded', timeout: 20000 });
      await sleep(2500);
      await page.evaluate(() => window.scrollBy(0, 1000));
      await sleep(1000);
      
      const text = await page.evaluate(() => document.body ? document.body.innerText : '');
      
      // Extract phones
      const rawPhones = text.match(PHONE_RX) || [];
      const phones = [...new Set(rawPhones.map(cleanPhone).filter(Boolean))];

      // Extract emails
      const rawEmails = text.match(EMAIL_RX) || [];
      const emails = [...new Set(rawEmails.map(e => e.trim().toLowerCase()))];

      if (phones.length > 0 || emails.length > 0) {
        return { phones, emails };
      }
    } catch (_) {}
  }
  return { phones: [], emails: [] };
}

(async () => {
  console.log('🚀 Spawning Facebook Lead Scraper Playwright process...');
  console.log(`Keyword: "${keyword}"`);
  console.log(`Country/City Filter: "${country}"`);
  console.log(`Profile: "${profileName}"`);
  console.log(`Max Leads to check: ${maxLeads}`);

  if (!fs.existsSync(profileDir)) {
    console.error(`❌ Profile folder not found: ${profileDir}`);
    process.exit(1);
  }

  let browser, context;
  try {
    const launchOptions = {
      headless: true,
      args: [
        '--disable-blink-features=AutomationControlled',
        '--no-sandbox',
        '--disable-infobars',
        '--disable-gpu',
        '--lang=en-US'
      ],
      ignoreDefaultArgs: ['--enable-automation'],
      locale: 'en-US'
    };

    context = await chromium.launchPersistentContext(profileDir, launchOptions);
    const page = await context.newPage();

    await page.addInitScript(() => {
      Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
    });

    console.log('Verifying Facebook Session...');
    await page.goto('https://www.facebook.com', { waitUntil: 'domcontentloaded' });
    await sleep(3000);

    if (page.url().includes('/login')) {
      console.error('❌ Session expired or invalid. Please check your cookies.');
      await context.close();
      process.exit(1);
    }

    console.log('✅ Session Valid. Starting extraction...');

    // Build Search Queries
    const queryStr = country ? `${keyword} ${country}` : keyword;
    const pagesSearchUrl = `https://www.facebook.com/search/pages/?q=${encodeURIComponent(queryStr)}`;
    const peopleSearchUrl = `https://www.facebook.com/search/people/?q=${encodeURIComponent(queryStr)}`;

    // 1. Gather Pages Links
    console.log('Gathering Facebook Pages...');
    const pages = await scrollAndCollect(page, pagesSearchUrl);
    console.log(`Found ${pages.length} potential pages.`);
    await sleep(2000);

    // 2. Gather People Links
    console.log('Gathering Facebook People profiles...');
    const people = await scrollAndCollect(page, peopleSearchUrl);
    console.log(`Found ${people.length} potential people profiles.`);

    // Merge and Deduplicate
    const allLinks = [
      ...pages.map(p => ({ ...p, type: 'pages' })),
      ...people.map(p => ({ ...p, type: 'people' }))
    ];

    const seen = new Set();
    const uniqueLinks = allLinks.filter(l => {
      if (seen.has(l.url)) return false;
      seen.add(l.url);
      return true;
    });

    const toVisit = Math.min(uniqueLinks.length, maxLeads);
    console.log(`📝 Visiting ${toVisit} profiles out of ${uniqueLinks.length} total unique results...`);

    const scrapedLeads = [];

    for (let i = 0; i < toVisit; i++) {
      const link = uniqueLinks[i];
      const percent = Math.round(((i + 1) / toVisit) * 100);
      console.log(`Progress: ${percent}%`);
      console.log(`Visiting: ${link.url}`);

      try {
        const { phones, emails } = await getPhonesAndEmails(page, link.url, link.type);
        if (phones.length > 0 || emails.length > 0) {
          const lead = {
            name: link.name || 'Unknown',
            email: emails.join(', '),
            phone: phones.join(', '),
            city: country || 'N/A',
            url: link.url
          };
          scrapedLeads.push(lead);
          saveLeadsFile(scrapedLeads);
          console.log(`✅ [LEAD FOUND] Name: ${lead.name} | Phone: ${lead.phone} | Email: ${lead.email}`);
        } else {
          console.log('No contact details found on this profile.');
        }
      } catch (err) {
        console.log(`⚠️ Error visiting profile: ${err.message}`);
      }

      // Human-like delay
      await sleep(3000 + Math.random() * 4000);
    }

    // Save final reports
    if (scrapedLeads.length > 0) {
      const timestamp = new Date().toISOString().replace(/T/, '_').replace(/\..+/, '').replace(/:/g, '-');
      const baseFilename = `facebook_leads_${keyword.replace(/[^a-z0-9]/gi, '_').toLowerCase()}_${timestamp}`;

      // 1. Export Excel
      const wb = new ExcelJS.Workbook();
      const ws = wb.addWorksheet('Facebook Leads');
      ws.columns = [
        { header: 'Name', key: 'name', width: 30 },
        { header: 'Email', key: 'email', width: 35 },
        { header: 'Phone Number', key: 'phone', width: 25 },
        { header: 'City/Location', key: 'city', width: 20 },
        { header: 'Facebook URL', key: 'url', width: 45 }
      ];
      ws.getRow(1).font = { bold: true };
      scrapedLeads.forEach(l => ws.addRow(l));
      
      const excelPath = path.join(leadsDir, `${baseFilename}.xlsx`);
      await wb.xlsx.writeFile(excelPath);
      console.log(`📊 Excel report exported: ${excelPath}`);

      // 2. Export CSV
      const csvPath = path.join(leadsDir, `${baseFilename}.csv`);
      const csvHeaders = 'Name,Email,Phone,City,URL\n';
      const escapeCSV = (str) => `"${String(str || '').replace(/"/g, '""')}"`;
      const csvRows = scrapedLeads.map(l => 
        `${escapeCSV(l.name)},${escapeCSV(l.email)},${escapeCSV(l.phone)},${escapeCSV(l.city)},${escapeCSV(l.url)}`
      ).join('\n');
      fs.writeFileSync(csvPath, csvHeaders + csvRows, 'utf8');
      console.log(`📊 CSV report exported: ${csvPath}`);
    }

    console.log('🎉 Facebook scrape campaign completed successfully.');
    await context.close();
    process.exit(0);

  } catch (err) {
    console.error(`❌ Process Error: ${err.message}`);
    if (context) await context.close();
    process.exit(1);
  }
})();
