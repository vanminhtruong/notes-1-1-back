'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.addColumn('Users', 'language', {
      type: Sequelize.STRING,
      allowNull: false,
      defaultValue: 'vi',
    });
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.removeColumn('Users', 'language');
  }
};
