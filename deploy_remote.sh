#!/bin/bash
set -e

echo "=== 1. BACKING UP & UPDATING NGINX CONFIG ==="
sudo cp /etc/nginx/sites-available/default /etc/nginx/sites-available/default.bak_audit
sudo cp /tmp/nginx_zestify.conf /etc/nginx/sites-available/default

echo "=== 2. TESTING NGINX CONFIG ==="
sudo nginx -t
sudo systemctl reload nginx
echo "Nginx reloaded successfully!"

echo "=== 3. BACKING UP & EXTRACTING BACKEND DIST ==="
cd /home/ubuntu/octal-backend
rm -rf dist.bak_audit
cp -r dist dist.bak_audit
tar -xzf /tmp/backend_dist.tar.gz -C /home/ubuntu/octal-backend/

echo "=== 4. RESTARTING PM2 OCTAL-BACKEND ==="
pm2 restart octal-backend
sleep 2
pm2 status octal-backend

echo "=== 5. EXTRACTING FRONTEND DIST ==="
tar -xzf /tmp/frontend_dist.tar.gz -C /var/www/octal-frontend/
sudo chown -R www-data:www-data /var/www/octal-frontend
echo "Frontend deployed successfully!"
