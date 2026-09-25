// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import CustomerList from '../src/components/CustomerList'
import { appApi } from '../src/lib/appApi'
import type { Customer, Card } from '../src/types'

vi.mock('../src/lib/appApi', async importOriginal => {
  const actual = await importOriginal<typeof import('../src/lib/appApi')>()
  return {
    ...actual,
    appApi: {
      ...actual.appApi,
      customers: {
        ...actual.appApi.customers,
        getAll: vi.fn(),
        getCards: vi.fn(),
        delete: vi.fn(),
        findDuplicates: vi.fn(),
        merge: vi.fn(),
        // 子组件 CustomerForm 挂载时不会真正提交，这里给个兜底避免误触真实 invoke
        create: vi.fn().mockResolvedValue({} as any),
        update: vi.fn().mockResolvedValue({} as any),
      },
    },
  }
})

const getAll = () => vi.mocked(appApi.customers.getAll)
const getCards = () => vi.mocked(appApi.customers.getCards)
const del = () => vi.mocked(appApi.customers.delete)
const findDup = () => vi.mocked(appApi.customers.findDuplicates)
const merge = () => vi.mocked(appApi.customers.merge)

const customer: Customer = {
  id: 1,
  name: '张三',
  phone: '13800001111',
  wechat: 'zs',
  address: '北京海淀区',
  notes: 'vip',
  tags: '高价值',
  card_count: 2,
  total_profit: 100,
  created_at: '2026-01-01',
  updated_at: '2026-01-01',
}

const card: Card = {
  id: 10,
  card_name: '联通大王卡',
  carrier: '联通',
  plan_type: '大流量',
  monthly_price: 29,
  data_amount: '200G',
  apply_time: '2026-01-02',
  activate_time: '',
  promo_start: '',
  promo_end: '2027-01-02',
  phone_number: '13800002222',
  customer_id: 1,
  profit: 50,
  status: '使用中',
  notes: '',
} as Card

const onRefresh = vi.fn()

beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => {})
  vi.spyOn(window, 'alert').mockImplementation(() => {})
  onRefresh.mockClear()
})
afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

