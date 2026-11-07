
const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('data/app.sqlite', sqlite3.OPEN_READONLY, (e)=>{ if(e){console.log('DBERR', e.message); process.exit(1);} });
db.all("SELECT name FROM sqlite_master WHERE type='table'", (e, rows) => {
  if (e) { console.log('ERR', e.message); process.exit(1); }
  const usersTable = rows.map(r=>r.name).find(n=>/user/i.test(n) && !/session|block/i.test(n));
  db.all("SELECT id, email, name, isActive FROM " + usersTable + " ORDER BY id LIMIT 10", (e2, users) => {
    if (e2) { console.log('ERR2', e2.message); process.exit(1); }
    console.log('TABLE=' + usersTable);
    console.log(JSON.stringify(users));
    db.close();
  });
});
