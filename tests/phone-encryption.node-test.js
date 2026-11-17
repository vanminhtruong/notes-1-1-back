import test from 'node:test';
import assert from 'node:assert/strict';

process.env.NODE_ENV = 'test';
process.env.PHONE_ENCRYPTION_KEY = '0123456789abcdef'.repeat(4);
const { sequelize } = await import('../src/db/index.js');
const { User } = await import('../src/models/index.js');
const { migratePhoneEncryption } = await import('../src/db/phoneMigration.js');
const { phoneLookupHash, decryptPhone } = await import('../src/utils/phoneCrypto.js');

test('phone is encrypted at rest, but profile getter stays readable and lookup works', async () => {
  await sequelize.sync({ force: true });
  const user = await User.create({
    email: 'phone-test@example.com', password: 'password123', name: 'Phone Test', phone: '0912 345 678',
  });
  const [records] = await sequelize.query('SELECT phone, phoneHash FROM "Users" WHERE id = ?', { replacements: [user.id] });
  assert.match(records[0].phone, /^enc:v1:/);
  assert.doesNotMatch(records[0].phone, /0912/);
  assert.equal(records[0].phoneHash, phoneLookupHash('+84912345678'));
  assert.equal(user.phone, '0912 345 678');
  assert.equal(user.toJSON().phone, '0912 345 678');
  assert.equal(Object.hasOwn(user.toJSON(), 'phoneHash'), false);

  await user.update({ phone: '+84987654321' });
  const [modified] = await sequelize.query('SELECT phone, phoneHash FROM "Users" WHERE id = ?', { replacements: [user.id] });
  assert.equal(decryptPhone(modified[0].phone), '+84987654321');
  assert.equal(modified[0].phoneHash, phoneLookupHash('0987654321'));

  await user.update({ phone: null });
  const [cleared] = await sequelize.query('SELECT phone, phoneHash FROM "Users" WHERE id = ?', { replacements: [user.id] });
  assert.equal(cleared[0].phone, null);
  assert.equal(cleared[0].phoneHash, null);
});

test('one-time migration converts existing cleartext and can safely rerun', async () => {
  const user = await User.create({
    email: 'legacy-test@example.com', password: 'password123', name: 'Legacy Test',
  });
  await sequelize.query('UPDATE "Users" SET phone = ? WHERE id = ?', { replacements: ['0901 234 567', user.id] });
  await migratePhoneEncryption();
  const [rows] = await sequelize.query('SELECT phone, phoneHash FROM "Users" WHERE id = ?', { replacements: [user.id] });
  assert.match(rows[0].phone, /^enc:v1:/);
  assert.equal(decryptPhone(rows[0].phone), '0901 234 567');
  assert.equal(rows[0].phoneHash, phoneLookupHash('+84901234567'));
  await migratePhoneEncryption();
  const [after] = await sequelize.query('SELECT phone, phoneHash FROM "Users" WHERE id = ?', { replacements: [user.id] });
  assert.deepEqual(after[0], rows[0]);
  await sequelize.close();
});
