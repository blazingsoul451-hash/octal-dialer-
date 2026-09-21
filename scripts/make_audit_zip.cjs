const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const staging = path.join(__dirname, '..', 'staging_audit');
if (fs.existsSync(staging)) fs.rmSync(staging, { recursive: true, force: true });
fs.mkdirSync(staging, { recursive: true });

const auditDir = path.join(__dirname, '..', 'LEAD_GEN_Z_LOCAL_AUDIT');
for (const file of fs.readdirSync(auditDir)) {
  if (file.endsWith('.png')) {
    fs.copyFileSync(path.join(auditDir, file), path.join(staging, file));
  }
}

for (const report of ['LEAD_GEN_Z_ARCHITECTURE.md', 'LEAD_GEN_Z_IMPLEMENTATION_REPORT.md', 'ZESTIFY_PRODUCT_SPLIT_REPORT.md']) {
  const p = path.join(__dirname, '..', report);
  if (fs.existsSync(p)) {
    fs.copyFileSync(p, path.join(staging, report));
  }
}

const zipPath = path.join(__dirname, '..', 'LEAD_GEN_Z_LOCAL_AUDIT.zip');
if (fs.existsSync(zipPath)) fs.unlinkSync(zipPath);

// Use archiver or tar or powershell Compress-Archive safely
execSync(`tar -a -c -f "${zipPath}" -C "${staging}" .`);
fs.rmSync(staging, { recursive: true, force: true });

console.log('Zip file created successfully:', fs.statSync(zipPath).size, 'bytes');
