import bcrypt from 'bcryptjs';

export default (sequelize, DataTypes) => {
  const User = sequelize.define('User', {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },
    email: {
      type: DataTypes.STRING,
      allowNull: false,
      unique: true,
      validate: {
        isEmail: true,
      },
    },
    password: {
      type: DataTypes.STRING,
      allowNull: false,
      validate: {
        len: [6, 100],
      },
    },
    name: {
      type: DataTypes.STRING,
      allowNull: false,
      validate: {
        len: [2, 50],
      },
    },
    // Optional contact info
    phone: {
      type: DataTypes.STRING,
      allowNull: true,
      validate: {
        // Custom validator that only validates when phone is not empty
        phoneFormat(value) {
          if (value && value.trim() !== '') {
            // Only validate if phone has value
            if (!/^[+\d][\d\s\-()]{5,20}$/.test(value)) {
              throw new Error('Phone number format is invalid. Use digits, +, spaces, hyphens, parentheses only.');
            }
          }
        }
      },
    },
    // Optional birth date (no time component)
    birthDate: {
      type: DataTypes.DATEONLY,
      allowNull: true,
    },
    // Optional gender
    gender: {
      type: DataTypes.ENUM('male', 'female', 'other', 'unspecified'),
      allowNull: false,
      defaultValue: 'unspecified',
    },
    isActive: {
      type: DataTypes.BOOLEAN,
      defaultValue: true,
    },
    avatar: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    e2eeEnabled: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    },
    e2eePinHash: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    readStatusEnabled: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true,
    },
    lastSeenAt: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    theme: {
      type: DataTypes.STRING,
      allowNull: false,
      defaultValue: 'light',
      validate: {
        isIn: [['light', 'dark', 'dark-black']],
      },
    },
    language: {
      type: DataTypes.STRING,
      allowNull: false,
      defaultValue: 'en',
    },
    // Animated background settings for dark-black theme
    animatedBackground: {
      type: DataTypes.JSON,
      allowNull: true,
      defaultValue: null,
      // Structure: { enabled: boolean, theme: 'christmas' | 'tet' | 'easter' | 'none' }
    },
    // Persisted preference: remember-me on login
    rememberLogin: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    },
    // Privacy flags
    hidePhone: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    },
    hideBirthDate: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    },
    // Cho phép nhận tin nhắn từ người lạ (không phải bạn bè)
    allowMessagesFromNonFriends: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    },
    // Role của user
    role: {
      type: DataTypes.ENUM('user', 'admin'),
      allowNull: false,
      defaultValue: 'user',
    },
    // Admin level để phân quyền chi tiết (chỉ áp dụng khi role = 'admin')
    adminLevel: {
      type: DataTypes.ENUM('super_admin', 'sub_admin', 'dev', 'mod'),
      allowNull: true, // null cho user thường
    },
    // Permissions cho admin (JSON array)
    adminPermissions: {
      type: DataTypes.JSON,
      allowNull: true,
      defaultValue: null,
    },
  }, {
    hooks: {
      beforeCreate: async (user) => {
        if (user.password) {
          user.password = await bcrypt.hash(user.password, 10);
        }
      },
      beforeUpdate: async (user) => {
        if (user.changed('password')) {
          user.password = await bcrypt.hash(user.password, 10);
        }
      },
    },
  });

  User.prototype.validatePassword = async function (password) {
    return bcrypt.compare(password, this.password);
  };

  User.prototype.toJSON = function () {
    const values = Object.assign({}, this.get());
    // Only delete password if not explicitly requested in attributes
    // Admin can see password hash if they include it in query
    if (!this._options?.attributes?.includes('password')) {
      delete values.password;
    }
    return values;
  };

  return User;
};

