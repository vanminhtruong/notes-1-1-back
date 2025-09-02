'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    const tableInfo = await queryInterface.describeTable('Users');
    if (!tableInfo.theme) {
      await queryInterface.addColumn('Users', 'theme', {
        type: Sequelize.STRING,
        allowNull: false,
        defaultValue: 'light',
      });
    }
  },

  down: async (queryInterface, Sequelize) => {
    const tableInfo = await queryInterface.describeTable('Users');
    if (tableInfo.theme) {
      await queryInterface.removeColumn('Users', 'theme');
    }
  }
};
