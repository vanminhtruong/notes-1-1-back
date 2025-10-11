export const up = async (queryInterface, Sequelize) => {
  await queryInterface.addColumn('GroupSharedNotes', 'canEdit', {
    type: Sequelize.BOOLEAN,
    defaultValue: false,
    allowNull: false,
  });

  await queryInterface.addColumn('GroupSharedNotes', 'canDelete', {
    type: Sequelize.BOOLEAN,
    defaultValue: false,
    allowNull: false,
  });

  await queryInterface.addColumn('GroupSharedNotes', 'canCreate', {
    type: Sequelize.BOOLEAN,
    defaultValue: false,
    allowNull: false,
  });
};

export const down = async (queryInterface) => {
  await queryInterface.removeColumn('GroupSharedNotes', 'canEdit');
  await queryInterface.removeColumn('GroupSharedNotes', 'canDelete');
  await queryInterface.removeColumn('GroupSharedNotes', 'canCreate');
};
