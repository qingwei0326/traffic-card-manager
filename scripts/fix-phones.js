const initSqlJs = require('sql.js');
const fs = require('fs');
const path = require('path');
const dbPath = path.join(process.env.APPDATA, 'traffic-card-manager', 'traffic-cards.db');
const buf = fs.readFileSync(dbPath);

initSqlJs().then(SQL => {
  const db = new SQL.Database(buf);

  // 修复cards表
  const stmt = db.prepare("SELECT id, phone_number FROM cards WHERE phone_number LIKE ?");
  stmt.bind(["'%"]);
  while (stmt.step()) {
    const row = stmt.get();
    const id = row[0];
    const phone = row[1];
    const fixed = phone.replace(/^'/, '');
    db.run("UPDATE cards SET phone_number = ? WHERE id = ?", [fixed, id]);
    console.log('cards: ' + phone + ' -> ' + fixed);
  }
  stmt.free();

  // 修复customers表
  const stmt2 = db.prepare("SELECT id, phone FROM customers WHERE phone LIKE ?");
  stmt2.bind(["'%"]);
  while (stmt2.step()) {
    const row = stmt2.get();
    const id = row[0];
    const phone = row[1];
    const fixed = phone.replace(/^'/, '');
    db.run("UPDATE customers SET phone = ? WHERE id = ?", [fixed, id]);
    console.log('customers: ' + phone + ' -> ' + fixed);
  }
  stmt2.free();

  // 保存
  const data = db.export();
  fs.writeFileSync(dbPath, Buffer.from(data));

  // 验证
  const r = db.exec('SELECT phone_number FROM cards ORDER BY id');
  console.log('\n验证:');
  if (r.length) r[0].values.forEach(v => console.log('  ' + v[0]));
});
