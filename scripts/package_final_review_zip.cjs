// scripts/package_final_review_zip.cjs
// Packages the complete verified repository into review ZIP archives,
// strictly omitting all secrets, .git, node_modules, build artifacts, and binary caches.

const fs = require('fs');
const path = require('path');
const archiver = require('archiver');

const projectRoot = path.resolve(__dirname, '..');
const outputPaths = [
  'C:\\Users\\ice\\Desktop\\octal-dialer-review.zip',
  'C:\\Users\\ice\\Desktop\\octal.zip',
  path.join(projectRoot, 'octal-dialer-review.zip')
];

// Exclusion rules
const EXCLUDE_DIRS = new Set([
  '.git',
  'node_modules',
  'dist',
  'build',
  'IMPORTANT_SECRETS',
  '.gemini',
  '.cortex',
  '.system_generated',
  '.vscode',
  '.idea',
  'zip-cache',
  'intermediates'
]);

const EXCLUDE_FILES = new Set([
  'app-release.apk',
  'cloudflared.exe',
  'backend_deploy.tar.gz',
  'dist.tar.gz',
  'dist_deploy.tar.gz',
  'dist_light.tar.gz',
  'dist_web.tar.gz',
  'frontend_deploy.tar.gz',
  'web_assets_deploy.tar.gz',
  'octal-dialer-review.zip',
  'octal-dialer-verification-source.zip',
  'octal.zip',
  'frontend_clean.zip',
  'frontend_dist.zip',
  'frontend_live.zip',
  'octal_backend.zip'
]);

function shouldInclude(relPath) {
  const normalized = relPath.replace(/\\/g, '/');
  const segments = normalized.split('/');

  for (const seg of segments) {
    if (EXCLUDE_DIRS.has(seg)) return false;
    if (seg.startsWith('pg_mig013_test_')) return false;
  }

  const fileName = segments[segments.length - 1];
  if (EXCLUDE_FILES.has(fileName)) return false;
  if (fileName.endsWith('.zip') || fileName.endsWith('.tar.gz') || fileName.endsWith('.apk') || fileName.endsWith('.exe')) return false;
  if (fileName.startsWith('.env') && !fileName.endsWith('.example')) return false;
  if (fileName.endsWith('.pem') || fileName.endsWith('.key') || fileName.endsWith('.log')) return false;
  if (normalized.includes('IMPORTANT_SECRETS')) return false;

  return true;
}

function collectFiles(dir, baseDir, fileList = []) {
  const items = fs.readdirSync(dir, { withFileTypes: true });
  for (const item of items) {
    const fullPath = path.join(dir, item.name);
    const relPath = path.relative(baseDir, fullPath);

    if (!shouldInclude(relPath)) continue;

    if (item.isDirectory()) {
      collectFiles(fullPath, baseDir, fileList);
    } else if (item.isFile()) {
      fileList.push({ fullPath, relPath: relPath.replace(/\\/g, '/') });
    }
  }
  return fileList;
}

async function createZip(targetPath, files) {
  return new Promise((resolve, reject) => {
    const output = fs.createWriteStream(targetPath);
    const archive = archiver('zip', { zlib: { level: 9 } });

    output.on('close', () => {
      console.log(`[ZIP SUCCESS] Created ${targetPath} (${(archive.pointer() / 1024 / 1024).toFixed(2)} MB)`);
      resolve();
    });

    archive.on('warning', (err) => {
      if (err.code === 'ENOENT') console.warn(err);
      else reject(err);
    });

    archive.on('error', (err) => reject(err));

    archive.pipe(output);

    for (const f of files) {
      archive.file(f.fullPath, { name: f.relPath });
    }

    archive.finalize();
  });
}

async function main() {
  console.log('Scanning repository files from:', projectRoot);
  const files = collectFiles(projectRoot, projectRoot);
  console.log(`Found ${files.length} valid source files to package.`);

  // Create temporary primary zip first
  const primaryZip = outputPaths[0];
  console.log(`\nArchiving to ${primaryZip}...`);
  await createZip(primaryZip, files);

  // Copy to remaining destinations
  for (let i = 1; i < outputPaths.length; i++) {
    const dest = outputPaths[i];
    console.log(`Copying to ${dest}...`);
    fs.copyFileSync(primaryZip, dest);
    console.log(`✓ Copied ${dest}`);
  }

  console.log('\nAll review archives successfully generated!');
}

main().catch(err => {
  console.error('Packaging failed:', err);
  process.exit(1);
});
