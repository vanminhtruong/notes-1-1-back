export default (sequelize, DataTypes) => {
  const Background = sequelize.define('Background', {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },
    uniqueId: {
      type: DataTypes.STRING(50),
      allowNull: false,
      unique: true,
      comment: 'Unique identifier for the background (e.g., coral, nature1)',
    },
    type: {
      type: DataTypes.ENUM('color', 'image'),
      allowNull: false,
      comment: 'Type of background: color or image',
    },
    value: {
      type: DataTypes.STRING(500),
      allowNull: true,
      comment: 'Color hex code or image URL',
    },
    label: {
      type: DataTypes.STRING(100),
      allowNull: false,
      comment: 'Display label for the background',
    },
    category: {
      type: DataTypes.STRING(50),
      allowNull: true,
      comment: 'Category for grouping (e.g., nature, city, abstract)',
    },
    isActive: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true,
      comment: 'Whether this background is active and available for selection',
    },
    sortOrder: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
      comment: 'Sort order for display',
    },
  }, {
    tableName: 'Backgrounds',
    timestamps: true,
    indexes: [
      {
        fields: ['type'],
      },
      {
        fields: ['category'],
      },
      {
        fields: ['isActive'],
      },
      {
        fields: ['sortOrder'],
      },
    ],
  });

  return Background;
};
