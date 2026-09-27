// @vitest-environment jsdom
// CardForm 组件测试：mock customers.getAll（下拉）与 cards.create/update（保存）。
// 覆盖：新建/编辑渲染、客户加载、校验拦截、合法提交、Escape 关闭、加载失败、保存失败。
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import CardForm, { defaultForm } from '../src/components/CardForm'
import { appApi } from '../src/lib/appApi'
import type { Card, Customer } from '../src/types'

vi.mock('../src/lib/appApi', async importOriginal => {
  const actual = await importOriginal<typeof import('../src/lib/appApi')>()
  return {
    ...actual,
    appApi: {
      ...actual.appApi,
      customers: { ...actual.appApi.customers, getAll: vi.fn() },
      cards: { ...actual.appApi.cards, create: vi.fn(), update: vi.fn() },
    },
  }
})

const getAll = () => vi.mocked(appApi.customers.getAll)
const create = () => vi.mocked(appApi.cards.create)
const update = () => vi.mocked(appApi.cards.update)

const makeCustomer = (over: Partial<Customer> = {}): Customer => ({
  id: 1,
  name: '张三',
  phone: '13800138000',
  wechat: 'zw',
  address: '福建',
  notes: '',
  created_at: '2026-01-01',
  updated_at: '2026-01-01',
  ...over,
})

const makeCard = (over: Partial<Card> = {}): Card => ({
  id: 99,
  card_name: '联通大王卡',
  carrier: '联通',
  plan_type: '大流量',
  monthly_price: 29,
  data_amount: '200G',
  apply_time: '2026-01-01',
  activate_time: '2026-01-01',
  promo_start: '2026-01-01',
  promo_end: '2026-12-31',
  phone_number: '13900139000',
  customer_id: 1,
  profit: 88,
  status: '使用中',
  notes: '',
  created_at: '2026-01-01',
  updated_at: '2026-01-01',
  ...over,
})

const emptyPage = { data: [], total: 0, page: 1, pageSize: 500 }

beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => {})
  vi.spyOn(window, 'alert').mockImplementation(() => {})
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

describe('CardForm', () => {
  it('renders the new-card form and loads customers into the dropdown', async () => {
    getAll().mockResolvedValue({ ...emptyPage, data: [makeCustomer()] })
    render(<CardForm card={null} onSave={() => {}} onCancel={() => {}} />)

    await waitFor(() => expect(screen.getByText('添加流量卡')).toBeTruthy())
    // 客户下拉选项：name (phone)
    expect(screen.getByText('张三 (13800138000)')).toBeTruthy()
  })

  it('blocks submit and shows validation error when card_name is empty', async () => {
    getAll().mockResolvedValue(emptyPage)
    render(<CardForm card={null} onSave={() => {}} onCancel={() => {}} />)

    await waitFor(() => expect(screen.getByText('添加流量卡')).toBeTruthy())
    const formEl = screen.getByText('保存').closest('form') as HTMLFormElement
    fireEvent.submit(formEl)

    await waitFor(() => expect(screen.getByText('请输入卡片名称')).toBeTruthy())
    expect(create()).not.toHaveBeenCalled()
  })

  it('submits a valid new card via cards.create and calls onSave', async () => {
    getAll().mockResolvedValue(emptyPage)
    create().mockResolvedValue({ ...defaultForm, id: 1, created_at: '', updated_at: '' } as Card)
    const onSave = vi.fn()
    render(<CardForm card={null} onSave={onSave} onCancel={() => {}} />)

    await waitFor(() => expect(screen.getByText('添加流量卡')).toBeTruthy())
    fireEvent.change(screen.getByPlaceholderText('如：联通大王卡'), {
      target: { value: '联通大王卡' },
    })
    fireEvent.submit(screen.getByText('保存').closest('form') as HTMLFormElement)

    await waitFor(() => expect(create()).toHaveBeenCalled())
    expect(onSave).toHaveBeenCalled()
  })

  it('prefills fields and submits via cards.update in edit mode', async () => {
    getAll().mockResolvedValue(emptyPage)
    update().mockResolvedValue(makeCard())
    const card = makeCard()
    const onSave = vi.fn()
    render(<CardForm card={card} onSave={onSave} onCancel={() => {}} />)

    await waitFor(() => expect(screen.getByText('编辑流量卡')).toBeTruthy())
    const nameInput = screen.getByDisplayValue('联通大王卡') as HTMLInputElement
    expect(nameInput.value).toBe('联通大王卡')

    fireEvent.submit(screen.getByText('保存').closest('form') as HTMLFormElement)
    await waitFor(() => expect(update()).toHaveBeenCalled())
    expect(update().mock.calls[0][0]).toBe(99)
    expect(onSave).toHaveBeenCalled()
  })

  it('closes the form on Escape keypress', async () => {
    getAll().mockResolvedValue(emptyPage)
    const onCancel = vi.fn()
    render(<CardForm card={null} onSave={() => {}} onCancel={onCancel} />)

    await waitFor(() => expect(screen.getByText('添加流量卡')).toBeTruthy())
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(onCancel).toHaveBeenCalled()
  })

  it('silently handles a failed customer load without crashing', async () => {
    getAll().mockRejectedValue(new Error('网络错误'))
    render(<CardForm card={null} onSave={() => {}} onCancel={() => {}} />)
    await waitFor(() => expect(screen.getByText('添加流量卡')).toBeTruthy())
    // 下拉为空，但表单仍渲染
    expect(screen.getByText('取消')).toBeTruthy()
  })

  it('alerts when saving fails', async () => {
    getAll().mockResolvedValue(emptyPage)
    create().mockRejectedValue(new Error('db down'))
    const alert = vi.spyOn(window, 'alert')
    render(<CardForm card={null} onSave={() => {}} onCancel={() => {}} />)

    await waitFor(() => expect(screen.getByText('添加流量卡')).toBeTruthy())
    fireEvent.change(screen.getByPlaceholderText('如：联通大王卡'), {
      target: { value: '联通大王卡' },
    })
    fireEvent.submit(screen.getByText('保存').closest('form') as HTMLFormElement)

    await waitFor(() => expect(alert).toHaveBeenCalled())
  })
})
