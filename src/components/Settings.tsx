import { useState, useEffect } from 'react'
import { ImportResult } from '../types'

interface SettingsProps {
  onRefresh: () => void
}

interface Api172Config {
  user_id: string
  secret: string
}

// 默认配置（空，从 localStorage 加载）
const DEFAULT_CONFIG: Api172Config = {
  user_id: '',
  secret: '',
}

export default function Settings({ onRefresh }: SettingsProps) {
  const [importing, setImporting] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [importing172, setImporting172] = useState(false)
  const [importingHaoyi, setImportingHaoyi] = useState(false)
  const [importingPlans, setImportingPlans] = useState(false)
  const [planImportResult, setPlanImportResult] = useState('')
  const [apiConfig, setApiConfig] = useState<Api172Config>(DEFAULT_CONFIG)
  const [testingApi, setTestingApi] = useState(false)
  const [apiTestResult, setApiTestResult] = useState<{ success: boolean; message: string } | null>(null)
  const [apiConfigSaved, setApiConfigSaved] = useState(false)
  const [syncingProducts, setSyncingProducts] = useState(false)
  const [syncResult, setSyncResult] = useState<{ imported: number; updated: number; total: number } | null>(null)
  const [queryingOrder, setQueryingOrder] = useState(false)
  const [orderQueryId, setOrderQueryId] = useState('')
  const [orderQueryResult, setOrderQueryResult] = useState<any>(null)
  const [importResult, setImportResult] = useState<{
    title: string
    result: ImportResult
    skippedReason: string
  } | null>(null)
  const [backupResult, setBackupResult] = useState('')

  // 导入预览状态
  const [previewOpen, setPreviewOpen] = useState(false)
  const [previewTitle, setPreviewTitle] = useState('')
  const [previewRows, setPreviewRows] = useState<any[]>([])
  const [previewHeaders, setPreviewHeaders] = useState<string[]>([])
  const [previewImportFn, setPreviewImportFn] = useState<((rows: any[]) => Promise<any>) | null>(null)
  const [previewSkippedReason, setPreviewSkippedReason] = useState('')
  const [previewLoading, setPreviewLoading] = useState(false)

  // 加载保存的配置（从主进程安全存储）
  useEffect(() => {
    window.electronAPI.apiConfig.get().then(config => {
      if (config.user_id || config.secret) {
        setApiConfig(config)
      }
    }).catch(() => {})
  }, [])

  const handleSaveApiConfig = async () => {
    await window.electronAPI.apiConfig.save(apiConfig)
    setApiConfigSaved(true)
    setTimeout(() => setApiConfigSaved(false), 2000)
  }

  const handleTestApi = async () => {
    setTestingApi(true)
    setApiTestResult(null)
    try {
      const result = await window.electronAPI.api172.testConnection(apiConfig)
      setApiTestResult(result)
    } catch (error: any) {
      setApiTestResult({ success: false, message: `测试失败: ${error.message}` })
    } finally {
      setTestingApi(false)
    }
  }

  const handleSyncProducts = async () => {
    setSyncingProducts(true)
    setSyncResult(null)
    try {
      const result = await window.electronAPI.api172.syncProducts(apiConfig)
      setSyncResult(result)
      onRefresh()
    } catch (error: any) {
      alert('同步失败: ' + error.message)
    } finally {
      setSyncingProducts(false)
    }
  }

  const handleQueryOrder = async () => {
    if (!orderQueryId.trim()) return
    setQueryingOrder(true)
    setOrderQueryResult(null)
    try {
      const result = await window.electronAPI.api172.getOrderInfo(apiConfig, orderQueryId.trim())
      setOrderQueryResult(result)
    } catch (error: any) {
      setOrderQueryResult({ code: -1, message: '查询失败: ' + error.message })
    } finally {
      setQueryingOrder(false)
    }
  }

  const handleExport = async () => {
    setExporting(true)
    try {
      const data = await window.electronAPI.backup.export()
      const json = JSON.stringify(data, null, 2)
      const blob = new Blob([json], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `流量卡备份_${new Date().toISOString().slice(0, 10)}.json`
      a.click()
      URL.revokeObjectURL(url)
      setBackupResult(`导出成功：${data.cards.length} 张卡片，${data.customers.length} 个客户`)
    } catch (error) {
      console.error('导出失败:', error)
      alert('导出失败，请重试')
    } finally {
      setExporting(false)
    }
  }

  const handleImport = async () => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = '.json'
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0]
      if (!file) return

      if (!confirm('导入将覆盖现有数据，确定继续吗？建议先导出备份。')) return

      setImporting(true)
      try {
        const text = await file.text()
        const data = JSON.parse(text)

        if (!data.cards || !data.customers) {
          throw new Error('数据格式不正确')
        }

        const result = await window.electronAPI.backup.import(data)
        setBackupResult(`导入成功：${result.cards} 张卡片，${result.customers} 个客户`)
        onRefresh()
      } catch (error) {
        console.error('导入失败:', error)
        alert('导入失败，请检查文件格式')
      } finally {
        setImporting(false)
      }
    }
    input.click()
  }

  const handleImport172 = async () => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = '.xlsx,.xls'
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0]
      if (!file) return

      setImporting172(true)
      try {
        const XLSX = await import('xlsx')
        const arrayBuffer = await file.arrayBuffer()
        const workbook = XLSX.read(arrayBuffer, { type: 'array' })
        const sheetName = workbook.SheetNames[0]
        const sheet = workbook.Sheets[sheetName]
        const rows = XLSX.utils.sheet_to_json(sheet) as any[]

        if (rows.length === 0) {
          alert('文件中没有数据')
          return
        }

        // 显示预览
        const headers = rows.length > 0 ? Object.keys(rows[0]) : []
        setPreviewRows(rows)
        setPreviewHeaders(headers)
        setPreviewTitle(`172号卡订单 — 共 ${rows.length} 条`)
        setPreviewSkippedReason('已存在、已撤单或审核不通过')
        setPreviewImportFn(() => async (r: any[]) => {
          const result = await window.electronAPI.import172.import(r)
          setImportResult({ title: '172号卡订单导入完成', result, skippedReason: '已存在、已撤单或审核不通过' })
          onRefresh()
          return result
        })
        setPreviewOpen(true)
      } catch (error) {
        console.error('导入失败:', error)
        alert('导入失败，请检查文件格式是否正确')
      } finally {
        setImporting172(false)
      }
    }
    input.click()
  }

  const handleImportHaoyi = async () => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = '.xlsx,.xls'
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0]
      if (!file) return

      setImportingHaoyi(true)
      try {
        const XLSX = await import('xlsx')
        const arrayBuffer = await file.arrayBuffer()
        const workbook = XLSX.read(arrayBuffer, { type: 'array' })
        const sheetName = workbook.SheetNames[0]
        const sheet = workbook.Sheets[sheetName]
        const rows = XLSX.utils.sheet_to_json(sheet) as any[]

        if (rows.length === 0) {
          alert('文件中没有数据')
          return
        }

        const headers = rows.length > 0 ? Object.keys(rows[0]) : []
        setPreviewRows(rows)
        setPreviewHeaders(headers)
        setPreviewTitle(`号易订单 — 共 ${rows.length} 条`)
        setPreviewSkippedReason('已存在、开卡失败或已取消')
        setPreviewImportFn(() => async (r: any[]) => {
          const result = await window.electronAPI.importHaoyi.import(r)
          setImportResult({ title: '号易订单导入完成', result, skippedReason: '已存在、开卡失败或已取消' })
          onRefresh()
          return result
        })
        setPreviewOpen(true)
      } catch (error) {
        console.error('导入失败:', error)
        alert('导入失败，请检查文件格式是否正确')
      } finally {
        setImportingHaoyi(false)
      }
    }
    input.click()
  }

  return (
    <div className="space-y-6">
      {/* 页面标题 */}
      <h2 className="text-2xl font-bold text-gray-900">系统设置</h2>

      {/* 172号卡API配置 */}
      <div className="card p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">🔗 172号卡API配置</h3>
        <p className="text-sm text-gray-500 mb-4">
          配置172号卡平台API凭证，用于自动同步订单数据。
        </p>

        <div className="grid grid-cols-2 gap-4 mb-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">user_id（登录账号）</label>
            <input
              type="text"
              value={apiConfig.user_id}
              onChange={e => setApiConfig(prev => ({ ...prev, user_id: e.target.value }))}
              placeholder="172号卡登录账号"
              className="input"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">secret（密钥）</label>
            <input
              type="password"
              value={apiConfig.secret}
              onChange={e => setApiConfig(prev => ({ ...prev, secret: e.target.value }))}
              placeholder="向管理员获取密钥"
              className="input"
            />
          </div>
        </div>

        <div className="flex gap-3">
          <button
            onClick={handleSaveApiConfig}
            className="btn btn-primary"
          >
            {apiConfigSaved ? '✅ 已保存' : '💾 保存配置'}
          </button>
          <button
            onClick={handleTestApi}
            disabled={testingApi}
            className="btn btn-secondary"
          >
            {testingApi ? '测试中...' : '🔌 测试连接'}
          </button>
        </div>

        {apiTestResult && (
          <div className={`mt-4 p-3 rounded-lg text-sm ${
            apiTestResult.success ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-800'
          }`}>
            {apiTestResult.message}
          </div>
        )}

        {/* 产品同步 */}
        <div className="mt-4 pt-4 border-t border-gray-200">
          <div className="flex items-center gap-3">
            <button
              onClick={handleSyncProducts}
              disabled={syncingProducts}
              className="btn btn-primary"
            >
              {syncingProducts ? '同步中...' : '🔄 从172同步产品'}
            </button>
            {syncResult && (
              <span className="text-sm text-green-700">
                ✅ 新增 {syncResult.imported} 条，更新 {syncResult.updated} 条（共 {syncResult.total} 个产品）
              </span>
            )}
          </div>
          <p className="text-xs text-gray-400 mt-2">从172平台API拉取最新产品列表，同步到套餐模板库</p>
        </div>

        {/* 订单查询 */}
        <div className="mt-4 pt-4 border-t border-gray-200">
          <p className="text-sm font-medium text-gray-700 mb-2">📋 订单查询</p>
          <div className="flex gap-3">
            <input
              type="text"
              value={orderQueryId}
              onChange={e => setOrderQueryId(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleQueryOrder()}
              placeholder="输入172平台订单号"
              className="input flex-1"
            />
            <button
              onClick={handleQueryOrder}
              disabled={queryingOrder || !orderQueryId.trim()}
              className="btn btn-secondary"
            >
              {queryingOrder ? '查询中...' : '🔍 查询'}
            </button>
          </div>
          {orderQueryResult && (
            <div className={`mt-3 p-3 rounded-lg text-sm ${
              orderQueryResult.code === 0 ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-800'
            }`}>
              {orderQueryResult.code === 0 ? (
                <pre className="whitespace-pre-wrap text-xs">{JSON.stringify(orderQueryResult.data, null, 2)}</pre>
              ) : (
                <span>{orderQueryResult.message || '查询失败'}</span>
              )}
            </div>
          )}
        </div>

        <div className="mt-4 p-3 bg-blue-50 rounded-lg text-sm text-blue-800">
          <p className="font-medium">API限制说明：</p>
          <ul className="mt-1 space-y-1">
            <li>• 订单查询：每天每个订单不超过10次</li>
            <li>• 产品查询：每分钟不超过10次</li>
            <li>• 建议每天同步几次即可</li>
          </ul>
        </div>
      </div>

      {/* 172号卡导入 */}
      <div className="card p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">📥 导入172号卡订单（Excel）</h3>
        <p className="text-sm text-gray-500 mb-4">
          从172号卡平台导出的Excel订单文件导入数据。系统会自动：
        </p>
        <ul className="text-sm text-gray-600 mb-4 space-y-1">
          <li>• 解析订单号、客户信息、套餐信息、快递信息等</li>
          <li>• 自动识别运营商和套餐类型</li>
          <li>• 自动创建客户记录并关联</li>
          <li>• 跳过已撤单和审核不通过的订单</li>
          <li>• 跳过已存在的订单（通过订单号去重）</li>
        </ul>
        <div
          onDragOver={e => { e.preventDefault(); e.currentTarget.classList.add('border-blue-400', 'bg-blue-50') }}
          onDragLeave={e => { e.currentTarget.classList.remove('border-blue-400', 'bg-blue-50') }}
          onDrop={async e => {
            e.preventDefault()
            e.currentTarget.classList.remove('border-blue-400', 'bg-blue-50')
            const file = e.dataTransfer.files[0]
            if (!file) return
            if (!file.name.endsWith('.xlsx') && !file.name.endsWith('.xls')) {
              alert('请拖入 Excel 文件（.xlsx/.xls）')
              return
            }
            // 模拟文件选择
            setImporting172(true)
            try {
              const XLSX = await import('xlsx')
              const arrayBuffer = await file.arrayBuffer()
              const workbook = XLSX.read(arrayBuffer, { type: 'array' })
              const rows = XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]]) as any[]
              if (rows.length === 0) { alert('文件中没有数据'); return }
              const headers = Object.keys(rows[0])
              setPreviewRows(rows); setPreviewHeaders(headers)
              setPreviewTitle(`172号卡订单 — 共 ${rows.length} 条`)
              setPreviewSkippedReason('已存在、已撤单或审核不通过')
              setPreviewImportFn(() => async (r: any[]) => {
                const result = await window.electronAPI.import172.import(r)
                setImportResult({ title: '172号卡订单导入完成', result, skippedReason: '已存在、已撤单或审核不通过' })
                onRefresh(); return result
              })
              setPreviewOpen(true)
            } catch { alert('文件解析失败') } finally { setImporting172(false) }
          }}
          className="border-2 border-dashed border-gray-300 rounded-lg p-4 text-center text-sm text-gray-500 mb-4 transition-colors cursor-pointer"
        >
          📎 或拖拽 Excel 文件到此处
        </div>
        <button
          onClick={handleImport172}
          disabled={importing172}
          className="btn btn-primary"
        >
          {importing172 ? '导入中...' : '📥 选择172号卡导出文件'}
        </button>
      </div>

      {importResult && (
        <div className="card p-6 border-blue-100 bg-blue-50">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h3 className="text-lg font-semibold text-blue-900">{importResult.title}</h3>
              <div className="grid grid-cols-3 gap-4 mt-4">
                <div>
                  <p className="text-sm text-blue-700">总计</p>
                  <p className="text-2xl font-bold text-blue-950">{importResult.result.total}</p>
                </div>
                <div>
                  <p className="text-sm text-blue-700">成功导入</p>
                  <p className="text-2xl font-bold text-green-700">{importResult.result.imported}</p>
                </div>
                <div>
                  <p className="text-sm text-blue-700">跳过</p>
                  <p className="text-2xl font-bold text-orange-700">{importResult.result.skipped}</p>
                </div>
              </div>
              <p className="text-sm text-blue-800 mt-3">跳过原因：{importResult.skippedReason}</p>
            </div>
            <button
              onClick={() => setImportResult(null)}
              className="text-blue-700 hover:text-blue-900 text-sm"
            >
              关闭
            </button>
          </div>
        </div>
      )}

      {/* 号易导入 */}
      <div className="card p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">📥 导入号易订单（Excel）</h3>
        <p className="text-sm text-gray-500 mb-4">
          从号易平台导出的Excel订单文件导入数据。系统会自动：
        </p>
        <ul className="text-sm text-gray-600 mb-4 space-y-1">
          <li>• 解析订单号、客户信息、套餐信息、快递信息等</li>
          <li>• 自动识别运营商和套餐类型</li>
          <li>• 自动转换Excel日期格式</li>
          <li>• 自动创建客户记录并关联</li>
          <li>• 跳过开卡失败和已取消的订单</li>
          <li>• 跳过已存在的订单（通过订单号去重）</li>
        </ul>
        <div
          onDragOver={e => { e.preventDefault(); e.currentTarget.classList.add('border-blue-400', 'bg-blue-50') }}
          onDragLeave={e => { e.currentTarget.classList.remove('border-blue-400', 'bg-blue-50') }}
          onDrop={async e => {
            e.preventDefault()
            e.currentTarget.classList.remove('border-blue-400', 'bg-blue-50')
            const file = e.dataTransfer.files[0]
            if (!file) return
            if (!file.name.endsWith('.xlsx') && !file.name.endsWith('.xls')) {
              alert('请拖入 Excel 文件（.xlsx/.xls）')
              return
            }
            setImportingHaoyi(true)
            try {
              const XLSX = await import('xlsx')
              const arrayBuffer = await file.arrayBuffer()
              const workbook = XLSX.read(arrayBuffer, { type: 'array' })
              const rows = XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]]) as any[]
              if (rows.length === 0) { alert('文件中没有数据'); return }
              const headers = Object.keys(rows[0])
              setPreviewRows(rows); setPreviewHeaders(headers)
              setPreviewTitle(`号易订单 — 共 ${rows.length} 条`)
              setPreviewSkippedReason('已存在、开卡失败或已取消')
              setPreviewImportFn(() => async (r: any[]) => {
                const result = await window.electronAPI.importHaoyi.import(r)
                setImportResult({ title: '号易订单导入完成', result, skippedReason: '已存在、开卡失败或已取消' })
                onRefresh(); return result
              })
              setPreviewOpen(true)
            } catch { alert('文件解析失败') } finally { setImportingHaoyi(false) }
          }}
          className="border-2 border-dashed border-gray-300 rounded-lg p-4 text-center text-sm text-gray-500 mb-4 transition-colors cursor-pointer"
        >
          📎 或拖拽 Excel 文件到此处
        </div>
        <button
          onClick={handleImportHaoyi}
          disabled={importingHaoyi}
          className="btn btn-primary"
        >
          {importingHaoyi ? '导入中...' : '📥 选择号易导出文件'}
        </button>
      </div>

      {/* 数据备份 */}
      <div className="card p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">💾 数据备份与恢复</h3>
        <p className="text-sm text-gray-500 mb-4">
          导出数据为 JSON 文件，可用于备份或迁移到其他电脑。导入数据会覆盖现有数据，请谨慎操作。
        </p>

        <div className="flex gap-4">
          <button
            onClick={handleExport}
            disabled={exporting}
            className="btn btn-primary"
          >
            {exporting ? '导出中...' : '📤 导出数据'}
          </button>
          <button
            onClick={handleImport}
            disabled={importing}
            className="btn btn-secondary"
          >
            {importing ? '导入中...' : '📥 导入JSON备份'}
          </button>
        </div>
        {backupResult && (
          <div className="mt-4 p-3 rounded-lg bg-green-50 text-green-800 text-sm">
            {backupResult}
          </div>
        )}
      </div>

      {/* 套餐模板导入 */}
      <div className="card p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">📦 套餐模板导入</h3>
        <p className="text-sm text-gray-500 mb-4">
          从抓取的JSON文件批量导入套餐模板。支持172号卡平台和号易平台的数据格式，系统会自动识别。
          已存在的套餐（按商品ID判断）不会重复导入，172数据会更新已有记录。
        </p>

        <div className="flex gap-4 flex-wrap">
          <button
            onClick={async () => {
              if (!confirm('确定要导入172套餐模板吗？\n文件：data/172-plans.json')) return
              setImportingPlans(true)
              try {
                const result = await window.electronAPI.plans.importFromFile('data/172-plans.json')
                setPlanImportResult(`172号卡平台：新增 ${result.imported} 条，更新 ${result.updated} 条（共 ${result.total} 条）`)
                onRefresh()
              } catch (e: any) {
                setPlanImportResult('导入失败: ' + e.message)
              } finally {
                setImportingPlans(false)
              }
            }}
            disabled={importingPlans}
            className="btn btn-primary"
          >
            {importingPlans ? '导入中...' : '📥 导入172套餐'}
          </button>

          <button
            onClick={async () => {
              if (!confirm('确定要导入号易套餐模板吗？\n文件：data/haoyi-plans-parsed.json')) return
              setImportingPlans(true)
              try {
                const result = await window.electronAPI.plans.importFromFile('data/haoyi-plans-parsed.json')
                setPlanImportResult(`号易平台：新增 ${result.imported} 条，更新 ${result.updated} 条（共 ${result.total} 条）`)
                onRefresh()
              } catch (e: any) {
                setPlanImportResult('导入失败: ' + e.message)
              } finally {
                setImportingPlans(false)
              }
            }}
            disabled={importingPlans}
            className="btn btn-secondary"
          >
            {importingPlans ? '导入中...' : '📥 导入号易套餐'}
          </button>
        </div>

        {planImportResult && (
          <div className="mt-4 p-3 rounded-lg bg-green-50 text-green-800 text-sm">
            {planImportResult}
          </div>
        )}
      </div>

      {/* 套餐类型说明 */}
      <div className="card p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">📋 套餐类型说明</h3>
        <div className="grid grid-cols-2 gap-4">
          <div className="p-4 bg-blue-50 rounded-lg">
            <h4 className="font-medium text-blue-900">性价比</h4>
            <p className="text-sm text-blue-700 mt-1">价格适中，流量够用，适合普通用户</p>
          </div>
          <div className="p-4 bg-green-50 rounded-lg">
            <h4 className="font-medium text-green-900">大流量</h4>
            <p className="text-sm text-green-700 mt-1">流量充足，适合重度使用者</p>
          </div>
          <div className="p-4 bg-purple-50 rounded-lg">
            <h4 className="font-medium text-purple-900">长期套餐</h4>
            <p className="text-sm text-purple-700 mt-1">优惠期长，适合不想频繁换卡的用户</p>
          </div>
          <div className="p-4 bg-orange-50 rounded-lg">
            <h4 className="font-medium text-orange-900">低价套餐</h4>
            <p className="text-sm text-orange-700 mt-1">价格最低，适合预算有限的用户</p>
          </div>
        </div>
      </div>

      {/* 关于 */}
      <div className="card p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">ℹ️ 关于</h3>
        <div className="space-y-2 text-sm text-gray-600">
          <p>流量卡管理系统 v1.0</p>
          <p>本地数据存储，隐私安全</p>
          <p>基于 Electron + React + SQLite 构建</p>
          <p>支持从172号卡平台导入订单数据</p>
          <p>支持172号卡API对接（产品查询、订单查询）</p>
        </div>
      </div>

      {/* 导入预览弹窗 */}
      {previewOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50" onClick={() => setPreviewOpen(false)}>
          <div className="bg-white rounded-xl shadow-xl w-[90vw] max-h-[80vh] flex flex-col" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between p-4 border-b">
              <h3 className="text-lg font-semibold">{previewTitle}</h3>
              <button onClick={() => setPreviewOpen(false)} className="text-gray-400 hover:text-gray-600 text-xl">✕</button>
            </div>
            <div className="flex-1 overflow-auto p-4">
              <p className="text-sm text-gray-500 mb-3">
                预览前 20 条数据（跳过原因：{previewSkippedReason}）
              </p>
              <div className="overflow-x-auto border rounded-lg">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 sticky top-0">
                    <tr>
                      {previewHeaders.slice(0, 8).map(h => (
                        <th key={h} className="px-3 py-2 text-left text-xs font-medium text-gray-500 whitespace-nowrap">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {previewRows.slice(0, 20).map((row, i) => (
                      <tr key={i} className="hover:bg-gray-50">
                        {previewHeaders.slice(0, 8).map(h => (
                          <td key={h} className="px-3 py-2 text-gray-600 whitespace-nowrap max-w-[200px] truncate" title={String(row[h] ?? '')}>
                            {String(row[h] ?? '-')}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {previewRows.length > 20 && (
                <p className="text-xs text-gray-400 mt-2">还有 {previewRows.length - 20} 条未显示</p>
              )}
            </div>
            <div className="flex justify-end gap-3 p-4 border-t">
              <button onClick={() => setPreviewOpen(false)} className="btn btn-secondary">取消</button>
              <button
                onClick={async () => {
                  if (!previewImportFn) return
                  setPreviewLoading(true)
                  try {
                    await previewImportFn(previewRows)
                    setPreviewOpen(false)
                  } catch (e) {
                    alert('导入失败')
                  } finally {
                    setPreviewLoading(false)
                  }
                }}
                disabled={previewLoading}
                className="btn btn-primary"
              >
                {previewLoading ? '导入中...' : `确认导入 ${previewRows.length} 条`}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
