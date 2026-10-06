import re
import os

frontend_src = 'website_octal_dialer/frontend/src'
matches = []

for root, dirs, files in os.walk(frontend_src):
    for file in files:
        if file.endswith(('.ts', '.tsx', '.js', '.jsx')):
            filepath = os.path.join(root, file)
            with open(filepath, 'r', encoding='utf-8', errors='ignore') as f:
                lines = f.readlines()
                for idx, line in enumerate(lines):
                    if re.search(r'\.(?:json\(\)|json\s*\(\s*\))', line):
                        # check if it's JSON.stringify or JSON.parse
                        if 'JSON.stringify' in line or 'JSON.parse' in line:
                            continue
                        matches.append((file, idx + 1, line.strip()))

print(f"Total .json() calls in frontend: {len(matches)}")
print("\nFirst 30 .json() calls:")
for file, lineno, line in matches[:30]:
    print(f"{file}:{lineno}: {line}")
