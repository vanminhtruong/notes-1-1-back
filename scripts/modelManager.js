import { sequelize } from '../src/db/index.js';
import { DataTypes, QueryTypes } from 'sequelize';
import {
  ChatPreference,
  NoteCategory,
  NoteFolder,
  NoteTag,
  NoteTagMapping,
  SharedNote,
  GroupSharedNote,
  MessageRead,
  GroupMessageRead,
  Message,
  GroupMessage,
  Note,
  User,
  Group,
} from '../src/models/index.js';

class ModelManager {
  constructor() {
    this.qi = sequelize.getQueryInterface();
  }

  /**
   * Helper method để lấy table definition từ Sequelize model
   * @param {Object} model - Sequelize model instance
   * @returns {Object} Table definition object
   */
  getTableDefinitionFromModel(model) {
    const attributes = model.rawAttributes;
    const tableDefinition = {};

    for (const [key, attr] of Object.entries(attributes)) {
      tableDefinition[key] = {
        type: attr.type,
        allowNull: attr.allowNull !== undefined ? attr.allowNull : true,
        primaryKey: attr.primaryKey || false,
        autoIncrement: attr.autoIncrement || false,
        defaultValue: attr.defaultValue,
        references: attr.references,
        onDelete: attr.onDelete,
        validate: attr.validate,
      };

      // Remove undefined values
      Object.keys(tableDefinition[key]).forEach(k => {
        if (tableDefinition[key][k] === undefined) {
          delete tableDefinition[key][k];
        }
      });
    }

    return tableDefinition;
  }

  /**
   * Helper method để lấy indexes từ Sequelize model
   * @param {Object} model - Sequelize model instance
   * @returns {Array} Array of index definitions
   */
  getIndexesFromModel(model) {
    const indexes = model.options?.indexes || [];
    return indexes.map(idx => ({
      fields: idx.fields,
      unique: idx.unique || false,
      name: idx.name || `${model.tableName}_${idx.fields.join('_')}_idx`,
    }));
  }

  /**
   * Helper method để tự động sync tất cả columns từ model vào table
   * @param {string} tableName - Tên bảng trong database
   * @param {Object} model - Sequelize model instance
   * @param {Array} excludeColumns - Danh sách columns cần bỏ qua (mặc định: id, createdAt, updatedAt)
   */
  async autoSyncModelColumns(tableName, model, excludeColumns = ['id', 'createdAt', 'updatedAt']) {
    const modelAttrs = model.rawAttributes;
    
    for (const [colName, attr] of Object.entries(modelAttrs)) {
      // Bỏ qua các columns trong excludeColumns
      if (excludeColumns.includes(colName)) {
        continue;
      }
      
      // Tự động ensure column tồn tại
      await this.ensureColumnExists(tableName, colName, {
        type: attr.type,
        allowNull: attr.allowNull !== undefined ? attr.allowNull : true,
        defaultValue: attr.defaultValue,
        references: attr.references,
        onDelete: attr.onDelete,
        validate: attr.validate,
      });
    }
  }

  async createChatPreferenceTable() {
    console.log('Creating ChatPreferences table if missing...');
    const tableDefinition = this.getTableDefinitionFromModel(ChatPreference);
    const indexes = this.getIndexesFromModel(ChatPreference);
    await this.ensureTableExists('ChatPreferences', tableDefinition, indexes);
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
    // Tự động sync tất cả columns từ model (bỏ qua id, createdAt, updatedAt)
    await this.autoSyncModelColumns('Messages', Message);
  }

  async updateGroupMessageTable() {
    console.log('Updating GroupMessages table...');
    // Tự động sync tất cả columns từ model (bỏ qua id, createdAt, updatedAt)
    await this.autoSyncModelColumns('GroupMessages', GroupMessage);
  }

  async updateNotesTable() {
    console.log('Updating Notes table...');

    // Tự động sync tất cả columns từ model (bỏ qua id, createdAt, updatedAt)
    await this.autoSyncModelColumns('Notes', Note);

    // Try to remove old category column if it exists (string type)
    try {
      const columns = await this.qi.describeTable('Notes');
      if (columns.category && columns.category.type.toLowerCase().includes('varchar')) {
        console.log('Removing old category column from Notes...');
        await this.qi.removeColumn('Notes', 'category');
        console.log('✓ Removed old category column');
      }
    } catch (error) {
      console.warn('Warning: Could not remove old category column:', error.message);
    }
  }

