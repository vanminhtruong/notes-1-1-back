export default {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.addColumn('Users', 'role', {
      type: Sequelize.ENUM('user', 'admin'),
      allowNull: false,
      defaultValue: 'user',
    });
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.removeColumn('Users', 'role');
  },
};
