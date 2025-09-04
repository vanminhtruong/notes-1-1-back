module.exports = (sequelize, DataTypes) => {
  const GroupMessage = sequelize.define('GroupMessage', {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },
    groupId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: {
        model: 'Groups',
        key: 'id'
      },
      onDelete: 'CASCADE'
    },
    senderId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: {
        model: 'Users',
        key: 'id'
      },
      onDelete: 'CASCADE'
    },
    content: {
      type: DataTypes.TEXT,
      allowNull: false,
      validate: {
        len: [1, 2000]
      }
    },
    messageType: {
      type: DataTypes.ENUM('text', 'image', 'file'),
      defaultValue: 'text'
    },
    status: {
      type: DataTypes.ENUM('sent', 'delivered', 'read'),
      defaultValue: 'sent'
    },
    isRead: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false
    },
    // Optional deletion flags similar to 1:1 messages
    isDeletedForAll: {
      type: DataTypes.BOOLEAN,
      defaultValue: false
    },
    deletedForUserIds: {
      type: DataTypes.TEXT,
      allowNull: false,
      defaultValue: '[]',
      get() {
        const raw = this.getDataValue('deletedForUserIds');
        try { return JSON.parse(raw || '[]'); } catch { return []; }
      },
      set(val) {
        try {
          this.setDataValue('deletedForUserIds', JSON.stringify(Array.isArray(val) ? val : []));
        } catch {
          this.setDataValue('deletedForUserIds', '[]');
        }
      }
    }
  }, {
    indexes: [
      { fields: ['groupId', 'createdAt'] },
      { fields: ['senderId'] },
    ]
  });

  GroupMessage.associate = function(models) {
    GroupMessage.belongsTo(models.Group, { foreignKey: 'groupId', as: 'group' });
    GroupMessage.belongsTo(models.User, { foreignKey: 'senderId', as: 'sender' });
    GroupMessage.hasMany(models.GroupMessageRead, {
      foreignKey: 'messageId',
      as: 'reads'
    });
  };

  return GroupMessage;
};
