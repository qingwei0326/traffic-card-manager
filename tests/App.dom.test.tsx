// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import App from '../src/App'

// 隔离各页面组件，只验证 App 自身的导航/关闭提示/迁移横幅逻辑，
// 避免页面内部的大数据依赖污染本测试。
vi.mock('../src/components/Dashboard', () => ({ default: () => <div data-testid="page-dashboard" /> }))
vi.mock('../src/components/CardList', () => ({ default: () => <div data-testid="page-cards" /> }))
vi.mock('../src/components/CustomerList', () => ({ default: () => <div data-testid="page-customers" /> }))
vi.mock('../src/components/FinanceStats', () => ({ default: () => <div data-testid="page-finance" /> }))
vi.mock('../src/components/PlanList', () => ({ default: () => <div data-testid="page-plans" /> }))
vi.mock('../src/components/CardPicker', () => ({ default: () => <div data-testid="page-picker" /> }))
vi.mock('../src/components/Settings', () => ({ default: () => <div data-testid="page-settings" /> }))

const { onCloseRequest, chooseCloseAction, getStatus, captured, update } = vi.hoisted(() => {
  const captured: Array<() => void> = []
  const onCloseRequest = vi.fn((cb: () => void) => {
    captured.push(cb)
    return Promise.resolve(vi.fn())
  })
  const chooseCloseAction = vi.fn()
  const getStatus = vi.fn()
  const noop = () => vi.fn()
  const update = {
    check: vi.fn().mockResolvedValue({ ok: true, version: '1.0.1' }),
    download: vi.fn().mockResolvedValue({ ok: true }),
    install: vi.fn().mockResolvedValue({ ok: true }),
    onAvailable: vi.fn().mockResolvedValue(noop()),
    onNotAvailable: vi.fn().mockResolvedValue(noop()),
    onProgress: vi.fn().mockResolvedValue(noop()),
    onDownloaded: vi.fn().mockResolvedValue(noop()),
    onError: vi.fn().mockResolvedValue(noop()),
  }
  return { onCloseRequest, chooseCloseAction, getStatus, captured, update }
})

vi.mock('../src/lib/appApi', () => ({
  appApi: new Proxy(
    {
      app: { showWindow: vi.fn(), chooseCloseAction, onCloseRequest },
      migration: { getStatus },
      update,
    },
    {
      get: (target, prop) =>
        prop in target
          ? (target as Record<string, unknown>)[prop]
          : new Proxy({}, { get: () => vi.fn().mockResolvedValue(undefined) }),
    },
  ),
}))

beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => {})
  // jsdom 不实现 matchMedia，Layout 初始会读取它
  window.matchMedia = vi.fn().mockImplementation((q: string) => ({
    matches: false,
    media: q,
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }))
  getStatus.mockResolvedValue({ ok: true })
  captured.length = 0
})
afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

describe('App 顶层装配', () => {
  it('默认进入 dashboard 页面', () => {
    render(<App />)
    expect(screen.getByTestId('page-dashboard')).toBeTruthy()
  })

  it('迁移状态失败时渲染 MigrationBanner 并显示错误', async () => {
    getStatus.mockResolvedValueOnce({ ok: false, error: 'schema 升级失败' })
    render(<App />)
    await waitFor(() => expect(screen.getByText('schema 升级失败')).toBeTruthy())
  })

  it('收到关闭请求事件后弹出关闭提示，最小化按钮调用 chooseCloseAction', async () => {
    render(<App />)
    expect(captured.length).toBe(1)
    captured[0]()

    await waitFor(() => expect(screen.getByText('关闭流量卡管理系统')).toBeTruthy())
    fireEvent.click(screen.getByText('最小化到托盘'))

    expect(chooseCloseAction).toHaveBeenCalledWith('minimize')
  })

  it('关闭提示中直接退出按钮调用 chooseCloseAction("quit")', async () => {
    render(<App />)
    captured[0]()
    await waitFor(() => expect(screen.getByText('直接退出')).toBeTruthy())
    fireEvent.click(screen.getByText('直接退出'))
    expect(chooseCloseAction).toHaveBeenCalledWith('quit')
  })
})
