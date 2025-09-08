module.exports = {
  up: async (queryInterface, Sequelize) => {
    try {
      const columns = await queryInterface.describeTable('Notes');
      if (!columns.imageUrl) {
        await queryInterface.addColumn('Notes', 'imageUrl', {
          type: Sequelize.STRING,
          allowNull: true,
        });
      }
    } catch (e) {
      // Fallback: attempt add and ignore if exists
      try {
        await queryInterface.addColumn('Notes', 'imageUrl', {
          type: Sequelize.STRING,
          allowNull: true,
        });
      } catch (_) {}
    }
  },

  down: async (queryInterface) => {
    try {
      const columns = await queryInterface.describeTable('Notes');
      if (columns.imageUrl) {
        await queryInterface.removeColumn('Notes', 'imageUrl');
      }
    } catch (_) {
      // ignore
    }
  }
};


