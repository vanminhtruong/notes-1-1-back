export default (sequelize, DataTypes) => {
  const NoteCategory = sequelize.define('NoteCategory', {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },
    name: {
      type: DataTypes.STRING,
      allowNull: false,
      validate: {
        len: [1, 100],
      },
    },
    color: {
      type: DataTypes.STRING,
      allowNull: true,
      defaultValue: '#3B82F6',
    },
    icon: {
      type: DataTypes.STRING,
      allowNull: true,
      defaultValue: 'Tag',
    },
    isDefault: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    },
    userId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: {
        model: 'Users',
        key: 'id',
      },
    },
    selectionCount: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
    },
  });

  NoteCategory.associate = function(models) {
    NoteCategory.belongsTo(models.User, {
      foreignKey: 'userId',
      as: 'user',
    });
    NoteCategory.hasMany(models.Note, {
      foreignKey: 'categoryId',
      as: 'notes',
    });
  };

  return NoteCategory;
};
