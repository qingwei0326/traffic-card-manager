// @vitest-environment jsdom
// Layout：mock appApi.update 的 5 个事件监听 + check/download/install，
// 覆盖菜单渲染、暗色切换、更新生命周期回调、检查/下载/安装、菜单导航。
// 另需 polyfill window.matchMedia（jsdom 不实现）。
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import Layout from '../src/components/Layout'
import { appApi } from '../src/lib/appApi'

vi.mock('../src/lib/appApi', async importOriginal => {
  const actual = await importOriginal<typeof import('../src/lib/appApi')>()
  return {
    ...actual,
    appApi: {
      ...actual.appApi,
      update: {
        ...actual.appApi.update,
        check: vi.fn(),
        download: vi.fn(),
        install: vi.fn(),
        onAvailable: vi.fn(),
        onNotAvailable: vi.fn(),
        onProgress: vi.fn(),
        onDownloaded: vi.fn(),
        onError: vi.fn(),
      },
    },
  }
})

const check = () => vi.mocked(appApi.update.check)
const download = () => vi.mocked(appApi.update.download)
const install = () => vi.mocked(appApi.update.install)
const onAvailable = () => vi.mocked(appApi.update.onAvailable)
const onNotAvailable = () => vi.mocked(appApi.update.onNotAvailable)
const onProgress = () => vi.mocked(appApi.update.onProgress)
const onDownloaded = () => vi.mocked(appApi.update.onDownloaded)
const onError = () => vi.mocked(appApi.update.onError)

const noop = () => vi.fn()
let cbs: Record<string, (...a: any[]) => void> = {}

beforeEach(() => {
  cbs = {}
  localStorage.clear()
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
  vi.spyOn(console, 'error').mockImplementation(() => {})

  // 捕获 Tauri 事件回调（组件在 useEffect 中注册），便于在测试中手动触发。
  // addDisposer 会对返回值调用 .then，因此必须返回 Promise<disposer>。
  onAvailable().mockImplementation((cb: any) => { cbs.onAvailable = cb; return Promise.resolve(noop()) })
  onNotAvailable().mockImplementation((cb: any) => { cbs.onNotAvailable = cb; return Promise.resolve(noop()) })
  onProgress().mockImplementation((cb: any) => { cbs.onProgress = cb; return Promise.resolve(noop()) })
  onDownloaded().mockImplementation((cb: any) => { cbs.onDownloaded = cb; return Promise.resolve(noop()) })
  onError().mockImplementation((cb: any) => { cbs.onError = cb; return Promise.resolve(noop()) })
  check().mockResolvedValue({ ok: true, version: '9.9.9' })
  download().mockResolvedValue({ ok: true })
  install().mockResolvedValue({ ok: true })
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

describe('Layout', () => {
  it('renders the sidebar menu and version footer', () => {
    render(
      <Layout currentPage="dashboard" onNavigate={() => {}}>
        <div>页面内容</div>
      </Layout>,
    )
    expect(screen.getByText('流量卡管理系统')).toBeTruthy()
    expect(screen.getByText('首页')).toBeTruthy()
    expect(screen.getByText('智能挑卡')).toBeTruthy()
    expect(screen.getByText('流量卡管理')).toBeTruthy()
    expect(screen.getByText('客户管理')).toBeTruthy()
    expect(screen.getByText('财务统计')).toBeTruthy()
    expect(screen.getByText('套餐模板库')).toBeTruthy()
    expect(screen.getByText('系统设置')).toBeTruthy()
    expect(screen.getByText('流量卡管理系统 v1.0.1')).toBeTruthy()
    // children 透传
    expect(screen.getByText('页面内容')).toBeTruthy()
  })

  it('toggles dark mode and persists to localStorage', () => {
    render(<Layout currentPage="dashboard" onNavigate={() => {}}>x</Layout>)
    // 默认浅色 → 按钮提示「深色模式」
    expect(screen.getByText('深色模式')).toBeTruthy()
    fireEvent.click(screen.getByText('深色模式'))
    expect(document.documentElement.classList.contains('dark')).toBe(true)
    expect(localStorage.getItem('theme')).toBe('dark')

    fireEvent.click(screen.getByText('浅色模式'))
    expect(document.documentElement.classList.contains('dark')).toBe(false)
    expect(localStorage.getItem('theme')).toBe('light')
  })

  it('invokes onNavigate when a menu item is clicked', () => {
    const onNavigate = vi.fn()
    render(<Layout currentPage="dashboard" onNavigate={onNavigate}>x</Layout>)
    fireEvent.click(screen.getByText('财务统计'))
    expect(onNavigate).toHaveBeenCalledWith('finance')
  })

  it('reflects each update lifecycle callback in the UI', () => {
    render(<Layout currentPage="dashboard" onNavigate={() => {}}>x</Layout>)

    // 有可用版本 → 显示「下载」按钮
    act(() => cbs.onAvailable('3.0.0'))
    expect(screen.getByText('下载 v3.0.0')).toBeTruthy()

    // 下载进度 → 显示「正在下载 vX.Y.Z NN%」
    act(() => cbs.onProgress(42))
    expect(screen.getByText(/正在下载/)).toBeTruthy()
    expect(screen.getByText(/42%/)).toBeTruthy()

    // 下载完成 → 显示「重启安装」按钮
    act(() => cbs.onDownloaded())
    expect(screen.getByText(/重启安装/)).toBeTruthy()

    // 更新出错 → 显示错误信息
    act(() => cbs.onError('出错了'))
    expect(screen.getByText('出错了')).toBeTruthy()

    // 无可用版本 → 提示已是最新
    act(() => cbs.onNotAvailable())
    expect(screen.getByText('当前已是最新版本')).toBeTruthy()
  })

  it('checks for updates and downloads when available', async () => {
    render(<Layout currentPage="dashboard" onNavigate={() => {}}>x</Layout>)

    fireEvent.click(screen.getByText('检查更新'))
    await waitFor(() => expect(check()).toHaveBeenCalled())

    // 模拟后端推送「有可用版本」
    act(() => cbs.onAvailable('2.0.0'))
    const dlBtn = screen.getByText('下载 v2.0.0')
    expect(dlBtn).toBeTruthy()

    fireEvent.click(dlBtn)
    await waitFor(() => expect(download()).toHaveBeenCalled())
  })

  it('shows the download error message on failure', async () => {
    download().mockResolvedValueOnce({ ok: false, message: '下载失败' })
    render(<Layout currentPage="dashboard" onNavigate={() => {}}>x</Layout>)

    act(() => cbs.onAvailable('1.0.0'))
    fireEvent.click(screen.getByText('下载 v1.0.0'))
    await waitFor(() => expect(screen.getByText('下载失败')).toBeTruthy())
  })

  it('installs the update once downloaded', () => {
    render(<Layout currentPage="dashboard" onNavigate={() => {}}>x</Layout>)
    act(() => cbs.onDownloaded())
    const installBtn = screen.getByText(/重启安装/)
    fireEvent.click(installBtn)
    expect(install()).toHaveBeenCalled()
  })
})
