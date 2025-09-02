'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    const tableInfo = await queryInterface.describeTable('Users');
    if (!tableInfo.hidePhone) {
      await queryInterface.addColumn('Users', 'hidePhone', {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: false,
      });
    }
    if (!tableInfo.hideBirthDate) {
      await queryInterface.addColumn('Users', 'hideBirthDate', {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: false,
      });
    }
  },

  down: async (queryInterface, Sequelize) => {
    const tableInfo = await queryInterface.describeTable('Users');
    if (tableInfo.hidePhone) {
      await queryInterface.removeColumn('Users', 'hidePhone');
    }
    if (tableInfo.hideBirthDate) {
      await queryInterface.removeColumn('Users', 'hideBirthDate');
    }
  }
};
