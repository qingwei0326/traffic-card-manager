// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import CardPicker from '../src/components/CardPicker'
import { appApi } from '../src/lib/appApi'
import type { Plan } from '../src/types'

vi.mock('../src/lib/appApi', async importOriginal => {
  const actual = await importOriginal<typeof import('../src/lib/appApi')>()
  return {
    ...actual,
    appApi: { ...actual.appApi, plans: { ...actual.appApi.plans, getAll: vi.fn() } },
  }
})

const getAll = () => vi.mocked(appApi.plans.getAll)

const onProvinceUsed = vi.fn()

const unicom: Plan = {
  id: 1, code: 'C1', grab_code: 'G1', name: '联通大王卡', carrier: '联通',
  monthly_price: 29, data_amount: 200, promo_period: 12, contract_period: 24,
  first_charge: 50, activation: '自主激活', region: '全国', commission: '100',
  note: '', age_limit: '18-60', forbid_regions: '', express: '京东', source: '172',
  sale_status: '在售', created_at: '2026-01-01',
}
const mobileStop: Plan = {
  id: 2, code: 'M1', grab_code: 'G2', name: '移动花卡', carrier: '移动',
  monthly_price: 19, data_amount: 100, promo_period: 0, contract_period: 0,
  first_charge: 0, activation: '快递激活', region: '全国', commission: '80',
  note: '', age_limit: '', forbid_regions: '新疆,西藏', express: '顺丰', source: '172',
  sale_status: '停售', created_at: '2026-01-01',
}

beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => {})
  Object.defineProperty(navigator, 'clipboard', {
    value: { writeText: vi.fn().mockResolvedValue(undefined) },
    configurable: true,
    writable: true,
  })
  onProvinceUsed.mockClear()
})
afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

describe('CardPicker 智能挑卡', () => {
  it('加载套餐后展示在售数量与挑卡入口', async () => {
    getAll().mockResolvedValue([unicom, mobileStop])
    render(<CardPicker />)
    await waitFor(() => expect(screen.getByText('🎯 智能挑卡')).toBeTruthy())
    expect(screen.getByText(/当前共 1 个在售套餐/)).toBeTruthy()
  })

  it('搜索只返回在售套餐', async () => {
    getAll().mockResolvedValue([unicom, mobileStop])
    render(<CardPicker />)
    await waitFor(() => expect(screen.getByText('🎯 智能挑卡')).toBeTruthy())

    fireEvent.click(screen.getByText('🔍 搜索推荐'))

    await waitFor(() => expect(screen.getByText(/推荐结果：1 个套餐/)).toBeTruthy())
    expect(screen.getByText('联通大王卡')).toBeTruthy()
    // 停售套餐被过滤
    expect(screen.queryByText('移动花卡')).toBeNull()
  })

  it('按运营商筛选可进一步收窄结果', async () => {
    getAll().mockResolvedValue([unicom, mobileStop])
    render(<CardPicker />)
    await waitFor(() => expect(screen.getByText('🎯 智能挑卡')).toBeTruthy())

    // 运营商 select 是页面第 2 个 combobox（首个为客户省份）
    const selects = screen.getAllByRole('combobox')
    fireEvent.change(selects[1], { target: { value: '联通' } })
    fireEvent.click(screen.getByText('🔍 搜索推荐'))

    await waitFor(() => expect(screen.getByText(/推荐结果：1 个套餐/)).toBeTruthy())
    expect(screen.getByText('联通大王卡')).toBeTruthy()
  })

  it('点击复制推荐后标记已复制', async () => {
    getAll().mockResolvedValue([unicom])
    render(<CardPicker />)
    await waitFor(() => expect(screen.getByText('🎯 智能挑卡')).toBeTruthy())

    fireEvent.click(screen.getByText('🔍 搜索推荐'))
    await waitFor(() => expect(screen.getByText('联通大王卡')).toBeTruthy())

    fireEvent.click(screen.getByText('📋 复制推荐'))
    await waitFor(() => expect(screen.getByText('✅ 已复制')).toBeTruthy())
    expect(navigator.clipboard.writeText).toHaveBeenCalled()
  })

  it('带 initialProvince 时自动搜索并回调 onProvinceUsed', async () => {
    getAll().mockResolvedValue([unicom, mobileStop])
    render(<CardPicker initialProvince="新疆" onProvinceUsed={onProvinceUsed} />)
    await waitFor(() => expect(onProvinceUsed).toHaveBeenCalled())
    // 新疆在禁发地区 → 移动花卡(停售)已被排除，联通(全国)在售保留
    await waitFor(() => expect(screen.getByText(/推荐结果：1 个套餐/)).toBeTruthy())
  })
})
