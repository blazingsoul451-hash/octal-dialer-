const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const rootDir = 'C:\\Users\\ice\\Desktop\\OCTAL_DIALER_PROJECT';
const outputHtml = path.join(__dirname, 'codebase_export.html');
const outputPdf = 'C:\\Users\\ice\\Desktop\\ZESTIFY_OCTAL_DIALER_COMPLETE_LIVE_CODEBASE.pdf';
const outputMd = 'C:\\Users\\ice\\Desktop\\ZESTIFY_OCTAL_DIALER_COMPLETE_LIVE_CODEBASE.md';

const fileList = [
  // Backend Core
  'website_octal_dialer/backend/src/server.ts',
  'website_octal_dialer/backend/src/authManager.ts',
  'website_octal_dialer/backend/src/databaseManager.ts',
  'website_octal_dialer/backend/src/sessionManager.ts',
  'website_octal_dialer/backend/src/safetyController.ts',
  'website_octal_dialer/backend/src/entitlementManager.ts',
  'website_octal_dialer/backend/src/billingManager.ts',
  'website_octal_dialer/backend/src/emailVerificationService.ts',
  'website_octal_dialer/backend/src/googleMapsScraperService.ts',
  'website_octal_dialer/backend/src/scraperRoutes.ts',
  'website_octal_dialer/backend/src/scraperTypes.ts',
  'website_octal_dialer/backend/src/scraperWorker.ts',
  'website_octal_dialer/backend/src/ssrfProtection.ts',
  'website_octal_dialer/backend/src/tunnelManager.ts',
  'website_octal_dialer/backend/src/apkWatcher.ts',
  'website_octal_dialer/backend/src/config.ts',
  'website_octal_dialer/backend/src/db/schema.sql',
  'website_octal_dialer/backend/src/db/pool.ts',
  'website_octal_dialer/backend/src/db/dbAdapter.ts',

  // Database Migrations (001 - 018)
  'website_octal_dialer/backend/src/db/migrations/001_initial_schema.sql',
  'website_octal_dialer/backend/src/db/migrations/002_add_users_table.sql',
  'website_octal_dialer/backend/src/db/migrations/003_rbac_and_modules.sql',
  'website_octal_dialer/backend/src/db/migrations/004_billing_and_entitlements.sql',
  'website_octal_dialer/backend/src/db/migrations/005_teams_and_scoping.sql',
  'website_octal_dialer/backend/src/db/migrations/006_email_verification.sql',
  'website_octal_dialer/backend/src/db/migrations/007_google_maps_scraper.sql',
  'website_octal_dialer/backend/src/db/migrations/008_leads_assigned_to.sql',
  'website_octal_dialer/backend/src/db/migrations/009_leads_audit_log.sql',
  'website_octal_dialer/backend/src/db/migrations/010_tenant_branding.sql',
  'website_octal_dialer/backend/src/db/migrations/011_tenant_lead_routing_policy.sql',
  'website_octal_dialer/backend/src/db/migrations/012_customer_type_personal_or_company.sql',
  'website_octal_dialer/backend/src/db/migrations/013_team_lead_visibility_policy.sql',
  'website_octal_dialer/backend/src/db/migrations/014_workspace_invitations.sql',
  'website_octal_dialer/backend/src/db/migrations/015_user_activity_status.sql',
  'website_octal_dialer/backend/src/db/migrations/016_impersonation_audit_logging.sql',
  'website_octal_dialer/backend/src/db/migrations/017_company_onboarding_wizard_state.sql',
  'website_octal_dialer/backend/src/db/migrations/018_platform_authority_isolation.sql',

  // Frontend Core
  'website_octal_dialer/frontend/src/App.tsx',
  'website_octal_dialer/frontend/src/main.tsx',
  'website_octal_dialer/frontend/src/types/index.ts',
  'website_octal_dialer/frontend/src/utils/roleUtils.ts',
  'website_octal_dialer/frontend/src/components/LoginScreen.tsx',
  'website_octal_dialer/frontend/src/components/SuperAdminPortal.tsx',
  'website_octal_dialer/frontend/src/components/LeadQueue.tsx',
  'website_octal_dialer/frontend/src/components/LeadsTable.tsx',
  'website_octal_dialer/frontend/src/components/DispositionModal.tsx',
  'website_octal_dialer/frontend/src/components/CallLog.tsx',
  'website_octal_dialer/frontend/src/components/ConnectionPanel.tsx',
  'website_octal_dialer/frontend/src/components/TeamLeadDashboard.tsx',
  'website_octal_dialer/frontend/src/components/settings/CompanySettings.tsx',
  'website_octal_dialer/frontend/src/components/onboarding/CustomerOnboardingModal.tsx',
  'website_octal_dialer/frontend/src/components/onboarding/InvitationAcceptanceModal.tsx',
  'website_octal_dialer/frontend/src/components/CRMWorkspacePage.tsx',
  'website_octal_dialer/frontend/src/components/CampaignWorkspacePage.tsx',
  'website_octal_dialer/frontend/src/components/FollowUpsPage.tsx',
  'website_octal_dialer/frontend/src/components/LeadProfileDrawer.tsx',
  'website_octal_dialer/frontend/src/components/ImportPanel.tsx',
  'website_octal_dialer/frontend/src/components/DncPanel.tsx',
  'website_octal_dialer/frontend/src/hooks/useSocket.ts',

  // Mobile Telephony Core
  'application_octal_dialer/lib/main.dart',
  'application_octal_dialer/lib/screens/calling_screen.dart',
  'application_octal_dialer/lib/screens/connect_screen.dart',
  'application_octal_dialer/lib/screens/connected_screen.dart',
  'application_octal_dialer/android/app/src/main/kotlin/com/example/application_octal_dialer/MainActivity.kt',
  'application_octal_dialer/android/app/src/main/AndroidManifest.xml'
];

