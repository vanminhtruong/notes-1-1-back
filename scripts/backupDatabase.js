import 'dotenv/config';
import sqlite3 from 'sqlite3';
import { promises as fs, constants } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { createHash, randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const backendRoot = fileURLToPath(new URL('../', import.meta.url));
const open = (filename, mode) => new Promise((resolve, reject) => {
  const db = new sqlite3.Database(filename, mode, (error) => error ? reject(error) : resolve(db));
});
const close = (db) => new Promise((resolve, reject) => db.close((error) => error ? reject(error) : resolve()));
const run = (db, sql) => new Promise((resolve, reject) => db.run(sql, (error) => error ? reject(error) : resolve()));
const get = (db, sql) => new Promise((resolve, reject) => db.get(sql, (error, row) => error ? reject(error) : resolve(row)));

const defaultDirectory = () => process.env.SQLITE_BACKUP_DIR || (process.platform === 'win32'
  ? 'E:/PlantHub-backups/backend'
  : path.join(os.homedir(), 'PlantHub-backups', 'backend'));

export async function restoreDatabaseIfMissing({
  storage = process.env.SQLITE_STORAGE || 'data/app.sqlite',
  directory = defaultDirectory(),
} = {}) {
  if (storage === ':memory:') return null;
  const target = path.resolve(backendRoot, storage);
  try {
    await fs.access(target);
    return null; // Never overwrite an existing database, including an empty one.
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  for (const suffix of ['-wal', '-shm', '-journal']) {
    try {
      await fs.access(`${target}${suffix}`);
    } catch (error) {
      if (error.code === 'ENOENT') continue;
      throw error;
    }
    throw new Error(`Restore stopped: existing SQLite sidecar ${target}${suffix}`);
  }
  const folder = path.resolve(backendRoot, directory);
  let names;
  try {
    names = await fs.readdir(folder);
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    console.log('[Restore] No backup folder found; starting with a new database.');
    return null;
  }
  // Accept previous path-based names too, so a clone at a new location can recover.
  const pattern = /^planthub-(?:[a-f0-9]{12}|backend)-(\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-\d{3}Z)-[a-f0-9-]+\.sqlite$/;
  const candidates = names.filter((name) => pattern.test(name))
    .sort((a, b) => pattern.exec(b)[1].localeCompare(pattern.exec(a)[1]) || b.localeCompare(a));
  if (!candidates.length) {
    console.log('[Restore] No matching backups found; starting with a new database.');
    return null;
  }
  await fs.mkdir(path.dirname(target), { recursive: true });
  for (const name of candidates) {
    const temporary = `${target}.${randomUUID()}.restore`;
    let db;
    try {
      await fs.copyFile(path.join(folder, name), temporary, constants.COPYFILE_EXCL);
      db = await open(temporary, sqlite3.OPEN_READONLY);
      const result = await get(db, 'PRAGMA integrity_check');
      if (result.integrity_check !== 'ok') throw new Error('Integrity check failed');
      await close(db);
      db = null;
    } catch (error) {
      if (db) await close(db).catch(() => {});
      await fs.rm(temporary, { force: true });
      console.warn(`[Restore] Cannot use ${name}: ${error.message}`);
      continue;
    }
    try {
      await fs.chmod(temporary, 0o600);
      // Exclusive copy also protects against another process creating the DB meanwhile.
      await fs.copyFile(temporary, target, constants.COPYFILE_EXCL);
    } finally {
      await fs.rm(temporary, { force: true });
    }
    console.log(`[Restore] Copied ${path.join(folder, name)} to ${target}`);
    return target;
  }
  throw new Error('No valid backup could be restored; startup stopped.');
}

export async function backupDatabase({
  storage = process.env.SQLITE_STORAGE || 'data/app.sqlite',
  directory = defaultDirectory(),
  keep = Number(process.env.SQLITE_BACKUP_KEEP || 14),
} = {}) {
  if (storage === ':memory:') return null;
  if (!Number.isInteger(keep) || keep < 1) throw new Error('SQLITE_BACKUP_KEEP must be a positive integer.');
  const source = path.resolve(backendRoot, storage);
  try {
    await fs.access(source);
  } catch (error) {
    if (error.code === 'ENOENT') {
      console.log('[Backup] No existing database yet; skipping first-run backup.');
      return null;
    }
    throw error;
  }

  const destination = path.resolve(backendRoot, directory);
  await fs.mkdir(destination, { recursive: true, mode: 0o700 });
  const realDestination = await fs.realpath(destination);
  const relative = path.relative(await fs.realpath(backendRoot), realDestination);
  if (!relative || (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative))) {
    throw new Error('SQLITE_BACKUP_DIR must be outside the backend project.');
  }
  const prefix = `planthub-${createHash('sha256').update(source).digest('hex').slice(0, 12)}-`;
  const filename = `${prefix}${new Date().toISOString().replace(/[:.]/g, '-')}-${randomUUID()}.sqlite`;
  const target = path.join(realDestination, filename);
  const temporary = `${target}.partial`;
  let sourceDb;
  let backupDb;
  try {
    sourceDb = await open(source, sqlite3.OPEN_READONLY);
    sourceDb.configure('busyTimeout', 10000);
    // SQLite creates a consistent snapshot, including committed WAL data.
    await run(sourceDb, `VACUUM INTO '${temporary.replace(/'/g, "''")}'`);
    await close(sourceDb);
    sourceDb = null;
    backupDb = await open(temporary, sqlite3.OPEN_READONLY);
    const result = await get(backupDb, 'PRAGMA integrity_check');
    if (result.integrity_check !== 'ok') throw new Error('Backup integrity check failed.');
    await close(backupDb);
    backupDb = null;
    await fs.chmod(temporary, 0o600);
    await fs.rename(temporary, target);
  } catch (error) {
    if (backupDb) await close(backupDb).catch(() => {});
    if (sourceDb) await close(sourceDb).catch(() => {});
    await fs.rm(temporary, { force: true }).catch(() => {});
    throw error;
  }

  console.log(`[Backup] Verified SQLite backup: ${target}`);
  const backups = (await fs.readdir(realDestination))
    .filter((name) => name.startsWith(prefix) && name.endsWith('.sqlite'))
    .sort().reverse();
  for (const name of backups.slice(keep)) await fs.unlink(path.join(realDestination, name));
  return target;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  backupDatabase().catch((error) => {
    console.error('[Backup] Failed; server startup stopped to protect your data:', error.message);
    process.exitCode = 1;
  });
}
