const XLSX = require('xlsx');
const path = require('path');

const filePath = path.join('C:\\Users\\青微\\Downloads\\订单导出.xlsx');
const workbook = XLSX.readFile(filePath);

console.log('=== 工作表 ===');
console.log(workbook.SheetNames);

const sheetName = workbook.SheetNames[0];
const sheet = workbook.Sheets[sheetName];
const data = XLSX.utils.sheet_to_json(sheet, { header: 1 });

console.log('\n=== 表头 ===');
if (data.length > 0) {
  console.log(data[0]);
}

console.log('\n=== 数据行数 ===');
console.log(data.length - 1);

console.log('\n=== 前3行数据 ===');
for (let i = 1; i < Math.min(4, data.length); i++) {
  console.log(`\n行 ${i}:`);
  if (data[0]) {
    for (let j = 0; j < data[0].length; j++) {
      console.log(`  ${data[0][j]}: ${data[i][j] || '-'}`);
    }
  }
}
