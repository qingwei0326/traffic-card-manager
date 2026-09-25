// @vitest-environment jsdom
// FinanceStats：mock appApi.finance 的四个方法，覆盖加载/成功/错误/空数据/重试。
// recharts 的 ResponsiveContainer 依赖 ResizeObserver，jsdom 缺失，需 polyfill。
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import FinanceStats from '../src/components/FinanceStats'
import { appApi } from '../src/lib/appApi'
import type { ProfitSummary, MonthlyProfitRow, ProfitByType } from '../src/types'

vi.mock('../src/lib/appApi', async importOriginal => {
  const actual = await importOriginal<typeof import('../src/lib/appApi')>()
  return {
    ...actual,
    appApi: {
      ...actual.appApi,
      finance: {
        ...actual.appApi.finance,
        getProfitSummary: vi.fn(),
        getMonthlyProfit: vi.fn(),
        getProfitByCarrier: vi.fn(),
        getProfitByPlanType: vi.fn(),
      },
    },
  }
})

const getProfitSummary = () => vi.mocked(appApi.finance.getProfitSummary)
const getMonthlyProfit = () => vi.mocked(appApi.finance.getMonthlyProfit)
const getProfitByCarrier = () => vi.mocked(appApi.finance.getProfitByCarrier)
const getProfitByPlanType = () => vi.mocked(appApi.finance.getProfitByPlanType)

// 成功态的固定 fixture
const summary: ProfitSummary = {
  totalProfit: 1234.5,
  avgProfit: 100.5,
  totalCards: 50,
  monthProfit: 88.8,
  monthCards: 7,
}
const monthly: MonthlyProfitRow[] = [
  { month: '01', profit: 10, count: 1 },
  { month: '06', profit: 200.5, count: 3 },
]
const carrier: ProfitByType[] = [{ carrier: '移动', profit: 500, count: 4 }]
const planType: ProfitByType[] = [{ plan_type: '长期', profit: 300, count: 2 }]

// ResizeObserver 在 jsdom 缺失，recharts 的 ResponsiveContainer 依赖它
class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}

beforeEach(() => {
  vi.stubGlobal('ResizeObserver', ResizeObserverStub)
  vi.spyOn(console, 'error').mockImplementation(() => {})
  vi.spyOn(console, 'warn').mockImplementation(() => {})
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('FinanceStats', () => {
  it('shows loading state first', async () => {
    let resolve: (v: ProfitSummary) => void = () => {}
    getProfitSummary().mockReturnValue(new Promise(r => { resolve = r }))
    getMonthlyProfit().mockResolvedValue([])
    getProfitByCarrier().mockResolvedValue([])
    getProfitByPlanType().mockResolvedValue([])

    const { container } = render(<FinanceStats />)
    expect(screen.getByText('加载中...')).toBeTruthy()
    // 加载态是纯 div（非 Skeleton），只需确认不含后续内容
    expect(container.querySelector('.grid')).toBeNull()

    resolve(summary)
    await waitFor(() => expect(screen.getByText('财务统计')).toBeTruthy())
  })

  it('renders profit summary, breakdown charts and tables on success', async () => {
    getProfitSummary().mockResolvedValue(summary)
    getMonthlyProfit().mockResolvedValue(monthly)
    getProfitByCarrier().mockResolvedValue(carrier)
    getProfitByPlanType().mockResolvedValue(planType)

    render(<FinanceStats />)
    await waitFor(() => expect(screen.getByText('财务统计')).toBeTruthy())

    // 统计卡片
    expect(screen.getByText('总利润')).toBeTruthy()
    expect(screen.getByText('¥1234.50')).toBeTruthy()
    expect(screen.getByText('本月利润')).toBeTruthy()
    expect(screen.getByText('¥88.80')).toBeTruthy()
    expect(screen.getByText('本月办卡')).toBeTruthy()
    expect(screen.getByText('7 张')).toBeTruthy()
    expect(screen.getByText('平均利润')).toBeTruthy()
    expect(screen.getByText('¥100.50')).toBeTruthy()
    expect(screen.getByText('总办卡数')).toBeTruthy()
    expect(screen.getByText('50 张')).toBeTruthy()

    // 饼图标题
    expect(screen.getByText('按运营商利润分布')).toBeTruthy()
    expect(screen.getByText('按套餐类型利润分布')).toBeTruthy()

    // 月度明细表格
    expect(screen.getByText('月度明细')).toBeTruthy()
    // 季度汇总
    expect(screen.getByText('季度汇总')).toBeTruthy()
  })

  it('shows 暂无数据 when breakdown is empty', async () => {
    getProfitSummary().mockResolvedValue(summary)
    getMonthlyProfit().mockResolvedValue([])
    getProfitByCarrier().mockResolvedValue([])
    getProfitByPlanType().mockResolvedValue([])

    render(<FinanceStats />)
    await waitFor(() => expect(screen.getByText('财务统计')).toBeTruthy())
    expect(screen.getAllByText('暂无数据')).toHaveLength(2)
  })

  it('shows error message when load fails with an Error', async () => {
    getProfitSummary().mockRejectedValue(new Error('网络断开'))
    getMonthlyProfit().mockResolvedValue([])
    getProfitByCarrier().mockResolvedValue([])
    getProfitByPlanType().mockResolvedValue([])

    render(<FinanceStats />)
    await waitFor(() => expect(screen.getByText('财务数据加载失败')).toBeTruthy())
    expect(screen.getByText('网络断开')).toBeTruthy()
  })

  it('falls back to a generic message for non-Error rejections', async () => {
    getProfitSummary().mockRejectedValue('boom')
    getMonthlyProfit().mockResolvedValue([])
    getProfitByCarrier().mockResolvedValue([])
    getProfitByPlanType().mockResolvedValue([])

    render(<FinanceStats />)
    await waitFor(() =>
      expect(screen.getByText('加载财务数据失败，请重试')).toBeTruthy(),
    )
  })

  it('retries loading when 重试 is clicked', async () => {
    getProfitSummary().mockRejectedValueOnce(new Error('fail'))
    getMonthlyProfit().mockResolvedValue([])
    getProfitByCarrier().mockResolvedValue([])
    getProfitByPlanType().mockResolvedValue([])

    render(<FinanceStats />)
    await waitFor(() => expect(screen.getByText('财务数据加载失败')).toBeTruthy())

    // 第二次点击重试时四个方法都成功
    getProfitSummary().mockResolvedValue(summary)
    getMonthlyProfit().mockResolvedValue(monthly)
    getProfitByCarrier().mockResolvedValue(carrier)
    getProfitByPlanType().mockResolvedValue(planType)

    fireEvent.click(screen.getByText('重试'))
    await waitFor(() => expect(screen.getByText('财务统计')).toBeTruthy())
    expect(screen.getByText('¥1234.50')).toBeTruthy()
  })
})
