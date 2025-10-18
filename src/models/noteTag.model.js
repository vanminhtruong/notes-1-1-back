export default (sequelize, DataTypes) => {
  const NoteTag = sequelize.define('NoteTag', {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },
    name: {
      type: DataTypes.STRING,
      allowNull: false,
      validate: {
        len: [1, 50],
      },
    },
    color: {
      type: DataTypes.STRING,
      allowNull: false,
      defaultValue: '#3B82F6', // blue-500
      validate: {
        is: /^#[0-9A-F]{6}$/i,
      },
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

  NoteTag.associate = function(models) {
    NoteTag.belongsTo(models.User, {
      foreignKey: 'userId',
      as: 'user',
    });
    NoteTag.belongsToMany(models.Note, {
      through: 'NoteTagMappings',
      foreignKey: 'tagId',
      otherKey: 'noteId',
      as: 'notes',
    });
  };

  return NoteTag;
};
