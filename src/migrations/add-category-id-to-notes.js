export default {
  async up(queryInterface, Sequelize) {
    // Add categoryId column
    await queryInterface.addColumn('Notes', 'categoryId', {
      type: Sequelize.INTEGER,
      allowNull: true,
      references: {
        model: 'NoteCategories',
        key: 'id'
      },
      onUpdate: 'CASCADE',
      onDelete: 'SET NULL'
    });

    // Add index for better query performance
    await queryInterface.addIndex('Notes', ['categoryId']);

    // Remove old category column (string type)
    await queryInterface.removeColumn('Notes', 'category');
  },

  async down(queryInterface, Sequelize) {
    // Add back old category column
    await queryInterface.addColumn('Notes', 'category', {
      type: Sequelize.STRING,
      allowNull: true,
      defaultValue: 'general'
    });

    // Remove categoryId
    await queryInterface.removeIndex('Notes', ['categoryId']);
    await queryInterface.removeColumn('Notes', 'categoryId');
  }
};
