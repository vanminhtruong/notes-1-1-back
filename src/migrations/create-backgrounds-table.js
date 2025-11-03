export const up = async (queryInterface, Sequelize) => {
  await queryInterface.createTable('Backgrounds', {
    id: {
      type: Sequelize.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },
    uniqueId: {
      type: Sequelize.STRING(50),
      allowNull: false,
      unique: true,
      comment: 'Unique identifier for the background (e.g., coral, nature1)',
    },
    type: {
      type: Sequelize.ENUM('color', 'image'),
      allowNull: false,
      comment: 'Type of background: color or image',
    },
    value: {
      type: Sequelize.STRING(500),
      allowNull: true,
      comment: 'Color hex code or image URL',
    },
    label: {
      type: Sequelize.STRING(100),
      allowNull: false,
      comment: 'Display label for the background',
    },
    category: {
      type: Sequelize.STRING(50),
      allowNull: true,
      comment: 'Category for grouping (e.g., nature, city, abstract)',
    },
    isActive: {
      type: Sequelize.BOOLEAN,
      allowNull: false,
      defaultValue: true,
      comment: 'Whether this background is active and available for selection',
    },
    sortOrder: {
      type: Sequelize.INTEGER,
      allowNull: false,
      defaultValue: 0,
      comment: 'Sort order for display',
    },
    createdAt: {
      type: Sequelize.DATE,
      allowNull: false,
      defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
    },
    updatedAt: {
      type: Sequelize.DATE,
      allowNull: false,
      defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
    },
  });

  // Add indexes
  await queryInterface.addIndex('Backgrounds', ['type']);
  await queryInterface.addIndex('Backgrounds', ['category']);
  await queryInterface.addIndex('Backgrounds', ['isActive']);
  await queryInterface.addIndex('Backgrounds', ['sortOrder']);
};

export const down = async (queryInterface, Sequelize) => {
  await queryInterface.dropTable('Backgrounds');
};
