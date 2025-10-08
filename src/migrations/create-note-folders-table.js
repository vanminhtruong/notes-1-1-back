export default {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('NoteFolders', {
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
        defaultValue: 'blue'
      },
      icon: {
        type: Sequelize.STRING(50),
        allowNull: true,
        defaultValue: 'folder'
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
    await queryInterface.addIndex('NoteFolders', ['userId']);
    await queryInterface.addIndex('NoteFolders', ['name']);
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.dropTable('NoteFolders');
  }
};