describe('CustomerList 客户管理', () => {
  it('加载并渲染客户表格', async () => {
    getAll().mockResolvedValue({ data: [customer], total: 1 })
    render(<CustomerList onRefresh={onRefresh} />)
    await waitFor(() => expect(screen.getByText('张三')).toBeTruthy())
    expect(screen.getByText(/共 1 个客户/)).toBeTruthy()
    expect(screen.getByText('¥100.00')).toBeTruthy()
  })

  it('空数据展示空状态并可添加', async () => {
    getAll().mockResolvedValue({ data: [], total: 0 })
    render(<CustomerList onRefresh={onRefresh} />)
    await waitFor(() => expect(screen.getByText('暂无客户')).toBeTruthy())
    expect(screen.getByText('添加第一个客户')).toBeTruthy()
  })

  it('点击客户行打开详情并加载其卡片', async () => {
    getAll().mockResolvedValue({ data: [customer], total: 1 })
    getCards().mockResolvedValue([card])
    render(<CustomerList onRefresh={onRefresh} />)
    await waitFor(() => expect(screen.getByText('张三')).toBeTruthy())
    fireEvent.click(screen.getByText('张三'))
    await waitFor(() => expect(getCards()).toHaveBeenCalledWith(1))
    expect(screen.getByText(/办卡记录（1 张）/)).toBeTruthy()
    expect(screen.getByText('联通大王卡')).toBeTruthy()
  })

  it('点「添加客户」打开新增表单（添加客户标题）', async () => {
    getAll().mockResolvedValue({ data: [], total: 0 })
    render(<CustomerList onRefresh={onRefresh} />)
    await waitFor(() => expect(screen.getByText('暂无客户')).toBeTruthy())
    fireEvent.click(screen.getByText('添加第一个客户'))
    expect(screen.getByText('添加客户')).toBeTruthy()
  })

  it('编辑按钮打开编辑表单（编辑客户标题）', async () => {
    getAll().mockResolvedValue({ data: [customer], total: 1 })
    render(<CustomerList onRefresh={onRefresh} />)
    await waitFor(() => expect(screen.getByText('张三')).toBeTruthy())
    fireEvent.click(screen.getByText('编辑'))
    expect(screen.getByText('编辑客户')).toBeTruthy()
  })

  it('删除走确认弹窗并最终调用 customers.delete', async () => {
    getAll().mockResolvedValue({ data: [customer], total: 1 })
    del().mockResolvedValueOnce(undefined)
    render(<CustomerList onRefresh={onRefresh} />)
    await waitFor(() => expect(screen.getByText('张三')).toBeTruthy())
    fireEvent.click(screen.getByText('删除'))
    await waitFor(() => expect(screen.getByText('确定要删除这个客户吗？关联的流量卡不会被删除。')).toBeTruthy())
    // 确认按钮（弹窗内第二个「删除」文本）
    fireEvent.click(screen.getAllByText('删除')[1])
    await waitFor(() => expect(del()).toHaveBeenCalledWith(1))
    expect(onRefresh).toHaveBeenCalled()
  })

  it('合并去重：发现重复组并可合并', async () => {
    getAll().mockResolvedValue({ data: [], total: 0 })
    findDup().mockResolvedValue([[customer, { ...customer, id: 2, name: '李四' }]])
    merge().mockResolvedValue({ merged: 1 })
    render(<CustomerList onRefresh={onRefresh} />)
    await waitFor(() => expect(screen.getByText('暂无客户')).toBeTruthy())
    fireEvent.click(screen.getByText('🔀 合并去重'))
    await waitFor(() => expect(screen.getByText('重复组 1（2 个客户）')).toBeTruthy())
    fireEvent.click(screen.getByText('合并 1 组'))
    await waitFor(() => expect(merge()).toHaveBeenCalledWith(1, [2]))
    expect(screen.getByText(/合并完成，处理了 1 个重复客户/)).toBeTruthy()
  })

  it('外部 selectedCustomerId 自动选中详情并触发回调', async () => {
    getAll().mockResolvedValue({ data: [customer], total: 1 })
    getCards().mockResolvedValue([])
    const onSel = vi.fn()
    render(<CustomerList onRefresh={onRefresh} selectedCustomerId={1} onSelectionHandled={onSel} />)
    await waitFor(() => expect(getCards()).toHaveBeenCalledWith(1))
    await waitFor(() => expect(onSel).toHaveBeenCalled())
  })

  it('推荐套餐按钮回调带提取的省份', async () => {
    getAll().mockResolvedValue({ data: [customer], total: 1 })
    getCards().mockResolvedValue([])
    const onRec = vi.fn()
    render(<CustomerList onRefresh={onRefresh} onRecommendPlans={onRec} />)
    await waitFor(() => expect(screen.getByText('张三')).toBeTruthy())
    fireEvent.click(screen.getByText('张三'))
    await waitFor(() => expect(screen.getByText(/推荐套餐/)).toBeTruthy())
    fireEvent.click(screen.getByText(/推荐套餐/))
    expect(onRec).toHaveBeenCalledWith('北京')
  })

  it('切换标签筛选会重新加载', async () => {
    getAll().mockResolvedValue({ data: [customer], total: 1 })
    render(<CustomerList onRefresh={onRefresh} />)
    await waitFor(() => expect(screen.getByText('张三')).toBeTruthy())
    const callsBefore = getAll().mock.calls.length
    fireEvent.change(screen.getByDisplayValue('全部标签'), { target: { value: '高价值' } })
    await waitFor(() => expect(getAll().mock.calls.length).toBe(callsBefore + 1))
  })

  it('多页时翻页重新拉取', async () => {
    getAll().mockResolvedValue({ data: [customer], total: 120 })
    render(<CustomerList onRefresh={onRefresh} />)
    await waitFor(() => expect(screen.getByText('张三')).toBeTruthy())
    expect(screen.getByText('1 / 3')).toBeTruthy()
    const callsBefore = getAll().mock.calls.length
    fireEvent.click(screen.getByText('下一页'))
    await waitFor(() => expect(getAll().mock.calls.length).toBe(callsBefore + 1))
    expect(screen.getByText('2 / 3')).toBeTruthy()
  })
})
