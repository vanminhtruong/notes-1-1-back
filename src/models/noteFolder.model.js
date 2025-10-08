export default (sequelize, DataTypes) => {
  const NoteFolder = sequelize.define('NoteFolder', {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },
    name: {
      type: DataTypes.STRING(100),
      allowNull: false,
      validate: {
        len: [1, 100],
      },
    },
    color: {
      type: DataTypes.STRING(20),
      allowNull: true,
      defaultValue: 'blue',
    },
    icon: {
      type: DataTypes.STRING(50),
      allowNull: true,
      defaultValue: 'folder',
    },
    userId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: {
        model: 'Users',
        key: 'id',
      },
    },
  });

  NoteFolder.associate = function(models) {
    NoteFolder.belongsTo(models.User, {
      foreignKey: 'userId',
      as: 'user',
    });
    NoteFolder.hasMany(models.Note, {
      foreignKey: 'folderId',
      as: 'notes',
    });
  };

  return NoteFolder;
};
