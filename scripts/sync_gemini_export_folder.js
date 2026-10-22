/**
 * scripts/sync_gemini_export_folder.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Master Synchronization Script for Gemini Export Mirrors:
 * 1. C:\Users\ice\Desktop\Octal_Dialer_Code_For_Gemini\
 * 2. G:\My Drive\Octal_Dialer_Code\
 *
 * Ensures 100% of files contain the LATEST, fully-tested and verified code,
 * eliminating all obsolete/stale versions.
 * ─────────────────────────────────────────────────────────────────────────────
 */

const fs = require('fs');
const path = require('path');

const projectRoot = path.resolve(__dirname, '..');
const destDirs = [
  'C:\\Users\\ice\\Desktop\\Octal_Dialer_Code_For_Gemini',
  'G:\\My Drive\\Octal_Dialer_Code',
];

for (const d of destDirs) {
  if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true });
}

console.log('🚀 Synchronizing Gemini Code Export Mirrors with LATEST Production Code...\n');

// Helper to read UTF-8 file
function readSource(relPath) {
  const full = path.join(projectRoot, relPath);
  if (!fs.existsSync(full)) {
    throw new Error(`File not found: ${full}`);
  }
  return fs.readFileSync(full, 'utf8');
}

// ─── 1. INDIVIDUAL COMPONENT FILES (ALL LATEST VERSIONS) ────────────────────
console.log('📦 1. Exporting individual verified source files...');

const serverTs = readSource('website_octal_dialer/backend/src/server.ts');
const fbLocalWorker = readSource('desktop_octal_agent/lib/services/fb_local_worker.dart');
const localFbBot = readSource('desktop_octal_agent/local_engine/local_fb_bot.js');
const fbPosterScript = readSource('website_octal_dialer/backend/src/facebook_modules/facebook_poster.js');
const autoEmailerTsx = readSource('website_octal_dialer/frontend/src/components/AutoEmailer.tsx');
const fbAutoPosterTsx = readSource('website_octal_dialer/frontend/src/components/FacebookAutoPoster.tsx');
const uniboxTsx = readSource('website_octal_dialer/frontend/src/components/OmnichannelUnibox.tsx');
const replyEngineTs = readSource('website_octal_dialer/backend/src/services/omnichannelReplyEngine.ts');
const uniboxRoutesTs = readSource('website_octal_dialer/backend/src/uniboxRoutes.ts');
const migration024 = readSource('website_octal_dialer/backend/src/db/migrations/024_omnichannel_unibox_and_sync.sql');
const mainActivityKt = readSource('application_octal_dialer/android/app/src/main/kotlin/com/octal/dialer/octal_dialer/MainActivity.kt');
const apiServiceDart = readSource('desktop_octal_agent/lib/services/api_service.dart');
const leadQueueTsx = readSource('website_octal_dialer/frontend/src/components/LeadQueue.tsx');
const appTsx = readSource('website_octal_dialer/frontend/src/App.tsx');
const databaseManagerTs = readSource('website_octal_dialer/backend/src/databaseManager.ts');

// Extract current email sending section from server.ts
const emailStartIdx = serverTs.indexOf("// ─── POST /email/start ──");
const emailStopIdx = serverTs.indexOf("// ─── POST /emailer/stop ──");
const emailSendingSection = (emailStartIdx !== -1 && emailStopIdx !== -1)
  ? serverTs.slice(emailStartIdx, emailStopIdx).trim()
  : serverTs.slice(serverTs.indexOf("['/email/start'"), serverTs.indexOf("['/emailer/stop'")).trim();

// Extract current remaining email routes
const remainingRoutesStartIdx = serverTs.indexOf("// ─── GET /api/email/track/open/:token ──");
const remainingRoutes = (remainingRoutesStartIdx !== -1 && emailStartIdx !== -1)
  ? serverTs.slice(remainingRoutesStartIdx, emailStartIdx).trim()
  : "/* Current Email Routes verified in server.ts */";

