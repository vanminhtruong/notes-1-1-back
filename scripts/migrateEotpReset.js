import 'dotenv/config';
import { existsSync, copyFileSync, mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { sequelize } from '../src/db/index.js';
import '../src/models/index.js';

// Add only the two columns required by real SMS verification; never drop user data.
async function migrate() {
  const query = sequelize.getQueryInterface();
  const storage = sequelize.options.storage;
  const fullPath = storage && storage !== ':memory:' ? resolve(storage) : null;
  const definition = {
    providerRequestId: { type: 'VARCHAR(255)', allowNull: true },
    resetTokenHash: { type: 'VARCHAR(255)', allowNull: true },
  };
  try {
    if (fullPath && existsSync(fullPath)) {
      const dir = join(dirname(fullPath), 'backups');
      mkdirSync(dir, { recursive: true });
      const stamp = new Date().toISOString().replace(/[:.]/g, '-');
      copyFileSync(fullPath, join(dir, 'pre-eotp-' + stamp + '.sqlite.bak'));
      console.log('[eOTP migration] Database backup created.');
    }
    const tables = await query.showAllTables();
    if (!tables.some((table) => (typeof table === 'string' ? table : table.tableName) === 'PasswordResets')) {
      throw new Error('PasswordResets table not found. Run the normal initial database setup first.');
    }
    let columns = await query.describeTable('PasswordResets');
    for (const [name, spec] of Object.entries(definition)) {
      if (columns[name]) continue;
      await query.addColumn('PasswordResets', name, spec);
      console.log('[eOTP migration] Added column: ' + name);
      columns = await query.describeTable('PasswordResets');
    }
    console.log('[eOTP migration] Schema is ready.');
  } finally {
    await sequelize.close();
  }
}

migrate().catch((err) => {
  console.error('[eOTP migration] Failed:', err.message);
  process.exitCode = 1;
});
