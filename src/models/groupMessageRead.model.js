export default (sequelize, DataTypes) => {
  const GroupMessageRead = sequelize.define('GroupMessageRead', {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },
    messageId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: {
        model: 'GroupMessages',
        key: 'id'
      },
      onDelete: 'CASCADE'
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
    readAt: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW
    }
  }, {
    indexes: [
      {
        unique: true,
        fields: ['messageId', 'userId']
      }
    ]
  });

  GroupMessageRead.associate = function(models) {
    GroupMessageRead.belongsTo(models.GroupMessage, { foreignKey: 'messageId', as: 'message' });
    GroupMessageRead.belongsTo(models.User, { foreignKey: 'userId', as: 'user' });
  };

  return GroupMessageRead;
};
