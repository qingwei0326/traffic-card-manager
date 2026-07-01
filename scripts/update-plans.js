const initSqlJs = require('sql.js');
const fs = require('fs');
const path = require('path');
const plans = require('../data/haoyi-plans-parsed.json');
const dbPath = path.join(process.env.APPDATA, 'traffic-card-manager', 'traffic-cards.db');
const buf = fs.readFileSync(dbPath);

initSqlJs().then(SQL => {
  const db = new SQL.Database(buf);

  // 先添加新字段（如果不存在）
  const alters = [
    "ALTER TABLE plans ADD COLUMN age_limit TEXT",
    "ALTER TABLE plans ADD COLUMN forbid_regions TEXT",
    "ALTER TABLE plans ADD COLUMN express TEXT",
  ];
  for (const sql of alters) {
    try { db.run(sql) } catch {}
  }

  let updated = 0;
  for (const p of plans) {
    try {
      // 清理 forbid_regions：移除与 region 重叠的部分
      let forbid = p.forbidRegions || '';
      if (forbid && p.region && p.region !== '全国') {
        const regionParts = p.region.split(/[/、]/).map(s => s.replace(/省|市/g, '').trim());
        const forbidParts = forbid.split(/[,，、]/).map(s => s.trim());
        forbid = forbidParts.filter(f => {
          const fc = f.replace(/省|市|壮族自治区|自治区/g, '').trim();
          return !regionParts.includes(fc);
        }).join('、');
      }
      db.run(`UPDATE plans SET
        promo_period = ?,
        contract_period = ?,
        first_charge = ?,
        activation = ?,
        region = ?,
        age_limit = ?,
        forbid_regions = ?,
        express = ?
        WHERE code = ?`,
        [p.promoPeriod, p.contractPeriod, p.firstCharge, p.activation || '',
         p.region || '全国', p.ageLimit || '', forbid, p.express || '',
         p.code]);
      updated++;
    } catch (e) {
      // skip
    }
  }

  const data = db.export();
  fs.writeFileSync(dbPath, Buffer.from(data));

  // 验证
  const r = db.exec('SELECT COUNT(*) FROM plans WHERE promo_period > 0');
  const r2 = db.exec('SELECT COUNT(*) FROM plans WHERE age_limit != ""');
  const r3 = db.exec('SELECT COUNT(*) FROM plans WHERE forbid_regions != ""');
  console.log('更新: ' + updated + ' 条');
  console.log('有优惠期: ' + r[0].values[0][0]);
  console.log('有办卡年龄: ' + r2[0].values[0][0]);
  console.log('有禁发地区: ' + r3[0].values[0][0]);
});
