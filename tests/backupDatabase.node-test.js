import { test } from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import sqlite3 from 'sqlite3';
import { spawnSync } from 'node:child_process';
import { backupDatabase, restoreDatabaseIfMissing } from '../scripts/backupDatabase.js';

const open = (filename) => new Promise((resolve, reject) => {
  const db = new sqlite3.Database(filename, (error) => error ? reject(error) : resolve(db));
});
const exec = (db, sql) => new Promise((resolve, reject) => db.exec(sql, (error) => error ? reject(error) : resolve()));
const get = (db, sql) => new Promise((resolve, reject) => db.get(sql, (error, row) => error ? reject(error) : resolve(row)));
const close = (db) => new Promise((resolve, reject) => db.close((error) => error ? reject(error) : resolve()));

test('fresh clone restores across paths, skips corrupt newest copy, and preserves existing DB', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'planthub-restore-test-'));
  let db;
  try {
    const storage = path.join(root, 'old-clone', 'app.sqlite');
    const directory = path.join(root, 'backups');
    await fs.mkdir(path.dirname(storage));
    db = await open(storage);
    await exec(db, "CREATE TABLE notes (content TEXT); INSERT INTO notes VALUES ('recover me');");
    await close(db);
    db = null;
    const backup = await backupDatabase({ storage, directory });
    const original = await fs.readFile(backup);
    await fs.writeFile(path.join(directory, 'planthub-aaaaaaaaaaaa-9999-01-01T00-00-00-000Z-bad.sqlite'), 'corrupt');
    const target = path.join(root, 'new-clone', 'data', 'app.sqlite');
    assert.equal(await restoreDatabaseIfMissing({ storage: target, directory }), target);
    db = await open(target);
    assert.equal((await get(db, 'SELECT content FROM notes')).content, 'recover me');
    await exec(db, "INSERT INTO notes VALUES ('new data');");
    await close(db);
    db = null;
    const current = await fs.readFile(target);
    assert.equal(await restoreDatabaseIfMissing({ storage: target, directory }), null);
    assert.deepEqual(await fs.readFile(target), current);
    assert.deepEqual(await fs.readFile(backup), original);
    const absent = path.join(root, 'absent.sqlite');
    assert.equal(await restoreDatabaseIfMissing({ storage: absent, directory: path.join(root, 'none') }), null);
    await fs.writeFile(`${absent}-wal`, 'leftover');
    await assert.rejects(restoreDatabaseIfMissing({ storage: absent, directory }), /sidecar/);
    await assert.rejects(restoreDatabaseIfMissing({ storage: path.join(root, 'bad.sqlite'), directory: await makeCorruptFolder(root) }), /No valid backup/);
  } finally {
    if (db) await close(db);
    await fs.rm(root, { recursive: true, force: true });
  }
});

async function makeCorruptFolder(root) {
  const folder = path.join(root, 'corrupt-only');
  await fs.mkdir(folder);
  await fs.writeFile(path.join(folder, 'planthub-aaaaaaaaaaaa-2026-01-01T00-00-00-000Z-bad.sqlite'), 'corrupt');
  return folder;
}

test('npm run dev installs on a fresh checkout and skips install on the next run', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'planthub-dev-test-'));
  try {
    const project = path.join(root, 'project');
    const fixture = path.join(root, 'fixture');
    await fs.mkdir(path.join(project, 'scripts'), { recursive: true });
    await fs.mkdir(fixture);
    await fs.writeFile(path.join(fixture, 'package.json'), JSON.stringify({ name: 'local-fixture', version: '1.0.0', main: 'index.js' }));
    await fs.writeFile(path.join(fixture, 'index.js'), 'module.exports = {};');
    await fs.writeFile(path.join(project, 'package.json'), JSON.stringify({
      name: 'bootstrap-test', version: '1.0.0', type: 'module',
      dependencies: { 'local-fixture': 'file:../fixture' },
      scripts: { predev: 'node scripts/prepareDev.js', dev: 'node scripts/server.js' },
    }));
    await fs.copyFile(new URL('../scripts/prepareDev.js', import.meta.url), path.join(project, 'scripts/prepareDev.js'));
    await fs.writeFile(path.join(project, 'scripts/backupDatabase.js'), "export async function restoreDatabaseIfMissing() { console.log('RESTORE_CHECK'); } export async function backupDatabase() { console.log('BACKUP_CHECK'); }");
    await fs.writeFile(path.join(project, 'scripts/server.js'), "console.log('SERVER_READY');");
    const invoke = () => spawnSync(process.execPath, [process.env.npm_execpath, 'run', 'dev'], {
      cwd: project, encoding: 'utf8', timeout: 60000,
      env: { ...process.env, npm_config_audit: 'false', npm_config_fund: 'false' },
    });
    const first = invoke();
    assert.equal(first.status, 0, first.stdout + first.stderr);
    assert.match(first.stdout, /Dependencies missing; running npm install/);
    assert.match(first.stdout, /RESTORE_CHECK[\s\S]*BACKUP_CHECK[\s\S]*SERVER_READY/);
    const second = invoke();
    assert.equal(second.status, 0, second.stdout + second.stderr);
    assert.match(second.stdout, /skipping npm install/);
    assert.doesNotMatch(second.stdout, /Dependencies missing/);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test('snapshot restores committed WAL data and retention preserves unrelated files', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'planthub-backup-test-'));
  const storage = path.join(root, 'source.sqlite');
  const directory = path.join(root, 'backups');
  let source;
  let restored;
  try {
    source = await open(storage);
    await exec(source, "PRAGMA journal_mode=WAL; PRAGMA wal_autocheckpoint=0; CREATE TABLE notes (content TEXT); INSERT INTO notes VALUES ('first');");
    const first = await backupDatabase({ storage, directory, keep: 1 });
    await fs.writeFile(path.join(directory, 'unrelated.sqlite'), 'preserve me');
    await exec(source, "INSERT INTO notes VALUES ('committed in WAL');");
    const second = await backupDatabase({ storage, directory, keep: 1 });
    assert.notEqual(first, second);
    assert.equal((await fs.readdir(directory)).filter((name) => name.startsWith('planthub-')).length, 1);
    assert.equal(await fs.readFile(path.join(directory, 'unrelated.sqlite'), 'utf8'), 'preserve me');
    const restorePath = path.join(root, 'restored.sqlite');
    await fs.copyFile(second, restorePath);
    restored = await open(restorePath);
    assert.equal((await get(restored, 'SELECT COUNT(*) AS count FROM notes')).count, 2);
    assert.equal((await get(restored, 'PRAGMA integrity_check')).integrity_check, 'ok');
  } finally {
    if (restored) await close(restored);
    if (source) await close(source);
    await fs.rm(root, { recursive: true, force: true });
  }
});

test('missing database is skipped; invalid settings and corrupt databases fail without pruning backups', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'planthub-backup-test-'));
  try {
    const storage = path.join(root, 'source.sqlite');
    const directory = path.join(root, 'backups');
    assert.equal(await backupDatabase({ storage, directory }), null);
    await assert.rejects(backupDatabase({ storage, directory, keep: 0 }), /positive integer/);
    await fs.writeFile(storage, 'invalid SQLite database');
    await fs.mkdir(directory);
    await fs.writeFile(path.join(directory, 'existing.sqlite'), 'keep');
    await assert.rejects(backupDatabase({ storage, directory }));
    assert.deepEqual(await fs.readdir(directory), ['existing.sqlite']);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});
