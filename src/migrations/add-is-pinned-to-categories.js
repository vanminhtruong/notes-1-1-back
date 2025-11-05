export async function up(queryInterface, Sequelize) {
  await queryInterface.addColumn('NoteCategories', 'isPinned', {
    type: Sequelize.BOOLEAN,
    allowNull: false,
    defaultValue: false,
    after: 'isDefault'
  });
}

export async function down(queryInterface, Sequelize) {
  await queryInterface.removeColumn('NoteCategories', 'isPinned');
}
