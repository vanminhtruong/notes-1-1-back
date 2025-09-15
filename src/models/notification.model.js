module.exports = (sequelize, DataTypes) => {
  const Notification = sequelize.define(
    'Notification',
    {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
      userId: { type: DataTypes.INTEGER, allowNull: false }, // recipient
      type: { type: DataTypes.STRING(50), allowNull: false }, // 'friend_request' | 'group_invite' | 'message' | 'group_message' | 'system'
      fromUserId: { type: DataTypes.INTEGER, allowNull: true },
      groupId: { type: DataTypes.INTEGER, allowNull: true },
      metadata: { type: DataTypes.JSON, allowNull: true },
      isRead: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    },
    {
      tableName: 'notifications',
      timestamps: true,
      underscored: true,
      indexes: [
        { fields: ['user_id'] },
        { fields: ['type'] },
        { fields: ['is_read'] },
      ],
    }
  );
  return Notification;
};
