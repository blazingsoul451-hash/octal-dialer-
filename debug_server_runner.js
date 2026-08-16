const { spawn } = require('child_process');
const path = require('path');

console.log('[DEBUG RUNNER] Starting backend process with full event interception...');

const child = spawn(process.execPath, [path.join(__dirname, 'website_octal_dialer/backend/dist/server.js')], {
  cwd: path.join(__dirname, 'website_octal_dialer/backend'),
  stdio: ['ignore', 'pipe', 'pipe']
});

child.stdout.on('data', (d) => {
  process.stdout.write('[BACKEND STDOUT] ' + d.toString());
});

child.stderr.on('data', (d) => {
  process.stderr.write('[BACKEND STDERR] ' + d.toString());
});

child.on('error', (err) => {
  console.error('[BACKEND ERROR EVENT]', err);
});

child.on('close', (code, signal) => {
  console.log(`[BACKEND CLOSE] Code: ${code}, Signal: ${signal}`);
});

child.on('exit', (code, signal) => {
  console.log(`[BACKEND EXIT] Code: ${code}, Signal: ${signal}`);
});
