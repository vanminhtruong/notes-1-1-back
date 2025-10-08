export default {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('Notes', 'folderId', {
      type: Sequelize.INTEGER,
      allowNull: true,
      references: {
        model: 'NoteFolders',
        key: 'id'
      },
      onUpdate: 'CASCADE',
      onDelete: 'SET NULL'
    });

    // Add index for better query performance
    await queryInterface.addIndex('Notes', ['folderId']);
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.removeIndex('Notes', ['folderId']);
    await queryInterface.removeColumn('Notes', 'folderId');
  }
};
