export default (sequelize, DataTypes) => {
  const Note = sequelize.define('Note', {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },
    title: {
      type: DataTypes.STRING,
      allowNull: false,
      validate: {
        len: [1, 200],
      },
    },
    content: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    imageUrl: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    category: {
      type: DataTypes.STRING,
      allowNull: true,
      defaultValue: 'general',
    },
    priority: {
      type: DataTypes.ENUM('low', 'medium', 'high'),
      defaultValue: 'medium',
    },
    isArchived: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
    },
    reminderAt: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    reminderSent: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    },
    reminderAcknowledged: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    },
    userId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: {
        model: 'Users',
        key: 'id',
      },
    },
  });

  Note.associate = function(models) {
    Note.belongsTo(models.User, {
      foreignKey: 'userId',
      as: 'user',
    });
  };

  return Note;
};
