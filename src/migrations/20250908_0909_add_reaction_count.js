export default {
  async up(queryInterface, Sequelize) {
    // Add 'count' column to MessageReactions if missing, default 1
    try {
      const columns = await queryInterface.describeTable('MessageReactions');
      if (!columns.count) {
        await queryInterface.addColumn('MessageReactions', 'count', {
          type: Sequelize.INTEGER,
          allowNull: false,
          defaultValue: 1,
        });
      }
    } catch (e) {
      try {
        await queryInterface.addColumn('MessageReactions', 'count', {
          type: Sequelize.INTEGER,
          allowNull: false,
          defaultValue: 1,
        });
      } catch (_) {}
    }
  },
  async down(queryInterface) {
    try {
      const columns = await queryInterface.describeTable('MessageReactions');
      if (columns.count) {
        await queryInterface.removeColumn('MessageReactions', 'count');
      }
    } catch (_) {
      // ignore
    }
  }
};
