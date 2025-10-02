export default {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('SharedNotes', {
      id: {
        allowNull: false,
        autoIncrement: true,
        primaryKey: true,
        type: Sequelize.INTEGER
      },
      noteId: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: {
          model: 'Notes',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE'
      },
      sharedWithUserId: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: {
          model: 'Users',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE'
      },
      sharedByUserId: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: {
          model: 'Users',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE'
      },
      canEdit: {
        type: Sequelize.BOOLEAN,
        defaultValue: false
      },
      canDelete: {
        type: Sequelize.BOOLEAN,
        defaultValue: false
      },
      message: {
        type: Sequelize.TEXT,
        allowNull: true
      },
      sharedAt: {
        type: Sequelize.DATE,
        defaultValue: Sequelize.NOW
      },
      isActive: {
        type: Sequelize.BOOLEAN,
        defaultValue: true
      },
      createdAt: {
        allowNull: false,
        type: Sequelize.DATE
      },
      updatedAt: {
        allowNull: false,
        type: Sequelize.DATE
      }
    });

    // Add indexes for better performance
    await queryInterface.addIndex('SharedNotes', ['noteId']);
    await queryInterface.addIndex('SharedNotes', ['sharedWithUserId']);
    await queryInterface.addIndex('SharedNotes', ['sharedByUserId']);
    await queryInterface.addIndex('SharedNotes', ['isActive']);
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.dropTable('SharedNotes');
  }
};