  async createNoteCategoriesTable() {
    console.log('Creating NoteCategories table if missing...');
    const tableDefinition = this.getTableDefinitionFromModel(NoteCategory);
    const indexes = [
      { fields: ['userId'], name: 'notecategories_userid_idx' },
      { fields: ['name'], name: 'notecategories_name_idx' },
      { fields: ['isPinned'], name: 'notecategories_ispinned_idx' },
    ];
    await this.ensureTableExists('NoteCategories', tableDefinition, indexes);
  }

  async updateNoteCategoriesTable() {
    console.log('Updating NoteCategories table...');
    
    // Tự động sync tất cả columns từ model
    await this.autoSyncModelColumns('NoteCategories', NoteCategory);

    // Tối ưu: Đảm bảo indexes tồn tại cho performance
    try {
      const indexes = await this.qi.showIndex('NoteCategories');
      const indexNames = indexes.map(idx => idx.name);

      if (!indexNames.includes('notecategories_userid_idx')) {
        await this.qi.addIndex('NoteCategories', ['userId'], {
          name: 'notecategories_userid_idx',
        });
        console.log('✓ Added userId index to NoteCategories');
      }

      if (!indexNames.includes('notecategories_name_idx')) {
        await this.qi.addIndex('NoteCategories', ['name'], {
          name: 'notecategories_name_idx',
        });
        console.log('✓ Added name index to NoteCategories');
      }

      // Thêm composite index cho query tìm trùng lặp nhanh hơn
      if (!indexNames.includes('notecategories_userid_name_idx')) {
        await this.qi.addIndex('NoteCategories', ['userId', 'name'], {
          name: 'notecategories_userid_name_idx',
        });
        console.log('✓ Added composite userId+name index to NoteCategories');
      }

      // Thêm index cho isPinned để tối ưu sorting
      if (!indexNames.includes('notecategories_ispinned_idx')) {
        await this.qi.addIndex('NoteCategories', ['isPinned'], {
          name: 'notecategories_ispinned_idx',
        });
        console.log('✓ Added isPinned index to NoteCategories');
      }
    } catch (error) {
      console.warn('Warning: Could not add indexes to NoteCategories:', error.message);
    }
  }

  async createNoteFoldersTable() {
    console.log('Creating NoteFolders table if missing...');
    const tableDefinition = this.getTableDefinitionFromModel(NoteFolder);
    const indexes = [
      { fields: ['userId'], name: 'notefolders_userid_idx' },
      { fields: ['name'], name: 'notefolders_name_idx' },
    ];
    await this.ensureTableExists('NoteFolders', tableDefinition, indexes);
  }

  async createNoteTagsTable() {
    console.log('Creating NoteTags table if missing...');
    const tableDefinition = this.getTableDefinitionFromModel(NoteTag);
    const indexes = [
      { fields: ['userId'], name: 'notetags_userid_idx' },
      { fields: ['userId', 'name'], unique: true, name: 'notetags_userid_name_unique' },
    ];
    await this.ensureTableExists('NoteTags', tableDefinition, indexes);
  }

  async updateNoteTagsTable() {
    console.log('Updating NoteTags table...');
    // Tự động sync tất cả columns từ model
    await this.autoSyncModelColumns('NoteTags', NoteTag);
  }

  async createNoteTagMappingsTable() {
    console.log('Creating NoteTagMappings table if missing...');
    const tableDefinition = this.getTableDefinitionFromModel(NoteTagMapping);
    const indexes = [
      { fields: ['noteId'], name: 'notetagmappings_noteid_idx' },
      { fields: ['tagId'], name: 'notetagmappings_tagid_idx' },
      { fields: ['noteId', 'tagId'], unique: true, name: 'notetagmappings_note_tag_unique' },
    ];
    await this.ensureTableExists('NoteTagMappings', tableDefinition, indexes);
  }

