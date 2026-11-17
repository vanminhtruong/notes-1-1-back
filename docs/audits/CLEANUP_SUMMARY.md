# Backend API + SQLite schema cleanup — 2026-11-17

## Scope
Static route/client comparison against `Front/src` and `admin/src` (554 source files), cross-checked with backend route/service/model/migration code. Database checks were read-only before the guarded migration. This is not proof that external integrations never call an API.

## Applied
- Removed `POST /api/v1/auth/facebook` and its unused controller/service implementation (both frontends use Google or password login, not this route).
- Removed a stale delete statement for `GroupSharedNotePermissions` from the administrative user-purge routine.
- Dropped 7 empty, unmodeled, unreferenced tables: `Categories`, `Tags`, `GroupPreferences`, `GroupSharedNotePermissions`, `NoteBackgrounds`, `UserPermissions`, `samples`.
- Dropped 5 model-absent columns with only NULL or zero values: `Users.faceImageUrl`, `Users.tokenExpiresIn`, `Groups.adminOnlyMessaging`, `Messages.isEncrypted`, `GroupMessages.isEncrypted`.

## Intentionally preserved
- `Notes_backup`: contains 35 rows, not safe to delete automatically
- `Users.darkTheme`: old preference values vary across accounts
- `Notes.category`: legacy category values still populated
- `BlockedUsers` and `PinnedMessages`: currently empty but their models and features are active
- `GET /api/health`: used by health checks
- `POST /api/v1/admin/notes-trash/:id/restore`: dynamic client usage; static pattern matching can miss it
- Other authenticated/realtime/background APIs: absence of direct call alone is insufficient evidence of disuse

## Verification
- Verified snapshot backups created before the cleanup and immediately before transaction
- SQLite `PRAGMA integrity_check = ok` and `foreign_key_check` empty
- Database table count: 35 -> 28
- Swagger operations: 253 -> 252
- All five selected automated API tests passed (auth/JWT, registration/profile/phone, OTP reset, Swagger)
- Live health and Swagger responded HTTP 200 after backend restart

## Re-run / inspect
- Read-only audit: `node scripts/auditClientApiSchema.mjs`
- Preview candidate database cleanup: `node scripts/cleanupUnusedSchema.mjs --dry-run`
- Transactional cleanup with snapshot: `node scripts/cleanupUnusedSchema.mjs --apply`
- Audit metadata: `docs/audits/frontend-api-database-audit.json`

Do not delete a table or column just because it is empty, absent from a frontend literal, or no longer declared by Sequelize. External clients and historical data can still depend on them.
