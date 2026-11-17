/**
 * Per-user dismissal of a shared group note. A dismissal never deletes
 * the note itself or the group-wide sharing relationship.
 */
export default (sequelize, DataTypes) => sequelize.define('GroupSharedNoteDismissal', {
  groupSharedNoteId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: { model: 'GroupSharedNotes', key: 'id' },
    onDelete: 'CASCADE',
  },
  userId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: { model: 'Users', key: 'id' },
    onDelete: 'CASCADE',
  },
}, {
  indexes: [
    { unique: true, fields: ['groupSharedNoteId', 'userId'] },
    { fields: ['userId'] },
  ],
});
