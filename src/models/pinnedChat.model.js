const { Op } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  const PinnedChat = sequelize.define('PinnedChat', {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },
    userId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: {
        model: 'Users',
        key: 'id'
      },
      onDelete: 'CASCADE'
    },
    pinnedUserId: {
      type: DataTypes.INTEGER,
      allowNull: true,
      references: {
        model: 'Users', 
        key: 'id'
      },
      onDelete: 'CASCADE'
    },
    pinnedGroupId: {
      type: DataTypes.INTEGER,
      allowNull: true,
      references: {
        model: 'Groups',
        key: 'id'
      },
      onDelete: 'CASCADE'
    },
    pinnedAt: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW
    }
  }, {
    tableName: 'PinnedChats',
    timestamps: true,
    indexes: [
      {
        unique: true,
        fields: ['userId', 'pinnedUserId'],
        where: {
          pinnedUserId: { [Op.not]: null }
        }
      },
      {
        unique: true,
        fields: ['userId', 'pinnedGroupId'],
        where: {
          pinnedGroupId: { [Op.not]: null }
        }
      }
    ],
    validate: {
      exactlyOnePin() {
        if ((this.pinnedUserId && this.pinnedGroupId) || (!this.pinnedUserId && !this.pinnedGroupId)) {
          throw new Error('Exactly one of pinnedUserId or pinnedGroupId must be set');
        }
      }
    }
  });

  return PinnedChat;
};
