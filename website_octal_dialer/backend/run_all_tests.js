/**
 * run_all_tests.js
 * Comprehensive master regression runner for Octal Dialer SaaS (Phases 4–12C).
 */

const { execSync } = require('child_process');

const testSuites = [
  { name: 'Google Sign In vs Sign Up Separation', file: 'test_google_signin_vs_signup_separation.js' },
  { name: 'Email Verification, OTP & Disposable Protection', file: 'test_email_verification_otp.js' },
  { name: 'Google OAuth Routes & Proxy Verification', file: 'test_google_oauth_routes.js' },
  { name: 'Google OAuth, Hardened RBAC & CAPTCHA', file: 'test_auth_google_rbac_captcha.js' },
  { name: 'RBAC Hierarchy & Module Permissions', file: 'test_rbac_hierarchy_permissions.js' },
  { name: 'Phase 13: CRM Navigation & Architecture', file: 'test_phase13_crm_consolidation.js' },
  { name: 'Phase E: CRM & Lead Intelligence', file: 'test_phaseE_crm.js' },
  { name: 'Phase 12D: Product-Wide UX & Integration', file: 'test_phase12d_product_integration.js' },
  { name: 'Phase 12C: Operations & Health UI', file: 'test_phase12c_operations_ui.js' },
  { name: 'Phase 12B: Admin UI & Enterprise Control', file: 'test_phase12b_admin_ui.js' },
  { name: 'Phase 12A: Call Analytics & Reporting', file: 'test_phase12a_reports.js' },
  { name: 'Phase 12: Integration End-to-End', file: 'test_phase12_integration.js' },
  { name: 'Phase 11: Production Readiness', file: 'test_phase11_production_readiness.js' },
  { name: 'Phase 10: Production Hardening', file: 'test_phase10_production_hardening.js' },
  { name: 'Phase 9: Hardening & IDOR', file: 'test_phase9_hardening.js' },
  { name: 'Phase 8: Billing Lifecycle', file: 'test_phase8_billing.js' },
  { name: 'Phase 7: Entitlements & Quotas', file: 'test_phase7_entitlements.js' },
  { name: 'Phase 6: Roles & RBAC Authority', file: 'test_phase6_roles.js' },
  { name: 'Phase 5: Signup Verification', file: 'test_signup_verification.js' },
  { name: 'Phase 5: Tenant Onboarding', file: 'test_phase5_signup.js' },
  { name: 'Phase 4: Multi-Tenant Isolation', file: 'test_tenant_isolation.js' }
];

console.log('═══════════════════════════════════════════════════════════════════════════');
console.log('OCTAL DIALER SAAS — MASTER REGRESSION RUNNER (PHASES 4 TO 12C)');
console.log('═══════════════════════════════════════════════════════════════════════════\n');

let passedCount = 0;
let failedCount = 0;

for (const suite of testSuites) {
  try {
    process.stdout.write(`▶ Running: ${suite.name} (${suite.file})... `);
    const output = execSync(`node ${suite.file}`, { cwd: __dirname, encoding: 'utf8' });
    console.log('✅ PASS');
    passedCount++;
  } catch (err) {
    console.log('❌ FAIL');
    console.error(err.stdout || err.stderr || err.message);
    failedCount++;
  }
}

console.log('\n═══════════════════════════════════════════════════════════════════════════');
console.log(`MASTER REGRESSION SUMMARY: ${passedCount}/${testSuites.length} SUITES PASSED (${failedCount} FAILED)`);
console.log('═══════════════════════════════════════════════════════════════════════════');

if (failedCount > 0) {
  process.exit(1);
} else {
  console.log('🎉 ALL 13 TEST SUITES PASSED WITH ZERO REGRESSIONS!');
}
