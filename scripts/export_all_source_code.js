const fs = require('fs');
const path = require('path');

const base = path.resolve(__dirname, '..');
const destDirs = [
  'G:\\My Drive\\Octal_Dialer_Code',
  'C:\\Users\\ice\\Desktop\\Octal_Dialer_Code_For_Gemini',
];

const EXCLUDE_DIRS = new Set([
  'node_modules',
  '.git',
  'dist',
  'build',
  '.dart_tool',
  '.gradle',
  'IMPORTANT_SECRETS',
  '.gemini',
  '.cortex',
  '.system_generated',
  '.vscode',
  '.idea',
  'zip-cache',
  'intermediates',
  '.next'
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
    const relPath = path.relative(base, f).replace(/\\/g, '/');
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

console.log('🚀 Packaging clean source files into master text bundles...');

// 1. Database & Migrations
const dbFiles = [
  ...getFiles(path.join(base, 'website_octal_dialer/backend/src/db')),
  ...getFiles(path.join(base, 'website_octal_dialer/backend/scripts')),
];
const dbBundle = bundleFiles(dbFiles, '01_DATABASE_AND_MIGRATIONS');

// 2. Backend Server & Engines
const backendFiles = getFiles(path.join(base, 'website_octal_dialer/backend/src'));
const backendBundle = bundleFiles(backendFiles, '02_BACKEND_SERVER_AND_ENGINES');

// 3. Android Telecom Bridge
const androidFiles = [
  ...getFiles(path.join(base, 'application_octal_dialer/lib')),
  ...getFiles(path.join(base, 'application_octal_dialer/android/app/src/main')),
];
const androidBundle = bundleFiles(androidFiles, '03_ANDROID_OCTAL_DIALER_APP');

// 4. Desktop FB Agent
const desktopFiles = [
  ...getFiles(path.join(base, 'desktop_octal_agent/lib')),
  ...getFiles(path.join(base, 'desktop_octal_agent/local_engine')),
];
const desktopBundle = bundleFiles(desktopFiles, '04_DESKTOP_OCTAL_AGENT');

// 5. Frontend React & CRM
const frontendFiles = [
  ...getFiles(path.join(base, 'website_octal_dialer/frontend/src')),
  path.join(base, 'website_octal_dialer/frontend/index.html'),
  path.join(base, 'website_octal_dialer/frontend/vite.config.ts'),
].filter((f) => fs.existsSync(f));
const frontendBundle = bundleFiles(frontendFiles, '05_FRONTEND_REACT_AND_CRM');

// 6. Lead Gen & Scrapers
const scraperFiles = getFiles(path.join(base, 'website_octal_dialer/backend/src/services')).filter(
  (f) => f.includes('Scraper') || f.includes('scraper') || f.includes('lead')
);
const scraperBundle = bundleFiles(scraperFiles, '06_LEAD_GEN_Z_SCRAPERS');

// 7. Blueprint
const blueprintPath = 'C:\\Users\\ice\\Desktop\\Octal_Dialer_Code_For_Gemini\\07_MASTER_BLUEPRINT_AND_PLAN.txt';
let blueprintContent = '';
if (fs.existsSync(blueprintPath)) {
  blueprintContent = fs.readFileSync(blueprintPath, 'utf8');
}

const modules = [
  { name: '01_DATABASE_AND_MIGRATIONS.txt', content: dbBundle },
  { name: '02_BACKEND_SERVER_AND_ENGINES.txt', content: backendBundle },
  { name: '03_ANDROID_OCTAL_DIALER_APP.txt', content: androidBundle },
  { name: '04_DESKTOP_OCTAL_AGENT.txt', content: desktopBundle },
  { name: '05_FRONTEND_REACT_AND_CRM.txt', content: frontendBundle },
  { name: '06_LEAD_GEN_Z_SCRAPERS.txt', content: scraperBundle },
];

for (const dir of destDirs) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  for (const mod of modules) {
    fs.writeFileSync(path.join(dir, mod.name), mod.content, 'utf8');
  }
}

// Build consolidated master file
let allInOne = `################################################################################\n`;
allInOne += `# OCTAL DIALER & CRM: COMPLETE OMNICHANNEL PROJECT REPOSITORY EXPORT\n`;
allInOne += `# Omnichannel Lead-Gen, Unified Unibox, Telecom Bridge & Desktop FB Engine\n`;
allInOne += `# GENERATED FOR GEMINI PRO: ${new Date().toISOString()}\n`;
allInOne += `################################################################################\n\n`;

if (blueprintContent) {
  allInOne += blueprintContent + '\n\n';
}
for (const mod of modules) {
  allInOne += mod.content + '\n\n';
}

for (const dir of destDirs) {
  const masterPath = path.join(dir, 'ENTIRE_OCTAL_DIALER_PROJECT_ALL_IN_ONE.txt');
  fs.writeFileSync(masterPath, allInOne, 'utf8');
  console.log(`✅ Synced master bundle to ${masterPath} (${(allInOne.length / (1024 * 1024)).toFixed(2)} MB)`);
}

console.log('🎉 All exports successfully synchronized!');
