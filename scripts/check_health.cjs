const http = require('http');

async function request(options, data) {
  return new Promise((resolve, reject) => {
    const req = http.request(options, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, data: JSON.parse(body) });
        } catch {
          resolve({ status: res.statusCode, text: body });
        }
      });
    });
    req.on('error', reject);
    if (data) req.write(JSON.stringify(data));
    req.end();
  });
}

async function main() {
  console.log('[Health Check] Logging in as platform admin...');
  const loginRes = await request({
    hostname: 'localhost',
    port: 5000,
    path: '/auth/login',
    method: 'POST',
    headers: { 'Content-Type': 'application/json' }
  }, { username: 'admin', password: 'AdminPassword1234!' });

  if (loginRes.status !== 200 || !loginRes.data.token) {
    console.error('Failed to log in as admin:', loginRes);
    process.exit(1);
  }

  console.log(`[Health Check] Admin token acquired. Role: ${loginRes.data.user.role}`);

  const healthRes = await request({
    hostname: 'localhost',
    port: 5000,
    path: '/api/super-admin/system-health',
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${loginRes.data.token}`,
      'Content-Type': 'application/json'
    }
  });

  console.log(`[Health Check] Status: ${healthRes.status}`);
  console.log('[Health Check] System Health Response:');
  console.log(JSON.stringify(healthRes.data || healthRes.text, null, 2));
}

main().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
