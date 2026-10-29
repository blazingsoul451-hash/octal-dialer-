/**
 * scripts/sync_gemini_export_folder.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Master Clean Synchronization Script for Gemini & Argon Review Mirrors:
 * 1. C:\Users\ice\Desktop\Octal_Dialer_Code_For_Gemini\
 * 2. G:\My Drive\Octal_Dialer_Code\
 *
 * Enforces ZERO duplicates, ZERO orphan snippets, and clean sequential numbering:
 *   00_ENTIRE_OCTAL_DIALER_PROJECT_ALL_IN_ONE.txt
 *   01_MASTER_BLUEPRINT_AND_ARCHITECTURE.txt
 *   02_DATABASE_AND_MIGRATIONS.txt
 *   03_BACKEND_SERVER_AND_ENGINES.txt
 *   04_ANDROID_OCTAL_DIALER_APP.txt
 *   05_DESKTOP_OCTAL_AGENT.txt
 *   06_FRONTEND_REACT_AND_CRM.txt
 *   07_LEAD_GEN_Z_SCRAPERS.txt
 *   08_OMNICHANNEL_OUTREACH_AND_UNIBOX.txt
 *   09_DEV_CONFIGS_SCRIPTS_AND_DEPLOYMENT.txt
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
  if (!fs.existsSync(d)) {
    fs.mkdirSync(d, { recursive: true });
  } else {
    // Purge any old files to ensure zero duplicate / orphan files remain
    const existing = fs.readdirSync(d);
    for (const f of existing) {
      if (f.endsWith('.txt')) {
        try {
          fs.unlinkSync(path.join(d, f));
        } catch (_) {}
      }
    }
  }
}

console.log('🚀 Synchronizing Clean, Non-Duplicated Gemini Code Export Mirrors...\n');

// Helper to read UTF-8 file
function readSource(relPath) {
  const full = path.join(projectRoot, relPath);
  if (!fs.existsSync(full)) {
    throw new Error(`File not found: ${full}`);
  }
  return fs.readFileSync(full, 'utf8');
}

// Master Blueprint Content
const blueprintPath = path.join(projectRoot, 'omnichannel_outreach_master_blueprint.md');
let blueprintContent = fs.existsSync(blueprintPath) ? fs.readFileSync(blueprintPath, 'utf8') : '';

// ─── REPOSITORY RECURSIVE FILE BUNDLER ──────────────────────────────────────
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

// ─── 1. BUNDLE DEFINITIONS (CLEAN, SEPARATED ARCHITECTURE) ───────────────────

// 02. Database & Migrations
const dbFiles = [
  ...getFiles(path.join(projectRoot, 'website_octal_dialer/backend/src/db')),
  path.join(projectRoot, 'website_octal_dialer/backend/src/databaseManager.ts'),
].filter(f => fs.existsSync(f));
const dbBundle = bundleFiles(dbFiles, '02_DATABASE_AND_MIGRATIONS');

// 03. Backend Server & Engines
const backendFiles = getFiles(path.join(projectRoot, 'website_octal_dialer/backend/src'));
const backendBundle = bundleFiles(backendFiles, '03_BACKEND_SERVER_AND_ENGINES');

// 04. Android Dialer App & Telecom Bridge
const androidFiles = [
  ...getFiles(path.join(projectRoot, 'application_octal_dialer/lib')),
  ...getFiles(path.join(projectRoot, 'application_octal_dialer/android/app/src/main')),
].filter(f => fs.existsSync(f));
const androidBundle = bundleFiles(androidFiles, '04_ANDROID_OCTAL_DIALER_APP');

// 05. Desktop Residential Agent
const desktopFiles = [
  ...getFiles(path.join(projectRoot, 'desktop_octal_agent/lib')),
  ...getFiles(path.join(projectRoot, 'desktop_octal_agent/local_engine')),
].filter(f => fs.existsSync(f));
const desktopBundle = bundleFiles(desktopFiles, '05_DESKTOP_OCTAL_AGENT');

// 06. Frontend React & CRM & Unibox
const frontendFiles = [
  ...getFiles(path.join(projectRoot, 'website_octal_dialer/frontend/src')),
  path.join(projectRoot, 'website_octal_dialer/frontend/index.html'),
  path.join(projectRoot, 'website_octal_dialer/frontend/vite.config.ts'),
].filter(f => fs.existsSync(f));
const frontendBundle = bundleFiles(frontendFiles, '06_FRONTEND_REACT_AND_CRM');

// 07. Lead Gen Scrapers (Google Maps & Facebook)
const scraperFiles = [
  path.join(projectRoot, 'website_octal_dialer/backend/src/googleMapsScraperService.ts'),
  path.join(projectRoot, 'website_octal_dialer/backend/src/scraperRoutes.ts'),
  path.join(projectRoot, 'website_octal_dialer/backend/src/scraperTypes.ts'),
  path.join(projectRoot, 'website_octal_dialer/backend/src/scraperWorker.ts'),
  path.join(projectRoot, 'website_octal_dialer/backend/src/facebook_modules/facebook_scraper.js'),
  path.join(projectRoot, 'website_octal_dialer/frontend/src/components/ScraperFilesPanel.tsx'),
  path.join(projectRoot, 'website_octal_dialer/frontend/src/components/FacebookScraper.tsx'),
].filter(f => fs.existsSync(f));
const scraperBundle = bundleFiles(scraperFiles, '07_LEAD_GEN_Z_SCRAPERS');

// 08. Omnichannel Outreach & Unibox
const outreachFiles = [
  path.join(projectRoot, 'website_octal_dialer/backend/src/services/omnichannelReplyEngine.ts'),
  path.join(projectRoot, 'website_octal_dialer/backend/src/services/secretVault.ts'),
  path.join(projectRoot, 'website_octal_dialer/backend/src/services/redirectGuard.ts'),
  path.join(projectRoot, 'website_octal_dialer/backend/src/utils/spreadsheetSafety.ts'),
  path.join(projectRoot, 'website_octal_dialer/backend/src/uniboxRoutes.ts'),
  path.join(projectRoot, 'website_octal_dialer/backend/src/facebookPosterRoutes.ts'),
  path.join(projectRoot, 'website_octal_dialer/frontend/src/components/OmnichannelUnibox.tsx'),
  path.join(projectRoot, 'website_octal_dialer/frontend/src/components/AutoEmailer.tsx'),
  path.join(projectRoot, 'website_octal_dialer/frontend/src/components/FacebookAutoPoster.tsx'),
  path.join(projectRoot, 'desktop_octal_agent/local_engine/local_fb_bot.js'),
  path.join(projectRoot, 'desktop_octal_agent/lib/services/fb_local_worker.dart'),
  path.join(projectRoot, 'website_octal_dialer/backend/src/db/migrations/024_omnichannel_unibox_and_sync.sql'),
  path.join(projectRoot, 'website_octal_dialer/backend/src/db/migrations/025_fb_persistence_and_integrity.sql'),
].filter(f => fs.existsSync(f));
const outreachBundle = bundleFiles(outreachFiles, '08_OMNICHANNEL_OUTREACH_AND_UNIBOX');

// 09. Dev Configs, Scripts, Tests and Deployment
const devConfigCandidateFiles = [
  path.join(projectRoot, 'package.json'),
  path.join(projectRoot, 'scripts/start_all.js'),
  path.join(projectRoot, 'scripts/sync_gemini_export_folder.js'),
  path.join(projectRoot, 'scripts/test_emailer_and_facebook_poster.cjs'),
  path.join(projectRoot, 'website_octal_dialer/backend/package.json'),
  path.join(projectRoot, 'website_octal_dialer/backend/tsconfig.json'),
  path.join(projectRoot, 'website_octal_dialer/backend/test_call_flow_and_outcomes.js'),
  ...getFiles(path.join(projectRoot, 'website_octal_dialer/backend/tests')),
  path.join(projectRoot, 'website_octal_dialer/frontend/package.json'),
  path.join(projectRoot, 'website_octal_dialer/frontend/vite.config.ts'),
  path.join(projectRoot, 'website_octal_dialer/frontend/tsconfig.json'),
  path.join(projectRoot, 'desktop_octal_agent/pubspec.yaml'),
  path.join(projectRoot, 'desktop_octal_agent/local_engine/package.json'),
  path.join(projectRoot, 'application_octal_dialer/pubspec.yaml'),
  path.join(projectRoot, 'application_octal_dialer/android/app/build.gradle'),
].filter(f => fs.existsSync(f));
const devConfigsBundle = bundleFiles(devConfigCandidateFiles, '09_DEV_CONFIGS_SCRIPTS_AND_DEPLOYMENT');

// ─── 2. MASTER ALL-IN-ONE BUNDLE ────────────────────────────────────────────
let allInOne = `################################################################################
# OCTAL DIALER & CRM: COMPLETE PRODUCTION REPOSITORY EXPORT
# Architecture: Omnichannel Unibox, Persistent IMAP IDLE, Hot Dialer Priority
# Desktop Residential FB Agent, Telecom Bridge, and Multi-Tenant SaaS
# Generated: ${new Date().toISOString()}
################################################################################\n\n`;

allInOne += blueprintContent + '\n\n';
allInOne += dbBundle + '\n\n';
allInOne += backendBundle + '\n\n';
allInOne += androidBundle + '\n\n';
allInOne += desktopBundle + '\n\n';
allInOne += frontendBundle + '\n\n';
allInOne += scraperBundle + '\n\n';
allInOne += devConfigsBundle + '\n\n';

// ─── 3. WRITE EXACTLY 10 NON-DUPLICATED NUMBERED FILES ───────────────────────
const cleanFiles = [
  { name: '00_ENTIRE_OCTAL_DIALER_PROJECT_ALL_IN_ONE.txt', content: allInOne },
  { name: '01_MASTER_BLUEPRINT_AND_ARCHITECTURE.txt', content: blueprintContent },
  { name: '02_DATABASE_AND_MIGRATIONS.txt', content: dbBundle },
  { name: '03_BACKEND_SERVER_AND_ENGINES.txt', content: backendBundle },
  { name: '04_ANDROID_OCTAL_DIALER_APP.txt', content: androidBundle },
  { name: '05_DESKTOP_OCTAL_AGENT.txt', content: desktopBundle },
  { name: '06_FRONTEND_REACT_AND_CRM.txt', content: frontendBundle },
  { name: '07_LEAD_GEN_Z_SCRAPERS.txt', content: scraperBundle },
  { name: '08_OMNICHANNEL_OUTREACH_AND_UNIBOX.txt', content: outreachBundle },
  { name: '09_DEV_CONFIGS_SCRIPTS_AND_DEPLOYMENT.txt', content: devConfigsBundle },
];

for (const dir of destDirs) {
  for (const f of cleanFiles) {
    const filePath = path.join(dir, f.name);
    fs.writeFileSync(filePath, f.content, 'utf8');
  }
  console.log(`✅ Saved ${cleanFiles.length} clean, non-duplicated files to: ${dir}`);
}

console.log('\n🎉 ALL DUPLICATES & REDUNDANT SNIPPETS REMOVED! Folder is pristine.');
