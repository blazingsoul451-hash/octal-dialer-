# 10_TEST_RESULTS.md — Live Test Suite Execution Results

**Timestamp:** 2026-08-16T11:14:00+05:00  
**Working Directory:** `C:\Users\ice\Desktop\OCTAL_DIALER_PROJECT\website_octal_dialer\backend`

---

## 1. Test Suite Execution Summary

```text
Test: Live Multi-Tenant Behavioral E2E Suite
Command: node test_auto_dialer_multi_tenant_e2e.js
Total: 28
Passed: 28
Failed: 0
Skipped: 0
Exit code: 0
Actual output summary: All 28 assertions passed (Google OAuth separation, Tenant A vs B isolation, Socket.IO authorization, live call flow, disposition save).
Result: PASS

Test: Auto Dialer Invariants & Structural Test Suite
Command: node test_auto_dialer_complete.js
Total: 52
Passed: 52
Failed: 0
Skipped: 0
Exit code: 0
Actual output summary: All 52 tests passed across Session, Phone Pairing, Dial Dispatch, Call State Machine, Hangup Delivery, Emergency Stop, Lead Lease, Android Native, and Socket Security.
Result: PASS

Test: Comprehensive Tenant Isolation Security Suite
Command: node test_tenant_isolation.js
Total: 19
Passed: 19
Failed: 0
Skipped: 0
Exit code: 0
Actual output summary: All 19 tests passed (JWT fail-closed, admin role isolation, lead read/update/delete isolation, call logs, device isolation, SQLite integrity).
Result: PASS

Test: Google Sign-In vs Sign-Up Separation Suite
Command: node test_google_signin_vs_signup_separation.js
Total: 6
Passed: 6
Failed: 0
Skipped: 0
Exit code: 0
Actual output summary: All 6 tests passed (Unknown user signin fails, new user signup succeeds with role=user, existing user signin succeeds, duplicate signup rejected, account linking works).
Result: PASS

Test: Email Verification & OTP Disposable Defense Suite
Command: node test_email_verification_otp.js
Total: 8
Passed: 8
Failed: 0
Skipped: 0
Exit code: 0
Actual output summary: All 8 tests passed (Email format syntax, disposable provider defense, cryptographic OTP generation, signup cooldown, user activation).
Result: PASS
```

---

## 2. Overall Test Totals

- **Total Test Suites Executed:** 5
- **Total Assertions / Test Cases:** 113
- **Total Passed:** 113
- **Total Failed:** 0
- **Total Skipped:** 0
- **Pass Rate:** 100.0%
