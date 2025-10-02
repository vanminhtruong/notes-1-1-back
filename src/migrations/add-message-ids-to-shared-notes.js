export default {
  up: async (queryInterface, Sequelize) => {
    // Add messageId to SharedNotes table
    await queryInterface.addColumn('SharedNotes', 'messageId', {
      type: Sequelize.INTEGER,
      allowNull: true,
      references: {
        model: 'Messages',
        key: 'id',
      },
      onUpdate: 'CASCADE',
      onDelete: 'SET NULL',
    });

    // Add groupMessageId to GroupSharedNotes table
    await queryInterface.addColumn('GroupSharedNotes', 'groupMessageId', {
      type: Sequelize.INTEGER,
      allowNull: true,
      references: {
        model: 'GroupMessages',
        key: 'id',
      },
      onUpdate: 'CASCADE',
      onDelete: 'SET NULL',
    });

    // Add indexes for better performance
    await queryInterface.addIndex('SharedNotes', ['messageId']);
    await queryInterface.addIndex('GroupSharedNotes', ['groupMessageId']);
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.removeColumn('SharedNotes', 'messageId');
    await queryInterface.removeColumn('GroupSharedNotes', 'groupMessageId');
  },
};
