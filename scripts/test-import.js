/**
 * Test script: 验证批量导入逻辑
 * 读取 JSON 文件，模拟 importPlansFromFile 的解析过程
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

  // 模拟数据源检测
  const first = plans[0]
  const is172 = 'settlementRules' in first || 'taocanDetail' in first || ('price' in first && 'data' in first)
  const source = is172 ? '172号卡平台' : '号易平台'
  console.log(`   检测数据源: ${source}`)

  // 模拟字段映射
  let imported = 0, skipped = 0
  for (const p of plans) {
    if (is172) {
      const plan = {
        code: p.code || p.code?.toString(),
        name: p.name,
        carrier: p.carrier,
        price: p.price,
        data: p.data,
        voice: p.voice,
        sms: p.sms || '0条短信',
        keywords: p.keywords || '',
        region: p.region || '',
        commission: p.commission || 0,
        commissionType: p.commissionType || '元/单',
        status: p.status || '在售',
        subStatus: p.subStatus || '',
        forbidRegions: Array.isArray(p.forbidRegions) ? p.forbidRegions.join(',') : (p.forbidRegions || ''),
        ageLimit: p.ageLimit || '',
        taocanDetail: p.taocanDetail || '',
        settlementRules: p.settlementRules || '',
        source: '172号卡平台',
      }
      if (!plan.code || !plan.name) { skipped++; continue }
      imported++
    } else {
      const plan = {
        code: p.planCode || p.code,
        name: p.planName || p.name,
        carrier: p.carrierName || p.carrier,
        price: p.planPrice || p.price || 0,
        data: p.planData || p.data || '',
        voice: p.planVoice || p.voice || '',
        sms: p.planSms || p.sms || '0条短信',
        region: p.planRegion || p.region || '',
        keywords: p.planKeywords || p.keywords || '',
        source: '号易平台',
      }
      if (!plan.code || !plan.name) { skipped++; continue }
      imported++
    }
  }

  console.log(`   解析成功: ${imported} 条`)
  if (skipped > 0) console.log(`   跳过(缺字段): ${skipped} 条`)

  // 统计运营商
  const carriers = {}
  plans.forEach(p => {
    const c = p.carrier || p.carrierName || '未知'
    carriers[c] = (carriers[c] || 0) + 1
  })
  console.log(`   运营商分布:`, carriers)

  // 显示前3条样例
  console.log(`   样例:`)
  plans.slice(0, 3).forEach(p => {
    const name = p.name || p.planName
    const price = p.price || p.planPrice
    console.log(`     - ${name} (${price}元)`)
  })
}

console.log('=== 测试批量导入 ===')
testFile(path.join('data', '172-plans.json'))
testFile(path.join('data', 'haoyi-plans-parsed.json'))
console.log('\n✅ 解析测试完成')