  async createSharedNotesTable() {
    console.log('Creating SharedNotes table if missing...');
    const tableDefinition = this.getTableDefinitionFromModel(SharedNote);
    const indexes = [
      { fields: ['noteId'], name: 'sharednotes_noteid_idx' },
      { fields: ['sharedWithUserId'], name: 'sharednotes_sharedwithuser_idx' },
      { fields: ['sharedByUserId'], name: 'sharednotes_sharedbyuser_idx' },
      { fields: ['messageId'], name: 'sharednotes_messageid_idx' },
      { fields: ['sharedAt'], name: 'sharednotes_sharedat_idx' },
    ];
    await this.ensureTableExists('SharedNotes', tableDefinition, indexes);
  }

  async updateSharedNotesTable() {
    console.log('Updating SharedNotes table...');
    // Tự động sync tất cả columns từ model
    await this.autoSyncModelColumns('SharedNotes', SharedNote);
  }

  async createGroupSharedNotesTable() {
    console.log('Creating GroupSharedNotes table if missing...');
    const tableDefinition = this.getTableDefinitionFromModel(GroupSharedNote);
    const indexes = [
      { fields: ['noteId'], name: 'groupsharednotes_noteid_idx' },
      { fields: ['groupId'], name: 'groupsharednotes_groupid_idx' },
      { fields: ['sharedByUserId'], name: 'groupsharednotes_sharedbyuser_idx' },
      { fields: ['groupMessageId'], name: 'groupsharednotes_groupmessageid_idx' },
      { fields: ['sharedAt'], name: 'groupsharednotes_sharedat_idx' },
    ];
    await this.ensureTableExists('GroupSharedNotes', tableDefinition, indexes);
  }

  async updateGroupSharedNotesTable() {
    console.log('Updating GroupSharedNotes table...');
    // Tự động sync tất cả columns từ model
    await this.autoSyncModelColumns('GroupSharedNotes', GroupSharedNote);
  }

  async updateUsersTable() {
    console.log('Updating Users table...');
    // Tự động sync tất cả columns từ model (bỏ qua id, email, password, name, createdAt, updatedAt)
    // Giữ lại email, password, name vì đây là các trường cơ bản đã tồn tại từ đầu
    await this.autoSyncModelColumns('Users', User, ['id', 'email', 'password', 'name', 'isActive', 'createdAt', 'updatedAt']);
  }

  async updateGroupsTable() {
    console.log('Updating Groups table...');
    // Tự động sync tất cả columns từ model (bỏ qua id, name, ownerId, createdAt, updatedAt)
    await this.autoSyncModelColumns('Groups', Group, ['id', 'name', 'ownerId', 'createdAt', 'updatedAt']);
  }

  async createReadTables() {
    console.log('Creating read tracking tables...');

    // MessageReads table
    const messageReadTableDef = this.getTableDefinitionFromModel(MessageRead);
    const messageReadIndexes = this.getIndexesFromModel(MessageRead);
    await this.ensureTableExists('MessageReads', messageReadTableDef, messageReadIndexes);

    // GroupMessageReads table
    const groupMessageReadTableDef = this.getTableDefinitionFromModel(GroupMessageRead);
    const groupMessageReadIndexes = this.getIndexesFromModel(GroupMessageRead);
    await this.ensureTableExists('GroupMessageReads', groupMessageReadTableDef, groupMessageReadIndexes);
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
      
      // Note Categories migrations - must be before updateNotesTable
      await this.createNoteCategoriesTable();
      await this.updateNoteCategoriesTable();
      
      // Note Folders migrations - must be before updateNotesTable
      await this.createNoteFoldersTable();
      
      // Note Tags migrations - must be before NoteTagMappings
      await this.createNoteTagsTable();
      await this.updateNoteTagsTable();
      await this.createNoteTagMappingsTable();
      
      await this.updateNotesTable();
      
      await this.createReadTables();
      await this.createChatPreferenceTable();
      
      // Shared Notes migrations
      await this.createSharedNotesTable();
      await this.updateSharedNotesTable();
      await this.createGroupSharedNotesTable();
      await this.updateGroupSharedNotesTable();
      
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

export default ModelManager;
