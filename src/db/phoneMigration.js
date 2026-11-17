import { QueryTypes } from 'sequelize';
import { sequelize } from './index.js';
import { decryptPhone, encryptPhone, isEncryptedPhone, phoneLookupHash, requirePhoneEncryptionKey } from '../utils/phoneCrypto.js';

// Called before the HTTP server starts. Idempotent, transactional, and never prints phone values.
export async function migratePhoneEncryption() {
  requirePhoneEncryptionKey(); // Fail closed if the key is missing/invalid.
  const qi = sequelize.getQueryInterface();
  const columns = await qi.describeTable('Users');
  if (!columns.phoneHash) {
    throw new Error('Missing Users.phoneHash column. Database schema sync must finish before phone migration.');
  }

  let changed = 0;
  await sequelize.transaction(async (transaction) => {
    const rows = await sequelize.query(
      'SELECT id, phone, phoneHash FROM "Users" WHERE phone IS NOT NULL AND phone <> \'\'',
      { type: QueryTypes.SELECT, transaction },
    );
    for (const row of rows) {
      const plaintext = decryptPhone(row.phone); // Authenticates existing GCM ciphertext.
      const digest = phoneLookupHash(plaintext);
      if (isEncryptedPhone(row.phone) && row.phoneHash === digest) continue;
      const ciphertext = isEncryptedPhone(row.phone) ? row.phone : encryptPhone(plaintext);
      await sequelize.query(
        'UPDATE "Users" SET phone = ?, phoneHash = ? WHERE id = ?',
        { replacements: [ciphertext, digest, row.id], transaction },
      );
      changed += 1;
    }
    await sequelize.query(
      'UPDATE "Users" SET phoneHash = NULL WHERE phone IS NULL OR phone = \'\'',
      { transaction },
    );
  });

  const indexes = await qi.showIndex('Users');
  if (!indexes.some((index) => index.name === 'users_phone_hash_idx')) {
    await qi.addIndex('Users', ['phoneHash'], { name: 'users_phone_hash_idx' });
  }
  console.log('[DB] Phone encryption verified; updated records:', changed);
}
