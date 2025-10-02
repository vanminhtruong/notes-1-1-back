export default {
  up: async (queryInterface, Sequelize) => {
    const tableInfo = await queryInterface.describeTable('Users');
    if (!tableInfo.readStatusEnabled) {
      await queryInterface.addColumn('Users', 'readStatusEnabled', {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: true
      });
    }
  },

  down: async (queryInterface, Sequelize) => {
    const tableInfo = await queryInterface.describeTable('Users');
    if (tableInfo.readStatusEnabled) {
      await queryInterface.removeColumn('Users', 'readStatusEnabled');
    }
  }
};
