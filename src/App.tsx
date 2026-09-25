import { useEffect, useState } from 'react'
import { LogOut, MinusCircle, X } from 'lucide-react'
import Layout from './components/Layout'
import Dashboard from './components/Dashboard'
import CardList from './components/CardList'
import CustomerList from './components/CustomerList'
import FinanceStats from './components/FinanceStats'
import Settings from './components/Settings'
import PlanList from './components/PlanList'
import CardPicker from './components/CardPicker'
import MigrationBanner from './components/MigrationBanner'
import { appApi } from './lib/appApi'
import type { Card } from './types'

export type Page = 'dashboard' | 'cards' | 'customers' | 'finance' | 'plans' | 'picker' | 'settings'

function App() {
  const [currentPage, setCurrentPage] = useState<Page>('dashboard')
  const [refreshKey, setRefreshKey] = useState(0)
  const [openCardForm, setOpenCardForm] = useState(false)
  const [openCustomerForm, setOpenCustomerForm] = useState(false)
  const [selectedCustomerId, setSelectedCustomerId] = useState<number | null>(null)
  const [pickerProvince, setPickerProvince] = useState('')
  const [cardInitialStatus, setCardInitialStatus] = useState<Card['status'] | ''>('')
  const [showClosePrompt, setShowClosePrompt] = useState(false)
  const [migrationError, setMigrationError] = useState<string | null>(null)

  useEffect(() => {
    let dispose: (() => void) | undefined
    let active = true
    appApi.app.onCloseRequest(() => setShowClosePrompt(true)).then(unlisten => {
      if (active) {
        dispose = unlisten
      } else {
        unlisten()
      }
    })
    return () => {
      active = false
      dispose?.()
    }
  }, [])

  // 起动时查询迁移是否成功：失败则弹告警横幅（如 schema 升级失败、
  // 旧版数据搬迁失败），而不是让用户面对一个静默崩溃的窗口。
  useEffect(() => {
    let active = true
    appApi.migration
      .getStatus()
      .then(status => {
        if (active && !status.ok) {
          setMigrationError(status.error ?? '未知迁移错误')
        }
      })
      .catch(() => {})
    return () => {
      active = false
    }
  }, [])

  const handleRefresh = () => {
    setRefreshKey(prev => prev + 1)
  }

  const handleNavigateToAddCard = () => {
    setOpenCardForm(true)
    setCurrentPage('cards')
  }

  const handleNavigateToAddCustomer = () => {
    setOpenCustomerForm(true)
    setCurrentPage('customers')
  }

  const handleViewCustomer = (customerId: number) => {
    setSelectedCustomerId(customerId)
    setCurrentPage('customers')
  }

  const handleRecommendPlans = (province: string) => {
    setPickerProvince(province)
    setCurrentPage('picker')
  }

  const handleViewPendingCards = () => {
    setCardInitialStatus('待确认')
    setCurrentPage('cards')
  }

  const handleCardFormOpened = () => {
    setOpenCardForm(false)
  }

  const handleCustomerFormOpened = () => {
    setOpenCustomerForm(false)
  }

  const renderPage = () => {
    switch (currentPage) {
      case 'dashboard':
        return <Dashboard key={refreshKey} onNavigate={setCurrentPage} onAddCard={handleNavigateToAddCard} onAddCustomer={handleNavigateToAddCustomer} onViewCustomer={handleViewCustomer} onViewPendingCards={handleViewPendingCards} />
      case 'cards':
        return <CardList key={refreshKey} onRefresh={handleRefresh} openForm={openCardForm} onFormOpened={handleCardFormOpened} onViewCustomer={handleViewCustomer} initialStatus={cardInitialStatus} onInitialStatusUsed={() => setCardInitialStatus('')} />
      case 'customers':
        return <CustomerList key={refreshKey} onRefresh={handleRefresh} openForm={openCustomerForm} onFormOpened={handleCustomerFormOpened} selectedCustomerId={selectedCustomerId} onSelectionHandled={() => setSelectedCustomerId(null)} onRecommendPlans={handleRecommendPlans} />
      case 'finance':
        return <FinanceStats key={refreshKey} />
      case 'plans':
        return <PlanList key={refreshKey} />
      case 'picker':
        return <CardPicker key={refreshKey} initialProvince={pickerProvince} onProvinceUsed={() => setPickerProvince('')} />
      case 'settings':
        return <Settings key={refreshKey} onRefresh={handleRefresh} />
      default:
        return <Dashboard key={refreshKey} onNavigate={setCurrentPage} onAddCard={handleNavigateToAddCard} onAddCustomer={handleNavigateToAddCustomer} onViewCustomer={handleViewCustomer} onViewPendingCards={handleViewPendingCards} />
    }
  }

  return (
    <Layout currentPage={currentPage} onNavigate={setCurrentPage}>
      {migrationError && (
        <MigrationBanner error={migrationError} onDismiss={() => setMigrationError(null)} />
      )}
      {renderPage()}
      {showClosePrompt && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/45 px-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-lg border border-slate-200 bg-white shadow-2xl dark:border-slate-700 dark:bg-slate-800">
            <div className="flex items-start justify-between gap-4 border-b border-slate-200 px-5 py-4 dark:border-slate-700">
              <div>
                <h3 className="text-base font-semibold text-slate-950 dark:text-slate-100">关闭流量卡管理系统</h3>
                <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">选择关闭窗口后的处理方式</p>
              </div>
              <button
                onClick={() => setShowClosePrompt(false)}
                className="inline-flex h-8 w-8 items-center justify-center rounded-md text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-700 dark:hover:text-slate-200"
                aria-label="取消关闭"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="space-y-3 p-5">
              <button
                onClick={() => {
                  setShowClosePrompt(false)
                  appApi.app.chooseCloseAction('minimize')
                }}
                className="group flex w-full items-start gap-3 rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-left transition-colors hover:border-blue-300 hover:bg-blue-100 dark:border-blue-900/60 dark:bg-blue-900/20 dark:hover:bg-blue-900/30"
              >
                <span className="mt-0.5 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-blue-600 text-white">
                  <MinusCircle className="h-5 w-5" />
                </span>
                <span>
                  <span className="block font-medium text-blue-900 dark:text-blue-100">最小化到托盘</span>
                  <span className="mt-1 block text-sm leading-5 text-blue-700 dark:text-blue-300">程序继续运行，到期提醒和托盘恢复仍然可用。</span>
                </span>
              </button>

              <button
                onClick={() => {
                  setShowClosePrompt(false)
                  appApi.app.chooseCloseAction('quit')
                }}
                className="group flex w-full items-start gap-3 rounded-lg border border-slate-200 px-4 py-3 text-left transition-colors hover:border-red-200 hover:bg-red-50 dark:border-slate-700 dark:hover:border-red-900/70 dark:hover:bg-red-900/20"
              >
                <span className="mt-0.5 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-slate-100 text-slate-600 group-hover:bg-red-600 group-hover:text-white dark:bg-slate-700 dark:text-slate-200">
                  <LogOut className="h-5 w-5" />
                </span>
                <span>
                  <span className="block font-medium text-slate-900 dark:text-slate-100">直接退出</span>
                  <span className="mt-1 block text-sm leading-5 text-slate-500 dark:text-slate-400">完全关闭程序，托盘和提醒都会停止。</span>
                </span>
              </button>
            </div>
          </div>
        </div>
      )}
    </Layout>
  )
}

export default App
