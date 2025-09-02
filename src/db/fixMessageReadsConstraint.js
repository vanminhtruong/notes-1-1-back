const { sequelize } = require('./index');

async function fixMessageReadsConstraint() {
  try {
    console.log('Fixing MessageReads table constraint...');
    
    // Drop and recreate the MessageReads table with correct constraints
    await sequelize.query('PRAGMA foreign_keys=OFF;');
    
    // Drop the table if it exists
    await sequelize.query('DROP TABLE IF EXISTS MessageReads;');
    
    // Recreate with correct composite unique constraint
    await sequelize.query(`
      CREATE TABLE "MessageReads" (
        "id" INTEGER PRIMARY KEY AUTOINCREMENT,
        "messageId" INTEGER NOT NULL REFERENCES "Messages" ("id") ON DELETE CASCADE,
        "userId" INTEGER NOT NULL REFERENCES "Users" ("id") ON DELETE CASCADE,
        "readAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        UNIQUE("messageId", "userId")
      );
    `);
    
    // Create index for performance
    await sequelize.query('CREATE INDEX "message_reads_messageId_userId" ON "MessageReads" ("messageId", "userId");');
    
    await sequelize.query('PRAGMA foreign_keys=ON;');
    
    console.log('✅ MessageReads constraint fixed successfully!');
    await sequelize.close();
  } catch (error) {
    console.error('❌ Fix failed:', error);
    process.exit(1);
  }
}

// Run if called directly
if (require.main === module) {
  fixMessageReadsConstraint();
}

module.exports = { fixMessageReadsConstraint };
