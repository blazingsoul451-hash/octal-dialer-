import re

with open('website_octal_dialer/backend/src/server.ts', 'r', encoding='utf-8') as f:
    content = f.read()

routes = set()
for m in re.finditer(r'app\.(?:get|post|put|delete|patch|options)\(\s*(\[[^\]]+\]|\'[^\']+\'|"[^"]+")', content):
    arg = m.group(1)
    paths = re.findall(r'[\'\"`]([^\'\"`]+)[\'\"`]', arg)
    for p in paths:
        routes.add(p)

print(f"Total distinct route paths registered in server.ts: {len(routes)}")
prefixes = set()
for r in sorted(list(routes)):
    parts = r.strip('/').split('/')
    if parts:
        prefixes.add('/' + parts[0])

print("\nTop-level route prefixes:")
for p in sorted(list(prefixes)):
    print(f"  {p}")

print("\nAll routes by prefix:")
for p in sorted(list(prefixes)):
    matching = [r for r in sorted(list(routes)) if r.startswith(p)]
    print(f"\n--- {p} ({len(matching)} routes) ---")
    for r in matching:
        print(f"  {r}")
