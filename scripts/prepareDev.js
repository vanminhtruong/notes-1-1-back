// Built-in modules only: this script must work immediately after a fresh clone.
import { readFileSync, existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = fileURLToPath(new URL('../', import.meta.url));
const require = createRequire(new URL('../package.json', import.meta.url));

export function dependenciesMissing() {
  if (!existsSync(path.join(root, 'node_modules'))) return true;
  const pkg = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8'));
  return Object.keys({ ...pkg.dependencies, ...pkg.devDependencies }).some((name) => {
    try {
      require.resolve(name);
      return false;
    } catch {
      return true;
    }
  });
}

async function prepareDev() {
  if (dependenciesMissing()) {
    console.log('[Dev] Dependencies missing; running npm install...');
    if (!process.env.npm_execpath) throw new Error('Run this through npm run dev.');
    const result = spawnSync(process.execPath, [process.env.npm_execpath, 'install', '--include=dev'], {
      cwd: root, stdio: 'inherit',
    });
    if (result.error) throw result.error;
    if (result.status !== 0) throw new Error(`npm install failed (exit ${result.status}).`);
    if (dependenciesMissing()) throw new Error('Dependencies are still missing after npm install.');
  } else {
    console.log('[Dev] Dependencies already available; skipping npm install.');
  }
  const { restoreDatabaseIfMissing, backupDatabase } = await import('./backupDatabase.js');
  await restoreDatabaseIfMissing();
  await backupDatabase();
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  prepareDev().catch((error) => {
    console.error('[Dev] Preparation failed; server not started:', error.message);
    process.exitCode = 1;
  });
}
