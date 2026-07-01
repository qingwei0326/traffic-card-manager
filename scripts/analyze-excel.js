const XLSX = require('xlsx');
const path = require('path');

const filePath = path.join('C:\\Users\\青微\\Downloads\\导出订单.xlsx');
const workbook = XLSX.readFile(filePath);

console.log('=== 工作表 ===');
console.log(workbook.SheetNames);

// 读取第一个工作表
const sheetName = workbook.SheetNames[0];
const sheet = workbook.Sheets[sheetName];

// 转换为JSON
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

// 尝试用对象模式读取
console.log('\n=== 对象模式（第一行）===');
const jsonData = XLSX.utils.sheet_to_json(sheet);
if (jsonData.length > 0) {
  console.log(jsonData[0]);
}
