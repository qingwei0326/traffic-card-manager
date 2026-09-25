// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import Settings from '../src/components/Settings'
import { appApi } from '../src/lib/appApi'

vi.mock('../src/lib/appApi', async importOriginal => {
  const actual = await importOriginal<typeof import('../src/lib/appApi')>()
  return {
    ...actual,
    appApi: {
      ...actual.appApi,
      apiConfig: { ...actual.appApi.apiConfig, get: vi.fn(), save: vi.fn() },
      api172: {
        ...actual.appApi.api172,
        testConnection: vi.fn(),
        syncProducts: vi.fn(),
        getOrderInfo: vi.fn(),
      },
      backup: { ...actual.appApi.backup, export: vi.fn() },
      plans: { ...actual.appApi.plans, importFromFile: vi.fn() },
    },
  }
})

const getConf = () => vi.mocked(appApi.apiConfig.get)
const saveConf = () => vi.mocked(appApi.apiConfig.save)
const testConn = () => vi.mocked(appApi.api172.testConnection)
const syncProd = () => vi.mocked(appApi.api172.syncProducts)
const getOrder = () => vi.mocked(appApi.api172.getOrderInfo)
const doExport = () => vi.mocked(appApi.backup.export)
const importPlans = () => vi.mocked(appApi.plans.importFromFile)

const configuredStatus = {
  configured: true,
  masked_secret: '****',
  source: 'keyring' as const,
  user_id: 'u1',
  warning: undefined,
}

const onRefresh = vi.fn()

beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => {})
  vi.spyOn(window, 'alert').mockImplementation(() => {})
  vi.spyOn(window, 'confirm').mockReturnValue(true)
  // jsdom 无 createObjectURL，导出测试需要 polyfill
  vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:mock')
  vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {})
  onRefresh.mockClear()
})
afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

describe('Settings 系统设置', () => {
  it('启动加载配置并展示密钥保护来源', async () => {
    getConf().mockResolvedValue(configuredStatus)
    render(<Settings onRefresh={onRefresh} />)
    await waitFor(() => expect(screen.getByDisplayValue('u1')).toBeTruthy())
    expect(screen.getByTestId('api-secret-source').textContent).toBe('已存入系统钥匙串')
  })

  it('配置告警时展示 api-secret-warning', async () => {
    getConf().mockResolvedValue({ ...configuredStatus, warning: '需要重新配置密钥' })
    render(<Settings onRefresh={onRefresh} />)
    await waitFor(() => expect(screen.getByTestId('api-secret-warning')).toBeTruthy())
    expect(screen.getByTestId('api-secret-warning').textContent).toBe('需要重新配置密钥')
  })

  it('保存配置调用 apiConfig.save 并提示已保存', async () => {
    getConf().mockResolvedValue(configuredStatus)
    saveConf().mockResolvedValue({ ...configuredStatus, source: 'keyring' })
    render(<Settings onRefresh={onRefresh} />)
    await waitFor(() => expect(screen.getByDisplayValue('u1')).toBeTruthy())

    fireEvent.change(screen.getByTestId('api-secret-input'), { target: { value: 'secret-abc' } })
    fireEvent.click(screen.getByText('💾 保存配置'))
    await waitFor(() => expect(saveConf()).toHaveBeenCalledWith('u1', 'secret-abc'))
    expect(screen.getByText('✅ 已保存')).toBeTruthy()
  })

  it('测试连接调用 api172.testConnection', async () => {
    getConf().mockResolvedValue(configuredStatus)
    testConn().mockResolvedValue({ success: true, message: '连接成功' })
    render(<Settings onRefresh={onRefresh} />)
    await waitFor(() => expect(screen.getByDisplayValue('u1')).toBeTruthy())

    fireEvent.click(screen.getByText('🔌 测试连接'))
    await waitFor(() => expect(testConn()).toHaveBeenCalledWith('u1'))
    expect(screen.getByText('连接成功')).toBeTruthy()
  })

  it('同步产品调用 api172.syncProducts 并展示结果', async () => {
    getConf().mockResolvedValue(configuredStatus)
    syncProd().mockResolvedValue({ imported: 3, updated: 1, backfilled: 2, total: 6 })
    render(<Settings onRefresh={onRefresh} />)
    await waitFor(() => expect(screen.getByDisplayValue('u1')).toBeTruthy())

    fireEvent.click(screen.getByText('🔄 从172同步产品'))
    await waitFor(() => expect(syncProd()).toHaveBeenCalledWith('u1'))
    expect(screen.getByText(/新增 3 条，更新 1 条，回填老卡 2 张/)).toBeTruthy()
    expect(onRefresh).toHaveBeenCalled()
  })

  it('订单查询调用 api172.getOrderInfo 并展示结果', async () => {
    getConf().mockResolvedValue(configuredStatus)
    getOrder().mockResolvedValue({ code: 0, data: { order_id: 'ORD1', status: '已激活' } })
    render(<Settings onRefresh={onRefresh} />)
    await waitFor(() => expect(screen.getByDisplayValue('u1')).toBeTruthy())

    fireEvent.change(screen.getByPlaceholderText('输入172平台订单号'), { target: { value: 'ORD1' } })
    fireEvent.click(screen.getByText('🔍 查询'))
    await waitFor(() => expect(getOrder()).toHaveBeenCalledWith('u1', 'ORD1'))
    expect(screen.getByText(/"order_id": "ORD1"/)).toBeTruthy()
  })

  it('导出数据调用 backup.export 并生成下载链接', async () => {
    getConf().mockResolvedValue(configuredStatus)
    doExport().mockResolvedValue({
      cards: [{ id: 1 }],
      customers: [{ id: 1 }],
      plans: [{ id: 1 }, { id: 2 }],
    } as any)
    render(<Settings onRefresh={onRefresh} />)
    await waitFor(() => expect(screen.getByDisplayValue('u1')).toBeTruthy())

    fireEvent.click(screen.getByText('📤 导出数据'))
    await waitFor(() => expect(doExport()).toHaveBeenCalled())
    expect(URL.createObjectURL).toHaveBeenCalled()
    expect(screen.getByText(/导出成功：1 张卡片，1 个客户，2 个套餐/)).toBeTruthy()
  })

  it('清除密钥调用 apiConfig.save 传入空 secret', async () => {
    getConf().mockResolvedValue(configuredStatus)
    saveConf().mockResolvedValue({ ...configuredStatus, source: 'none' })
    render(<Settings onRefresh={onRefresh} />)
    await waitFor(() => expect(screen.getByTestId('api-secret-clear')).toBeTruthy())

    fireEvent.click(screen.getByTestId('api-secret-clear'))
    await waitFor(() => expect(saveConf()).toHaveBeenCalledWith('u1', ''))
  })

  it('导入172套餐模板调用 plans.importFromFile', async () => {
    getConf().mockResolvedValue(configuredStatus)
    importPlans().mockResolvedValue({ imported: 5, updated: 2, backfilled: 1, total: 8 })
    render(<Settings onRefresh={onRefresh} />)
    await waitFor(() => expect(screen.getByDisplayValue('u1')).toBeTruthy())

    fireEvent.click(screen.getByText('📥 导入172套餐'))
    await waitFor(() => expect(importPlans()).toHaveBeenCalledWith('172-plans.json'))
    expect(screen.getByText(/172号卡平台：新增 5 条/)).toBeTruthy()
  })
})
