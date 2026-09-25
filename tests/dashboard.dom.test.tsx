// @vitest-environment jsdom
// Dashboard：mock appApi.cards 的四个方法，覆盖加载/成功/空数据/错误/快捷操作/行内跳转。
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import Dashboard from '../src/components/Dashboard'
import { appApi } from '../src/lib/appApi'
import type { Card, CardStats, MonthlyStats, PaginatedResult } from '../src/types'

vi.mock('../src/lib/appApi', async importOriginal => {
  const actual = await importOriginal<typeof import('../src/lib/appApi')>()
  return {
    ...actual,
    appApi: {
      ...actual.appApi,
      cards: {
        ...actual.appApi.cards,
        getStats: vi.fn(),
        getMonthlyStats: vi.fn(),
        getExpiringSoon: vi.fn(),
        getAll: vi.fn(),
      },
    },
  }
})

const getStats = () => vi.mocked(appApi.cards.getStats)
const getMonthlyStats = () => vi.mocked(appApi.cards.getMonthlyStats)
const getExpiringSoon = () => vi.mocked(appApi.cards.getExpiringSoon)
const getAll = () => vi.mocked(appApi.cards.getAll)

const makeCard = (over: Partial<Card> = {}): Card => ({
  id: 1,
  card_name: '卡A',
  carrier: '移动',
  plan_type: '长期',
  monthly_price: 29,
  data_amount: '200G',
  apply_time: '2026-01-01',
  activate_time: '2026-01-01',
  promo_start: '2026-01-01',
  promo_end: '2026-12-31',
  phone_number: '13800138000',
  customer_id: null,
  profit: 88,
  status: '使用中',
  notes: '',
  created_at: '2026-01-01',
  updated_at: '2026-01-01',
  ...over,
})

const stats: CardStats = { total: 100, active: 80, expired: 5, cancelled: 15, totalProfit: 5000 }
const monthly: MonthlyStats = { newCards: 12, monthProfit: 345.6 }

const pendingResult = (data: Card[], total: number): PaginatedResult<Card> => ({
  data,
  total,
  page: 1,
  pageSize: 8,
})

const defaultHandlers = () => ({
  onNavigate: vi.fn(),
  onAddCard: vi.fn(),
  onAddCustomer: vi.fn(),
  onViewCustomer: vi.fn(),
  onViewPendingCards: vi.fn(),
})

beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

