// @vitest-environment jsdom
// 说明：vitest 4.1.9 下 vitest.config.ts 的 environmentMatchGlobs 实测未生效
// （仍按 node 环境执行，render 报 "document is not defined"），
// 因此改用文件级 docblock 显式指定 jsdom，这是更可靠的做法。
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import PlanList from '../src/components/PlanList'
import { appApi } from '../src/lib/appApi'

// 只覆盖 plans.getAll/delete/backfillCards，其余保持真实实现，避免 mock 与真实 API 表面脱节。
vi.mock('../src/lib/appApi', async importOriginal => {
  const actual = await importOriginal<typeof import('../src/lib/appApi')>()
  return {
    ...actual,
    appApi: {
      ...actual.appApi,
      plans: { ...actual.appApi.plans, getAll: vi.fn(), delete: vi.fn(), backfillCards: vi.fn() },
    },
  }
})

const getAll = () => vi.mocked(appApi.plans.getAll)
const deletePlan = () => vi.mocked(appApi.plans.delete)
const backfill = () => vi.mocked(appApi.plans.backfillCards)

beforeEach(() => {
  // PlanList 失败时会 console.error，静音以保持测试输出干净
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

describe('PlanList loadPlans 异常路径', () => {
  it('clears loading and renders the thrown Error message', async () => {
    getAll().mockRejectedValueOnce(new Error('网络断开'))

    render(<PlanList />)

    // 关键回归点：修复前 loadPlans 没有 try/catch，抛错后 setLoading(false) 永不执行，
    // 界面会永久停留在"加载中"。
    // getBy* 找不到时会直接抛错，本身即断言；这里不依赖 jest-dom 的 toBeInTheDocument
    await waitFor(() => expect(screen.getByTestId('plans-error')).toBeTruthy())
    expect(screen.queryByTestId('plans-loading')).toBeNull()
    expect(screen.getByText('网络断开')).toBeTruthy()
  })

  it('falls back to a generic message for non-Error rejections', async () => {
    // Tauri invoke 可能 reject 字符串而非 Error 实例
    getAll().mockRejectedValueOnce('boom')

    render(<PlanList />)

    await waitFor(() => expect(screen.getByTestId('plans-error')).toBeTruthy())
    expect(screen.getByText('加载套餐失败，请重试')).toBeTruthy()
    expect(screen.queryByTestId('plans-loading')).toBeNull()
  })

  it('clears loading and shows no error when plans load', async () => {
    getAll().mockResolvedValueOnce([])

    render(<PlanList />)

    await waitFor(() => expect(screen.queryByTestId('plans-loading')).toBeNull())
    expect(screen.queryByTestId('plans-error')).toBeNull()
  })
})

describe('PlanList 正常渲染', () => {
  const plan = {
    id: 1,
    code: 'C1',
    grab_code: 'G1',
    name: '联通大王卡',
    carrier: '联通',
    monthly_price: 29,
    data_amount: 200,
    promo_period: 12,
    contract_period: 24,
    first_charge: 50,
    activation: '自主激活',
    region: '全国',
    commission: '100',
    note: '',
    age_limit: '18-60',
    forbid_regions: '',
    express: '京东',
    source: '172',
    sale_status: '在售',
    created_at: '2026-01-01',
  }

  it('renders the plan table when plans load', async () => {
    getAll().mockResolvedValueOnce([plan])

    render(<PlanList />)

    await waitFor(() => expect(screen.getByText('套餐模板库')).toBeTruthy())
    expect(screen.getByText('联通大王卡')).toBeTruthy()
    expect(screen.getByText(/共 1 个套餐模板/)).toBeTruthy()
  })

  it('shows the empty hint when there are no plans', async () => {
    getAll().mockResolvedValueOnce([])

    render(<PlanList />)

    await waitFor(() => expect(screen.getByText('暂无套餐数据，请先导入')).toBeTruthy())
  })

  it('shows the no-match hint when filters exclude all plans', async () => {
    getAll().mockResolvedValueOnce([plan])

    render(<PlanList />)
    await waitFor(() => expect(screen.getByText('联通大王卡')).toBeTruthy())

    // 搜索一个不存在的名称 → 列表被过滤空（但 plans 非空）
    fireEvent.change(screen.getByPlaceholderText('搜索套餐名称...'), {
      target: { value: '不存在的套餐' },
    })
    expect(screen.getByText('没有匹配的套餐')).toBeTruthy()
  })
})

describe('PlanList 交互', () => {
  const unicom = {
    id: 1, code: 'C1', grab_code: 'G1', name: '联通大王卡', carrier: '联通',
    monthly_price: 29, data_amount: 200, promo_period: 12, contract_period: 24,
    first_charge: 50, activation: '自主激活', region: '全国', commission: '100',
    note: '', age_limit: '18-60', forbid_regions: '', express: '京东', source: '172',
    sale_status: '在售', created_at: '2026-01-01',
  }
  const mobile = {
    id: 2, code: 'M1', grab_code: 'G2', name: '移动花卡', carrier: '移动',
    monthly_price: 19, data_amount: 100, promo_period: 0, contract_period: 0,
    first_charge: 0, activation: '快递激活', region: '全国', commission: '80',
    note: '', age_limit: '', forbid_regions: '新疆,西藏', express: '顺丰', source: '172',
    sale_status: '停售', created_at: '2026-01-01',
  }

  it('点击运营商统计可按运营商过滤', async () => {
    getAll().mockResolvedValue([unicom, mobile])
    render(<PlanList />)
    await waitFor(() => expect(screen.getByText('联通大王卡')).toBeTruthy())

    // 运营商统计区第一个「移动」是统计标签（表格里也有「移动」徽标，取全部匹配里的统计项）
    const mobileStats = screen.getAllByText('移动')
    fireEvent.click(mobileStats[0])

    await waitFor(() => expect(screen.queryByText('联通大王卡')).toBeNull())
    expect(screen.getByText('移动花卡')).toBeTruthy()

    // 再次点击同一运营商取消过滤
    fireEvent.click(screen.getAllByText('移动')[0])
    await waitFor(() => expect(screen.getByText('联通大王卡')).toBeTruthy())
  })

  it('删除套餐前 confirm 确认，调用 plans.delete 并重载', async () => {
    getAll().mockResolvedValue([unicom])
    deletePlan().mockResolvedValueOnce(undefined)
    vi.spyOn(window, 'confirm').mockReturnValue(true)

    render(<PlanList />)
    await waitFor(() => expect(screen.getByText('联通大王卡')).toBeTruthy())

    const callsBefore = getAll().mock.calls.length
    fireEvent.click(screen.getByText('删除'))
    await waitFor(() => expect(deletePlan()).toHaveBeenCalledWith(1))
    expect(getAll().mock.calls.length).toBe(callsBefore + 1) // 删除后触发重载
  })

  it('回填历史卡片调用 plans.backfillCards', async () => {
    getAll().mockResolvedValue([unicom])
    backfill().mockResolvedValueOnce({ backfilled: 3 })

    render(<PlanList />)
    await waitFor(() => expect(screen.getByText('联通大王卡')).toBeTruthy())

    fireEvent.click(screen.getByText('回填历史卡片'))
    await waitFor(() => expect(backfill()).toHaveBeenCalled())
    expect(screen.getByText(/回填完成：补齐历史卡片 3 张/)).toBeTruthy()
  })
})
