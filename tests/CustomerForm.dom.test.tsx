// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import CustomerForm from '../src/components/CustomerForm'
import { appApi } from '../src/lib/appApi'
import type { Customer } from '../src/types'

vi.mock('../src/lib/appApi', async importOriginal => {
  const actual = await importOriginal<typeof import('../src/lib/appApi')>()
  return {
    ...actual,
    appApi: {
      ...actual.appApi,
      customers: { ...actual.appApi.customers, create: vi.fn(), update: vi.fn() },
    },
  }
})

const create = () => vi.mocked(appApi.customers.create)
const update = () => vi.mocked(appApi.customers.update)

const onSave = vi.fn()
const onCancel = vi.fn()

beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => {})
  vi.spyOn(window, 'alert').mockImplementation(() => {})
})
afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

const sampleCustomer: Customer = {
  id: 7,
  name: '张三',
  phone: '13800001111',
  wechat: 'z san',
  address: '北京',
  notes: 'vip',
  tags: '高价值',
  created_at: '2026-01-01',
  updated_at: '2026-01-01',
}

describe('CustomerForm 添加模式', () => {
  it('标题为「添加客户」且字段为空', () => {
    render(<CustomerForm customer={null} onSave={onSave} onCancel={onCancel} />)
    expect(screen.getByText('添加客户')).toBeTruthy()
    const name = screen.getByPlaceholderText('客户姓名') as HTMLInputElement
    expect(name.value).toBe('')
  })

  it('提交空姓名时校验报错且不调用 create', async () => {
    render(<CustomerForm customer={null} onSave={onSave} onCancel={onCancel} />)
    fireEvent.submit(document.querySelector('form')!)
    expect(await screen.findByText('请输入客户姓名')).toBeTruthy()
    expect(create()).not.toHaveBeenCalled()
    expect(onSave).not.toHaveBeenCalled()
  })

  it('手机号格式错误时给出对应校验信息', async () => {
    render(<CustomerForm customer={null} onSave={onSave} onCancel={onCancel} />)
    fireEvent.change(screen.getByPlaceholderText('客户姓名'), { target: { value: '李四' } })
    fireEvent.change(screen.getByPlaceholderText('联系电话'), { target: { value: '123' } })
    fireEvent.submit(document.querySelector('form')!)
    expect(await screen.findByText('手机号格式不正确（11位大陆手机号）')).toBeTruthy()
    expect(create()).not.toHaveBeenCalled()
  })

  it('填写合法姓名后提交调用 create 并触发 onSave', async () => {
    create().mockResolvedValueOnce({ id: 1 } as Customer)
    render(<CustomerForm customer={null} onSave={onSave} onCancel={onCancel} />)
    fireEvent.change(screen.getByPlaceholderText('客户姓名'), { target: { value: '王五' } })
    fireEvent.submit(document.querySelector('form')!)
    await waitFor(() => expect(onSave).toHaveBeenCalled())
    expect(create()).toHaveBeenCalledWith(
      expect.objectContaining({ name: '王五' }),
    )
  })

  it('Esc 键触发 onCancel', () => {
    render(<CustomerForm customer={null} onSave={onSave} onCancel={onCancel} />)
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(onCancel).toHaveBeenCalled()
  })

  it('点击预设标签会把标签写入 tags 字段', () => {
    render(<CustomerForm customer={null} onSave={onSave} onCancel={onCancel} />)
    fireEvent.click(screen.getByText('新客户'))
    const tags = screen.getByPlaceholderText('自定义标签，逗号分隔') as HTMLInputElement
    expect(tags.value).toContain('新客户')
  })
})

describe('CustomerForm 编辑模式', () => {
  it('回显已有客户数据且标题为「编辑客户」', () => {
    render(<CustomerForm customer={sampleCustomer} onSave={onSave} onCancel={onCancel} />)
    expect(screen.getByText('编辑客户')).toBeTruthy()
    expect((screen.getByPlaceholderText('客户姓名') as HTMLInputElement).value).toBe('张三')
    expect((screen.getByPlaceholderText('联系电话') as HTMLInputElement).value).toBe('13800001111')
  })

  it('提交时调用 update 并带上客户 id', async () => {
    update().mockResolvedValueOnce(sampleCustomer)
    render(<CustomerForm customer={sampleCustomer} onSave={onSave} onCancel={onCancel} />)
    fireEvent.submit(document.querySelector('form')!)
    await waitFor(() => expect(onSave).toHaveBeenCalled())
    expect(update()).toHaveBeenCalledWith(7, expect.objectContaining({ name: '张三' }))
  })
})
