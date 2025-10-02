export default (sequelize, DataTypes) => {
  const UserSession = sequelize.define('UserSession', {
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
      onUpdate: 'CASCADE',
    },
    token: {
      type: DataTypes.STRING(500),
      allowNull: false,
      unique: true,
    },
    // Device information
    deviceType: {
      type: DataTypes.STRING,
      allowNull: true, // 'mobile', 'desktop', 'tablet', 'unknown'
    },
    deviceName: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    browser: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    os: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    // Location and IP
    ipAddress: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    location: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    // Session metadata
    userAgent: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    lastActivityAt: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
    },
    expiresAt: {
      type: DataTypes.DATE,
      allowNull: false,
    },
    isActive: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true,
    },
    // Mark current session
    isCurrent: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    },
  }, {
    tableName: 'user_sessions',
    indexes: [
      {
        fields: ['userId'],
      },
      {
        fields: ['token'],
      },
      {
        fields: ['expiresAt'],
      },
    ],
  });

  return UserSession;
};
