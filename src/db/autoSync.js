/*
  Auto-sync Sequelize models to SQLite with data safety.
  - Backs up the current SQLite file to data/backups before applying schema changes
  - Calls sequelize.sync({ alter: true }) so it adjusts tables without dropping data
*/

import path from 'path';
import fs from 'fs';
import 'dotenv/config';
import { sequelize } from './index.js';
// Import models to ensure all are registered before sync
import '../models/index.js';

async function ensureDir(dir) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function getSqlitePath() {
  // sequelize.options.storage holds the path configured in src/db/index.js
  return sequelize?.options?.storage || null;
}

function backupSqliteFile(storagePath) {
  if (!storagePath || storagePath === ':memory:') return null;
  const absStorage = path.isAbsolute(storagePath)
    ? storagePath
    : path.join(process.cwd(), storagePath);
  if (!fs.existsSync(absStorage)) return null; // nothing to backup yet

  const backupDir = path.join(path.dirname(absStorage), 'backups');
  const ts = new Date().toISOString().replace(/[:.]/g, '-');
  const base = path.basename(absStorage, path.extname(absStorage));
  const backupPath = path.join(backupDir, `${base}-${ts}.sqlite.bak`);
  ensureDir(backupDir);
  fs.copyFileSync(absStorage, backupPath);
  return backupPath;
}

async function cleanupTempBackupTables() {
  // SQLite dialect sometimes creates `<table>_backup` when altering columns.
  // If a previous run crashed, these leftovers break subsequent syncs.
  try {
    const qi = sequelize.getQueryInterface();
    const [rows] = await sequelize.query(
      "SELECT name FROM sqlite_master WHERE type='table' AND name LIKE '%_backup';"
    );
    const names = rows.map((r) => r.name).filter(Boolean);
    if (names.length) {
      console.log(`[DB] Cleaning up leftover *_backup tables: ${names.join(', ')}`);
    }
    for (const name of names) {
      try {
        await qi.dropTable(name);
        console.log(`[DB] Dropped temp table: ${name}`);
      } catch (dropErr) {
        console.warn(`[DB] Failed to drop temp table ${name}:`, dropErr?.message || dropErr);
      }
    }
  } catch (err) {
    console.warn('[DB] Cleanup of *_backup tables skipped due to error:', err?.message || err);
  }
}

async function autoSync() {
  const storage = getSqlitePath();
  console.log(`[DB] Using SQLite storage: ${storage}`);

  try {
    console.log('[DB] Authenticating...');
    await sequelize.authenticate();
    console.log('[DB] Authentication OK');

    // Backup before altering schema
    const backupPath = backupSqliteFile(storage);
    if (backupPath) {
      console.log(`[DB] Backup created at: ${backupPath}`);
    } else {
      console.log('[DB] No existing DB file to backup or using in-memory storage.');
    }

    // Clean leftover temporary backup tables created by prior failed alters
    await cleanupTempBackupTables();

    console.log('[DB] Starting sequelize.sync({ alter: true })...');
    const dialect = sequelize.getDialect && sequelize.getDialect();
    let fksDisabled = false;
    try {
      if (dialect === 'sqlite') {
        console.log('[DB] Temporarily disabling SQLite foreign_keys for alter...');
        await sequelize.query('PRAGMA foreign_keys=OFF;');
        fksDisabled = true;
      }
      await sequelize.sync({ alter: true });
      console.log('[DB] Schema synchronized successfully.');
    } finally {
      if (fksDisabled) {
        console.log('[DB] Re-enabling SQLite foreign_keys...');
        try { await sequelize.query('PRAGMA foreign_keys=ON;'); } catch (_) {}
      }
    }
  } catch (err) {
    console.error('[DB] Auto-sync failed:', err);
    process.exitCode = 1;
  } finally {
    try {
      await sequelize.close();
    } catch (_) {}
  }
}

import { fileURLToPath } from 'url';
const __filename = fileURLToPath(import.meta.url);

if (process.argv[1] === __filename) {
  autoSync();
}

export { autoSync };
