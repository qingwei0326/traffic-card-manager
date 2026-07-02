import { useState, useEffect } from 'react'
import { Plan } from '../types'
import { appApi } from '../lib/appApi'

// 中国省份列表
const PROVINCES = [
  '全国', '北京', '上海', '天津', '重庆',
  '河北', '山西', '辽宁', '吉林', '黑龙江',
  '江苏', '浙江', '安徽', '福建', '江西',
  '山东', '河南', '湖北', '湖南', '广东',
  '广西', '海南', '四川', '贵州', '云南',
  '西藏', '陕西', '甘肃', '青海', '宁夏', '新疆',
  '内蒙古',
]

interface CardPickerProps {
  initialProvince?: string
  onProvinceUsed?: () => void
}

export default function CardPicker({ initialProvince, onProvinceUsed }: CardPickerProps) {
  const [plans, setPlans] = useState<Plan[]>([])
  const [loading, setLoading] = useState(true)
  const [copiedId, setCopiedId] = useState<number | null>(null)

  // 筛选条件
  const [province, setProvince] = useState('')
  const [age, setAge] = useState('')
  const [carrier, setCarrier] = useState('')
  const [maxPrice, setMaxPrice] = useState('')
  const [minData, setMinData] = useState('')
  const [keyword, setKeyword] = useState('')

  // 结果
  const [results, setResults] = useState<Plan[]>([])
  const [showResults, setShowResults] = useState(false)

  // 接收初始省份参数并自动搜索
  useEffect(() => {
    if (initialProvince && plans.length > 0) {
      setProvince(initialProvince)
      onProvinceUsed?.()
      // 触发自动搜索
      setTimeout(() => {
        document.querySelector<HTMLButtonElement>('.btn-primary')?.click()
      }, 100)
    }
  }, [initialProvince, plans.length])

  useEffect(() => {
    loadPlans()
  }, [])

  const loadPlans = async () => {
    setLoading(true)
    try {
      const data = await appApi.plans.getAll()
      setPlans(data)
    } catch (e) {
      console.error('加载套餐失败:', e)
    } finally {
      setLoading(false)
    }
  }

  const handleSearch = () => {
    let filtered = [...plans]

    // 只显示在售
    filtered = filtered.filter(p => (p.sale_status || '在售') === '在售')

    // 省份筛选：如果选了具体省份，排除该省份禁发的套餐
    if (province && province !== '全国') {
      filtered = filtered.filter(p => {
        // 如果套餐限发区域包含该省份 → 可以发
        if (p.region && p.region !== '全国') {
          if (p.region.includes(province)) return true
          // 城市级匹配（如"广东深圳"匹配"广东"）
          const regionParts = p.region.split(/[/、]/)
          for (const part of regionParts) {
            if (part.includes(province) || province.includes(part.replace(/省|市/g, ''))) return true
          }
          return false
        }
        // 全国套餐：检查禁发地区
        if (p.forbid_regions) {
          const forbidden = p.forbid_regions.split(/[,，、]/).map((s: string) => s.trim())
          for (const f of forbidden) {
            if (f.includes(province) || province.includes(f.replace(/省|市/g, ''))) return false
          }
        }
        return true
      })
    }

    // 年龄筛选
    if (age) {
      const ageNum = parseInt(age)
      filtered = filtered.filter(p => {
        if (!p.age_limit) return true // 没写年龄限制的默认可办
        const match = p.age_limit.match(/(\d+)[^\d]*(\d+)/)
        if (match) {
          const min = parseInt(match[1])
          const max = parseInt(match[2])
          return ageNum >= min && ageNum <= max
        }
        return true
      })
    }

    // 运营商
    if (carrier) {
      filtered = filtered.filter(p => p.carrier === carrier)
    }

    // 价格上限
    if (maxPrice) {
      const max = parseFloat(maxPrice)
      filtered = filtered.filter(p => p.monthly_price <= max)
    }

    // 最低流量
    if (minData) {
      const min = parseInt(minData)
      filtered = filtered.filter(p => p.data_amount >= min)
    }

    // 关键词
    if (keyword) {
      const kw = keyword.toLowerCase()
      filtered = filtered.filter(p => p.name.toLowerCase().includes(kw))
    }

    setResults(filtered)
    setShowResults(true)
  }

  const handleReset = () => {
    setProvince('')
    setAge('')
    setCarrier('')
    setMaxPrice('')
    setMinData('')
    setKeyword('')
    setShowResults(false)
  }

  const getCarrierColor = (c: string) => {
    switch (c) {
      case '移动': return 'bg-blue-100 text-blue-700'
      case '联通': return 'bg-red-100 text-red-700'
      case '电信': return 'bg-green-100 text-green-700'
      case '广电': return 'bg-purple-100 text-purple-700'
      default: return 'bg-gray-100 text-gray-700'
    }
  }

  const copyRecommend = async (plan: Plan) => {
    const lines = [
      `【${plan.carrier}】${plan.name}`,
      `月租：${plan.monthly_price}元/月 | 流量：${plan.data_amount}G`,
    ]
    if (plan.promo_period > 0) lines.push(`优惠期：${plan.promo_period}个月`)
    if (plan.contract_period > 0) lines.push(`合约期：${plan.contract_period}个月`)
    if (plan.first_charge > 0) lines.push(`首充：${plan.first_charge}元`)
    if (plan.age_limit) lines.push(`办卡年龄：${plan.age_limit}`)
    if (plan.region && plan.region !== '全国') lines.push(`限发区域：${plan.region}`)
    if (plan.forbid_regions) lines.push(`禁发区域：${plan.forbid_regions}`)
    if (plan.express) lines.push(`快递方式：${plan.express}`)
    if (plan.activation) lines.push(`激活方式：${plan.activation}`)
    if (plan.commission) lines.push(`预计佣金：${plan.commission}`)
    if (plan.note) lines.push(`备注：${plan.note}`)

    try {
      await navigator.clipboard.writeText(lines.join('\n'))
      setCopiedId(plan.id)
      setTimeout(() => setCopiedId(null), 2000)
    } catch {
      // fallback
      const textarea = document.createElement('textarea')
      textarea.value = lines.join('\n')
      document.body.appendChild(textarea)
      textarea.select()
      document.execCommand('copy')
      document.body.removeChild(textarea)
      setCopiedId(plan.id)
      setTimeout(() => setCopiedId(null), 2000)
    }
  }

  return (
    <div className="space-y-6">
      {/* 标题 */}
      <div>
        <h2 className="text-2xl font-bold text-gray-900">🎯 智能挑卡</h2>
        <p className="text-sm text-gray-500 mt-1">输入客户条件，自动筛选可用套餐</p>
      </div>

      {/* 条件输入 */}
      <div className="card p-6">
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-4">
          {/* 客户省份 */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">客户所在省份</label>
            <select value={province} onChange={e => setProvince(e.target.value)} className="select">
              <option value="">不限</option>
              {PROVINCES.map(p => <option key={p} value={p}>{p}</option>)}
            </select>
          </div>

          {/* 客户年龄 */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">客户年龄</label>
            <input
              type="number"
              value={age}
              onChange={e => setAge(e.target.value)}
              placeholder="如 25"
              min="10"
              max="100"
              className="input"
            />
          </div>

          {/* 运营商 */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">偏好运营商</label>
            <select value={carrier} onChange={e => setCarrier(e.target.value)} className="select">
              <option value="">不限</option>
              <option value="移动">移动</option>
              <option value="联通">联通</option>
              <option value="电信">电信</option>
              <option value="广电">广电</option>
            </select>
          </div>

          {/* 最高月租 */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">最高月租（元）</label>
            <input
              type="number"
              value={maxPrice}
              onChange={e => setMaxPrice(e.target.value)}
              placeholder="如 39"
              min="0"
              className="input"
            />
          </div>

          {/* 最低流量 */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">最低流量（G）</label>
            <input
              type="number"
              value={minData}
              onChange={e => setMinData(e.target.value)}
              placeholder="如 100"
              min="0"
              className="input"
            />
          </div>

          {/* 关键词 */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">套餐关键词</label>
            <input
              type="text"
              value={keyword}
              onChange={e => setKeyword(e.target.value)}
              placeholder="如 长期、大流量"
              className="input"
            />
          </div>
        </div>

        <div className="flex gap-3">
          <button onClick={handleSearch} className="btn btn-primary">
            🔍 搜索推荐
          </button>
          <button onClick={handleReset} className="btn btn-secondary">
            重置条件
          </button>
        </div>
      </div>

      {/* 结果 */}
      {showResults && (
        <div className="card p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-slate-100">
              推荐结果：{results.length} 个套餐
            </h3>
            {province && (
              <span className="text-sm text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/30 px-3 py-1 rounded-full">
                已排除 {province} 禁发套餐
              </span>
            )}
          </div>

          {results.length === 0 ? (
            <div className="text-center py-12 text-gray-400">
              <span className="text-4xl mb-4 block">😔</span>
              <p>没有符合条件的套餐</p>
              <p className="text-sm mt-2">试试放宽条件</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {results.map(plan => (
                <div
                  key={plan.id}
                  className="border dark:border-slate-600 rounded-xl p-4 hover:shadow-md transition-shadow bg-white dark:bg-slate-800"
                >
                  {/* 头部：运营商+套餐名 */}
                  <div className="flex items-start gap-2 mb-3">
                    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium shrink-0 ${getCarrierColor(plan.carrier)}`}>
                      {plan.carrier}
                    </span>
                    <h4 className="text-sm font-semibold text-gray-900 leading-tight line-clamp-2">
                      {plan.name}
                    </h4>
                  </div>

                  {/* 价格+流量 */}
                  <div className="flex items-baseline gap-3 mb-3">
                    <span className="text-2xl font-bold text-orange-500 dark:text-orange-400">
                      {plan.monthly_price}<span className="text-sm font-normal">元/月</span>
                    </span>
                    <span className="text-lg font-semibold text-blue-600 dark:text-blue-400">
                      {plan.data_amount}G
                    </span>
                  </div>

                  {/* 佣金 */}
                  {plan.commission && (
                    <div className="mb-3 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg px-3 py-2">
                      <span className="text-xs text-yellow-600 dark:text-yellow-400 font-medium">💰 预计佣金</span>
                      <span className="text-lg font-bold text-yellow-700 dark:text-yellow-300 ml-2">{plan.commission}</span>
                    </div>
                  )}

                  {/* 详细信息 */}
                  <div className="space-y-1.5 text-xs text-gray-600 dark:text-slate-400 mb-3">
                    {plan.promo_period > 0 && (
                      <div>📅 优惠期 {plan.promo_period} 个月</div>
                    )}
                    {plan.contract_period > 0 && (
                      <div>📝 合约期 {plan.contract_period} 个月</div>
                    )}
                    {plan.first_charge > 0 && (
                      <div>💰 首充 {plan.first_charge} 元</div>
                    )}
                    {plan.age_limit && (
                      <div>👤 年龄 {plan.age_limit}</div>
                    )}
                    {plan.express && (
                      <div>📦 快递 {plan.express}</div>
                    )}
                    {plan.activation && (
                      <div>📱 激活 {plan.activation}</div>
                    )}
                  </div>

                  {/* 区域标签 */}
                  <div className="flex flex-wrap gap-1 mb-3">
                    {plan.region && plan.region !== '全国' ? (
                      <span className="text-xs bg-blue-50 text-blue-600 px-2 py-0.5 rounded">
                        限发 {plan.region}
                      </span>
                    ) : (
                      <span className="text-xs bg-green-50 text-green-600 px-2 py-0.5 rounded">
                        全国
                      </span>
                    )}
                    {plan.forbid_regions && (
                      <span className="text-xs bg-red-50 text-red-600 px-2 py-0.5 rounded" title={plan.forbid_regions}>
                        禁发 {plan.forbid_regions.length > 20 ? plan.forbid_regions.slice(0, 20) + '...' : plan.forbid_regions}
                      </span>
                    )}
                  </div>

                  {/* 复制推荐按钮 */}
                  <button
                    onClick={() => copyRecommend(plan)}
                    className={`w-full text-xs py-1.5 rounded-lg font-medium transition-colors ${
                      copiedId === plan.id
                        ? 'bg-green-500 text-white'
                        : 'bg-blue-50 text-blue-600 hover:bg-blue-100'
                    }`}
                  >
                    {copiedId === plan.id ? '✅ 已复制' : '📋 复制推荐'}
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* 未搜索时显示提示 */}
      {!showResults && !loading && (
        <div className="card p-12 text-center text-gray-400">
          <span className="text-5xl mb-4 block">🎯</span>
          <p className="text-lg mb-2">输入客户条件开始挑卡</p>
          <p className="text-sm">选择省份后会自动排除该地区禁发的套餐</p>
          <p className="text-sm">当前共 {plans.filter(p => (p.sale_status || '在售') === '在售').length} 个在售套餐</p>
        </div>
      )}
    </div>
  )
}
