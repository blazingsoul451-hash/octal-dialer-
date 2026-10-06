import re
import os

frontend_src = 'website_octal_dialer/frontend/src'
fetch_calls = set()
pattern = re.compile(r'fetch\(\s*[`\'"]([^`\'"]+)[`\'"]')

for root, dirs, files in os.walk(frontend_src):
    for file in files:
        if file.endswith(('.ts', '.tsx', '.js', '.jsx')):
            filepath = os.path.join(root, file)
            with open(filepath, 'r', encoding='utf-8', errors='ignore') as f:
                content = f.read()
                # find template string and literal fetches
                for m in re.finditer(r'fetch\(\s*[`]([^`]+)[`]', content):
                    fetch_calls.add((m.group(1), file))
                for m in re.finditer(r'fetch\(\s*[\'"]([^\'"]+)[\'"]', content):
                    fetch_calls.add((m.group(1), file))

print(f"Total fetch calls found: {len(fetch_calls)}")
print("\nUnique fetch endpoint patterns (sample):")
prefixes = set()
for url, filename in sorted(fetch_calls):
    # normalize ${serverUrl}/path or /path
    clean = re.sub(r'\$\{serverUrl\}', '', url)
    clean = re.sub(r'\$\{WEB_API_BASE\}', '', clean)
    clean = re.sub(r'\$\{baseUrl\}', '', clean)
    clean = re.sub(r'\$\{API_URL\}', '', clean)
    clean = clean.split('?')[0]
    parts = clean.strip('/').split('/')
    if parts and parts[0]:
        prefixes.add('/' + parts[0])

print("Frontend requested path prefixes:")
for p in sorted(list(prefixes)):
    print(" ", p)
