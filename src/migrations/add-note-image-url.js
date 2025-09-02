module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.addColumn('Notes', 'imageUrl', {
      type: Sequelize.STRING,
      allowNull: true,
    });
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.removeColumn('Notes', 'imageUrl');
  }
};


