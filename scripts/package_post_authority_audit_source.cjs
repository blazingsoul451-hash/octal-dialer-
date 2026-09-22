/**
 * scripts/package_post_authority_audit_source.cjs
 * Sanitized source packaging script for ZESTIFY_POST_AUTHORITY_AUDIT_SOURCE.zip.
 * Excludes: node_modules, dist, build, .git, local_pg_cluster, .env, secrets, keys, and archives.
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const ROOT_DIR = path.resolve(__dirname, '..');
const DEST_ZIP = path.join(ROOT_DIR, 'ZESTIFY_POST_AUTHORITY_AUDIT_SOURCE.zip');
const STAGING_DIR = path.join(ROOT_DIR, 'temp_staging_post_audit_source');

const EXCLUDED_DIRS = new Set([
  'node_modules',
  'dist',
  'build',
  '.git',
  '.dart_tool',
  '.gradle',
  'local_pg_cluster',
  'temp_staging_post_audit_source',
  'IMPORTANT_SECRETS',
  'audit_screenshots',
  'ZESTIFY_COMPLETE_UI_AUDIT',
  'ZESTIFY_AUTONOMOUS_CRM_AUDIT',
  'LEAD_GEN_Z_LOCAL_AUDIT'
]);

const EXCLUDED_EXTENSIONS = new Set([
  '.zip',
  '.tar.gz',
  '.apk',
  '.exe',
  '.log',
  '.sqlite',
  '.db',
  '.jks',
  '.keystore',
  '.p12',
  '.pfx'
]);

const EXCLUDED_FILES = new Set([
  '.env',
  'cloudflared.exe'
]);

function shouldCopy(srcPath, relativePath) {
  const parts = relativePath.split(path.sep);
  for (const part of parts) {
    if (EXCLUDED_DIRS.has(part)) return false;
  }

  const stat = fs.statSync(srcPath);
  if (stat.isDirectory()) return true;

  const base = path.basename(srcPath);
  if (EXCLUDED_FILES.has(base)) return false;

  const ext = path.extname(srcPath).toLowerCase();
  if (EXCLUDED_EXTENSIONS.has(ext)) return false;

  if (base.endsWith('.tar.gz')) return false;

  return true;
}

function copyRecursive(src, dest, relBase = '') {
  const entries = fs.readdirSync(src, { withFileTypes: true });
  fs.mkdirSync(dest, { recursive: true });

  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    const relPath = path.join(relBase, entry.name);

    if (!shouldCopy(srcPath, relPath)) continue;

    if (entry.isDirectory()) {
      copyRecursive(srcPath, destPath, relPath);
    } else if (entry.isFile()) {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

async function main() {
  console.log('=== ZESTIFY POST AUTHORITY AUDIT SOURCE PACKAGING ===');
  console.log(`Staging directory: ${STAGING_DIR}`);
  console.log(`Destination ZIP: ${DEST_ZIP}\n`);

  if (fs.existsSync(STAGING_DIR)) {
    fs.rmSync(STAGING_DIR, { recursive: true, force: true });
  }
  fs.mkdirSync(STAGING_DIR, { recursive: true });

  const targetDirs = [
    'website_octal_dialer',
    'application_octal_dialer',
    'lead-gen-z',
    'scripts'
  ];

  for (const dir of targetDirs) {
    const src = path.join(ROOT_DIR, dir);
    if (fs.existsSync(src)) {
      console.log(`Copying sanitized directory: ${dir}...`);
      copyRecursive(src, path.join(STAGING_DIR, dir), dir);
    }
  }

  const rootFiles = [
    'PLATFORM_CUSTOMER_AUTHORITY_FINAL_AUDIT.md',
    'GPT_CODE_REVIEW_MANIFEST.md',
    'package.json',
    '.gitignore',
    'AGENTS.md'
  ];

  for (const file of rootFiles) {
    const src = path.join(ROOT_DIR, file);
    if (fs.existsSync(src)) {
      console.log(`Copying root file: ${file}...`);
      fs.copyFileSync(src, path.join(STAGING_DIR, file));
    }
  }

  if (fs.existsSync(DEST_ZIP)) {
    fs.unlinkSync(DEST_ZIP);
  }

  console.log('\nCompressing into sanitized ZIP archive...');
  execSync(`powershell -NoProfile -Command "Compress-Archive -Path '${STAGING_DIR}\\*' -DestinationPath '${DEST_ZIP}' -CompressionLevel Optimal -Force"`, { stdio: 'inherit' });

  fs.rmSync(STAGING_DIR, { recursive: true, force: true });

  const stats = fs.statSync(DEST_ZIP);
  console.log(`\n🎉 Packaging complete: ${DEST_ZIP} (${(stats.size / 1024 / 1024).toFixed(2)} MB)`);
}

main().catch(err => {
  console.error('Packaging error:', err);
  process.exit(1);
});