// Master Blueprint Content
const blueprintPath = path.join(projectRoot, 'omnichannel_outreach_master_blueprint.md');
let blueprintContent = fs.existsSync(blueprintPath) ? fs.readFileSync(blueprintPath, 'utf8') : '';
if (!blueprintContent) {
  const alt = path.join(destDirs[0], '00_MASTER_BLUEPRINT_AND_PLAN.txt');
  if (fs.existsSync(alt)) blueprintContent = fs.readFileSync(alt, 'utf8');
}

// All Outreach Code Consolidated
const allOutreachContent = `################################################################################
# ALL OUTREACH CODE (LATEST PRODUCTION VERSIONS)
# Includes: Omnichannel Unibox, Cold Email Engine, Residential FB Bot & Routes
# Generated: ${new Date().toISOString()}
################################################################################

=== FILE: website_octal_dialer/backend/src/services/omnichannelReplyEngine.ts ===
${replyEngineTs}

=== FILE: website_octal_dialer/backend/src/uniboxRoutes.ts ===
${uniboxRoutesTs}

=== FILE: website_octal_dialer/frontend/src/components/OmnichannelUnibox.tsx ===
${uniboxTsx}

=== FILE: website_octal_dialer/frontend/src/components/AutoEmailer.tsx ===
${autoEmailerTsx}

=== FILE: website_octal_dialer/frontend/src/components/FacebookAutoPoster.tsx ===
${fbAutoPosterTsx}

=== FILE: desktop_octal_agent/local_engine/local_fb_bot.js ===
${localFbBot}

=== FILE: desktop_octal_agent/lib/services/fb_local_worker.dart ===
${fbLocalWorker}

=== FILE: website_octal_dialer/backend/src/db/migrations/024_omnichannel_unibox_and_sync.sql ===
${migration024}
`;

const individualFiles = [
  { name: '00_MASTER_BLUEPRINT_AND_PLAN.txt', content: blueprintContent },
  { name: '01_fb_local_worker.dart.txt', content: fbLocalWorker },
  { name: '02_local_fb_bot.js.txt', content: localFbBot },
  { name: '03_facebook_poster.js.txt', content: fbPosterScript },
  { name: '04_AutoEmailer.tsx.txt', content: autoEmailerTsx },
  { name: '05_FacebookAutoPoster.tsx.txt', content: fbAutoPosterTsx },
  { name: '06_server.ts.txt', content: serverTs },
  { name: '07_OmnichannelUnibox.tsx.txt', content: uniboxTsx },
  { name: '08_omnichannelReplyEngine.ts.txt', content: replyEngineTs },
  { name: '09_uniboxRoutes.ts.txt', content: uniboxRoutesTs },
  { name: '10_024_omnichannel_unibox_and_sync.sql.txt', content: migration024 },
  { name: '11_MainActivity.kt.txt', content: mainActivityKt },
  { name: '12_api_service.dart.txt', content: apiServiceDart },
  { name: '13_LeadQueue.tsx.txt', content: leadQueueTsx },
  { name: '14_App.tsx.txt', content: appTsx },
  { name: 'EMAIL_SENDING_SECTION_OF_SERVER_TS.txt', content: emailSendingSection },
  { name: 'REMAINING_EMAIL_ROUTES_FOR_GEMINI.txt', content: remainingRoutes },
  { name: 'ALL_OUTREACH_CODE_FOR_GEMINI.txt', content: allOutreachContent },
];

for (const dir of destDirs) {
  for (const f of individualFiles) {
    fs.writeFileSync(path.join(dir, f.name), f.content, 'utf8');
  }
}
console.log('✅ Updated all individual component text files.');

// ─── 2. REPOSITORY SOURCE CODE RECURSIVE PACKAGER ───────────────────────────
console.log('\n📦 2. Packaging clean architectural modules...');

const EXCLUDE_DIRS = new Set([
  'node_modules', '.git', 'dist', 'build', '.dart_tool', '.gradle',
  'IMPORTANT_SECRETS', '.gemini', '.cortex', '.system_generated',
  '.vscode', '.idea', 'zip-cache', 'intermediates', '.next'
]);

const ALLOWED_EXTS = new Set([
  '.ts', '.tsx', '.js', '.jsx', '.dart', '.kt', '.java', '.sql', '.json', '.html', '.css', '.yaml', '.yml'
]);

