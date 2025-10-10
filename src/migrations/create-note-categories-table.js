export default {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('NoteCategories', {
      id: {
        allowNull: false,
        autoIncrement: true,
        primaryKey: true,
        type: Sequelize.INTEGER
      },
      name: {
        type: Sequelize.STRING(100),
        allowNull: false
      },
      color: {
        type: Sequelize.STRING(20),
        allowNull: true,
        defaultValue: '#3B82F6'
      },
      icon: {
        type: Sequelize.STRING(50),
        allowNull: true,
        defaultValue: 'Tag'
      },
      isDefault: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: false
      },
      userId: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: {
          model: 'Users',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE'
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
    await queryInterface.addIndex('NoteCategories', ['userId']);
    await queryInterface.addIndex('NoteCategories', ['name']);
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.dropTable('NoteCategories');
  }
};
