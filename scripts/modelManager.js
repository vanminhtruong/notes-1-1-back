const { sequelize } = require('../src/db');
const { DataTypes, QueryTypes } = require('sequelize');

class ModelManager {
  constructor() {
    this.qi = sequelize.getQueryInterface();
  }

  async createChatPreferenceTable() {
    console.log('Creating ChatPreferences table if missing...');
    await this.ensureTableExists(
      'ChatPreferences',
      {
        id: {
          type: DataTypes.INTEGER,
          primaryKey: true,
          autoIncrement: true,
        },
        userId: {
          type: DataTypes.INTEGER,
          allowNull: false,
          references: { model: 'Users', key: 'id' },
          onDelete: 'CASCADE',
        },
        otherUserId: {
          type: DataTypes.INTEGER,
          allowNull: false,
          references: { model: 'Users', key: 'id' },
          onDelete: 'CASCADE',
        },
        backgroundUrl: {
          type: DataTypes.TEXT,
          allowNull: true,
        },
        nickname: {
          type: DataTypes.STRING(60),
          allowNull: true,
        },
        createdAt: {
          type: DataTypes.DATE,
          allowNull: false,
          defaultValue: DataTypes.NOW,
        },
        updatedAt: {
          type: DataTypes.DATE,
          allowNull: false,
          defaultValue: DataTypes.NOW,
        },
      },
      [
        {
          fields: ['userId', 'otherUserId'],
          unique: true,
          name: 'chatpreferences_user_other_unique',
        },
      ]
    );
  }

  async ensureColumnExists(tableName, columnName, columnDefinition) {
    try {
      const columns = await this.qi.describeTable(tableName);
      if (!columns[columnName]) {
        console.log(`Adding column ${columnName} to ${tableName}...`);
        await this.qi.addColumn(tableName, columnName, columnDefinition);
        console.log(`✓ Added column ${columnName} to ${tableName}`);
      }
    } catch (error) {
      console.warn(`Warning: Could not add column ${columnName} to ${tableName}:`, error.message);
    }
  }

  async ensureTableExists(tableName, tableDefinition, indexes = []) {
    try {
      const tables = await this.qi.showAllTables();
      if (!tables.includes(tableName)) {
        console.log(`Creating table ${tableName}...`);
        await this.qi.createTable(tableName, tableDefinition);
        console.log(`✓ Created table ${tableName}`);

        // Add indexes
        for (const index of indexes) {
          try {
            await this.qi.addIndex(tableName, index.fields, {
              unique: index.unique || false,
              name: index.name,
            });
            console.log(`✓ Added index ${index.name} to ${tableName}`);
          } catch (indexError) {
            console.warn(`Warning: Could not add index ${index.name}:`, indexError.message);
          }
        }
      }
    } catch (error) {
      console.warn(`Warning: Could not create table ${tableName}:`, error.message);
    }
  }

  async updateMessageTable() {
    console.log('Updating Messages table...');
    
    await this.ensureColumnExists('Messages', 'isDeletedForAll', {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    });

    await this.ensureColumnExists('Messages', 'deletedForUserIds', {
      type: DataTypes.TEXT,
      allowNull: false,
      defaultValue: '[]',
    });

    await this.ensureColumnExists('Messages', 'status', {
      type: DataTypes.ENUM('sent', 'delivered', 'read'),
      allowNull: false,
      defaultValue: 'sent',
    });

    await this.ensureColumnExists('Messages', 'replyToMessageId', {
      type: DataTypes.INTEGER,
      allowNull: true,
      references: {
        model: 'Messages',
        key: 'id',
      },
      onDelete: 'SET NULL',
    });
  }

  async updateGroupMessageTable() {
    console.log('Updating GroupMessages table...');
    
    await this.ensureColumnExists('GroupMessages', 'status', {
      type: DataTypes.ENUM('sent', 'delivered', 'read'),
      allowNull: false,
      defaultValue: 'sent',
    });

    await this.ensureColumnExists('GroupMessages', 'deletedForUserIds', {
      type: DataTypes.TEXT,
      allowNull: false,
      defaultValue: '[]',
    });

    await this.ensureColumnExists('GroupMessages', 'isDeletedForAll', {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    });

    await this.ensureColumnExists('GroupMessages', 'isRead', {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    });

    await this.ensureColumnExists('GroupMessages', 'replyToMessageId', {
      type: DataTypes.INTEGER,
      allowNull: true,
      references: {
        model: 'GroupMessages',
        key: 'id',
      },
      onDelete: 'SET NULL',
    });
  }

