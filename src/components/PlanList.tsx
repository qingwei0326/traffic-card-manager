import { useState, useEffect } from 'react'
import { Plan } from '../types'
import { appApi } from '../lib/appApi'
import { planDisplayName } from '../lib/planDisplay'

export default function PlanList() {
  const [plans, setPlans] = useState<Plan[]>([])
  const [search, setSearch] = useState('')
  const [carrierFilter, setCarrierFilter] = useState('')
  const [saleFilter, setSaleFilter] = useState('')
  const [loading, setLoading] = useState(true)
  const [importing, setImporting] = useState(false)
  const [backfilling, setBackfilling] = useState(false)
  const [notice, setNotice] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    loadPlans()
  }, [])

  const loadPlans = async () => {
    setLoading(true)
    setError('')
    try {
      const data = await appApi.plans.getAll()
      setPlans(data)
    } catch (err) {
      console.error('加载套餐失败:', err)
      setError(err instanceof Error ? err.message : '加载套餐失败，请重试')
    } finally {
      setLoading(false)
    }
  }

  const handleImport = async () => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = '.json'
    input.onchange = async (e: any) => {
      const file = e.target.files[0]
      if (!file) return

      setImporting(true)
      try {
        const text = await file.text()
        const data = JSON.parse(text)
        const result = await appApi.plans.import(data)
        setNotice(`导入完成：新增 ${result.imported} 个，更新 ${result.updated} 个，回填历史卡片 ${result.backfilled} 张（共 ${result.total} 个）`)
        loadPlans()
      } catch (err: any) {
        alert('导入失败：' + err.message)
      }
      setImporting(false)
    }
    input.click()
  }

  const handleBackfill = async () => {
    setBackfilling(true)
    try {
      const result = await appApi.plans.backfillCards()
      setNotice(`回填完成：补齐历史卡片 ${result.backfilled} 张`)
    } catch (err: any) {
      alert('回填失败：' + err.message)
    } finally {
      setBackfilling(false)
    }
  }

  const handleDelete = async (id: number) => {
    if (!confirm('确定删除这个套餐模板？')) return
    setError('')
    try {
      await appApi.plans.delete(id)
      loadPlans()
    } catch (err) {
      console.error('删除套餐失败:', err)
      setError('删除套餐失败，请重试')
    }
  }

  // 筛选
  const filtered = plans.filter(p => {
    if (carrierFilter && p.carrier !== carrierFilter) return false
    if (saleFilter && (p.sale_status || '在售') !== saleFilter) return false
    if (search && !p.name.toLowerCase().includes(search.toLowerCase())) return false
    return true
  })

  // 统计
  const carriers = ['移动', '联通', '电信', '广电']
  const stats = carriers.map(c => ({
    carrier: c,
    count: plans.filter(p => p.carrier === c).length
  }))
  const onSaleCount = plans.filter(p => (p.sale_status || '在售') === '在售').length
  const offSaleCount = plans.length - onSaleCount

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-800 dark:text-slate-100">套餐模板库</h1>
          <p className="text-sm text-gray-500 dark:text-slate-400 mt-1">共 {plans.length} 个套餐模板，导入订单时自动匹配</p>
        </div>
        <div className="flex gap-3">
          <button
            onClick={handleBackfill}
            disabled={backfilling}
            className="px-4 py-2 border border-blue-500 text-blue-600 rounded-lg hover:bg-blue-50 disabled:opacity-50"
          >
            {backfilling ? '回填中...' : '回填历史卡片'}
          </button>
          <button
            onClick={handleImport}
            disabled={importing}
            className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:opacity-50"
          >
            {importing ? '导入中...' : '导入/更新套餐数据'}
          </button>
        </div>
      </div>

      {notice && (
        <div className="mb-4 rounded-lg bg-blue-50 px-4 py-3 text-sm text-blue-800">
          {notice}
        </div>
      )}

      {/* 运营商统计 */}
      <div className="grid grid-cols-3 md:grid-cols-6 gap-4 mb-6">
        {stats.map(s => (
          <div
            key={s.carrier}
            onClick={() => setCarrierFilter(carrierFilter === s.carrier ? '' : s.carrier)}
            className={`p-4 rounded-lg border-2 cursor-pointer transition-all ${
              carrierFilter === s.carrier
                ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/30'
                : 'border-gray-200 dark:border-slate-600 hover:border-gray-300 dark:hover:border-slate-500'
            }`}
          >
            <div className="text-sm text-gray-500 dark:text-slate-400">{s.carrier}</div>
            <div className="text-2xl font-bold dark:text-slate-100">{s.count}</div>
          </div>
        ))}
        <div className="p-4 rounded-lg border-2 cursor-pointer transition-all border-gray-200 dark:border-slate-600 hover:border-gray-300 dark:hover:border-slate-500">
          <div className="text-sm text-gray-500 dark:text-slate-400">在售</div>
          <div className="text-2xl font-bold text-green-600">{onSaleCount}</div>
        </div>
        <div className="p-4 rounded-lg border-2 cursor-pointer transition-all border-gray-200 dark:border-slate-600 hover:border-gray-300 dark:hover:border-slate-500">
          <div className="text-sm text-gray-500 dark:text-slate-400">停售</div>
          <div className="text-2xl font-bold text-red-500">{offSaleCount}</div>
        </div>
      </div>

      {/* 搜索和筛选 */}
      <div className="mb-4 flex gap-3">
        <input
          type="text"
          placeholder="搜索套餐名称..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="input flex-1"
        />
        <select
          value={saleFilter}
          onChange={e => setSaleFilter(e.target.value)}
          className="select w-32"
        >
          <option value="">全部状态</option>
          <option value="在售">在售</option>
          <option value="停售">停售</option>
        </select>
      </div>

      {/* 表格 */}
      {loading ? (
        <div className="text-center py-8 text-gray-500" data-testid="plans-loading">加载中...</div>
      ) : error ? (
        <div className="flex flex-col items-center justify-center py-12 text-center px-6" data-testid="plans-error">
          <div className="text-red-600 font-medium mb-2">套餐数据加载失败</div>
          <p className="text-sm text-gray-500 mb-4 max-w-xl break-all">{error}</p>
          <button onClick={loadPlans} className="btn btn-secondary" data-testid="plans-retry">
            重试
          </button>
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-8 text-gray-500">
          {plans.length === 0 ? '暂无套餐数据，请先导入' : '没有匹配的套餐'}
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse">
            <thead className="bg-gray-50 dark:bg-slate-800">
              <tr>
                <th className="px-3 py-3 text-left text-sm font-medium text-gray-600 dark:text-slate-400">套餐名称</th>
                <th className="px-3 py-3 text-left text-sm font-medium text-gray-600 dark:text-slate-400">运营商</th>
                <th className="px-3 py-3 text-left text-sm font-medium text-gray-600 dark:text-slate-400">月租</th>
                <th className="px-3 py-3 text-left text-sm font-medium text-gray-600 dark:text-slate-400">流量</th>
                <th className="px-3 py-3 text-left text-sm font-medium text-gray-600 dark:text-slate-400">优惠期</th>
                <th className="px-3 py-3 text-left text-sm font-medium text-gray-600 dark:text-slate-400">合约期</th>
                <th className="px-3 py-3 text-left text-sm font-medium text-gray-600 dark:text-slate-400">首充</th>
                <th className="px-3 py-3 text-left text-sm font-medium text-gray-600 dark:text-slate-400">年龄</th>
                <th className="px-3 py-3 text-left text-sm font-medium text-gray-600 dark:text-slate-400">快递</th>
                <th className="px-3 py-3 text-left text-sm font-medium text-gray-600 dark:text-slate-400">佣金</th>
                <th className="px-3 py-3 text-left text-sm font-medium text-gray-600 dark:text-slate-400">禁发地区</th>
                <th className="px-3 py-3 text-left text-sm font-medium text-gray-600 dark:text-slate-400">状态</th>
                <th className="px-3 py-3 text-left text-sm font-medium text-gray-600 dark:text-slate-400">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-slate-700">
              {filtered.map(plan => {
                const displayName = planDisplayName(plan.name)
                return (
                  <tr key={plan.id} className="hover:bg-gray-50 dark:hover:bg-slate-700/50 transition-colors">
                    <td className="px-3 py-3 text-sm max-w-[200px] truncate" title={plan.name}>{displayName}</td>
                    <td className="px-3 py-3 text-sm">
                      <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${
                        plan.carrier === '移动' ? 'bg-blue-100 text-blue-700' :
                        plan.carrier === '联通' ? 'bg-red-100 text-red-700' :
                        plan.carrier === '电信' ? 'bg-green-100 text-green-700' :
                        'bg-purple-100 text-purple-700'
                      }`}>{plan.carrier}</span>
                    </td>
                    <td className="px-3 py-3 text-sm">{plan.monthly_price}元</td>
                    <td className="px-3 py-3 text-sm">{plan.data_amount}G</td>
                    <td className="px-3 py-3 text-sm">{plan.promo_period > 0 ? plan.promo_period + '个月' : '-'}</td>
                    <td className="px-3 py-3 text-sm">{plan.contract_period > 0 ? plan.contract_period + '个月' : '-'}</td>
                    <td className="px-3 py-3 text-sm">{plan.first_charge > 0 ? plan.first_charge + '元' : '-'}</td>
                    <td className="px-3 py-3 text-sm">{plan.age_limit || '-'}</td>
                    <td className="px-3 py-3 text-xs text-gray-500 max-w-[120px] truncate" title={plan.express}>{plan.express || '-'}</td>
                    <td className="px-3 py-3 text-sm font-medium text-yellow-600">{plan.commission || '-'}</td>
                    <td className="px-3 py-3 text-xs max-w-[180px] truncate"
                        title={[plan.region !== '全国' ? `限发: ${plan.region}` : '', plan.forbid_regions ? `禁发: ${plan.forbid_regions}` : ''].filter(Boolean).join('；')}>
                      {plan.region !== '全国' ? (
                        <span className="text-blue-600 font-medium">限发 {plan.region}</span>
                      ) : plan.forbid_regions ? (
                        <span className="text-orange-600">禁发 {plan.forbid_regions}</span>
                      ) : (
                        <span className="text-green-600">全国可发</span>
                      )}
                    </td>
                    <td className="px-3 py-3 text-sm">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
                        plan.sale_status === '在售' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                      }`}>
                        {plan.sale_status || '在售'}
                      </span>
                    </td>
                    <td className="px-3 py-3 text-sm">
                      <button
                        onClick={() => handleDelete(plan.id)}
                        className="text-red-500 hover:text-red-700 text-xs"
                      >删除</button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
