module.exports = (sequelize, DataTypes) => {
  const GroupInvite = sequelize.define('GroupInvite', {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },
    groupId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: { model: 'Groups', key: 'id' },
      onDelete: 'CASCADE',
    },
    inviterId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: { model: 'Users', key: 'id' },
      onDelete: 'CASCADE',
    },
    inviteeId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: { model: 'Users', key: 'id' },
      onDelete: 'CASCADE',
    },
    status: {
      type: DataTypes.ENUM('pending', 'accepted', 'declined'),
      allowNull: false,
      defaultValue: 'pending',
    },
  }, {
    indexes: [
      { unique: true, fields: ['groupId', 'inviteeId'] },
    ],
  });

  GroupInvite.associate = function(models) {
    GroupInvite.belongsTo(models.Group, { foreignKey: 'groupId', as: 'group' });
    GroupInvite.belongsTo(models.User, { foreignKey: 'inviterId', as: 'inviter' });
    GroupInvite.belongsTo(models.User, { foreignKey: 'inviteeId', as: 'invitee' });
  };

  return GroupInvite;
};
