export default (sequelize, DataTypes) => {
  const GroupSharedNote = sequelize.define('GroupSharedNote', {
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
    groupId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: {
        model: 'Groups',
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
    message: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    groupMessageId: {
      type: DataTypes.INTEGER,
      allowNull: true,
      references: {
        model: 'GroupMessages',
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

  GroupSharedNote.associate = function(models) {
    GroupSharedNote.belongsTo(models.Note, {
      foreignKey: 'noteId',
      as: 'note',
    });
    GroupSharedNote.belongsTo(models.Group, {
      foreignKey: 'groupId',
      as: 'group',
    });
    GroupSharedNote.belongsTo(models.User, {
      foreignKey: 'sharedByUserId',
      as: 'sharedByUser',
    });
  };

  return GroupSharedNote;
};
