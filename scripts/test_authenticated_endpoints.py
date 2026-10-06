import urllib.request
import urllib.error
import json

domains = ["https://www.zestify7.online", "https://zestify7.online"]

for domain in domains:
    print(f"\n=======================================================")
    print(f"AUTHENTICATED ENDPOINT AUDIT: {domain}")
    print(f"=======================================================")
    
    token_req = urllib.request.Request(
        f'{domain}/auth/login',
        data=json.dumps({'username': 'master_mohsin7', 'password': 'AdminPassword1234!'}).encode(),
        headers={'Content-Type': 'application/json', 'User-Agent': 'Mozilla/5.0'}
    )
    token = json.loads(urllib.request.urlopen(token_req).read().decode())['token']
    print('Got token successfully:', token[:25] + '...')

    endpoints = [
        ('/api/admin/users', 'GET'),
        ('/admin/users', 'GET'),
        ('/api/campaigns', 'GET'),
        ('/campaigns', 'GET'),
        ('/api/crm/overview', 'GET'),
        ('/api/leads', 'GET'),
        ('/leads', 'GET'),
        ('/email/templates', 'GET'),
        ('/api/email/templates', 'GET'),
        ('/emailer/status', 'GET'),
        ('/api/emailer/status', 'GET'),
        ('/health', 'GET'),
        ('/api/health', 'GET'),
        ('/ready', 'GET'),
        ('/api/ready', 'GET'),
        ('/info', 'GET'),
        ('/api/info', 'GET'),
        ('/billing/subscription', 'GET'),
        ('/teams', 'GET'),
        ('/api/teams', 'GET'),
        ('/users', 'GET'),
        ('/api/users', 'GET'),
        ('/invitations', 'GET'),
        ('/activity/logs', 'GET'),
        ('/metrics/agents', 'GET'),
    ]

    print(f"{'ENDPOINT':<26} | {'STATUS':<6} | {'CONTENT-TYPE':<32} | {'RESULT'}")
    print("-" * 90)

    for ep, method in endpoints:
        url = domain + ep
        req = urllib.request.Request(url, headers={'Authorization': f'Bearer {token}', 'User-Agent': 'Mozilla/5.0'}, method=method)
        try:
            with urllib.request.urlopen(req) as resp:
                ct = resp.headers.get('Content-Type', '')
                sample = resp.read().decode('utf-8', errors='replace')[:45].replace('\n', ' ')
                is_html = 'text/html' in ct.lower()
                tag = "[FAIL: HTML]" if is_html else "[PASS: JSON]"
                print(f"{ep:<26} | {resp.status:<6} | {ct:<32} | {tag} {sample}")
        except urllib.error.HTTPError as e:
            ct = e.headers.get('Content-Type', '')
            sample = e.read().decode('utf-8', errors='replace')[:45].replace('\n', ' ')
            is_html = 'text/html' in ct.lower()
            tag = "[FAIL: HTML]" if is_html else "[PASS: JSON]"
            print(f"{ep:<26} | {e.code:<6} | {ct:<32} | {tag} {sample}")
