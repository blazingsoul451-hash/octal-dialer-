with open('/etc/nginx/sites-available/default', 'r') as f:
    c = f.read()

target = """    location /billing {
        proxy_pass http://127.0.0.1:5000;
        proxy_set_header Host System.Management.Automation.Internal.Host.InternalHost;
        proxy_set_header X-Real-IP ;
        proxy_set_header X-Forwarded-For ;
    }"""

replacement = """    location /billing {
        proxy_pass http://127.0.0.1:5000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    }"""

if target in c:
    c = c.replace(target, replacement)
    with open('/etc/nginx/sites-available/default', 'w') as f:
        f.write(c)
    print("REPLACED_SUCCESSFULLY")
else:
    print("TARGET_NOT_FOUND")
