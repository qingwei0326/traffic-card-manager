import { ComponentType, ReactNode, useState, useEffect } from 'react'
import { Page } from '../App'
import {
  BarChart3,
  Bot,
  ChartNoAxesCombined,
  CreditCard,
  Database,
  Download,
  Moon,
  PackageSearch,
  RotateCw,
  Search,
  Settings,
  Signal,
  Sun,
  Users,
} from 'lucide-react'

interface LayoutProps {
  children: ReactNode
  currentPage: Page
  onNavigate: (page: Page) => void
}

const menuItems: { key: Page; label: string; icon: ComponentType<{ className?: string }> }[] = [
  { key: 'dashboard', label: '首页', icon: BarChart3 },
  { key: 'picker', label: '智能挑卡', icon: Bot },
  { key: 'cards', label: '流量卡管理', icon: CreditCard },
  { key: 'customers', label: '客户管理', icon: Users },
  { key: 'finance', label: '财务统计', icon: ChartNoAxesCombined },
  { key: 'plans', label: '套餐模板库', icon: PackageSearch },
  { key: 'settings', label: '系统设置', icon: Settings },
]

export default function Layout({ children, currentPage, onNavigate }: LayoutProps) {
  const [updateVersion, setUpdateVersion] = useState('')
  const [updateChecking, setUpdateChecking] = useState(false)
  const [updateDownloading, setUpdateDownloading] = useState(false)
  const [updateProgress, setUpdateProgress] = useState(0)
  const [updateReady, setUpdateReady] = useState(false)
  const [updateMessage, setUpdateMessage] = useState('')
  const [darkMode, setDarkMode] = useState(() => {
    return localStorage.getItem('theme') === 'dark' ||
      (!localStorage.getItem('theme') && window.matchMedia('(prefers-color-scheme: dark)').matches)
  })

  useEffect(() => {
    window.electronAPI.update?.onAvailable?.((version: string) => {
      setUpdateVersion(version)
      setUpdateChecking(false)
      setUpdateDownloading(false)
      setUpdateMessage(`发现新版本 v${version}`)
      setUpdateProgress(0)
    })
    window.electronAPI.update?.onNotAvailable?.(() => {
      setUpdateVersion('')
      setUpdateChecking(false)
      setUpdateDownloading(false)
      setUpdateProgress(0)
      setUpdateMessage('当前已是最新版本')
    })
    window.electronAPI.update?.onProgress?.((percent: number) => {
      setUpdateProgress(percent)
      setUpdateChecking(false)
      setUpdateDownloading(true)
      setUpdateMessage('')
    })
    window.electronAPI.update?.onDownloaded?.(() => {
      setUpdateReady(true)
      setUpdateChecking(false)
      setUpdateDownloading(false)
      setUpdateMessage('更新已下载完成')
    })
    window.electronAPI.update?.onError?.((message: string) => {
      setUpdateChecking(false)
      setUpdateDownloading(false)
      setUpdateMessage(message || '检查更新失败')
    })
  }, [])

  useEffect(() => {
    if (darkMode) {
      document.documentElement.classList.add('dark')
      localStorage.setItem('theme', 'dark')
    } else {
      document.documentElement.classList.remove('dark')
      localStorage.setItem('theme', 'light')
    }
  }, [darkMode])

  return (
    <div className="flex h-screen bg-slate-50 dark:bg-slate-900 text-slate-950 dark:text-slate-100">
      {/* 侧边栏 */}
      <aside className="w-64 shrink-0 bg-white dark:bg-slate-800 border-r border-slate-200 dark:border-slate-700 flex flex-col">
        {/* Logo */}
        <div className="h-16 flex items-center px-5 border-b border-slate-200 dark:border-slate-700">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-600 text-white">
            <Signal className="h-5 w-5" />
          </div>
          <div className="ml-3 min-w-0">
            <h1 className="truncate text-lg font-bold text-slate-950 dark:text-slate-100">流量卡管理系统</h1>
            <p className="text-xs text-slate-500 dark:text-slate-400">本地业务工作台</p>
          </div>
        </div>

        {/* 导航菜单 */}
        <nav className="flex-1 py-4">
          <ul className="space-y-1 px-3">
            {menuItems.map(item => (
              <li key={item.key}>
                <button
                  onClick={() => onNavigate(item.key)}
                  className={`w-full flex items-center gap-3 px-4 py-2.5 rounded-md text-sm font-medium transition-colors ${
                    currentPage === item.key
                      ? 'bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300'
                      : 'text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-700 hover:text-slate-950 dark:hover:text-slate-200'
                  }`}
                >
                  <item.icon className="h-4 w-4" />
                  <span>{item.label}</span>
                </button>
              </li>
            ))}
          </ul>
        </nav>

        {/* 底部信息 */}
        <div className="p-4 border-t border-slate-200 dark:border-slate-700 space-y-2">
          {/* 暗色模式切换 */}
          <button
            onClick={() => setDarkMode(!darkMode)}
            className="w-full flex items-center justify-center gap-2 px-3 py-2 text-xs rounded-md border border-slate-200 dark:border-slate-600 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"
          >
            {darkMode ? <Sun className="h-3.5 w-3.5" /> : <Moon className="h-3.5 w-3.5" />}
            {darkMode ? '浅色模式' : '深色模式'}
          </button>

          {updateReady ? (
            <button
              onClick={() => window.electronAPI.update?.install?.()}
              className="w-full inline-flex items-center justify-center gap-2 px-3 py-2 bg-green-600 text-white text-xs rounded-md hover:bg-green-700 transition-colors"
            >
              <RotateCw className="h-3.5 w-3.5" />
              重启安装 v{updateVersion}
            </button>
          ) : updateVersion ? (
            updateDownloading ? (
              <p className="flex items-center justify-center gap-1.5 text-xs text-blue-500 text-center animate-pulse">
                <Download className="h-3.5 w-3.5" />
                正在下载 v{updateVersion} {updateProgress > 0 ? `${updateProgress}%` : ''}
              </p>
            ) : (
              <button
                onClick={async () => {
                  setUpdateDownloading(true)
                  setUpdateMessage('')
                  const result = await window.electronAPI.update?.download?.()
                  if (result && !result.ok) {
                    setUpdateDownloading(false)
                    setUpdateMessage(result.message || '下载更新失败')
                  }
                }}
                className="w-full inline-flex items-center justify-center gap-2 px-3 py-2 bg-blue-600 text-white text-xs rounded-md hover:bg-blue-700 transition-colors"
              >
                <Download className="h-3.5 w-3.5" />
                下载 v{updateVersion}
              </button>
            )
          ) : (
            <button
              onClick={async () => {
                setUpdateChecking(true)
                setUpdateMessage('正在检查更新...')
                const result = await window.electronAPI.update?.check?.()
                if (result && !result.ok) {
                  setUpdateChecking(false)
                  setUpdateMessage(result.message || '检查更新失败')
                }
              }}
              disabled={updateChecking}
              className="w-full inline-flex items-center justify-center gap-2 px-3 py-2 text-xs rounded-md border border-slate-200 dark:border-slate-600 hover:bg-slate-50 dark:hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-60 transition-colors"
            >
              {updateChecking ? <RotateCw className="h-3.5 w-3.5 animate-spin" /> : <Search className="h-3.5 w-3.5" />}
              {updateChecking ? '正在检查更新' : '检查更新'}
            </button>
          )}

          {updateMessage ? (
            <p className="text-center text-[11px] leading-4 text-slate-400 dark:text-slate-500">
              {updateMessage}
            </p>
          ) : (
            <p className="flex items-center justify-center gap-1.5 text-xs text-slate-400 text-center">
              <Database className="h-3.5 w-3.5" />
              流量卡管理系统 v1.0.1
            </p>
          )}
        </div>
      </aside>

      {/* 主内容区 */}
      <main className="flex-1 overflow-auto">
        <div className="p-6">
          {children}
        </div>
      </main>
    </div>
  )
}
