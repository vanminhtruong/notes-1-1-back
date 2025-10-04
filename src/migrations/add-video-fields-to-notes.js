export default {
  up: async (queryInterface, Sequelize) => {
    try {
      const columns = await queryInterface.describeTable('Notes');
      
      if (!columns.videoUrl) {
        await queryInterface.addColumn('Notes', 'videoUrl', {
          type: Sequelize.STRING,
          allowNull: true,
        });
      }
      
      if (!columns.youtubeUrl) {
        await queryInterface.addColumn('Notes', 'youtubeUrl', {
          type: Sequelize.STRING,
          allowNull: true,
        });
      }
    } catch (e) {
      // Fallback: attempt add and ignore if exists
      try {
        await queryInterface.addColumn('Notes', 'videoUrl', {
          type: Sequelize.STRING,
          allowNull: true,
        });
      } catch (_) {}
      
      try {
        await queryInterface.addColumn('Notes', 'youtubeUrl', {
          type: Sequelize.STRING,
          allowNull: true,
        });
      } catch (_) {}
    }
  },

  down: async (queryInterface) => {
    try {
      const columns = await queryInterface.describeTable('Notes');
      
      if (columns.videoUrl) {
        await queryInterface.removeColumn('Notes', 'videoUrl');
      }
      
      if (columns.youtubeUrl) {
        await queryInterface.removeColumn('Notes', 'youtubeUrl');
      }
    } catch (_) {
      // ignore
    }
  }
};
