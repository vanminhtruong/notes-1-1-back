export default (sequelize, DataTypes) => {
  const Friendship = sequelize.define('Friendship', {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },
    requesterId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: {
        model: 'Users',
        key: 'id'
      },
      onDelete: 'CASCADE'
    },
    addresseeId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: {
        model: 'Users',
        key: 'id'
      },
      onDelete: 'CASCADE'
    },
    status: {
      type: DataTypes.ENUM('pending', 'accepted', 'rejected', 'blocked'),
      defaultValue: 'pending',
      allowNull: false
    },
  }, {
    indexes: [
      {
        unique: true,
        fields: ['requesterId', 'addresseeId']
      }
    ],
    validate: {
      notSelfFriend() {
        if (this.requesterId === this.addresseeId) {
          throw new Error('Cannot send friend request to yourself');
        }
      }
    }
  });

  Friendship.associate = function(models) {
    Friendship.belongsTo(models.User, {
      foreignKey: 'requesterId',
      as: 'requester'
    });
    Friendship.belongsTo(models.User, {
      foreignKey: 'addresseeId',
      as: 'addressee'
    });
  };

  return Friendship;
};
