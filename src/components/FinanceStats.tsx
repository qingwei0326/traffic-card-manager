import { useState, useEffect } from 'react'
import { ProfitSummary, MonthlyProfitRow, ProfitByType } from '../types'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend } from 'recharts'
import { appApi } from '../lib/appApi'

const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899']

export default function FinanceStats() {
  const [summary, setSummary] = useState<ProfitSummary | null>(null)
  const [monthlyProfit, setMonthlyProfit] = useState<MonthlyProfitRow[]>([])
  const [profitByCarrier, setProfitByCarrier] = useState<ProfitByType[]>([])
  const [profitByPlanType, setProfitByPlanType] = useState<ProfitByType[]>([])
  const [year, setYear] = useState(new Date().getFullYear())
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    loadData()
  }, [year])

  const loadData = async () => {
    setLoading(true)
    setError('')
    try {
      const [summaryData, monthlyData, carrierData, planTypeData] = await Promise.all([
        appApi.finance.getProfitSummary(),
        appApi.finance.getMonthlyProfit(year),
        appApi.finance.getProfitByCarrier(),
        appApi.finance.getProfitByPlanType(),
      ])
      setSummary(summaryData)
      setMonthlyProfit(monthlyData)
      setProfitByCarrier(carrierData)
      setProfitByPlanType(planTypeData)
    } catch (error) {
      console.error('加载财务数据失败:', error)
      setError(error instanceof Error ? error.message : '加载财务数据失败，请重试')
    } finally {
      setLoading(false)
    }
  }

  // 填充12个月数据
  const fullMonthlyData = Array.from({ length: 12 }, (_, i) => {
    const month = String(i + 1).padStart(2, '0')
    const found = monthlyProfit.find(m => m.month === month)
    return {
      month: `${month}月`,
      profit: found?.profit || 0,
      count: found?.count || 0,
    }
  })

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-gray-500">加载中...</div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-center px-6">
        <div className="text-red-600 font-medium mb-2">财务数据加载失败</div>
        <p className="text-sm text-gray-500 mb-4 max-w-xl break-all">{error}</p>
        <button onClick={loadData} className="btn btn-secondary">
          重试
        </button>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* 页面标题 */}
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-gray-900">财务统计</h2>
        <select
          value={year}
          onChange={e => setYear(parseInt(e.target.value))}
          className="select w-32"
        >
          {Array.from({ length: 7 }, (_, i) => new Date().getFullYear() - 2 + i).map(y => (
            <option key={y} value={y}>{y}年</option>
          ))}
        </select>
      </div>

      {/* 统计卡片 */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-4">
        <div className="card p-5">
          <p className="text-sm text-gray-500">总利润</p>
          <p className="text-2xl font-bold text-green-600 mt-1">
            ¥{(summary?.totalProfit || 0).toFixed(2)}
          </p>
        </div>
        <div className="card p-5">
          <p className="text-sm text-gray-500">本月利润</p>
          <p className="text-2xl font-bold text-blue-600 mt-1">
            ¥{(summary?.monthProfit || 0).toFixed(2)}
          </p>
        </div>
        <div className="card p-5">
          <p className="text-sm text-gray-500">本月办卡</p>
          <p className="text-2xl font-bold text-purple-600 mt-1">
            {summary?.monthCards || 0} 张
          </p>
        </div>
        <div className="card p-5">
          <p className="text-sm text-gray-500">平均利润</p>
          <p className="text-2xl font-bold text-orange-600 mt-1">
            ¥{(summary?.avgProfit || 0).toFixed(2)}
          </p>
        </div>
        <div className="card p-5">
          <p className="text-sm text-gray-500">总办卡数</p>
          <p className="text-2xl font-bold text-gray-900 mt-1">
            {summary?.totalCards || 0} 张
          </p>
        </div>
      </div>

      {/* 月度利润图表 */}
      <div className="card p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">月度利润趋势</h3>
        <div className="h-80 text-gray-900 dark:text-slate-200">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={fullMonthlyData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="month" tick={{ fontSize: 12, fill: 'currentColor' }} />
              <YAxis tick={{ fontSize: 12, fill: 'currentColor' }} />
              <Tooltip
                formatter={(value: number) => [`¥${value.toFixed(2)}`, '利润']}
                labelFormatter={(label) => `${year}年${label}`}
              />
              <Bar dataKey="profit" fill="#3b82f6" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* 饼图 */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        {/* 按运营商 */}
        <div className="card p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">按运营商利润分布</h3>
          {profitByCarrier.length === 0 ? (
            <div className="text-center text-gray-400 py-8">暂无数据</div>
          ) : (
            <div className="h-64 text-gray-900 dark:text-slate-200">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={profitByCarrier}
                    dataKey="profit"
                    nameKey="carrier"
                    cx="50%"
                    cy="50%"
                    outerRadius={80}
                    label={({ carrier, percent }) => `${carrier} ${(percent * 100).toFixed(0)}%`}
                  >
                    {profitByCarrier.map((_, index) => (
                      <Cell key={index} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(value: number) => [`¥${value.toFixed(2)}`, '利润']} />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>

        {/* 按套餐类型 */}
        <div className="card p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">按套餐类型利润分布</h3>
          {profitByPlanType.length === 0 ? (
            <div className="text-center text-gray-400 py-8">暂无数据</div>
          ) : (
            <div className="h-64 text-gray-900 dark:text-slate-200">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={profitByPlanType}
                    dataKey="profit"
                    nameKey="plan_type"
                    cx="50%"
                    cy="50%"
                    outerRadius={80}
                    label={({ plan_type, percent }) => `${plan_type} ${(percent * 100).toFixed(0)}%`}
                  >
                    {profitByPlanType.map((_, index) => (
                      <Cell key={index} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(value: number) => [`¥${value.toFixed(2)}`, '利润']} />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      </div>

      {/* 详细数据表格 */}
      <div className="card p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">月度明细</h3>
        <div className="table-container">
          <table>
            <thead>
              <tr>
                <th>月份</th>
                <th>办卡数量</th>
                <th>利润</th>
                <th>环比</th>
              </tr>
            </thead>
            <tbody>
              {fullMonthlyData.map((row, index) => {
                const prevProfit = index > 0 ? fullMonthlyData[index - 1].profit : 0
                const change = prevProfit > 0 ? ((row.profit - prevProfit) / prevProfit * 100) : 0
                return (
                  <tr key={index}>
                    <td className="font-medium">{year}年{row.month}</td>
                    <td>{row.count} 张</td>
                    <td className="text-green-600 font-medium">¥{row.profit.toFixed(2)}</td>
                    <td>
                      {index > 0 && prevProfit > 0 ? (
                        <span className={change >= 0 ? 'text-green-600' : 'text-red-500'}>
                          {change >= 0 ? '↑' : '↓'} {Math.abs(change).toFixed(1)}%
                        </span>
                      ) : '-'}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* 季度汇总 */}
      <div className="card p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">季度汇总</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map(q => {
            const startMonth = (q - 1) * 3
            const quarterData = fullMonthlyData.slice(startMonth, startMonth + 3)
            const qProfit = quarterData.reduce((s, r) => s + r.profit, 0)
            const qCount = quarterData.reduce((s, r) => s + r.count, 0)
            return (
              <div key={q} className="p-4 bg-gray-50 dark:bg-slate-700/50 rounded-lg">
                <div className="text-sm text-gray-500 dark:text-slate-400">Q{q}</div>
                <div className="text-lg font-bold text-gray-900 dark:text-slate-100 mt-1">¥{qProfit.toFixed(0)}</div>
                <div className="text-xs text-gray-500 dark:text-slate-400 mt-1">{qCount} 张</div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
