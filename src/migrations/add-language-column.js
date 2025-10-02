export default {
  up: async (queryInterface, Sequelize) => {
    const tableInfo = await queryInterface.describeTable('Users');
    if (!tableInfo.language) {
      await queryInterface.addColumn('Users', 'language', {
        type: Sequelize.STRING,
        allowNull: false,
        defaultValue: 'vi',
      });
    }
  },

  down: async (queryInterface, Sequelize) => {
    const tableInfo = await queryInterface.describeTable('Users');
    if (tableInfo.language) {
      await queryInterface.removeColumn('Users', 'language');
    }
  }
};
