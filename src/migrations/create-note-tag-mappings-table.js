export default {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable('NoteTagMappings', {
      id: {
        type: Sequelize.INTEGER,
        primaryKey: true,
        autoIncrement: true,
        allowNull: false,
      },
      noteId: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: {
          model: 'Notes',
          key: 'id',
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
      },
      tagId: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: {
          model: 'NoteTags',
          key: 'id',
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
      },
      createdAt: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
      },
      updatedAt: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
      },
    });

    // Add indexes for better query performance
    await queryInterface.addIndex('NoteTagMappings', ['noteId']);
    await queryInterface.addIndex('NoteTagMappings', ['tagId']);
    
    // Add unique constraint to prevent duplicate tag assignments
    await queryInterface.addIndex('NoteTagMappings', ['noteId', 'tagId'], {
      unique: true,
      name: 'unique_note_tag',
    });
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.dropTable('NoteTagMappings');
  },
};
