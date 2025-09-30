module.exports = (sequelize, DataTypes) => {
  const SharedNote = sequelize.define('SharedNote', {
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
    sharedWithUserId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: {
        model: 'Users',
        key: 'id',
      },
    },
    sharedByUserId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: {
        model: 'Users',
        key: 'id',
      },
    },
    canEdit: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
    },
    canDelete: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
    },
    canCreate: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
    },
    message: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    messageId: {
      type: DataTypes.INTEGER,
      allowNull: true,
      references: {
        model: 'Messages',
        key: 'id',
      },
    },
    sharedAt: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW,
    },
    isActive: {
      type: DataTypes.BOOLEAN,
      defaultValue: true,
    },
  });

  SharedNote.associate = function(models) {
    SharedNote.belongsTo(models.Note, {
      foreignKey: 'noteId',
      as: 'note',
    });
    SharedNote.belongsTo(models.User, {
      foreignKey: 'sharedWithUserId',
      as: 'sharedWithUser',
    });
    SharedNote.belongsTo(models.User, {
      foreignKey: 'sharedByUserId',
      as: 'sharedByUser',
    });
  };

  return SharedNote;
};
