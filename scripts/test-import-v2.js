/**
 * Test script v2: 按 database.ts 的实际字段映射验证
 */
const fs = require('fs')
const path = require('path')

const ROOT = path.resolve(__dirname, '..')

function testFile(fileName) {
  const filePath = path.join(ROOT, fileName)
  if (!fs.existsSync(filePath)) {
    console.log(`❌ ${fileName} 文件不存在`)
    return
  }

  const raw = fs.readFileSync(filePath, 'utf-8')
  const plans = JSON.parse(raw)
  console.log(`\n📦 ${fileName}: ${plans.length} 条记录`)

  const first = plans[0]
  const is172 = 'settlementRules' in first || 'taocanDetail' in first || ('price' in first && 'data' in first)
  const source = is172 ? '172号卡平台' : '号易平台'
  console.log(`   检测数据源: ${source}`)

  // 按 database.ts 的实际逻辑模拟
  let imported = 0, priceMissing = 0
  for (const p of plans) {
    const code = String(p.code || '')
    const name = p.name || ''
    const monthlyPrice = parseFloat(p.monthlyPrice || p.price) || 0
    const dataAmount = parseInt(p.dataAmount) || parseInt(String(p.data || '').replace(/\D/g, '')) || 0

    if (!code || !name) continue
    if (monthlyPrice === 0) priceMissing++
    imported++
  }

  console.log(`   可导入: ${imported} 条`)
  if (priceMissing > 0) console.log(`   ⚠️  价格为0: ${priceMissing} 条`)

  // 检查价格分布
  const prices = plans.map(p => parseFloat(p.monthlyPrice || p.price) || 0).filter(p => p > 0)
  const avg = (prices.reduce((a, b) => a + b, 0) / prices.length).toFixed(1)
  console.log(`   价格范围: ${Math.min(...prices)}-${Math.max(...prices)}元, 均价${avg}元`)
}

console.log('=== 验证 database.ts 实际映射 ===')
testFile(path.join('data', '172-plans.json'))
testFile(path.join('data', 'haoyi-plans-parsed.json'))
console.log('\n✅ 验证完成')
