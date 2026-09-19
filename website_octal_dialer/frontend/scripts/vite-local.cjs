// Load the same Vite config without esbuild's ancestor-directory scan on
// restricted Windows hosts. Normal npm build/dev commands remain available.
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
function config() {
  const code = ts.transpileModule(fs.readFileSync(path.join(__dirname, '../vite.config.ts'), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, esModuleInterop: true }
  }).outputText;
  const module = { exports: {} };
  new Function('require', 'module', 'exports', code)(require, module, module.exports);
  return { ...module.exports.default, configFile: false, cacheDir: '.build-cache/vite' };
}
module.exports = config;
if (require.main === module) {
  (async () => {
    const vite = await import('vite');
    if (process.argv[2] === 'build') await vite.build(config());
    else {
      const options = config();
      options.server = { ...options.server, host: '127.0.0.1', port: Number(process.argv[3] || 5174) };
      const server = await vite.createServer(options);
      await server.listen();
      server.printUrls();
    }
  })().catch(err => { console.error(err); process.exitCode = 1; });
}
