import { sequelize } from '../src/db/index.js';
import { DataTypes } from 'sequelize';

async function fixNoteTags() {
  try {
    const qi = sequelize.getQueryInterface();
    
    console.log('🔧 Fixing NoteTags table structure...');
    
    // Step 1: Drop NoteTagMappings first (foreign key constraint)
    console.log('1. Dropping NoteTagMappings table...');
    await qi.dropTable('NoteTagMappings').catch(() => {});
    
    // Step 2: Drop incorrect NoteTags table
    console.log('2. Dropping incorrect NoteTags table...');
    await qi.dropTable('NoteTags').catch(() => {});
    
    // Step 3: Recreate NoteTags with correct structure
    console.log('3. Creating NoteTags table with correct structure...');
    await qi.createTable('NoteTags', {
      id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
      },
      name: {
        type: DataTypes.STRING(50),
        allowNull: false,
      },
      color: {
        type: DataTypes.STRING(7),
        allowNull: false,
        defaultValue: '#3B82F6',
      },
      userId: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: { model: 'Users', key: 'id' },
        onDelete: 'CASCADE',
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
    });
    
    // Step 4: Add indexes
    console.log('4. Adding indexes to NoteTags...');
    await qi.addIndex('NoteTags', ['userId'], {
      name: 'notetags_userid_idx',
    });
    
    await qi.addIndex('NoteTags', ['userId', 'name'], {
      unique: true,
      name: 'notetags_userid_name_unique',
    });
    
    // Step 5: Recreate NoteTagMappings
    console.log('5. Creating NoteTagMappings table...');
    await qi.createTable('NoteTagMappings', {
      id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
      },
      noteId: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: { model: 'Notes', key: 'id' },
        onDelete: 'CASCADE',
      },
      tagId: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: { model: 'NoteTags', key: 'id' },
        onDelete: 'CASCADE',
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
    });
    
    // Step 6: Add indexes to NoteTagMappings
    console.log('6. Adding indexes to NoteTagMappings...');
    await qi.addIndex('NoteTagMappings', ['noteId'], {
      name: 'notetagmappings_noteid_idx',
    });
    
    await qi.addIndex('NoteTagMappings', ['tagId'], {
      name: 'notetagmappings_tagid_idx',
    });
    
    await qi.addIndex('NoteTagMappings', ['noteId', 'tagId'], {
      unique: true,
      name: 'notetagmappings_note_tag_unique',
    });
    
    console.log('✅ Successfully fixed NoteTags and NoteTagMappings tables!');
    console.log('\n📋 Verifying structure...');
    
    const noteTagsColumns = await qi.describeTable('NoteTags');
    console.log('NoteTags columns:', Object.keys(noteTagsColumns).join(', '));
    
    const mappingsColumns = await qi.describeTable('NoteTagMappings');
    console.log('NoteTagMappings columns:', Object.keys(mappingsColumns).join(', '));
    
    await sequelize.close();
    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error.message);
    await sequelize.close();
    process.exit(1);
  }
}

fixNoteTags();
