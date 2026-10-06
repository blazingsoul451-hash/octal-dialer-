import urllib.request
import urllib.error
import json

base_urls = ["https://www.zestify7.online", "https://zestify7.online"]

tests = [
    ("POST", "/auth/login", {"username": "master_mohsin7", "password": "AdminPassword1234!"}, {}, "Valid login"),
    ("POST", "/auth/login", {"username": "master_mohsin7", "password": "wrongpassword"}, {}, "Bad password"),
    ("POST", "/auth/login", {"username": "nobody_exists_xyz", "password": "password123"}, {}, "Nonexistent user"),
    ("POST", "/auth/login", {}, {}, "Empty JSON body"),
    ("POST", "/auth/login", {"username": None, "password": None}, {}, "Null fields"),
    ("POST", "/auth/login", "RAW:{bad json", {}, "Malformed JSON"),
    ("GET", "/auth/verify", None, {}, "Missing Authorization header"),
    ("GET", "/auth/verify", None, {"Authorization": "Bearer badtoken123"}, "Invalid Bearer token"),
    ("GET", "/auth/verify", None, {"Authorization": "MalformedFormat"}, "Malformed Auth header"),
    ("GET", "/api/crm/overview", None, {}, "Unauthenticated CRM overview"),
    ("GET", "/api/campaigns", None, {}, "Unauthenticated campaigns"),
    ("GET", "/api/devices", None, {}, "Unauthenticated devices"),
    ("GET", "/api/nonexistent_endpoint_123", None, {}, "Nonexistent API GET"),
    ("POST", "/api/nonexistent_endpoint_123", {}, {}, "Nonexistent API POST"),
    ("GET", "/admin/users", None, {}, "Direct /admin/users (Nginx check)"),
    ("GET", "/email/templates", None, {}, "Direct /email/templates (Nginx check)"),
    ("GET", "/emailer/status", None, {}, "Direct /emailer/status (Nginx check)"),
    ("GET", "/health", None, {}, "Direct /health (Nginx check)")
]

headers_default = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0 Safari/537.36",
    "Content-Type": "application/json"
}

print(f"{'URL':<28} | {'TEST':<32} | {'STATUS':<7} | {'CONTENT-TYPE':<25} | {'BODY SAMPLE'}")
print("-" * 120)

for base in base_urls:
    origin = base
    for method, path, body, extra_headers, desc in tests:
        url = base + path
        h = headers_default.copy()
        h["Origin"] = origin
        h.update(extra_headers)

        req_data = None
        if body is not None:
            if isinstance(body, str) and body.startswith("RAW:"):
                req_data = body[4:].encode("utf-8")
            else:
                req_data = json.dumps(body).encode("utf-8")

        req = urllib.request.Request(url, data=req_data, headers=h, method=method)
        status = 0
        ct = ""
        sample = ""
        try:
            with urllib.request.urlopen(req) as resp:
                status = resp.status
                ct = resp.headers.get("Content-Type", "")
                raw = resp.read().decode("utf-8", errors="replace")
                sample = raw[:60].replace("\n", " ").replace("\r", "")
        except urllib.error.HTTPError as e:
            status = e.code
            ct = e.headers.get("Content-Type", "")
            raw = e.read().decode("utf-8", errors="replace")
            sample = raw[:60].replace("\n", " ").replace("\r", "")
        except Exception as ex:
            sample = f"ERR: {ex}"

        is_html = "text/html" in ct.lower()
        flag = " [FAIL: HTML]" if is_html else ""
        print(f"{base:<28} | {desc:<32} | {status:<7} | {ct:<25} | {sample}{flag}")
