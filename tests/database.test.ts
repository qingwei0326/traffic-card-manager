import { describe, it, expect } from 'vitest'

// 测试套餐匹配逻辑（独立于数据库）
describe('套餐名匹配逻辑', () => {
  // 模拟 matchPlan 的逻辑
  function cleanPlanName(name: string): string {
    return name.replace(/【[^】]*】/g, '').trim()
  }

  it('去掉【】内容', () => {
    expect(cleanPlanName('移动大王卡【优惠版】')).toBe('移动大王卡')
    expect(cleanPlanName('联通畅享卡【限时】')).toBe('联通畅享卡')
  })

  it('保持原始名称不变', () => {
    expect(cleanPlanName('电信星卡')).toBe('电信星卡')
  })
})

describe('运营商识别', () => {
  function parseCarrier(planName: string): string {
    if (planName.includes('电信') || planName.includes('CT')) return '电信'
    if (planName.includes('联通') || planName.includes('CU')) return '联通'
    if (planName.includes('移动') || planName.includes('CM')) return '移动'
    if (planName.includes('广电')) return '广电'
    return '未知'
  }

  it('识别四大运营商', () => {
    expect(parseCarrier('电信星卡')).toBe('电信')
    expect(parseCarrier('联通大王卡')).toBe('联通')
    expect(parseCarrier('移动花卡')).toBe('移动')
    expect(parseCarrier('广电明途卡')).toBe('广电')
  })

  it('识别英文缩写', () => {
    expect(parseCarrier('CT电信卡')).toBe('电信')
    expect(parseCarrier('CU联通卡')).toBe('联通')
    expect(parseCarrier('CM移动卡')).toBe('移动')
  })

  it('未知运营商返回未知', () => {
    expect(parseCarrier('超级流量卡')).toBe('未知')
  })
})

describe('套餐类型识别', () => {
  function parsePlanType(planName: string): string {
    if (planName.includes('长期') || planName.includes('合约') || planName.includes('年')) {
      return '长期套餐'
    }
    const priceMatch = planName.match(/(\d+)元/)
    const price = priceMatch ? parseInt(priceMatch[1]) : 999
    if (price <= 19) return '低价套餐'
    if (price <= 29) return '性价比'
    if (price >= 39) return '大流量'
    return '性价比'
  }

  it('长期套餐优先', () => {
    expect(parsePlanType('长期大流量卡39元')).toBe('长期套餐')
    expect(parsePlanType('合约套餐29元')).toBe('长期套餐')
  })

  it('按价格分档', () => {
    expect(parsePlanType('低价卡19元')).toBe('低价套餐')
    expect(parsePlanType('畅享卡29元')).toBe('性价比')
    expect(parsePlanType('超大流量卡39元')).toBe('大流量')
  })
})

describe('流量提取', () => {
  function parseDataAmount(planName: string): string {
    const matches = planName.match(/(\d+G(?:\+\d+G)?)/)
    return matches ? matches[1] : ''
  }

  it('提取单一流量', () => {
    expect(parseDataAmount('移动大王卡100G')).toBe('100G')
  })

  it('提取组合流量', () => {
    expect(parseDataAmount('联通畅享卡100G+50G')).toBe('100G+50G')
  })

  it('无流量返回空', () => {
    expect(parseDataAmount('低价套餐')).toBe('')
  })
})

