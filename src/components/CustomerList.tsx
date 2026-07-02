import { useState, useEffect, useRef } from 'react'
import { Customer, Card, CustomerFilters } from '../types'
import CustomerForm from './CustomerForm'
import { ConfirmModal, AlertModal } from './Modal'
import { appApi } from '../lib/appApi'

interface CustomerListProps {
  onRefresh: () => void
  openForm?: boolean
  onFormOpened?: () => void
  selectedCustomerId?: number | null
  onSelectionHandled?: () => void
  onRecommendPlans?: (province: string) => void
}

// 从地址中提取省份
function extractProvince(address: string): string {
  if (!address) return ''
  const provinces = ['北京','上海','天津','重庆','河北','山西','辽宁','吉林','黑龙江','江苏','浙江','安徽','福建','江西','山东','河南','湖北','湖南','广东','广西','海南','四川','贵州','云南','西藏','陕西','甘肃','青海','宁夏','新疆','内蒙古']
  for (const p of provinces) {
    if (address.includes(p)) return p
  }
  return ''
}

export default function CustomerList({ onRefresh, openForm, onFormOpened, selectedCustomerId, onSelectionHandled, onRecommendPlans }: CustomerListProps) {
  const [customers, setCustomers] = useState<Customer[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null)
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null)
  const [customerCards, setCustomerCards] = useState<Card[]>([])
  const [search, setSearch] = useState('')
  const [searchInput, setSearchInput] = useState('')
  const [tagFilter, setTagFilter] = useState('')
  const PAGE_SIZE = 50

  // 合并去重状态
  const [showMerge, setShowMerge] = useState(false)
  const [mergeGroups, setMergeGroups] = useState<Customer[][]>([])
  const [mergeSelections, setMergeSelections] = useState<Record<number, number>>({})
  const [merging, setMerging] = useState(false)

  // 预设标签
  const PRESET_TAGS = ['价格敏感', '大流量', '长期用户', '已流失', '高价值', '新客户', '复购客户', '犹豫中']
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const handleSearchChange = (value: string) => {
    setSearchInput(value)
    if (debounceTimer.current) clearTimeout(debounceTimer.current)
    debounceTimer.current = setTimeout(() => {
      setPage(1)
      setSearch(value)
    }, 300)
  }

  const totalPages = Math.ceil(total / PAGE_SIZE)

  const handlePageChange = (newPage: number) => {
    setPage(newPage)
  }

  useEffect(() => {
    loadCustomers()
  }, [search, page, tagFilter])

  useEffect(() => {
    if (openForm) {
      setEditingCustomer(null)
      setShowForm(true)
      onFormOpened?.()
    }
  }, [openForm])

  // 外部传入 selectedCustomerId 时，自动选中该客户
  useEffect(() => {
    if (selectedCustomerId && customers.length > 0) {
      const customer = customers.find(c => c.id === selectedCustomerId)
      if (customer) {
        handleViewCards(customer)
        onSelectionHandled?.()
      }
    }
  }, [selectedCustomerId, customers])

  const loadCustomers = async () => {
    setLoading(true)
    try {
      const result = await appApi.customers.getAll({ search, tag: tagFilter, page, pageSize: PAGE_SIZE })
      setCustomers(result.data)
      setTotal(result.total)
    } catch (error) {
      console.error('加载客户失败:', error)
      setAlertMsg('加载客户失败，请重试')
    } finally {
      setLoading(false)
    }
  }

  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null)
  const [alertMsg, setAlertMsg] = useState('')

  const handleDelete = async (id: number) => {
    try {
      await appApi.customers.delete(id)
      loadCustomers()
      onRefresh()
      if (selectedCustomer?.id === id) {
        setSelectedCustomer(null)
        setCustomerCards([])
      }
    } catch (error) {
      console.error('删除失败:', error)
      setAlertMsg('删除失败，请重试')
    }
  }

  const handleEdit = (customer: Customer) => {
    setEditingCustomer(customer)
    setShowForm(true)
  }

  const handleViewCards = async (customer: Customer) => {
    setSelectedCustomer(customer)
    try {
      const cards = await appApi.customers.getCards(customer.id)
      setCustomerCards(cards)
    } catch (error) {
      console.error('加载客户卡片失败:', error)
      alert('加载卡片失败，请重试')
    }
  }

  const handleSave = () => {
    setShowForm(false)
    setEditingCustomer(null)
    loadCustomers()
    onRefresh()
  }

  const handleCancel = () => {
    setShowForm(false)
    setEditingCustomer(null)
  }

  const handleOpenMerge = async () => {
    try {
      const groups = await appApi.customers.findDuplicates()
      if (groups.length === 0) {
        setAlertMsg('没有发现重复客户')
        return
      }
      setMergeGroups(groups)
      // 默认选每组第一个为保留目标
      const selections: Record<number, number> = {}
      groups.forEach((_, i) => { selections[i] = 0 })
      setMergeSelections(selections)
      setShowMerge(true)
    } catch (error) {
      console.error('查找重复客户失败:', error)
      setAlertMsg('查找失败，请重试')
    }
  }

  const handleMerge = async () => {
    setMerging(true)
    try {
      let totalMerged = 0
      for (let i = 0; i < mergeGroups.length; i++) {
        const group = mergeGroups[i]
        const keepIdx = mergeSelections[i] ?? 0
        const keepId = group[keepIdx].id
        const mergeIds = group.filter((_, j) => j !== keepIdx).map(c => c.id)
        if (mergeIds.length === 0) continue
        const result = await appApi.customers.merge(keepId, mergeIds)
        totalMerged += result.merged
      }
      setShowMerge(false)
      setMergeGroups([])
      loadCustomers()
      onRefresh()
      if (selectedCustomer && mergeGroups.some(g => g.some(c => c.id === selectedCustomer.id && c.id !== g[mergeSelections[mergeGroups.indexOf(g)]].id))) {
        setSelectedCustomer(null)
        setCustomerCards([])
      }
      setAlertMsg(`合并完成，处理了 ${totalMerged} 个重复客户`)
    } catch (error) {
      console.error('合并失败:', error)
      setAlertMsg('合并失败，请重试')
    } finally {
      setMerging(false)
    }
  }

  // 搜索过滤客户（已在后端过滤）

  return (
    <div className="space-y-6">
      {/* 页面标题 */}
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-gray-900">客户管理</h2>
        <div className="flex gap-3">
          <button
            onClick={handleOpenMerge}
            className="btn btn-secondary"
          >
            🔀 合并去重
          </button>
          <button
            onClick={() => { setEditingCustomer(null); setShowForm(true) }}
            className="btn btn-primary"
          >
            ➕ 添加客户
          </button>
        </div>
      </div>

      {/* 搜索栏 */}
      <div className="card p-4">
        <div className="flex gap-4">
          <div className="flex-1">
            <input
              type="text"
              placeholder="搜索客户姓名、电话、微信..."
              value={searchInput}
              onChange={e => handleSearchChange(e.target.value)}
              className="input"
            />
          </div>
          <select
            value={tagFilter}
            onChange={e => { setTagFilter(e.target.value); setPage(1) }}
            className="select w-40"
          >
            <option value="">全部标签</option>
            {PRESET_TAGS.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-6">
        {/* 客户列表 */}
        <div className="col-span-2 card">
          {loading ? (
            <div className="flex items-center justify-center h-64">
              <div className="text-gray-500">加载中...</div>
            </div>
          ) : customers.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-64 text-gray-400">
              <span className="text-4xl mb-4">👥</span>
              <p>暂无客户</p>
              <button
                onClick={() => { setEditingCustomer(null); setShowForm(true) }}
                className="btn btn-primary mt-4"
              >
                添加第一个客户
              </button>
            </div>
          ) : (
            <div className="table-container">
              <table>
                <thead>
                  <tr>
                    <th>姓名</th>
                    <th>电话</th>
                    <th>微信</th>
                    <th>标签</th>
                    <th>办卡数</th>
                    <th>贡献利润</th>
                    <th>操作</th>
                  </tr>
                </thead>
                <tbody>
                  {customers.map(customer => (
                    <tr
                      key={customer.id}
                      className={`cursor-pointer transition-colors ${selectedCustomer?.id === customer.id ? 'bg-blue-50 dark:bg-blue-900/30' : 'hover:bg-gray-50 dark:hover:bg-slate-700/50'}`}
                      onClick={() => handleViewCards(customer)}
                    >
                      <td className="font-medium">{customer.name}</td>
                      <td>{customer.phone || '-'}</td>
                      <td>{customer.wechat || '-'}</td>
                      <td>
                        {customer.tags ? (
                          <div className="flex flex-wrap gap-1">
                            {customer.tags.split(',').map((t, i) => (
                              <span key={i} className="inline-block px-1.5 py-0.5 rounded text-xs bg-blue-50 text-blue-600">
                                {t.trim()}
                              </span>
                            ))}
                          </div>
                        ) : <span className="text-gray-400">-</span>}
                      </td>
                      <td>{customer.card_count || 0}</td>
                      <td className="text-green-600 font-medium">
                        ¥{(customer.total_profit || 0).toFixed(2)}
                      </td>
                      <td>
                        <div className="flex gap-2" onClick={e => e.stopPropagation()}>
                          <button
                            onClick={() => handleEdit(customer)}
                            className="text-blue-600 hover:text-blue-800 text-sm"
                          >
                            编辑
                          </button>
                          <button
                            onClick={() => setConfirmDeleteId(customer.id)}
                            className="text-red-600 hover:text-red-800 text-sm"
                          >
                            删除
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <div className="p-3 text-sm text-gray-500 flex items-center justify-between border-t border-gray-100">
            <span>共 {total} 个客户{search ? `（搜索"${search}"）` : ''}</span>
            {totalPages > 1 && (
              <div className="flex items-center gap-2">
                <button
                  onClick={() => handlePageChange(page - 1)}
                  disabled={page <= 1}
                  className="px-3 py-1 rounded border border-gray-300 disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50"
                >
                  上一页
                </button>
                <span>{page} / {totalPages}</span>
                <button
                  onClick={() => handlePageChange(page + 1)}
                  disabled={page >= totalPages}
                  className="px-3 py-1 rounded border border-gray-300 disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50"
                >
                  下一页
                </button>
              </div>
            )}
          </div>
        </div>

        {/* 客户详情 */}
        <div className="card p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">客户详情</h3>
          {!selectedCustomer ? (
            <div className="text-center text-gray-400 py-8">
              <p>点击左侧客户查看详情</p>
            </div>
          ) : (
            <div className="space-y-4">
              <div>
                <p className="text-sm text-gray-500">姓名</p>
                <p className="font-medium">{selectedCustomer.name}</p>
              </div>
              {selectedCustomer.phone && (
                <div>
                  <p className="text-sm text-gray-500">电话</p>
                  <p className="font-medium">{selectedCustomer.phone}</p>
                </div>
              )}
              {selectedCustomer.wechat && (
                <div>
                  <p className="text-sm text-gray-500">微信</p>
                  <p className="font-medium">{selectedCustomer.wechat}</p>
                </div>
              )}
              {selectedCustomer.address && (
                <div>
                  <p className="text-sm text-gray-500">地址</p>
                  <p className="font-medium">{selectedCustomer.address}</p>
                </div>
              )}
              {selectedCustomer.notes && (
                <div>
                  <p className="text-sm text-gray-500">备注</p>
                  <p className="font-medium">{selectedCustomer.notes}</p>
                </div>
              )}
              {selectedCustomer.tags && (
                <div>
                  <p className="text-sm text-gray-500 mb-1">标签</p>
                  <div className="flex flex-wrap gap-1">
                    {selectedCustomer.tags.split(',').map((t, i) => (
                      <span key={i} className="inline-block px-2 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-700">
                        {t.trim()}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* 推荐套餐按钮 */}
              {onRecommendPlans && (
                <button
                  onClick={() => {
                    const province = extractProvince(selectedCustomer.address || '') || extractProvince(selectedCustomer.notes || '')
                    onRecommendPlans(province)
                  }}
                  className="w-full btn btn-primary py-2 flex items-center justify-center gap-2"
                >
                  🎯 推荐套餐
                  {selectedCustomer.address && (
                    <span className="text-xs opacity-75">（{extractProvince(selectedCustomer.address) || '未识别省份'}）</span>
                  )}
                </button>
              )}

              <div className="pt-4 border-t border-gray-200 dark:border-slate-600">
                <p className="text-sm text-gray-500 dark:text-slate-400 mb-2">办卡记录（{customerCards.length} 张）</p>
                {customerCards.length === 0 ? (
                  <p className="text-gray-400 dark:text-slate-500 text-sm">暂无关联卡片</p>
                ) : (
                  <div className="relative">
                    <div className="absolute left-3 top-0 bottom-0 w-0.5 bg-gray-200 dark:bg-slate-600" />
                    <div className="space-y-3">
                      {customerCards.map(card => (
                        <div key={card.id} className="relative pl-7">
                          <div className={`absolute left-1.5 top-1.5 w-3 h-3 rounded-full border-2 ${
                            card.status === '使用中' ? 'bg-green-400 border-green-200 dark:border-green-700' :
                            card.status === '待确认' ? 'bg-yellow-400 border-yellow-200 dark:border-yellow-700' :
                            card.status === '已到期' ? 'bg-gray-400 border-gray-200 dark:border-slate-600' :
                            'bg-red-400 border-red-200 dark:border-red-700'
                          }`} />
                          <div className="p-2 bg-gray-50 dark:bg-slate-700/50 rounded">
                            <div className="flex items-center justify-between">
                              <p className="text-sm font-medium">{card.card_name}</p>
                              <span className={`status-tag text-xs ${
                                card.status === '使用中' ? 'status-active' :
                                card.status === '待确认' ? 'status-pending' :
                                card.status === '已到期' ? 'status-expired' : 'status-cancelled'
                              }`}>
                                {card.status}
                              </span>
                            </div>
                            <p className="text-xs text-gray-500 mt-1">
                              {card.carrier} · {card.plan_type} · {card.phone_number || '无号'}
                            </p>
                            <div className="flex items-center gap-3 mt-1 text-xs text-gray-400">
                              {card.apply_time && <span>办卡 {card.apply_time.slice(0, 10)}</span>}
                              {card.promo_end && <span>到期 {card.promo_end}</span>}
                              {card.profit > 0 && <span className="text-green-600">利润 ¥{card.profit}</span>}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* 表单弹窗 */}
      {showForm && (
        <CustomerForm
          customer={editingCustomer}
          onSave={handleSave}
          onCancel={handleCancel}
        />
      )}

      <ConfirmModal
        open={confirmDeleteId !== null}
        onClose={() => setConfirmDeleteId(null)}
        onConfirm={() => { if (confirmDeleteId) handleDelete(confirmDeleteId) }}
        title="删除确认"
        message="确定要删除这个客户吗？关联的流量卡不会被删除。"
        confirmText="删除"
        danger
      />

      <AlertModal
        open={!!alertMsg}
        onClose={() => setAlertMsg('')}
        message={alertMsg}
        type={alertMsg.includes('完成') || alertMsg.includes('成功') ? 'success' : 'error'}
      />

      {/* 合并去重弹窗 */}
      {showMerge && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50" onClick={() => setShowMerge(false)}>
          <div className="bg-white rounded-xl shadow-xl w-[700px] max-h-[80vh] flex flex-col" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between p-4 border-b">
              <h3 className="text-lg font-semibold">🔀 客户合并去重</h3>
              <button onClick={() => setShowMerge(false)} className="text-gray-400 hover:text-gray-600 text-xl">✕</button>
            </div>
            <div className="flex-1 overflow-auto p-4">
              <p className="text-sm text-gray-500 mb-4">
                发现 {mergeGroups.length} 组重复客户，请选择每组要保留的客户（其余将被合并删除，卡片自动转移）。
              </p>
              <div className="space-y-4">
                {mergeGroups.map((group, gi) => (
                  <div key={gi} className="border rounded-lg p-3">
                    <p className="text-sm font-medium text-gray-700 mb-2">重复组 {gi + 1}（{group.length} 个客户）</p>
                    <div className="space-y-2">
                      {group.map((c, ci) => (
                        <label key={c.id} className={`flex items-center gap-3 p-2 rounded cursor-pointer transition-colors ${
                          mergeSelections[gi] === ci ? 'bg-blue-50 border border-blue-300' : 'hover:bg-gray-50 border border-transparent'
                        }`}>
                          <input
                            type="radio"
                            name={`merge-group-${gi}`}
                            checked={mergeSelections[gi] === ci}
                            onChange={() => setMergeSelections(prev => ({ ...prev, [gi]: ci }))}
                            className="accent-blue-600"
                          />
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="font-medium text-gray-900">{c.name}</span>
                              {c.phone && <span className="text-sm text-gray-500">{c.phone}</span>}
                              {c.wechat && <span className="text-sm text-gray-400">微信:{c.wechat}</span>}
                            </div>
                            <div className="flex items-center gap-3 mt-1 text-xs text-gray-400">
                              <span>{c.card_count ?? 0} 张卡</span>
                              <span>利润 ¥{(c.total_profit ?? 0).toFixed(0)}</span>
                              {c.tags && <span>标签: {c.tags}</span>}
                            </div>
                          </div>
                          {mergeSelections[gi] === ci && (
                            <span className="text-xs text-blue-600 font-medium bg-blue-100 px-2 py-0.5 rounded">保留</span>
                          )}
                        </label>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <div className="flex justify-end gap-3 p-4 border-t">
              <button onClick={() => setShowMerge(false)} className="btn btn-secondary">取消</button>
              <button
                onClick={handleMerge}
                disabled={merging}
                className="btn btn-primary"
              >
                {merging ? '合并中...' : `合并 ${mergeGroups.length} 组`}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
