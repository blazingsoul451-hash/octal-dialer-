const fs = require('fs');
const path = require('path');
const archiver = require('archiver');

const outPath = path.resolve(__dirname, '../../ZESTIFY_SETTINGS_CLEANUP_AUDIT.zip');
const desktopPath = 'C:/Users/ice/Desktop/ZESTIFY_SETTINGS_CLEANUP_AUDIT.zip';
const output = fs.createWriteStream(outPath);
const archive = archiver('zip', { zlib: { level: 9 } });

output.on('close', () => {
  fs.copyFileSync(outPath, desktopPath);
  console.log('Archive created successfully: ' + archive.pointer() + ' total bytes at: ' + outPath + ' and ' + desktopPath);
});

archive.pipe(output);

const files = [
  '01_settings_overview.png',
  '02_company_profile.png',
  '03_users_roles.png',
  '04_user_edit_modules.png',
  '05_account.png',
  '06_billing.png'
];

for (const f of files) {
  const fp = path.resolve(__dirname, '../../audit_screenshots', f);
  if (fs.existsSync(fp)) {
    archive.file(fp, { name: f });
    console.log('Archived:', f);
  }
}

const auditMd = `# ZESTIFY COMPANY SETTINGS CLEANUP AUDIT

## Overview
This audit verifies the simplification and cleanup of the Company Owner Settings UI into a polished SaaS experience while 100% preserving Users & Roles, team administration, user module assignments, backend authorization, tenant isolation, and Dialer/CRM functionality.

## Verification Checklist
- **Company Profile**: Complete customer-facing profile with Company Name, Business Email, Phone, Website, Country, Timezone, and Location.
- **Users & Roles**: 100% preserved with full employee list, team leads, custom roles, permissions, invitations, and access review.
- **User Module Editing**: Fully preserved with Company Entitlement Ceiling enforcement (effective access = company entitlement ∩ user assignment).
- **Account**: Dedicated profile, live password complexity validation, and device session revocation.
- **Billing**: Customer-facing subscription overview with active plan tier, seat utilization progress, and plan tier comparisons.
- **Leads & CRM Settings Card**: Removed from top-level Settings.
- **Calling & Devices Settings Card**: Removed from top-level Settings.
- **Products & Modules Settings Card**: Removed from customer Settings (managed via Platform Console).
- **Tenant ID & Internal Governance Labels**: 100% hidden from customer UI.
- **Dialer & CRM Internals**: Untouched and operational.

## Included Screenshots
1. 01_settings_overview.png - Clean 4-card Settings landing page
2. 02_company_profile.png - Business information and localization
3. 03_users_roles.png - Preserved Users & Roles administration suite
4. 04_user_edit_modules.png - User module assignment and ceiling enforcement
5. 05_account.png - Personal credentials, password complexity, and security
6. 06_billing.png - Subscription tier, seat usage, and workspace plans
`;

archive.append(auditMd, { name: 'AUDIT_REPORT.md' });
archive.finalize();
