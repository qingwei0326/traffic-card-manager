import { useState, useEffect } from 'react'
import { CardStats, MonthlyStats, Card } from '../types'
import { Page } from '../App'
import Skeleton from './Skeleton'
import {
  BarChart3,
  CalendarClock,
  CheckCircle2,
  CreditCard,
  DatabaseBackup,
  FileChartColumn,
  Plus,
  Trophy,
  UserPlus,
  WalletCards,
  WandSparkles,
} from 'lucide-react'

interface DashboardProps {
  onNavigate: (page: Page) => void
  onAddCard: () => void
  onAddCustomer: () => void
  onViewCustomer: (customerId: number) => void
}

export default function Dashboard({ onNavigate, onAddCard, onAddCustomer, onViewCustomer }: DashboardProps) {
  const [stats, setStats] = useState<CardStats | null>(null)
  const [monthlyStats, setMonthlyStats] = useState<MonthlyStats | null>(null)
  const [expiringCards, setExpiringCards] = useState<Card[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    loadData()
  }, [])

  const loadData = async () => {
    setLoading(true)
    setError('')
    try {
      const now = new Date()
      const [statsData, monthlyData, expiring] = await Promise.all([
        window.electronAPI.cards.getStats(),
        window.electronAPI.cards.getMonthlyStats(now.getFullYear(), now.getMonth() + 1),
        window.electronAPI.cards.getExpiringSoon(30),
      ])
      setStats(statsData)
      setMonthlyStats(monthlyData)
      setExpiringCards(expiring)
    } catch (error) {
      console.error('加载数据失败:', error)
      setError(error instanceof Error ? error.message : '加载数据失败，请重试')
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return <Skeleton type="card" />
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-center px-6">
        <div className="text-red-600 font-medium mb-2">仪表盘数据加载失败</div>
        <p className="text-sm text-gray-500 mb-4 max-w-xl break-all">{error}</p>
        <button onClick={loadData} className="btn btn-secondary">
          重试
        </button>
      </div>
    )
  }

  const statCards = [
    { label: '总卡片数', value: stats?.total || 0, icon: CreditCard, color: 'bg-blue-50 text-blue-600 dark:bg-blue-900/30 dark:text-blue-300' },
    { label: '使用中', value: stats?.active || 0, icon: CheckCircle2, color: 'bg-emerald-50 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-300' },
    { label: '本月新增', value: monthlyStats?.newCards || 0, icon: BarChart3, color: 'bg-violet-50 text-violet-600 dark:bg-violet-900/30 dark:text-violet-300' },
    { label: '本月利润', value: `¥${(monthlyStats?.monthProfit || 0).toFixed(2)}`, icon: WalletCards, color: 'bg-amber-50 text-amber-600 dark:bg-amber-900/30 dark:text-amber-300' },
    { label: '总利润', value: `¥${(stats?.totalProfit || 0).toFixed(2)}`, icon: Trophy, color: 'bg-orange-50 text-orange-600 dark:bg-orange-900/30 dark:text-orange-300' },
  ]

  const quickActions = [
    { label: '添加流量卡', icon: Plus, onClick: onAddCard, primary: true },
    { label: '添加客户', icon: UserPlus, onClick: onAddCustomer },
    { label: '查看报表', icon: FileChartColumn, onClick: () => onNavigate('finance') },
    { label: '数据备份', icon: DatabaseBackup, onClick: () => onNavigate('settings') },
    { label: '智能挑卡', icon: WandSparkles, onClick: () => onNavigate('picker') },
  ]

  return (
    <div className="space-y-6">
      {/* 页面标题 */}
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-gray-900">仪表盘</h2>
        <p className="text-sm text-gray-500">
          {new Date().toLocaleDateString('zh-CN', { year: 'numeric', month: 'long', day: 'numeric' })}
        </p>
      </div>

      {/* 统计卡片 */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-4">
        {statCards.map((item, index) => (
          <div key={index} className="card p-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500">{item.label}</p>
                <p className="text-2xl font-bold text-gray-900 mt-1">{item.value}</p>
              </div>
              <div className={`${item.color} w-11 h-11 rounded-lg flex items-center justify-center`}>
                <item.icon className="h-5 w-5" />
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* 快捷操作 */}
      <div className="card p-5">
        <div className="flex items-center justify-between gap-4">
          <h3 className="text-base font-semibold text-gray-900">快捷操作</h3>
          <div className="flex flex-wrap items-center justify-end gap-3">
            {quickActions.map(action => (
              <button
                key={action.label}
                onClick={action.onClick}
                className={`btn ${action.primary ? 'btn-primary' : 'btn-secondary'}`}
              >
                <action.icon className="h-4 w-4" />
                <span>{action.label}</span>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* 即将到期提醒 */}
      <div className="card p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-gray-900">
            <span className="inline-flex items-center gap-2">
              <CalendarClock className="h-5 w-5 text-amber-500" />
              即将到期提醒（30天内）
            </span>
          </h3>
          <span className="text-sm text-gray-500">
            共 {expiringCards.length} 张
          </span>
        </div>

        {expiringCards.length === 0 ? (
          <div className="text-center py-8 text-gray-400">
            暂无即将到期的卡片
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">套餐</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">运营商</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">客户</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">手机号</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">优惠到期</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">剩余</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {expiringCards.slice(0, 10).map(card => {
                  const daysLeft = Math.ceil(
                    (new Date(card.promo_end).getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24)
                  )
                  return (
                    <tr
                      key={card.id}
                      className="hover:bg-blue-50 cursor-pointer transition-colors"
                      onClick={() => card.customer_id && onViewCustomer(card.customer_id)}
                    >
                      <td className="px-4 py-3 font-medium">{card.card_name}</td>
                      <td className="px-4 py-3">{card.carrier}</td>
                      <td className="px-4 py-3 font-medium text-blue-600">{card.customer_name || '-'}</td>
                      <td className="px-4 py-3">{card.phone_number || '-'}</td>
                      <td className="px-4 py-3">{card.promo_end}</td>
                      <td className="px-4 py-3">
                        <span className={`status-tag ${daysLeft <= 0 ? 'bg-red-100 text-red-700' : daysLeft <= 7 ? 'bg-red-100 text-red-700' : 'bg-yellow-100 text-yellow-700'}`}>
                          {daysLeft <= 0 ? '已过期' : `${daysLeft} 天`}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        {card.customer_id && (
                          <button
                            onClick={(e) => { e.stopPropagation(); onViewCustomer(card.customer_id!) }}
                            className="text-blue-600 hover:text-blue-800 text-xs font-medium"
                          >
                            联系客户 →
                          </button>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