function escapeHtml(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

console.log('Generating complete codebase HTML & Markdown export...');

let html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Zestify / Octal Dialer — Complete Live Production Codebase</title>
  <style>
    @page {
      size: A4;
      margin: 15mm 12mm 15mm 12mm;
    }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      color: #1e293b;
      background: #ffffff;
      line-height: 1.5;
      font-size: 11px;
      margin: 0;
      padding: 0;
    }
    .cover {
      page-break-after: always;
      text-align: center;
      padding: 100px 20px 40px;
    }
    .cover h1 {
      font-size: 32px;
      color: #0f172a;
      margin-bottom: 10px;
      font-weight: 800;
    }
    .cover h2 {
      font-size: 18px;
      color: #f59e0b;
      margin-bottom: 30px;
      font-weight: 600;
    }
    .cover .meta {
      background: #f8fafc;
      border: 1px solid #e2e8f0;
      border-radius: 12px;
      padding: 24px;
      max-width: 600px;
      margin: 0 auto;
      text-align: left;
      font-size: 12px;
    }
    .cover .meta dt {
      font-weight: bold;
      color: #334155;
      margin-top: 8px;
    }
    .cover .meta dd {
      margin-left: 0;
      color: #64748b;
      font-family: monospace;
    }
    .toc {
      page-break-after: always;
      padding: 20px 0;
    }
    .toc h2 {
      font-size: 20px;
      border-bottom: 2px solid #0f172a;
      padding-bottom: 8px;
      color: #0f172a;
    }
    .toc ul {
      list-style-type: none;
      padding-left: 0;
    }
    .toc li {
      padding: 4px 0;
      border-bottom: 1px dotted #cbd5e1;
      display: flex;
      justify-content: space-between;
      font-family: monospace;
      font-size: 10px;
    }
    .file-section {
      page-break-before: always;
      margin-top: 20px;
    }
    .file-header {
      background: #0f172a;
      color: #ffffff;
      padding: 10px 14px;
      border-radius: 6px 6px 0 0;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    .file-title {
      font-family: monospace;
      font-size: 12px;
      font-weight: 700;
      color: #fbbf24;
    }
    .file-meta {
      font-size: 10px;
      color: #94a3b8;
    }
    pre {
      margin: 0;
      padding: 12px;
      background: #f8fafc;
      border: 1px solid #e2e8f0;
      border-top: none;
      border-radius: 0 0 6px 6px;
      overflow-x: auto;
      font-family: "JetBrains Mono", Consolas, "Courier New", monospace;
      font-size: 9px;
      line-height: 1.4;
      white-space: pre-wrap;
      word-break: break-all;
    }
    .code-line {
      display: block;
    }
    .line-number {
      color: #94a3b8;
      display: inline-block;
      width: 45px;
      user-select: none;
      text-align: right;
      padding-right: 12px;
    }
  </style>
</head>
<body>

<div class="cover">
  <h1>ZESTIFY / OCTAL DIALER</h1>
  <h2>COMPLETE LIVE PRODUCTION SOURCE CODE REPOSITORY</h2>
  <div class="meta">
    <dl>
      <dt>Live Production URL</dt>
      <dd>https://zestify7.online | https://zestify7.online/admin</dd>
      <dt>Live Server IP</dt>
      <dd>140.245.215.156 (Oracle Cloud Infrastructure, Ubuntu 24.04 LTS)</dd>
      <dt>Git Checkpoint Commit</dt>
      <dd>b8cfafa (feature/saas-structure-v2)</dd>
      <dt>Database Engine</dt>
      <dd>PostgreSQL 16 (773 Tenants, 249 Users, 5,657 Leads)</dd>
      <dt>Telephony Engine</dt>
      <dd>OCTAL Mobile GSM TelecomManager Bridge (Android / Flutter)</dd>
      <dt>Date of Generation</dt>
      <dd>${new Date().toISOString()}</dd>
      <dt>Purpose</dt>
      <dd>Full Comprehensive Source Code Documentation for External Audit / Astra Review</dd>
    </dl>
  </div>
</div>

<div class="toc">
  <h2>Table of Contents</h2>
  <ul>
`;

let md = `# ZESTIFY / OCTAL DIALER — COMPLETE LIVE PRODUCTION SOURCE CODE
**Generated:** ${new Date().toISOString()}  
**Production Server:** 140.245.215.156 (Oracle Cloud)  
**Live URL:** https://zestify7.online | https://zestify7.online/admin  
**Commit:** b8cfafa  

---

## Table of Contents
`;

const processedFiles = [];

for (const relPath of fileList) {
  const fullPath = path.join(rootDir, relPath);
  if (fs.existsSync(fullPath)) {
    const content = fs.readFileSync(fullPath, 'utf8');
    const lines = content.split('\n');
    processedFiles.push({
      relPath,
      lineCount: lines.length,
      byteCount: Buffer.byteLength(content, 'utf8'),
      content,
      lines
    });
    md += `- [${relPath}](#${relPath.toLowerCase().replace(/[^a-z0-9]/g, '-')}) (${lines.length} lines)\n`;
    html += `<li><span>${relPath}</span> <span>${lines.length} lines</span></li>\n`;
  } else {
    console.warn('File not found, skipping:', relPath);
  }
}

