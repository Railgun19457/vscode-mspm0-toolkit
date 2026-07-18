const fs = require('fs');
const { spawnSync } = require('child_process');
function run(cmd, args) {
  const r = spawnSync(cmd, args, { stdio: 'inherit', shell: process.platform === 'win32' });
  if (r.status !== 0) process.exit(r.status || 1);
}
run('npm', ['run', 'compile-tests']);
fs.mkdirSync('out/test/mocks', { recursive: true });
fs.copyFileSync('src/test/mocks/vscode.js', 'out/test/mocks/vscode.js');
fs.copyFileSync('src/test/setup.cjs', 'out/test/setup.cjs');
run('npx', [
  'mocha', '--ui', 'tdd', '--timeout', '20000',
  '--require', './out/test/setup.cjs',
  'out/test/pathUtil.test.js',
  'out/test/deviceRegistry.test.js',
  'out/test/projectInit.test.js',
  'out/test/projectHealth.test.js',
]);
