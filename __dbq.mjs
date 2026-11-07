
import sqlite3 from 'sqlite3';
const db = new sqlite3.Database('data/app.sqlite');
const all = (sql) => new Promise((res, rej) => db.all(sql, (e, rows) => e ? rej(e) : res(rows)));
try {
  const users = await all("SELECT id, name, email, isActive, role FROM Users ORDER BY id LIMIT 20");
  console.log('USERS:', JSON.stringify(users));
  const conv = await all("SELECT senderId, receiverId, COUNT(*) c FROM Messages GROUP BY senderId, receiverId ORDER BY c DESC LIMIT 10");
  console.log('CONVS:', JSON.stringify(conv));
} catch (e) { console.log('ERR', e.message); }
db.close();
