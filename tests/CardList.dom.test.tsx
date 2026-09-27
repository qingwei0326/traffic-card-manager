// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import CardList from '../src/components/CardList'
import { appApi } from '../src/lib/appApi'
import type { Card } from '../src/types'

vi.mock('../src/lib/appApi', async importOriginal => {
  const actual = await importOriginal<typeof import('../src/lib/appApi')>()
  return {
    ...actual,
    appApi: { ...actual.appApi, cards: { ...actual.appApi.cards, getAll: vi.fn(), delete: vi.fn() } },
  }
})

const getAll = () => vi.mocked(appApi.cards.getAll)
const del = () => vi.mocked(appApi.cards.delete)

const card: Card = {
  id: 1,
  card_name: '联通大王卡',
  carrier: '联通',
  monthly_price: 29,
  data_amount: '200G',
  contract_period: 24,
  status: '使用中',
  customer_id: 5,
  customer_name: '张三',
  phone_number: '13800001111',
  created_at: '2026-01-01',
} as Card

const onRefresh = vi.fn()
const onViewCustomer = vi.fn()

beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => {})
  onRefresh.mockClear()
  onViewCustomer.mockClear()
})
afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

describe('CardList 流量卡列表', () => {
  it('加载成功后渲染卡片表格', async () => {
    getAll().mockResolvedValue({ data: [card], total: 1, page: 1, pageSize: 20 })
    render(<CardList onRefresh={onRefresh} />)
    await waitFor(() => expect(screen.getByText('联通大王卡')).toBeTruthy())
    expect(screen.getByText(/共 1 张卡片/)).toBeTruthy()
  })

  it('无数据时显示空状态', async () => {
    getAll().mockResolvedValue({ data: [], total: 0, page: 1, pageSize: 20 })
    render(<CardList onRefresh={onRefresh} />)
    await waitFor(() => expect(screen.getByText('暂无数据')).toBeTruthy())
  })

  it('加载失败显示错误并可重试', async () => {
    getAll().mockRejectedValueOnce(new Error('db 炸了'))
    render(<CardList onRefresh={onRefresh} />)
    await waitFor(() => expect(screen.getByText('数据加载失败')).toBeTruthy())
    expect(screen.getByText('db 炸了')).toBeTruthy()
    // 重试
    getAll().mockResolvedValue({ data: [card], total: 1, page: 1, pageSize: 20 })
    fireEvent.click(screen.getByText('重试'))
    await waitFor(() => expect(screen.getByText('联通大王卡')).toBeTruthy())
  })

  it('点击客户名回调 onViewCustomer', async () => {
    getAll().mockResolvedValue({ data: [card], total: 1, page: 1, pageSize: 20 })
    render(<CardList onRefresh={onRefresh} onViewCustomer={onViewCustomer} />)
    await waitFor(() => expect(screen.getByText('张三')).toBeTruthy())
    fireEvent.click(screen.getByText('张三'))
    expect(onViewCustomer).toHaveBeenCalledWith(5)
  })

  it('删除卡片走确认弹窗并最终调用 cards.delete', async () => {
    getAll().mockResolvedValue({ data: [card], total: 1, page: 1, pageSize: 20 })
    del().mockResolvedValueOnce(undefined)
    render(<CardList onRefresh={onRefresh} />)
    await waitFor(() => expect(screen.getByText('联通大王卡')).toBeTruthy())

    fireEvent.click(screen.getByLabelText('删除'))
    // ConfirmModal 打开
    await waitFor(() => expect(screen.getByText('确定要删除这张卡片吗？此操作不可撤销。')).toBeTruthy())
    fireEvent.click(screen.getByText('删除')) // 确认按钮

    await waitFor(() => expect(del()).toHaveBeenCalledWith(1))
    expect(onRefresh).toHaveBeenCalled()
  })

  it('多页时翻页会重新拉取', async () => {
    getAll().mockResolvedValue({ data: [card], total: 120, page: 1, pageSize: 20 })
    render(<CardList onRefresh={onRefresh} />)
    await waitFor(() => expect(screen.getByText('联通大王卡')).toBeTruthy())

    const callsBefore = getAll().mock.calls.length
    fireEvent.click(screen.getByText('下一页'))
    await waitFor(() => expect(getAll().mock.calls.length).toBe(callsBefore + 1))
    expect(screen.getByText('2 / 3')).toBeTruthy()
  })
})
