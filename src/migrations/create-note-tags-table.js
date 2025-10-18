export default {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable('NoteTags', {
      id: {
        type: Sequelize.INTEGER,
        primaryKey: true,
        autoIncrement: true,
        allowNull: false,
      },
      name: {
        type: Sequelize.STRING,
        allowNull: false,
      },
      color: {
        type: Sequelize.STRING,
        allowNull: false,
        defaultValue: '#3B82F6',
      },
      userId: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: {
          model: 'Users',
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

    // Add index for userId to improve query performance
    await queryInterface.addIndex('NoteTags', ['userId']);
    
    // Add unique constraint for user's tag names (case-insensitive)
    await queryInterface.addIndex('NoteTags', ['userId', 'name'], {
      unique: true,
      name: 'unique_user_tag_name',
    });
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.dropTable('NoteTags');
  },
};
