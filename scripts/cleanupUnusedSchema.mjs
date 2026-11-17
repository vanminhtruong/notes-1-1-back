/**
 * Guarded removal of confirmed obsolete SQLite artifacts.
 * Default is --dry-run; --apply requires a verified backup and has a transaction.
 * Never deletes populated tables, referenced tables or non-default column data.
 */
import 'dotenv/config';
import sqlite3 from 'sqlite3';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { backupDatabase } from './backupDatabase.js';

const root = fileURLToPath(new URL('../', import.meta.url));
const apply = process.argv.includes('--apply');
const dbArg = process.argv.find(a => a.startsWith('--db='));
const storage = dbArg ? dbArg.slice(5) : process.env.SQLITE_STORAGE || 'data/app.sqlite';
const dbfile = path.resolve(root, storage);

const orphanTables = [
  'Categories',
  'Tags',
  'GroupPreferences',
  'GroupSharedNotePermissions',
  'NoteBackgrounds',
  'UserPermissions',
  'samples',
];
const orphanColumns = [
  { table: 'Users', name: 'faceImageUrl', allowed: 'null' },
  { table: 'Users', name: 'tokenExpiresIn', allowed: 'null' },
  { table: 'Groups', name: 'adminOnlyMessaging', allowed: 'zero' },
  { table: 'Messages', name: 'isEncrypted', allowed: 'zero' },
  { table: 'GroupMessages', name: 'isEncrypted', allowed: 'zero' },
];
const q = name => '"' + name.replaceAll('"', '""') + '"';
const db = new sqlite3.Database(dbfile, sqlite3.OPEN_READWRITE, e => {
  if (e) console.error('Cannot open SQLite database');
});
db.configure('busyTimeout', 10000);
const all = sql => new Promise((resolve, reject) => db.all(sql, (e, rows) => e ? reject(e) : resolve(rows)));
const run = sql => new Promise((resolve, reject) => db.run(sql, e => e ? reject(e) : resolve()));
const get = async sql => (await all(sql))[0];
let transaction = false;
try {
  if ((await get('PRAGMA integrity_check'))?.integrity_check !== 'ok') throw new Error('SQLite integrity check failed before migration');
  if ((await all('PRAGMA foreign_key_check')).length) throw new Error('Foreign key check failed before migration');
  const schema = await all("SELECT type, name, tbl_name, sql FROM sqlite_master WHERE name NOT LIKE 'sqlite_%'");
  const existing = new Set(schema.filter(x => x.type === 'table').map(x => x.name));
  const toDropTables = [];
  const toDropColumns = [];
  for (const name of orphanTables) {
    if (!existing.has(name)) continue;
    const total = (await get('SELECT COUNT(*) AS n FROM ' + q(name))).n;
    if (total !== 0) throw new Error('Refusing to delete populated table: ' + name);
    const usedBy = [];
    for (const other of existing) {
      if (other === name) continue;
      const fks = await all('PRAGMA foreign_key_list(' + q(other) + ')');
      if (fks.some(x => x.table === name)) usedBy.push(other);
    }
    if (usedBy.length) throw new Error('Table has incoming foreign keys: ' + name);
    const relatedViews = schema.filter(x => ['view','trigger'].includes(x.type) && x.sql && new RegExp('\\b' + name + '\\b','i').test(x.sql));
    if (relatedViews.length) throw new Error('Table referenced by view/trigger: ' + name);
    toDropTables.push(name);
  }
  for (const col of orphanColumns) {
    if (!existing.has(col.table)) continue;
    const cols = await all('PRAGMA table_info(' + q(col.table) + ')');
    if (!cols.some(x => x.name === col.name)) continue;
    const clause = col.allowed === 'null' ? q(col.name) + ' IS NOT NULL'
      : '(' + q(col.name) + ' IS NOT NULL AND CAST(' + q(col.name) + " AS TEXT) <> '0')";
    const nonDefault = (await get('SELECT COUNT(*) AS n FROM ' + q(col.table) + ' WHERE ' + clause)).n;
    if (nonDefault > 0) throw new Error('Refusing to delete column with meaningful values: ' + col.table + '.' + col.name);
    const dependentSchema = schema.filter(x => x.type !== 'table' && x.tbl_name === col.table
      && x.sql && new RegExp('\\b' + col.name + '\\b', 'i').test(x.sql));
    if (dependentSchema.length) throw new Error('Column referenced by index/view/trigger: ' + col.table + '.' + col.name);
    toDropColumns.push(col);
  }
  console.log('Guarded cleanup preflight:', JSON.stringify({
    mode: apply ? 'APPLY' : 'DRY_RUN',
    emptyOrphanTables: toDropTables,
    obsoleteColumns: toDropColumns.map(x => x.table + '.' + x.name),
    preserved: ['Notes_backup (contains archived rows)', 'Users.darkTheme (historical preferences)', 'Notes.category (historical category values)'],
  }));
  if (apply) {
    if (!dbArg) await backupDatabase({ keep: 9999 });
    await run('PRAGMA foreign_keys = ON');
    await run('BEGIN IMMEDIATE TRANSACTION');
    transaction = true;
    for (const c of toDropColumns) await run('ALTER TABLE ' + q(c.table) + ' DROP COLUMN ' + q(c.name));
    for (const name of toDropTables) await run('DROP TABLE ' + q(name));
    if ((await all('PRAGMA foreign_key_check')).length) throw new Error('Foreign key check failed, rollback required');
    if ((await get('PRAGMA integrity_check'))?.integrity_check !== 'ok') throw new Error('Integrity check failed, rollback required');
    await run('COMMIT');
    transaction = false;
    console.log('Cleanup committed safely:', toDropTables.length, 'tables,', toDropColumns.length, 'columns');
  } else {
    console.log('Dry-run complete: database unchanged');
  }
} catch (error) {
  if (transaction) await run('ROLLBACK').catch(() => {});
  console.error('Cleanup aborted (no partial deletion):', error.message);
  process.exitCode = 1;
} finally {
  await new Promise(resolve => db.close(resolve));
}