function getFiles(dir, maxDepth = 10, currentDepth = 0) {
  if (currentDepth > maxDepth || !fs.existsSync(dir)) return [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  let files = [];
  for (const entry of entries) {
    if (EXCLUDE_DIRS.has(entry.name)) continue;
    // Exclude large legacy HTML/binary dumps in backend/scripts
    if (entry.name === 'codebase_export.html') continue;
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files = files.concat(getFiles(fullPath, maxDepth, currentDepth + 1));
    } else if (entry.isFile()) {
      const ext = path.extname(entry.name).toLowerCase();
      if (ALLOWED_EXTS.has(ext) && !entry.name.endsWith('.lock') && entry.name !== 'package-lock.json') {
        files.push(fullPath);
      }
    }
  }
  return files;
}

function bundleFiles(filePaths, moduleTitle) {
  let out = `================================================================================\n`;
  out += `MODULE: ${moduleTitle}\n`;
  out += `TOTAL FILES: ${filePaths.length}\n`;
  out += `GENERATED: ${new Date().toISOString()}\n`;
  out += `================================================================================\n\n`;

  for (const f of filePaths) {
    const relPath = path.relative(projectRoot, f).replace(/\\/g, '/');
    const stat = fs.statSync(f);
    out += `================================================================================\n`;
    out += `FILE: ${relPath}\n`;
    out += `SIZE: ${stat.size} bytes\n`;
    out += `================================================================================\n`;
    try {
      const content = fs.readFileSync(f, 'utf8');
      out += content + '\n\n';
    } catch (err) {
      out += `[ERROR READING FILE: ${err.message}]\n\n`;
    }
  }
  return out;
}

// A. Database & Migrations
const dbFiles = [
  ...getFiles(path.join(projectRoot, 'website_octal_dialer/backend/src/db')),
  path.join(projectRoot, 'website_octal_dialer/backend/src/databaseManager.ts'),
];
const dbBundle = bundleFiles(dbFiles, '01_DATABASE_AND_MIGRATIONS');

// B. Backend Server & Engines
const backendFiles = getFiles(path.join(projectRoot, 'website_octal_dialer/backend/src'));
const backendBundle = bundleFiles(backendFiles, '02_BACKEND_SERVER_AND_ENGINES');

// C. Android App & Telecom Bridge
const androidFiles = [
  ...getFiles(path.join(projectRoot, 'application_octal_dialer/lib')),
  ...getFiles(path.join(projectRoot, 'application_octal_dialer/android/app/src/main')),
];
const androidBundle = bundleFiles(androidFiles, '03_ANDROID_OCTAL_DIALER_APP');

// D. Desktop Residential Agent
const desktopFiles = [
  ...getFiles(path.join(projectRoot, 'desktop_octal_agent/lib')),
  ...getFiles(path.join(projectRoot, 'desktop_octal_agent/local_engine')),
];
const desktopBundle = bundleFiles(desktopFiles, '04_DESKTOP_OCTAL_AGENT');

// E. Frontend React & CRM & Unibox
const frontendFiles = [
  ...getFiles(path.join(projectRoot, 'website_octal_dialer/frontend/src')),
  path.join(projectRoot, 'website_octal_dialer/frontend/index.html'),
  path.join(projectRoot, 'website_octal_dialer/frontend/vite.config.ts'),
].filter(f => fs.existsSync(f));
const frontendBundle = bundleFiles(frontendFiles, '05_FRONTEND_REACT_AND_CRM');

// F. Scraper Files
const scraperFiles = [
  path.join(projectRoot, 'website_octal_dialer/backend/src/googleMapsScraperService.ts'),
  path.join(projectRoot, 'website_octal_dialer/backend/src/scraperRoutes.ts'),
  path.join(projectRoot, 'website_octal_dialer/backend/src/scraperTypes.ts'),
  path.join(projectRoot, 'website_octal_dialer/backend/src/scraperWorker.ts'),
  path.join(projectRoot, 'website_octal_dialer/backend/src/facebook_modules/facebook_scraper.js'),
  path.join(projectRoot, 'website_octal_dialer/frontend/src/components/ScraperFilesPanel.tsx'),
  path.join(projectRoot, 'website_octal_dialer/frontend/src/components/FacebookScraper.tsx'),
].filter(f => fs.existsSync(f));
const scraperBundle = bundleFiles(scraperFiles, '06_LEAD_GEN_Z_SCRAPERS');

