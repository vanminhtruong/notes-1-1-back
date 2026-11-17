// Only fields required to initialize the UI are returned by authentication APIs.
// Do not add contact details, DOB, gender, reset secrets or access-control internals.
const AUTH_FIELDS = ['id', 'name', 'avatar', 'role', 'theme', 'language', 'isActive'];
const PROFILE_FIELDS = [...AUTH_FIELDS, 'email', 'birthDate', 'gender'];

function pickFields(user, fields) {
  if (!user) return null;
  const source = typeof user.get === 'function' ? user.get({ plain: true }) : user;
  const result = {};
  for (const key of fields) {
    if (Object.prototype.hasOwnProperty.call(source, key)) result[key] = source[key];
  }
  return result;
}

export function serializeAuthUser(user) {
  return pickFields(user, AUTH_FIELDS);
}

// Used only by authenticated profile endpoints; never cached by the browser.
export function serializePrivateProfile(user) {
  return pickFields(user, PROFILE_FIELDS);
}