html += `  </ul>
</div>
`;

md += `\n---\n\n`;

for (const file of processedFiles) {
  console.log(`Processing: ${file.relPath} (${file.lineCount} lines)`);
  
  // HTML Section
  html += `
<div class="file-section">
  <div class="file-header">
    <span class="file-title">${file.relPath}</span>
    <span class="file-meta">${file.lineCount} lines &bull; ${(file.byteCount / 1024).toFixed(1)} KB</span>
  </div>
  <pre><code>`;

  for (let i = 0; i < file.lines.length; i++) {
    const lineNum = i + 1;
    const escaped = escapeHtml(file.lines[i]);
    html += `<span class="code-line"><span class="line-number">${lineNum}</span>${escaped}</span>`;
  }

  html += `</code></pre>
</div>
`;

  // Markdown Section
  const ext = path.extname(file.relPath).replace('.', '') || 'text';
  md += `## ${file.relPath}\n\n\`\`\`${ext}\n${file.content}\n\`\`\`\n\n---\n\n`;
}

html += `</body></html>`;

fs.writeFileSync(outputHtml, html, 'utf8');
console.log(`HTML generated at ${outputHtml} (${(fs.statSync(outputHtml).size / (1024 * 1024)).toFixed(2)} MB)`);

fs.writeFileSync(outputMd, md, 'utf8');
console.log(`Markdown generated at ${outputMd} (${(fs.statSync(outputMd).size / (1024 * 1024)).toFixed(2)} MB)`);

// Convert HTML to PDF using Chrome Headless
console.log('Converting HTML to PDF via Headless Chrome...');
const chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const chromeCmd = `"${chromePath}" --headless=new --disable-gpu --no-pdf-header-footer --print-to-pdf="${outputPdf}" "${outputHtml}"`;

try {
  execSync(chromeCmd, { stdio: 'inherit', timeout: 120000 });
  console.log(`PDF SUCCESSFULLY CREATED at: ${outputPdf}`);
} catch (e) {
  console.error('Chrome PDF conversion error:', e.message);
}