describe('手机号清洗', () => {
  it('去掉前导单引号', () => {
    expect("'13800138000".replace(/^'/, '')).toBe('13800138000')
  })

  it('正常手机号不变', () => {
    expect('13800138000'.replace(/^'/, '')).toBe('13800138000')
  })
})

describe('月租提取', () => {
  function parseMonthlyPrice(planName: string): number {
    const match = planName.match(/(?:月均)?(\d+(?:\.\d+)?)元/)
    if (match) return parseFloat(match[1]) || 0
    return 0
  }

  it('提取普通月租', () => {
    expect(parseMonthlyPrice('福建移动专享卡【29元235G】')).toBe(29)
    expect(parseMonthlyPrice('移动飞秦卡【18元90G+300分钟】')).toBe(18)
    expect(parseMonthlyPrice('广东电信专享卡【19元205G+1...】')).toBe(19)
  })

  it('提取月均价格', () => {
    expect(parseMonthlyPrice('广电飞酒卡【月均20元350G+2...】')).toBe(20)
  })

  it('无价格返回0', () => {
    expect(parseMonthlyPrice('超级流量卡')).toBe(0)
    expect(parseMonthlyPrice('不限量套餐')).toBe(0)
  })

  it('支持小数价格', () => {
    expect(parseMonthlyPrice('特惠卡9.9元')).toBe(9.9)
  })
})

describe('到期日自动计算', () => {
  function calcPromoEnd(activateTime: string, promoMonths: number): string {
    if (!activateTime || promoMonths <= 0) return ''
    const d = new Date(activateTime)
    if (isNaN(d.getTime())) return ''
    d.setMonth(d.getMonth() + promoMonths)
    d.setDate(0)
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  }

  it('5月激活6个月优惠 → 10月底', () => {
    expect(calcPromoEnd('2026-05-15', 6)).toBe('2026-10-31')
  })

  it('1月31日激活1个月 → 2月底', () => {
    expect(calcPromoEnd('2026-01-31', 1)).toBe('2026-02-28')
  })

  it('闰年1月31日激活1个月 → 2月29日', () => {
    expect(calcPromoEnd('2028-01-31', 1)).toBe('2028-02-29')
  })

  it('无激活时间返回空', () => {
    expect(calcPromoEnd('', 6)).toBe('')
  })

  it('优惠月数为0返回空', () => {
    expect(calcPromoEnd('2026-05-15', 0)).toBe('')
  })
})

describe('172号卡导入逻辑', () => {
  function mapStatus(orderStatus: string, activateStatus?: string): string {
    if (orderStatus === '已结算') return activateStatus === '已激活' ? '使用中' : '已到期'
    if (orderStatus === '已失效') return '已到期'
    return '待确认'
  }

  it('已结算+已激活 → 使用中', () => {
    expect(mapStatus('已结算', '已激活')).toBe('使用中')
  })

  it('已结算+未激活 → 已到期', () => {
    expect(mapStatus('已结算')).toBe('已到期')
    expect(mapStatus('已结算', '未激活')).toBe('已到期')
  })

  it('已失效 → 已到期', () => {
    expect(mapStatus('已失效')).toBe('已到期')
  })

  it('其他状态 → 待确认', () => {
    expect(mapStatus('已发货')).toBe('待确认')
    expect(mapStatus('')).toBe('待确认')
  })
})

describe('号易导入逻辑', () => {
  function mapHaoyiStatus(upstreamStatus: string): string {
    if (upstreamStatus === '已激活') return '使用中'
    if (upstreamStatus === '已开卡') return '使用中'
    if (upstreamStatus === '已发货') return '待确认'
    if (upstreamStatus.includes('失败') || upstreamStatus === '已取消') return '已到期'
    return '待确认'
  }

  it('已激活/已开卡 → 使用中', () => {
    expect(mapHaoyiStatus('已激活')).toBe('使用中')
    expect(mapHaoyiStatus('已开卡')).toBe('使用中')
  })

  it('已发货 → 待确认', () => {
    expect(mapHaoyiStatus('已发货')).toBe('待确认')
  })

  it('开卡失败/已取消 → 已到期', () => {
    expect(mapHaoyiStatus('开卡失败')).toBe('已到期')
    expect(mapHaoyiStatus('已取消')).toBe('已到期')
  })

  it('未知状态 → 待确认', () => {
    expect(mapHaoyiStatus('审核中')).toBe('待确认')
  })
})

describe('利润计算', () => {
  it('订单金额×0.94（扣税）', () => {
    const orderAmount = 29
    const profit = Math.round(orderAmount * 0.94 * 100) / 100
    expect(profit).toBe(27.26)
  })

  it('小数金额正确处理', () => {
    const profit = Math.round(19.9 * 0.94 * 100) / 100
    expect(profit).toBe(18.71)
  })
})
