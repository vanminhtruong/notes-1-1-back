export default {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('NoteFolders', 'isPinned', {
      type: Sequelize.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    });
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.removeColumn('NoteFolders', 'isPinned');
  }
};
