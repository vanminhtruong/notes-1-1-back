export const up = async (queryInterface, Sequelize) => {
  await queryInterface.addColumn('NoteCategories', 'selectionCount', {
    type: Sequelize.INTEGER,
    allowNull: false,
    defaultValue: 0,
  });
};

export const down = async (queryInterface) => {
  await queryInterface.removeColumn('NoteCategories', 'selectionCount');
};
