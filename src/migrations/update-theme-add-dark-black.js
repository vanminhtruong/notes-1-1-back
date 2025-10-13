export async function up(queryInterface, Sequelize) {
  await queryInterface.changeColumn('Users', 'theme', {
    type: Sequelize.STRING,
    allowNull: false,
    defaultValue: 'light',
    validate: {
      isIn: [['light', 'dark', 'dark-black']],
    },
  });
}

export async function down(queryInterface, Sequelize) {
  // Revert dark-black to dark before changing column
  await queryInterface.sequelize.query(
    "UPDATE Users SET theme = 'dark' WHERE theme = 'dark-black'"
  );
  
  await queryInterface.changeColumn('Users', 'theme', {
    type: Sequelize.STRING,
    allowNull: false,
    defaultValue: 'light',
    validate: {
      isIn: [['light', 'dark']],
    },
  });
}
