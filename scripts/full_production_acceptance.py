import urllib.request
import urllib.error
import json
import ssl
import sys

UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"

DOMAINS = [
    "https://www.zestify7.online",
    "https://zestify7.online"
]

results = []

def record(area, test_name, expected, actual, passed, evidence):
    status_str = "PASS" if passed else "FAIL"
    results.append({
        "area": area,
        "test": test_name,
        "expected": expected,
        "actual": actual,
        "status": status_str,
        "evidence": evidence
    })
    print(f"[{status_str}] {area} | {test_name}: {actual} ({evidence})", flush=True)

def run_suite():
    for base in DOMAINS:
        print(f"\n=======================================================", flush=True)
        print(f"RUNNING ACCEPTANCE PROTOCOL ON: {base}", flush=True)
        print(f"=======================================================", flush=True)

        # ── 1. SPA ROUTING ACCEPTANCE ─────────────────────────────────────
        spa_routes = [
            ("/", "Root SPA Index"),
            ("/login", "Login Page"),
            ("/dashboard", "Dashboard Deep-Link"),
            ("/admin", "Admin Portal Root"),
            ("/admin/", "Admin Portal Trailing Slash"),
            ("/settings", "Settings Deep-Link")
        ]

        for path, desc in spa_routes:
            url = base + path
            req = urllib.request.Request(url, headers={"User-Agent": UA})
            try:
                with urllib.request.urlopen(req, timeout=10) as resp:
                    ct = resp.headers.get("Content-Type", "")
                    body = resp.read().decode("utf-8", errors="replace")
                    is_html = "text/html" in ct and "<!doctype html" in body.lower()
                    record("SPA", f"{desc} ({path})", "200 text/html", f"{resp.status} {ct.split(';')[0]}", is_html, f"len={len(body)}")
            except Exception as e:
                record("SPA", f"{desc} ({path})", "200 text/html", f"ERROR: {e}", False, str(e))

        # ── 2. STATIC APK STREAMING ───────────────────────────────────────
        apk_url = base + "/download/apk"
        req = urllib.request.Request(apk_url, headers={"User-Agent": UA})
        try:
            with urllib.request.urlopen(req, timeout=10) as resp:
                ct = resp.headers.get("Content-Type", "")
                cl = resp.headers.get("Content-Length", "0")
                is_apk = "application/vnd.android.package-archive" in ct and int(cl) > 1000000
                record("Static", "Android APK Download (/download/apk)", "200 APK binary", f"{resp.status} {ct}", is_apk, f"size={cl} bytes")
        except Exception as e:
            record("Static", "Android APK Download (/download/apk)", "200 APK binary", f"ERROR: {e}", False, str(e))

        # ── 3. AUTHENTICATION (ALL 4 TIERS) ────────────────────────────────
        accounts = [
            ("software_owner", "SoftwareOwnerPass123!", "platform_admin", "/admin/login"),
            ("company_owner", "CompanyOwnerPass123!", "admin", "/auth/login"),
            ("team_lead", "TeamLeadPass123!", "team_lead", "/auth/login"),
            ("worker_agent", "WorkerPass123!", "user", "/auth/login"),
            ("master_mohsin7", "AdminPassword1234!", "superadmin", "/admin/login")
        ]

        auth_tokens = {}
        for username, password, expected_role, login_endpoint in accounts:
            login_url = base + login_endpoint
            payload = json.dumps({"username": username, "password": password}).encode("utf-8")
            req = urllib.request.Request(login_url, data=payload, headers={"Content-Type": "application/json", "User-Agent": UA})
            try:
                with urllib.request.urlopen(req, timeout=10) as resp:
                    ct = resp.headers.get("Content-Type", "")
                    data = json.loads(resp.read().decode())
                    token = data.get("token")
                    role = data.get("user", {}).get("role") or data.get("role")
                    passed = resp.status == 200 and "application/json" in ct and role == expected_role and bool(token)
                    auth_tokens[username] = token
                    record("Auth", f"Login {username} ({expected_role})", "200 JSON with token", f"{resp.status} {ct.split(';')[0]}", passed, f"role={role}")
            except Exception as e:
                record("Auth", f"Login {username} ({expected_role})", "200 JSON with token", f"ERROR: {e}", False, str(e))

        admin_token = auth_tokens.get("master_mohsin7") or auth_tokens.get("software_owner")
        owner_token = auth_tokens.get("company_owner")
        agent_token = auth_tokens.get("worker_agent")

        # ── 4. API NAMESPACES ACCEPTANCE (AUTHENTICATED) ───────────────────
        namespaces = [
            ("/api/admin/users", "GET", admin_token, "Admin Users API"),
            ("/admin/users", "GET", admin_token, "Direct /admin/users API"),
            ("/api/campaigns", "GET", owner_token, "Campaigns API"),
            ("/campaigns", "GET", owner_token, "Direct /campaigns API"),
            ("/api/crm/overview", "GET", owner_token, "CRM Overview API"),
            ("/api/leads", "GET", agent_token, "Leads API"),
            ("/leads", "GET", agent_token, "Direct /leads API"),
            ("/email/templates", "GET", owner_token, "Direct /email/templates API"),
            ("/api/email/templates", "GET", owner_token, "Aliased /api/email/templates API"),
            ("/emailer/status", "GET", owner_token, "Direct /emailer/status API"),
            ("/api/emailer/status", "GET", owner_token, "Aliased /api/emailer/status API"),
            ("/health", "GET", None, "Direct /health Probe"),
            ("/api/health", "GET", None, "Aliased /api/health Probe"),
            ("/ready", "GET", None, "Direct /ready Probe"),
            ("/api/ready", "GET", None, "Aliased /api/ready Probe"),
            ("/info", "GET", None, "Direct /info Endpoint"),
            ("/api/info", "GET", None, "Aliased /api/info Endpoint"),
            ("/billing/subscription", "GET", owner_token, "Direct /billing/subscription API"),
            ("/teams", "GET", owner_token, "Direct /teams API"),
            ("/api/teams", "GET", owner_token, "Aliased /api/teams API"),
            ("/users", "GET", owner_token, "Direct /users API"),
            ("/api/users", "GET", owner_token, "Aliased /api/users API"),
            ("/invitations", "GET", owner_token, "Direct /invitations API"),
            ("/activity/logs", "GET", owner_token, "Direct /activity/logs API"),
            ("/metrics/agents", "GET", owner_token, "Direct /metrics/agents API")
        ]

        for path, method, token, desc in namespaces:
            url = base + path
            headers = {"User-Agent": UA}
            if token:
                headers["Authorization"] = f"Bearer {token}"
            req = urllib.request.Request(url, headers=headers, method=method)
            try:
                with urllib.request.urlopen(req, timeout=10) as resp:
                    ct = resp.headers.get("Content-Type", "")
                    data = resp.read().decode("utf-8", errors="replace")
                    is_json = "application/json" in ct and not data.strip().startswith("<")
                    record("API", f"{desc} ({path})", "200 JSON", f"{resp.status} {ct.split(';')[0]}", is_json, f"bytes={len(data)}")
            except Exception as e:
                record("API", f"{desc} ({path})", "200 JSON", f"ERROR: {e}", False, str(e))

        # ── 5. NEGATIVE API & CRITICAL SAFETY CHECKS ───────────────────────
        negative_tests = [
            ("GET", "/api/NONEXISTENT_ENDPOINT_SAFETY_CHECK", None, "Nonexistent /api GET endpoint"),
            ("POST", "/api/NONEXISTENT_ENDPOINT_SAFETY_CHECK", "{}", "Nonexistent /api POST endpoint"),
            ("GET", "/admin/NONEXISTENT_ADMIN_ENDPOINT", None, "Nonexistent /admin GET endpoint"),
            ("GET", "/email/NONEXISTENT_EMAIL_ENDPOINT", None, "Nonexistent /email GET endpoint"),
            ("GET", "/api/leads", None, "Unauthenticated /api/leads"),
            ("GET", "/admin/users", None, "Unauthenticated /admin/users"),
            ("POST", "/auth/login", "RAW:{invalid json syntax", "Malformed JSON syntax to /auth/login"),
            ("POST", "/auth/login", json.dumps({"username": "bad_user_999", "password": "wrong_password"}), "Invalid credentials login")
        ]

        for method, path, body, desc in negative_tests:
            url = base + path
            headers = {"User-Agent": UA, "Content-Type": "application/json"}
            req_data = None
            if body:
                if body.startswith("RAW:"):
                    req_data = body[4:].encode("utf-8")
                else:
                    req_data = body.encode("utf-8")
            req = urllib.request.Request(url, data=req_data, headers=headers, method=method)
            try:
                with urllib.request.urlopen(req, timeout=10) as resp:
                    ct = resp.headers.get("Content-Type", "")
                    record("Negative", desc, "4xx JSON error", f"{resp.status} {ct}", False, "Unexpected 200 OK")
            except urllib.error.HTTPError as err:
                ct = err.headers.get("Content-Type", "")
                raw_body = err.read().decode("utf-8", errors="replace")
                is_json = "application/json" in ct and not raw_body.strip().startswith("<")
                passed = is_json and err.code in [400, 401, 403, 404]
                record("Negative", desc, "4xx JSON error", f"{err.code} {ct.split(';')[0]}", passed, raw_body[:50].replace('\n', ' '))

        # ── 6. CORS ORIGIN CHECKS ──────────────────────────────────────────
        cors_cases = [
            ("https://zestify7.online", "Production Apex Origin", True),
            ("https://www.zestify7.online", "Production WWW Origin", True),
            ("https://evil-hacker.com", "Malicious Foreign Origin", False)
        ]

        for origin_header, desc, should_allow in cors_cases:
            url = base + "/api/health"
            req = urllib.request.Request(url, headers={"Origin": origin_header, "User-Agent": UA})
            try:
                with urllib.request.urlopen(req, timeout=10) as resp:
                    acao = resp.headers.get("Access-Control-Allow-Origin")
                    if should_allow:
                        passed = acao == origin_header
                    else:
                        passed = acao is None
                    record("CORS", f"{desc} ({origin_header})", f"ACAO={origin_header if should_allow else 'None'}", f"ACAO={acao}", passed, f"Status {resp.status}")
            except Exception as e:
                record("CORS", f"{desc} ({origin_header})", f"ACAO={origin_header if should_allow else 'None'}", f"ERROR: {e}", False, str(e))

run_suite()

# ── SUMMARY REPORT ────────────────────────────────────────────────────────
total = len(results)
passed = sum(1 for r in results if r["status"] == "PASS")
failed = total - passed

print(f"\n=================================================================", flush=True)
print(f"ACCEPTANCE AUDIT COMPLETE: {passed}/{total} PASSED ({failed} FAILED)", flush=True)
print(f"=================================================================", flush=True)

if failed > 0:
    print("\nFAILED TESTS:", flush=True)
    for r in results:
        if r["status"] == "FAIL":
            print(f"  [FAIL] {r['area']} | {r['test']}: Expected {r['expected']}, got {r['actual']} ({r['evidence']})", flush=True)
    sys.exit(1)
else:
    print("\n[SUCCESS] ALL TESTS PASSED WITH ZERO REGRESSIONS!", flush=True)
    sys.exit(0)
