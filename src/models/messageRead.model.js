module.exports = (sequelize, DataTypes) => {
  const MessageRead = sequelize.define('MessageRead', {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },
    messageId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: {
        model: 'Messages',
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

  MessageRead.associate = function(models) {
    MessageRead.belongsTo(models.Message, { foreignKey: 'messageId', as: 'message' });
    MessageRead.belongsTo(models.User, { foreignKey: 'userId', as: 'user' });
  };

  return MessageRead;
};
