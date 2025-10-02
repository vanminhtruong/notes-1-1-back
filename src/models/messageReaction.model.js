import { Op } from 'sequelize';

export default (sequelize, DataTypes) => {
  const MessageReaction = sequelize.define('MessageReaction', {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    userId: { type: DataTypes.INTEGER, allowNull: false, references: { model: 'Users', key: 'id' }, onDelete: 'CASCADE' },
    messageId: { type: DataTypes.INTEGER, allowNull: true, references: { model: 'Messages', key: 'id' }, onDelete: 'CASCADE' },
    groupMessageId: { type: DataTypes.INTEGER, allowNull: true, references: { model: 'GroupMessages', key: 'id' }, onDelete: 'CASCADE' },
    type: { type: DataTypes.STRING(20), allowNull: false }, // like, love, haha, wow, sad, angry
    count: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 1 },
    reactedAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW }
  }, {
    tableName: 'MessageReactions',
    timestamps: true,
    indexes: [
      { unique: true, fields: ['userId', 'messageId', 'type'], where: { messageId: { [Op.not]: null } } },
      { unique: true, fields: ['userId', 'groupMessageId', 'type'], where: { groupMessageId: { [Op.not]: null } } },
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
  return MessageReaction;
}
