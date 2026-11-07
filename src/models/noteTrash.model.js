// Dedicated recycle-bin table: a complete, restorable snapshot of the original note.
export default (sequelize, DataTypes) => sequelize.define('NoteTrash', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  originalNoteId: { type: DataTypes.INTEGER, allowNull: false },
  userId: { type: DataTypes.INTEGER, allowNull: false, references: { model: 'Users', key: 'id' }, onDelete: 'CASCADE' },
  deletedById: { type: DataTypes.INTEGER, allowNull: true },
  title: { type: DataTypes.STRING(200), allowNull: false },
  snapshot: { type: DataTypes.TEXT, allowNull: false },
  deletedAt: { type: DataTypes.DATE, allowNull: false },
  expiresAt: { type: DataTypes.DATE, allowNull: false },
}, {
  tableName: 'NoteTrashes',
  indexes: [
    { fields: ['userId', 'deletedAt'], name: 'notetrashes_user_deleted_idx' },
    { fields: ['expiresAt'], name: 'notetrashes_expires_idx' },
  ],
});
