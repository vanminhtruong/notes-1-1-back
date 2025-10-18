export default (sequelize, DataTypes) => {
  const Note = sequelize.define('Note', {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },
    title: {
      type: DataTypes.STRING,
      allowNull: false,
      validate: {
        len: [1, 200],
      },
    },
    content: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    imageUrl: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    videoUrl: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    youtubeUrl: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    categoryId: {
      type: DataTypes.INTEGER,
      allowNull: true,
      references: {
        model: 'NoteCategories',
        key: 'id',
      },
    },
    priority: {
      type: DataTypes.ENUM('low', 'medium', 'high'),
      defaultValue: 'medium',
    },
    isArchived: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
    },
    reminderAt: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    reminderSent: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    },
    reminderAcknowledged: {
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
    folderId: {
      type: DataTypes.INTEGER,
      allowNull: true,
      references: {
        model: 'NoteFolders',
        key: 'id',
      },
    },
    isPinned: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    },
  });

  Note.associate = function(models) {
    Note.belongsTo(models.User, {
      foreignKey: 'userId',
      as: 'user',
    });
    Note.belongsTo(models.NoteFolder, {
      foreignKey: 'folderId',
      as: 'folder',
    });
    Note.belongsTo(models.NoteCategory, {
      foreignKey: 'categoryId',
      as: 'category',
    });
    Note.belongsToMany(models.NoteTag, {
      through: 'NoteTagMappings',
      foreignKey: 'noteId',
      otherKey: 'tagId',
      as: 'tags',
    });
  };

  return Note;
};
