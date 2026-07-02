import { useState, useEffect, useRef } from 'react'
import { Card, CardFilters, Customer, PaginatedResult } from '../types'
import CardForm from './CardForm'
import { ConfirmModal, AlertModal } from './Modal'
import Skeleton from './Skeleton'
import { Check, Edit3, Plus, Search, Trash2, X } from 'lucide-react'
import { appApi } from '../lib/appApi'

interface CardListProps {
  onRefresh: () => void
  openForm?: boolean
  onFormOpened?: () => void
  onViewCustomer?: (customerId: number) => void
  initialStatus?: Card['status'] | ''
  onInitialStatusUsed?: () => void
}

const carriers = ['全部', '移动', '联通', '电信', '广电']
const planTypes = ['全部', '性价比', '大流量', '长期套餐', '低价套餐']
const statuses = ['全部', '使用中', '待确认', '已到期', '已注销']

export default function CardList({ onRefresh, openForm, onFormOpened, onViewCustomer, initialStatus, onInitialStatusUsed }: CardListProps) {
  const [cards, setCards] = useState<Card[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editingCard, setEditingCard] = useState<Card | null>(null)
  const [error, setError] = useState('')
  const [searchInput, setSearchInput] = useState('')
  const PAGE_SIZE = 50
  const [filters, setFilters] = useState<CardFilters>({
    status: '全部',
    carrier: '全部',
    plan_type: '全部',
    search: '',
    page: 1,
    pageSize: PAGE_SIZE,
  })
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null)
  const [alertMsg, setAlertMsg] = useState('')
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set())
  const [batchAction, setBatchAction] = useState<'delete' | 'status' | null>(null)
  const [batchStatus, setBatchStatus] = useState('')

  // 搜索防抖：输入停止300ms后才触发搜索
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const handleSearchChange = (value: string) => {
    setSearchInput(value)
    if (debounceTimer.current) clearTimeout(debounceTimer.current)
    debounceTimer.current = setTimeout(() => {
      setPage(1)
      setFilters(prev => ({ ...prev, search: value, page: 1 }))
    }, 300)
  }

  useEffect(() => {
    loadCards()
  }, [filters])

  useEffect(() => {
    if (openForm) {
      setEditingCard(null)
      setShowForm(true)
      onFormOpened?.()
    }
  }, [openForm])

  useEffect(() => {
    if (initialStatus) {
      setPage(1)
      setFilters(prev => ({ ...prev, status: initialStatus, page: 1 }))
      onInitialStatusUsed?.()
    }
  }, [initialStatus])

  const loadCards = async () => {
    setLoading(true)
    setError('')
    try {
      const result = await appApi.cards.getAll(filters)
      setCards(result.data)
      setTotal(result.total)
    } catch (error) {
      console.error('加载卡片失败:', error)
      setError(error instanceof Error ? error.message : '加载数据失败，请重试')
    } finally {
      setLoading(false)
    }
  }

  const totalPages = Math.ceil(total / PAGE_SIZE)

  const handlePageChange = (newPage: number) => {
    setPage(newPage)
    setFilters(prev => ({ ...prev, page: newPage }))
  }

  // 批量操作
  const toggleSelect = (id: number) => {
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const toggleSelectAll = () => {
    if (selectedIds.size === cards.length) {
      setSelectedIds(new Set())
    } else {
      setSelectedIds(new Set(cards.map(c => c.id)))
    }
  }

  const handleBatchDelete = async () => {
    for (const id of selectedIds) {
      await appApi.cards.delete(id)
    }
    setSelectedIds(new Set())
    loadCards()
    onRefresh()
  }

  const handleBatchStatus = async () => {
    for (const id of selectedIds) {
      await appApi.cards.update(id, { status: batchStatus as Card['status'] })
    }
    setSelectedIds(new Set())
    setBatchAction(null)
    loadCards()
    onRefresh()
  }

  const handleDelete = async (id: number) => {
    try {
      await appApi.cards.delete(id)
      loadCards()
      onRefresh()
    } catch (error) {
      console.error('删除失败:', error)
      setAlertMsg('删除失败，请重试')
    }
  }

  const handleEdit = (card: Card) => {
    setEditingCard(card)
    setShowForm(true)
  }

  const handleSave = () => {
    setShowForm(false)
    setEditingCard(null)
    loadCards()
    onRefresh()
  }

  const handleCancel = () => {
    setShowForm(false)
    setEditingCard(null)
  }

  const getStatusClass = (status: string) => {
    switch (status) {
      case '使用中': return 'status-active'
      case '待确认': return 'status-pending'
      case '已到期': return 'status-expired'
      case '已注销': return 'status-cancelled'
      default: return ''
    }
  }

  return (
    <div className="space-y-6">
      {/* 页面标题 */}
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-gray-900">流量卡管理</h2>
        <button
          onClick={() => { setEditingCard(null); setShowForm(true) }}
          className="btn btn-primary"
        >
          <Plus className="h-4 w-4" />
          添加流量卡
        </button>
      </div>

      {/* 筛选栏 */}
      <div className="card p-4">
        <div className="flex items-center gap-3">
          <div className="relative min-w-[360px] flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="搜索套餐、手机号、客户、地市、备注..."
              value={searchInput}
              onChange={e => handleSearchChange(e.target.value)}
              className="input pl-9"
            />
          </div>
          <div className="w-32 shrink-0">
            <select
              value={filters.status}
              onChange={e => { setPage(1); setFilters(prev => ({ ...prev, status: e.target.value, page: 1 })) }}
              className="select"
            >
              {statuses.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <div className="w-32 shrink-0">
            <select
              value={filters.carrier}
              onChange={e => { setPage(1); setFilters(prev => ({ ...prev, carrier: e.target.value, page: 1 })) }}
              className="select"
            >
              {carriers.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div className="w-36 shrink-0">
            <select
              value={filters.plan_type}
              onChange={e => { setPage(1); setFilters(prev => ({ ...prev, plan_type: e.target.value, page: 1 })) }}
              className="select"
            >
              {planTypes.map(p => <option key={p} value={p}>{p}</option>)}
            </select>
          </div>
          {(searchInput || filters.status !== '全部' || filters.carrier !== '全部' || filters.plan_type !== '全部') && (
            <button
              onClick={() => {
                setSearchInput('')
                setPage(1)
                setFilters({ status: '全部', carrier: '全部', plan_type: '全部', search: '', page: 1, pageSize: PAGE_SIZE })
              }}
              className="btn btn-secondary shrink-0"
            >
              <X className="h-4 w-4" />
              重置
            </button>
          )}
        </div>
      </div>

      {/* 批量操作栏 */}
      {selectedIds.size > 0 && (
        <div className="card p-3 flex items-center gap-4 bg-blue-50 border-blue-200 dark:bg-blue-900/20 dark:border-blue-800">
          <span className="text-sm text-blue-700 font-medium">已选 {selectedIds.size} 项</span>
          <button onClick={() => { setConfirmDeleteId(-1) }} className="inline-flex items-center gap-1.5 text-sm text-red-600 hover:text-red-800">
            <Trash2 className="h-4 w-4" />
            批量删除
          </button>
          <div className="flex items-center gap-2">
            <select value={batchStatus} onChange={e => setBatchStatus(e.target.value)} className="select w-36 py-1.5 text-sm">
              <option value="">批量改状态...</option>
              <option value="使用中">使用中</option>
              <option value="待确认">待确认</option>
              <option value="已到期">已到期</option>
              <option value="已注销">已注销</option>
            </select>
            {batchStatus && (
              <button onClick={handleBatchStatus} className="inline-flex items-center gap-1 text-sm text-blue-600 hover:text-blue-800">
                <Check className="h-4 w-4" />
                确认
              </button>
            )}
          </div>
          <button onClick={() => setSelectedIds(new Set())} className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 ml-auto">
            <X className="h-4 w-4" />
            取消选择
          </button>
        </div>
      )}

      {/* 卡片列表 */}
      <div className="card">
        {loading ? (
          <div className="p-4">
            <Skeleton type="row" lines={10} />
          </div>
        ) : error ? (
          <div className="flex flex-col items-center justify-center h-64 text-center px-6">
            <div className="text-red-600 font-medium mb-2">数据加载失败</div>
            <p className="text-sm text-gray-500 mb-4 max-w-xl break-all">{error}</p>
            <button onClick={loadCards} className="btn btn-secondary">
              重试
            </button>
          </div>
        ) : cards.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 text-gray-400">
            <span className="text-4xl mb-4">📭</span>
            <p>暂无数据</p>
            <button
              onClick={() => { setEditingCard(null); setShowForm(true) }}
              className="btn btn-primary mt-4"
            >
              添加第一张流量卡
            </button>
          </div>
        ) : (
          <div className="table-container">
            <table>
              <thead>
                <tr>
                  <th className="w-10">
                    <input
                      type="checkbox"
                      checked={selectedIds.size === cards.length && cards.length > 0}
                      onChange={toggleSelectAll}
                      className="rounded"
                    />
                  </th>
                  <th>客户</th>
                  <th>手机号</th>
                  <th>套餐</th>
                  <th>运营商</th>
                  <th>月消费</th>
                  <th>流量</th>
                  <th>合约</th>
                  <th>到期/提醒</th>
                  <th>状态</th>
                  <th>操作</th>
                </tr>
              </thead>
              <tbody>
                {cards.map(card => {

                  const daysLeft = card.promo_end
                    ? Math.ceil((new Date(card.promo_end).getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24))
                    : null
                  const reminderDays = card.renewal_reminder_days || 30
                  const shouldRemind = daysLeft !== null && daysLeft <= reminderDays
                  return (
                    <tr key={card.id}>
                      <td>
                        <input
                          type="checkbox"
                          checked={selectedIds.has(card.id)}
                          onChange={() => toggleSelect(card.id)}
                          className="rounded"
                        />
                      </td>
                      <td className="font-medium">
                        {card.customer_id && onViewCustomer ? (
                          <button
                            onClick={() => onViewCustomer(card.customer_id!)}
                            className="text-blue-600 hover:text-blue-800 hover:underline"
                          >
                            {card.customer_name || '-'}
                          </button>
                        ) : (
                          card.customer_name || '-'
                        )}
                      </td>
                      <td>{card.phone_number || '-'}</td>
                      <td className="font-medium max-w-[240px] truncate" title={card.card_name}>{card.card_name}</td>
                      <td>{card.carrier}</td>
                      <td className="font-medium">¥{(card.monthly_price || 0).toFixed(2)}</td>
                      <td>{card.data_amount || '-'}</td>
                      <td>{card.contract_period ? `${card.contract_period}个月` : '-'}</td>
                      <td>
                        {card.promo_end ? (
                          <div>
                            <div className={shouldRemind ? 'text-red-600 font-medium' : ''}>{card.promo_end}</div>
                            <div className="text-xs mt-0.5">
                              {daysLeft !== null && daysLeft <= 0 ? (
                                <span className="text-red-600 font-medium">已到期</span>
                              ) : daysLeft !== null && daysLeft <= 7 ? (
                                <span className="text-red-600 font-medium">剩 {daysLeft} 天</span>
                              ) : daysLeft !== null && daysLeft <= reminderDays ? (
                                <span className="text-yellow-600">剩 {daysLeft} 天</span>
                              ) : (
                                <span className="text-gray-500">剩 {daysLeft} 天</span>
                              )}
                            </div>
                          </div>
                        ) : '-'}
                      </td>
                      <td>
                        <span className={`status-tag ${getStatusClass(card.status)}`}>
                          {card.status}
                        </span>
                      </td>
                      <td>
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => handleEdit(card)}
                            className="inline-flex h-8 w-8 items-center justify-center rounded-md text-blue-600 hover:bg-blue-50 hover:text-blue-800"
                            title="编辑"
                            aria-label="编辑"
                          >
                            <Edit3 className="h-4 w-4" />
                          </button>
                          <button
                            onClick={() => setConfirmDeleteId(card.id)}
                            className="inline-flex h-8 w-8 items-center justify-center rounded-md text-red-600 hover:bg-red-50 hover:text-red-800"
                            title="删除"
                            aria-label="删除"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* 统计信息 */}
      <div className="flex items-center justify-between text-sm text-gray-500">
        <span>共 {total} 张卡片</span>
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

      {/* 表单弹窗 */}
      {showForm && (
        <CardForm
          card={editingCard}
          onSave={handleSave}
          onCancel={handleCancel}
        />
      )}

      <ConfirmModal
        open={confirmDeleteId !== null}
        onClose={() => setConfirmDeleteId(null)}
        onConfirm={() => {
          if (confirmDeleteId === -1) handleBatchDelete()
          else if (confirmDeleteId) handleDelete(confirmDeleteId)
        }}
        title="删除确认"
        message={confirmDeleteId === -1 ? `确定要删除选中的 ${selectedIds.size} 张卡片吗？此操作不可撤销。` : '确定要删除这张卡片吗？此操作不可撤销。'}
        confirmText="删除"
        danger
      />

      <AlertModal
        open={!!alertMsg}
        onClose={() => setAlertMsg('')}
        message={alertMsg}
        type="error"
      />
    </div>
  )
}
