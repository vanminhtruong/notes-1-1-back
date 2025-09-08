/*
  Migration: Allow multiple reactions per user per message by adding unique constraints including type.
  Works for SQLite by recreating MessageReactions with new unique indexes.
*/

module.exports = {
  async up(queryInterface, Sequelize) {
    const dialect = queryInterface.sequelize.getDialect();
    if (dialect !== 'sqlite') {
      // Generic approach for non-sqlite: try to drop old unique indexes and add new ones
      try {
        await queryInterface.removeIndex('MessageReactions', ['userId', 'messageId']);
      } catch {}
      try {
        await queryInterface.removeIndex('MessageReactions', ['userId', 'groupMessageId']);
      } catch {}
      try {
        await queryInterface.addIndex('MessageReactions', ['userId', 'messageId', 'type'], { unique: true, name: 'mr_user_message_type_unique' });
      } catch {}
      try {
        await queryInterface.addIndex('MessageReactions', ['userId', 'groupMessageId', 'type'], { unique: true, name: 'mr_user_groupmessage_type_unique' });
      } catch {}
      return;
    }

    // SQLite: rebuild table to enforce new uniques
    const sequelize = queryInterface.sequelize;
    await sequelize.query('PRAGMA foreign_keys=OFF;');
    try {
      // 1) Create new table with desired schema
      await sequelize.query(`
        CREATE TABLE IF NOT EXISTS MessageReactions_new (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          userId INTEGER NOT NULL REFERENCES Users(id) ON DELETE CASCADE,
          messageId INTEGER NULL REFERENCES Messages(id) ON DELETE CASCADE,
          groupMessageId INTEGER NULL REFERENCES GroupMessages(id) ON DELETE CASCADE,
          type TEXT NOT NULL,
          reactedAt DATETIME NOT NULL DEFAULT (datetime('now')),
          createdAt DATETIME NOT NULL DEFAULT (datetime('now')),
          updatedAt DATETIME NOT NULL DEFAULT (datetime('now'))
        );
      `);

      // 2) Copy data from old table (ignore duplicates by best-effort)
      // If both messageId and groupMessageId are NULL, those rows shouldn't exist; copy as-is otherwise
      await sequelize.query(`
        INSERT OR IGNORE INTO MessageReactions_new (id, userId, messageId, groupMessageId, type, reactedAt, createdAt, updatedAt)
        SELECT id, userId, messageId, groupMessageId, type, reactedAt, createdAt, updatedAt FROM MessageReactions;
      `);

      // 3) Drop old table and rename new
      await sequelize.query('DROP TABLE MessageReactions;');
      await sequelize.query('ALTER TABLE MessageReactions_new RENAME TO MessageReactions;');

      // 4) Create unique indexes including type
      await sequelize.query("CREATE UNIQUE INDEX IF NOT EXISTS mr_user_message_type_unique ON MessageReactions(userId, messageId, type);");
      await sequelize.query("CREATE UNIQUE INDEX IF NOT EXISTS mr_user_groupmessage_type_unique ON MessageReactions(userId, groupMessageId, type);");
    } finally {
      await sequelize.query('PRAGMA foreign_keys=ON;');
    }
  },

  async down(queryInterface, Sequelize) {
    const dialect = queryInterface.sequelize.getDialect();
    if (dialect !== 'sqlite') {
      try {
        await queryInterface.removeIndex('MessageReactions', 'mr_user_message_type_unique');
      } catch {}
      try {
        await queryInterface.removeIndex('MessageReactions', 'mr_user_groupmessage_type_unique');
      } catch {}
      try {
        await queryInterface.addIndex('MessageReactions', ['userId', 'messageId'], { unique: true, name: 'mr_user_message_unique' });
      } catch {}
      try {
        await queryInterface.addIndex('MessageReactions', ['userId', 'groupMessageId'], { unique: true, name: 'mr_user_groupmessage_unique' });
      } catch {}
      return;
    }

    const sequelize = queryInterface.sequelize;
    await sequelize.query('PRAGMA foreign_keys=OFF;');
    try {
      // Recreate old structure with unique(userId,messageId) and unique(userId,groupMessageId)
      await sequelize.query(`
        CREATE TABLE IF NOT EXISTS MessageReactions_old (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          userId INTEGER NOT NULL REFERENCES Users(id) ON DELETE CASCADE,
          messageId INTEGER NULL REFERENCES Messages(id) ON DELETE CASCADE,
          groupMessageId INTEGER NULL REFERENCES GroupMessages(id) ON DELETE CASCADE,
          type TEXT NOT NULL,
          reactedAt DATETIME NOT NULL DEFAULT (datetime('now')),
          createdAt DATETIME NOT NULL DEFAULT (datetime('now')),
          updatedAt DATETIME NOT NULL DEFAULT (datetime('now'))
        );
      `);
      await sequelize.query(`
        INSERT OR IGNORE INTO MessageReactions_old (id, userId, messageId, groupMessageId, type, reactedAt, createdAt, updatedAt)
        SELECT id, userId, messageId, groupMessageId, type, reactedAt, createdAt, updatedAt FROM MessageReactions;
      `);
      await sequelize.query('DROP TABLE MessageReactions;');
      await sequelize.query('ALTER TABLE MessageReactions_old RENAME TO MessageReactions;');
      await sequelize.query("CREATE UNIQUE INDEX IF NOT EXISTS mr_user_message_unique ON MessageReactions(userId, messageId);");
      await sequelize.query("CREATE UNIQUE INDEX IF NOT EXISTS mr_user_groupmessage_unique ON MessageReactions(userId, groupMessageId);");
    } finally {
      await sequelize.query('PRAGMA foreign_keys=ON;');
    }
  }
};
