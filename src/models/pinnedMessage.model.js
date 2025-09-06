const { Op } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  const PinnedMessage = sequelize.define('PinnedMessage', {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },
    userId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: { model: 'Users', key: 'id' },
      onDelete: 'CASCADE',
    },
    messageId: {
      // Direct chat message id
      type: DataTypes.INTEGER,
      allowNull: true,
      references: { model: 'Messages', key: 'id' },
      onDelete: 'CASCADE',
    },
    groupMessageId: {
      // Group chat message id
      type: DataTypes.INTEGER,
      allowNull: true,
      references: { model: 'GroupMessages', key: 'id' },
      onDelete: 'CASCADE',
    },
    pinnedAt: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
    },
  }, {
    tableName: 'PinnedMessages',
    timestamps: true,
    indexes: [
      {
        unique: true,
        fields: ['userId', 'messageId'],
        where: { messageId: { [Op.not]: null } },
      },
      {
        unique: true,
        fields: ['userId', 'groupMessageId'],
        where: { groupMessageId: { [Op.not]: null } },
      },
    ],
    validate: {
      exactlyOneTarget() {
        const hasDM = !!this.messageId;
        const hasGroup = !!this.groupMessageId;
        if ((hasDM && hasGroup) || (!hasDM && !hasGroup)) {
          throw new Error('Exactly one of messageId or groupMessageId must be set');
        }
      },
    },
  });

  return PinnedMessage;
};
