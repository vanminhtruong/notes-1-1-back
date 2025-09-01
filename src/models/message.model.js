module.exports = (sequelize, DataTypes) => {
  const Message = sequelize.define('Message', {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
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
    receiverId: {
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
        len: [1, 1000]
      }
    },
    isRead: {
      type: DataTypes.BOOLEAN,
      defaultValue: false
    },
    status: {
      type: DataTypes.ENUM('sent', 'delivered', 'read'),
      defaultValue: 'sent'
    },
    messageType: {
      type: DataTypes.ENUM('text', 'image', 'file'),
      defaultValue: 'text'
    },
    // Recall/Deletion flags
    isDeletedForAll: {
      type: DataTypes.BOOLEAN,
      defaultValue: false
    },
    // Store list of user IDs (JSON string) for whom the message is hidden
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
      {
        fields: ['senderId', 'receiverId', 'createdAt']
      },
      {
        fields: ['receiverId', 'isRead']
      }
    ]
  });

  Message.associate = function(models) {
    Message.belongsTo(models.User, {
      foreignKey: 'senderId',
      as: 'sender'
    });
    Message.belongsTo(models.User, {
      foreignKey: 'receiverId',
      as: 'receiver'
    });
    Message.hasMany(models.MessageRead, {
      foreignKey: 'messageId',
      as: 'reads'
    });
  };

  return Message;
};
