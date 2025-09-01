module.exports = (sequelize, DataTypes) => {
  const Sample = sequelize.define(
    'Sample',
    {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
      name: { type: DataTypes.STRING(100), allowNull: false },
    },
    {
      tableName: 'samples',
      timestamps: true,
      underscored: true,
    }
  );
  return Sample;
};
