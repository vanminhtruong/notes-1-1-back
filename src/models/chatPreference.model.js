module.exports = (sequelize, DataTypes) => {
  const ChatPreference = sequelize.define('ChatPreference', {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },
    userId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: {
        model: 'Users',
        key: 'id',
      },
      onDelete: 'CASCADE',
    },
    otherUserId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: {
        model: 'Users',
        key: 'id',
      },
      onDelete: 'CASCADE',
    },
    backgroundUrl: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
  }, {
    indexes: [
      {
        unique: true,
        fields: ['userId', 'otherUserId'],
      }
    ]
  });

  ChatPreference.associate = function(models) {
    ChatPreference.belongsTo(models.User, { foreignKey: 'userId', as: 'user' });
    ChatPreference.belongsTo(models.User, { foreignKey: 'otherUserId', as: 'otherUser' });
  };

  return ChatPreference;
};
