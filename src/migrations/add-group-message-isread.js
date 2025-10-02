export default {
  up: async (queryInterface, Sequelize) => {
    const tableInfo = await queryInterface.describeTable('GroupMessages');
    if (!tableInfo.isRead) {
      await queryInterface.addColumn('GroupMessages', 'isRead', {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: false
      });
    }
  },

  down: async (queryInterface, Sequelize) => {
    const tableInfo = await queryInterface.describeTable('GroupMessages');
    if (tableInfo.isRead) {
      await queryInterface.removeColumn('GroupMessages', 'isRead');
    }
  }
};
