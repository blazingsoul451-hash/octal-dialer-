/**
 * Explicit APK Publisher (Option A)
 * Replaces unpredictable file watchers with a deterministic, fast command.
 * Run via: npm run publish:apk
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execSync } = require('child_process');

console.log('🚀 [Publish APK] Locating freshly compiled APK...');

const candidates = [
  path.resolve(__dirname, '../../../application_octal_dialer/build/app/outputs/flutter-apk/app-release.apk'),
  path.resolve(__dirname, '../../../application_octal_dialer/build/app/outputs/flutter-apk/app-debug.apk'),
  path.resolve(process.env.USERPROFILE || 'C:/Users/ice', 'Desktop/OCTAL_DIALER_LATEST.apk')
];

let sourceApk = null;
let maxMtime = 0;

for (const p of candidates) {
  if (fs.existsSync(p)) {
    const stat = fs.statSync(p);
    if (stat.size > 1000000 && stat.mtimeMs > maxMtime) {
      maxMtime = stat.mtimeMs;
      sourceApk = p;
    }
  }
}

if (!sourceApk) {
  console.error('❌ [Publish APK] Error: No compiled APK found. Please run "flutter build apk" first.');
  process.exit(1);
}

const stat = fs.statSync(sourceApk);
const sizeMb = (stat.size / (1024 * 1024)).toFixed(1);
console.log(`📦 Found APK: ${sourceApk} (${sizeMb} MB)`);

// 1. Calculate SHA256 Checksum
console.log('🔒 Calculating SHA256 Checksum...');
const buffer = fs.readFileSync(sourceApk);
const sha256 = crypto.createHash('sha256').update(buffer).digest('hex');
console.log(`   SHA256: ${sha256.substring(0, 16)}...`);

// 2. Deploy to Production VPS
const sshKey = 'C:\\Users\\ice\\Desktop\\hyderabad ssh key\\hyderabad_ssh_key.pem';
const vpsUser = 'ubuntu';
const vpsHost = '140.245.215.156';

console.log(`📡 Uploading APK to production server (${vpsHost})...`);
try {
  execSync(
    `scp -i "${sshKey}" -o StrictHostKeyChecking=no "${sourceApk}" ${vpsUser}@${vpsHost}:/tmp/OctalDialer.apk`,
    { stdio: 'inherit' }
  );

  console.log('⚡ Moving to Nginx web root on production...');
  execSync(
    `ssh -i "${sshKey}" -o StrictHostKeyChecking=no ${vpsUser}@${vpsHost} "sudo cp /tmp/OctalDialer.apk /var/www/octal-frontend/OctalDialer.apk && sudo chown www-data:www-data /var/www/octal-frontend/OctalDialer.apk && cp /tmp/OctalDialer.apk /home/ubuntu/octal-backend/data/OctalDialer.apk && rm -f /tmp/OctalDialer.apk"`,
    { stdio: 'inherit' }
  );

  console.log('\n======================================================');
  console.log('✅ APK PUBLISHED SUCCESSFULLY TO PRODUCTION!');
  console.log(`   Download Link : https://zestify7.online/download/apk`);
  console.log(`   File Size     : ${sizeMb} MB`);
  console.log(`   Checksum      : ${sha256}`);
  console.log('======================================================\n');
} catch (deployErr) {
  console.error('❌ Failed to upload to production server:', deployErr.message);
  process.exit(1);
}
