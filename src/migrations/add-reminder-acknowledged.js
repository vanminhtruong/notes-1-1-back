export default {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.addColumn('Notes', 'reminderAcknowledged', {
      type: Sequelize.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    });
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.removeColumn('Notes', 'reminderAcknowledged');
  }
};