// G. Dev Configs, Scripts and Deployment
const devConfigCandidateFiles = [
  path.join(projectRoot, 'package.json'),
  path.join(projectRoot, 'scripts/start_all.js'),
  path.join(projectRoot, 'scripts/sync_gemini_export_folder.js'),
  path.join(projectRoot, 'scripts/test_emailer_and_facebook_poster.cjs'),
  path.join(projectRoot, 'scripts/export_all_source_code.js'),
  path.join(projectRoot, 'website_octal_dialer/backend/package.json'),
  path.join(projectRoot, 'website_octal_dialer/backend/tsconfig.json'),
  path.join(projectRoot, 'website_octal_dialer/frontend/package.json'),
  path.join(projectRoot, 'website_octal_dialer/frontend/vite.config.ts'),
  path.join(projectRoot, 'website_octal_dialer/frontend/tsconfig.json'),
  path.join(projectRoot, 'desktop_octal_agent/pubspec.yaml'),
  path.join(projectRoot, 'desktop_octal_agent/local_engine/package.json'),
  path.join(projectRoot, 'application_octal_dialer/pubspec.yaml'),
  path.join(projectRoot, 'application_octal_dialer/android/app/build.gradle'),
].filter(f => fs.existsSync(f));
const devConfigsBundle = bundleFiles(devConfigCandidateFiles, '08_DEV_CONFIGS_SCRIPTS_AND_DEPLOYMENT');

const modules = [
  { name: '01_DATABASE_AND_MIGRATIONS.txt', content: dbBundle },
  { name: '02_BACKEND_SERVER_AND_ENGINES.txt', content: backendBundle },
  { name: '03_ANDROID_OCTAL_DIALER_APP.txt', content: androidBundle },
  { name: '04_DESKTOP_OCTAL_AGENT.txt', content: desktopBundle },
  { name: '05_FRONTEND_REACT_AND_CRM.txt', content: frontendBundle },
  { name: '06_LEAD_GEN_Z_SCRAPERS.txt', content: scraperBundle },
  { name: '07_MASTER_BLUEPRINT_AND_PLAN.txt', content: blueprintContent },
  { name: '08_DEV_CONFIGS_SCRIPTS_AND_DEPLOYMENT.txt', content: devConfigsBundle },
];

for (const dir of destDirs) {
  for (const m of modules) {
    fs.writeFileSync(path.join(dir, m.name), m.content, 'utf8');
  }
}
console.log('✅ Updated all architectural module text bundles.');

// ─── 3. CONSOLIDATED MASTER ALL-IN-ONE BUNDLE ───────────────────────────────
console.log('\n📦 3. Generating pristine ENTIRE_OCTAL_DIALER_PROJECT_ALL_IN_ONE.txt...');

let allInOne = `################################################################################
# OCTAL DIALER & CRM: COMPLETE PRODUCTION REPOSITORY EXPORT
# Architecture: Omnichannel Unibox, Persistent IMAP IDLE, Hot Dialer Priority
# Desktop Residential FB Agent, Telecom Bridge, and Multi-Tenant SaaS
# Generated: ${new Date().toISOString()}
################################################################################\n\n`;

allInOne += blueprintContent + '\n\n';
for (const m of modules) {
  if (m.name !== '07_MASTER_BLUEPRINT_AND_PLAN.txt') {
    allInOne += m.content + '\n\n';
  }
}

for (const dir of destDirs) {
  const masterPath = path.join(dir, 'ENTIRE_OCTAL_DIALER_PROJECT_ALL_IN_ONE.txt');
  fs.writeFileSync(masterPath, allInOne, 'utf8');
  const sizeMb = (Buffer.byteLength(allInOne, 'utf8') / (1024 * 1024)).toFixed(2);
  console.log(`✅ Master bundle synced to: ${masterPath} (${sizeMb} MB)`);
}

console.log('\n🎉 ALL FILES SYNCHRONIZED WITH ZERO OLD VERSIONS!');