describe('Dashboard', () => {
  it('shows Skeleton while loading', async () => {
    let resolve: (v: CardStats) => void = () => {}
    getStats().mockReturnValue(new Promise(r => { resolve = r }))
    getMonthlyStats().mockResolvedValue(monthly)
    getExpiringSoon().mockResolvedValue([])
    getAll().mockResolvedValue(pendingResult([], 0))

    const { container } = render(<Dashboard {...defaultHandlers()} />)
    expect(screen.queryByText('仪表盘')).toBeNull()
    // Skeleton type="card" 产出大量 animate-pulse
    expect(container.querySelector('.animate-pulse')).toBeTruthy()

    resolve(stats)
    await waitFor(() => expect(screen.getByText('仪表盘')).toBeTruthy())
  })

  it('renders stats, quick actions, pending and expiring tables on success', async () => {
    getStats().mockResolvedValue(stats)
    getMonthlyStats().mockResolvedValue(monthly)
    getExpiringSoon().mockResolvedValue([makeCard({ id: 1, card_name: '卡A', customer_id: 9, customer_name: '张三', promo_end: '2026-12-31' })])
    getAll().mockResolvedValue(pendingResult([makeCard({ id: 2, card_name: '卡B', customer_id: 9, customer_name: '张三', external_order_id: 'ORD-1' })], 3))

    const handlers = defaultHandlers()
    render(<Dashboard {...handlers} />)
    await waitFor(() => expect(screen.getByText('仪表盘')).toBeTruthy())

    // 统计卡片
    expect(screen.getByText('总卡片数')).toBeTruthy()
    expect(screen.getByText('100')).toBeTruthy()
    expect(screen.getByText('使用中')).toBeTruthy()
    expect(screen.getByText('80')).toBeTruthy()
    expect(screen.getByText('¥5000.00')).toBeTruthy()
    expect(screen.getByText('¥345.60')).toBeTruthy()

    // 快捷操作
    expect(screen.getByText('添加流量卡')).toBeTruthy()
    expect(screen.getByText('添加客户')).toBeTruthy()
    expect(screen.getByText('查看报表')).toBeTruthy()
    expect(screen.getByText('数据备份')).toBeTruthy()
    expect(screen.getByText('智能挑卡')).toBeTruthy()

    // 待确认订单
    expect(screen.getByText('待确认订单')).toBeTruthy()
    expect(screen.getByText('卡B')).toBeTruthy()
    expect(screen.getByText('共 3 张')).toBeTruthy()
    expect(screen.getByText('查看全部 →')).toBeTruthy()

    // 即将到期提醒
    expect(screen.getByText('即将到期提醒（30天内）')).toBeTruthy()
    expect(screen.getByText('卡A')).toBeTruthy()
    expect(screen.getByText('联系客户 →')).toBeTruthy()
  })

  it('renders empty placeholders when there are no pending/expiring cards', async () => {
    getStats().mockResolvedValue(stats)
    getMonthlyStats().mockResolvedValue(monthly)
    getExpiringSoon().mockResolvedValue([])
    getAll().mockResolvedValue(pendingResult([], 0))

    render(<Dashboard {...defaultHandlers()} />)
    await waitFor(() => expect(screen.getByText('仪表盘')).toBeTruthy())
    expect(screen.getByText('暂无待确认订单')).toBeTruthy()
    expect(screen.getByText('暂无即将到期的卡片')).toBeTruthy()
    // pendingTotal=0 时不显示「查看全部」
    expect(screen.queryByText('查看全部 →')).toBeNull()
  })

  it('shows error message when load fails', async () => {
    getStats().mockRejectedValue(new Error('db error'))
    getMonthlyStats().mockResolvedValue(monthly)
    getExpiringSoon().mockResolvedValue([])
    getAll().mockResolvedValue(pendingResult([], 0))

    render(<Dashboard {...defaultHandlers()} />)
    await waitFor(() => expect(screen.getByText('仪表盘数据加载失败')).toBeTruthy())
    expect(screen.getByText('db error')).toBeTruthy()
  })

  it('invokes quick action handlers', async () => {
    getStats().mockResolvedValue(stats)
    getMonthlyStats().mockResolvedValue(monthly)
    getExpiringSoon().mockResolvedValue([])
    getAll().mockResolvedValue(pendingResult([], 0))

    const handlers = defaultHandlers()
    render(<Dashboard {...handlers} />)
    await waitFor(() => expect(screen.getByText('仪表盘')).toBeTruthy())

    fireEvent.click(screen.getByText('添加流量卡'))
    expect(handlers.onAddCard).toHaveBeenCalledTimes(1)

    fireEvent.click(screen.getByText('添加客户'))
    expect(handlers.onAddCustomer).toHaveBeenCalledTimes(1)

    fireEvent.click(screen.getByText('查看报表'))
    expect(handlers.onNavigate).toHaveBeenCalledWith('finance')

    fireEvent.click(screen.getByText('数据备份'))
    expect(handlers.onNavigate).toHaveBeenCalledWith('settings')

    fireEvent.click(screen.getByText('智能挑卡'))
    expect(handlers.onNavigate).toHaveBeenCalledWith('picker')
  })

  it('navigates to customer when a pending card customer name is clicked', async () => {
    getStats().mockResolvedValue(stats)
    getMonthlyStats().mockResolvedValue(monthly)
    getExpiringSoon().mockResolvedValue([])
    getAll().mockResolvedValue(
      pendingResult([makeCard({ id: 2, card_name: '卡B', customer_id: 9, customer_name: '张三' })], 1),
    )

    const handlers = defaultHandlers()
    render(<Dashboard {...handlers} />)
    await waitFor(() => expect(screen.getByText('仪表盘')).toBeTruthy())

    fireEvent.click(screen.getByText('张三'))
    expect(handlers.onViewCustomer).toHaveBeenCalledWith(9)
  })

  it('navigates to customer from the expiring 联系客户 button', async () => {
    getStats().mockResolvedValue(stats)
    getMonthlyStats().mockResolvedValue(monthly)
    getExpiringSoon().mockResolvedValue([
      makeCard({ id: 1, card_name: '卡A', customer_id: 9, customer_name: '张三' }),
    ])
    getAll().mockResolvedValue(pendingResult([], 0))

    const handlers = defaultHandlers()
    render(<Dashboard {...handlers} />)
    await waitFor(() => expect(screen.getByText('仪表盘')).toBeTruthy())

    fireEvent.click(screen.getByText('联系客户 →'))
    expect(handlers.onViewCustomer).toHaveBeenCalledWith(9)
  })
})