  async updateNotesTable() {
    console.log('Updating Notes table...');

    await this.ensureColumnExists('Notes', 'imageUrl', {
      type: DataTypes.STRING,
      allowNull: true,
    });

    // Reminder fields
    await this.ensureColumnExists('Notes', 'reminderAt', {
      type: DataTypes.DATE,
      allowNull: true,
    });

    await this.ensureColumnExists('Notes', 'reminderSent', {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    });

    // Persistent acknowledgement state for reminders
    await this.ensureColumnExists('Notes', 'reminderAcknowledged', {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    });
  }

  async updateUsersTable() {
    console.log('Updating Users table...');
    
    await this.ensureColumnExists('Users', 'avatar', {
      type: DataTypes.STRING,
      allowNull: true,
    });

    // New profile fields
    await this.ensureColumnExists('Users', 'phone', {
      type: DataTypes.STRING,
      allowNull: true,
    });

    await this.ensureColumnExists('Users', 'birthDate', {
      type: DataTypes.DATEONLY,
      allowNull: true,
    });

    await this.ensureColumnExists('Users', 'gender', {
      type: DataTypes.ENUM('male', 'female', 'other', 'unspecified'),
      allowNull: false,
      defaultValue: 'unspecified',
    });

    await this.ensureColumnExists('Users', 'e2eeEnabled', {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    });

    await this.ensureColumnExists('Users', 'e2eePinHash', {
      type: DataTypes.STRING,
      allowNull: true,
    });

    await this.ensureColumnExists('Users', 'lastSeenAt', {
      type: DataTypes.DATE,
      allowNull: true,
    });

    await this.ensureColumnExists('Users', 'readStatusEnabled', {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true,
    });

    await this.ensureColumnExists('Users', 'theme', {
      type: DataTypes.STRING,
      allowNull: false,
      defaultValue: 'light',
    });

    await this.ensureColumnExists('Users', 'language', {
      type: DataTypes.STRING,
      allowNull: false,
      defaultValue: 'vi',
    });

    // Remember-me preference persisted on backend
    await this.ensureColumnExists('Users', 'rememberLogin', {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    });

    // Privacy flags
    await this.ensureColumnExists('Users', 'hidePhone', {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    });

    await this.ensureColumnExists('Users', 'hideBirthDate', {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    });

    await this.ensureColumnExists('Users', 'allowMessagesFromNonFriends', {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    });

    // Role column for admin features
    await this.ensureColumnExists('Users', 'role', {
      type: DataTypes.ENUM('user', 'admin'),
      allowNull: false,
      defaultValue: 'user',
    });
  }

  async updateGroupsTable() {
    console.log('Updating Groups table...');
    
    await this.ensureColumnExists('Groups', 'avatar', {
      type: DataTypes.STRING,
      allowNull: true,
    });

    await this.ensureColumnExists('Groups', 'background', {
      type: DataTypes.STRING,
      allowNull: true,
    });

    // New: admins-only messaging switch
    await this.ensureColumnExists('Groups', 'adminsOnly', {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    });
  }

