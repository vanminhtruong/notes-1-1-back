export default (sequelize, DataTypes) => {
  const NoteTagMapping = sequelize.define('NoteTagMapping', {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },
    noteId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: {
        model: 'Notes',
        key: 'id',
      },
    },
    tagId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: {
        model: 'NoteTags',
        key: 'id',
      },
    },
  });

  NoteTagMapping.associate = function(models) {
    NoteTagMapping.belongsTo(models.Note, {
      foreignKey: 'noteId',
      as: 'note',
    });
    NoteTagMapping.belongsTo(models.NoteTag, {
      foreignKey: 'tagId',
      as: 'tag',
    });
  };

  return NoteTagMapping;
};
