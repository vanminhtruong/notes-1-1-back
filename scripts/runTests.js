import { readdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

// Discover tests without shell glob expansion; isolate DB before any imports.
const root = fileURLToPath(new URL('../', import.meta.url));
const files = readdirSync(new URL('../tests/', import.meta.url))
  .filter(file => /(?:\.node-test|\.test)\.js$/.test(file))
  .sort().map(file => `tests/${file}`);
const result = spawnSync(process.execPath, ['--test', ...process.argv.slice(2), ...files], {
  cwd: root, env: { ...process.env, NODE_ENV: 'test' }, stdio: 'inherit',
});
if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