  async createReadTables() {
    console.log('Creating read tracking tables...');

    // MessageReads table
    await this.ensureTableExists('MessageReads', {
      id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
      },
      messageId: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: {
          model: 'Messages',
          key: 'id',
        },
        onDelete: 'CASCADE',
      },
      userId: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: {
          model: 'Users',
          key: 'id',
        },
        onDelete: 'CASCADE',
      },
      readAt: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW,
      },
      createdAt: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW,
      },
      updatedAt: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW,
      },
    }, [
      {
        fields: ['messageId', 'userId'],
        unique: true,
        name: 'messageread_message_user_unique',
      }
    ]);

    // GroupMessageReads table
    await this.ensureTableExists('GroupMessageReads', {
      id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
      },
      messageId: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: {
          model: 'GroupMessages',
          key: 'id',
        },
        onDelete: 'CASCADE',
      },
      userId: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: {
          model: 'Users',
          key: 'id',
        },
        onDelete: 'CASCADE',
      },
      readAt: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW,
      },
      createdAt: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW,
      },
      updatedAt: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW,
      },
    }, [
      {
        fields: ['messageId', 'userId'],
        unique: true,
        name: 'groupmessageread_message_user_unique',
      }
    ]);
  }

  async fixFriendshipIndexes() {
    console.log('Fixing Friendship indexes...');
    
    try {
      const isSqlite = sequelize.getDialect && sequelize.getDialect() === 'sqlite';
      if (isSqlite) {
        const idxList = await sequelize.query("PRAGMA index_list('Friendships')", { type: QueryTypes.SELECT });
        let hasCompositeUnique = false;
        let needsRebuild = false;
        
        for (const idx of idxList) {
          const cols = await sequelize.query(`PRAGMA index_info('${idx.name}')`, { type: QueryTypes.SELECT });
          const columnNames = cols.map(c => c.name);
          const isUnique = Number(idx.unique) === 1;
          
          if (isUnique && columnNames.length === 1 && columnNames[0] === 'requesterId') {
            if (String(idx.name).startsWith('sqlite_autoindex_Friendships')) {
              needsRebuild = true;
            } else {
              try {
                await this.qi.removeIndex('Friendships', idx.name);
              } catch {
                // Best-effort; ignore if fails
              }
            }
          }
          
          if (isUnique && columnNames.length === 2 && columnNames[0] === 'requesterId' && columnNames[1] === 'addresseeId') {
            hasCompositeUnique = true;
          }
        }

        if (needsRebuild) {
          console.log('Rebuilding Friendships table with correct indexes...');
          try {
            await sequelize.query('PRAGMA foreign_keys=OFF;');
            await sequelize.transaction(async (t) => {
              await sequelize.query('ALTER TABLE Friendships RENAME TO Friendships_old;', { transaction: t });
              await sequelize.query(`
                CREATE TABLE Friendships (
                  id INTEGER PRIMARY KEY AUTOINCREMENT,
                  requesterId INTEGER NOT NULL REFERENCES Users(id) ON DELETE CASCADE,
                  addresseeId INTEGER NOT NULL REFERENCES Users(id) ON DELETE CASCADE,
                  status TEXT NOT NULL CHECK (status IN ('pending','accepted','rejected','blocked')) DEFAULT 'pending',
                  createdAt DATETIME NOT NULL,
                  updatedAt DATETIME NOT NULL,
                  UNIQUE (requesterId, addresseeId)
                );
              `, { transaction: t });
              await sequelize.query(`
                INSERT INTO Friendships (id, requesterId, addresseeId, status, createdAt, updatedAt)
                SELECT id, requesterId, addresseeId, status, createdAt, updatedAt FROM Friendships_old;
              `, { transaction: t });
              await sequelize.query('DROP TABLE Friendships_old;', { transaction: t });
            });
            console.log('✓ Rebuilt Friendships table');
          } finally {
            await sequelize.query('PRAGMA foreign_keys=ON;');
          }
          hasCompositeUnique = true;
        }

        if (!hasCompositeUnique) {
          await this.qi.addIndex('Friendships', ['requesterId', 'addresseeId'], {
            unique: true,
            name: 'friendships_requester_addressee_unique',
          });
          console.log('✓ Added composite unique index to Friendships');
        }
      }
    } catch (error) {
      console.warn('Warning: Could not fix Friendship indexes:', error.message);
    }
  }

  async runMigrations() {
    console.log('🚀 Starting automatic model migrations...');
    
    try {
      // First, do a normal sync
      await sequelize.sync();
      console.log('✓ Basic sync completed');

      // Run all migrations
      await this.updateMessageTable();
      await this.updateGroupMessageTable();
      await this.updateUsersTable();
      await this.updateGroupsTable();
      await this.updateNotesTable();
      await this.createReadTables();
      await this.createChatPreferenceTable();
      // Ensure new columns on existing installations
      await this.ensureColumnExists('ChatPreferences', 'nickname', {
        type: DataTypes.STRING(60),
        allowNull: true,
      });
      await this.fixFriendshipIndexes();

      console.log('✅ All model migrations completed successfully!');
    } catch (error) {
      console.error('❌ Migration failed:', error);
      throw error;
    }
  }
}

module.exports = ModelManager;
