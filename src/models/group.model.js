export default (sequelize, DataTypes) => {
  const Group = sequelize.define('Group', {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },
    name: {
      type: DataTypes.STRING,
      allowNull: false,
      validate: {
        len: [1, 100]
      }
    },
    ownerId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: {
        model: 'Users',
        key: 'id'
      },
      onDelete: 'CASCADE'
    },
    avatar: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    background: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    adminsOnly: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    },
  }, {
    indexes: [
      { fields: ['ownerId'] },
      { unique: false, fields: ['name'] }
    ]
  });

  Group.associate = function(models) {
    Group.belongsTo(models.User, { foreignKey: 'ownerId', as: 'owner' });
    Group.hasMany(models.GroupMember, { foreignKey: 'groupId', as: 'members' });
    Group.hasMany(models.GroupMessage, { foreignKey: 'groupId', as: 'messages' });
  };

  return Group;
};
