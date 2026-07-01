import { app, BrowserWindow, ipcMain, Tray, Menu, Notification, nativeImage, dialog } from 'electron'
import path from 'path'
import log from 'electron-log'
import { autoUpdater } from 'electron-updater'
import type { UpdateInfo } from 'electron-updater'
import { Database } from './database'
import { testConnection, getProducts, getOrderInfo } from './api172'

const APP_ID = 'com.traffic-card.manager'

// 配置日志
log.transports.file.level = 'info'
log.transports.console.level = 'info'

if (process.platform === 'win32') {
  app.setAppUserModelId(APP_ID)
}

// ===== 单实例锁 =====
const gotTheLock = app.requestSingleInstanceLock()
if (!gotTheLock) {
  app.quit()
} else {
  app.on('second-instance', () => {
    // 第二个实例尝试启动时，聚焦到已有窗口
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore()
      mainWindow.show()
      mainWindow.focus()
    }
  })
}

// 配置自动更新
autoUpdater.logger = log
autoUpdater.autoDownload = false
autoUpdater.autoInstallOnAppQuit = true

let mainWindow: BrowserWindow | null = null
let db: Database | null = null
let tray: Tray | null = null
let expiryCheckTimer: ReturnType<typeof setInterval> | null = null
const notifiedCards = new Map<number, number>() // cardId -> lastNotifiedTimestamp
let updateCheckInProgress = false
let updateDownloadInProgress = false
let pendingUpdateInfo: UpdateInfo | null = null

function getAppIconPath() {
  return path.join(__dirname, '../build', process.platform === 'win32' ? 'icon.ico' : 'icon.png')
}

function createAppIcon() {
  try {
    const icon = nativeImage.createFromPath(getAppIconPath())
    return icon.isEmpty() ? undefined : icon
  } catch {
    return undefined
  }
}

function createWindow() {
  const icon = createAppIcon()

  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1200,
    minHeight: 800,
    title: '流量卡管理系统',
    icon,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  })
  mainWindow.setMenuBarVisibility(false)
  mainWindow.setAutoHideMenuBar(true)

  // 开发环境加载 Vite 开发服务器，生产环境加载打包后的文件
  if (process.env.VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL)
    mainWindow.webContents.openDevTools()
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'))
  }

  // 关闭时询问：最小化到托盘 or 退出
  mainWindow.on('close', (e) => {
    if (tray && !mainWindow?.isDestroyed()) {
      e.preventDefault()
      const result = dialog.showMessageBoxSync(mainWindow!, {
        type: 'question',
        buttons: ['最小化到托盘', '直接退出'],
        defaultId: 0,
        cancelId: 0,
        title: '关闭方式',
        message: '选择关闭后的行为',
        detail: '最小化到托盘：程序继续运行，双击托盘图标可恢复\n直接退出：完全关闭程序',
      })
      if (result === 0) {
        // 最小化到托盘
        mainWindow?.hide()
        tray.displayBalloon({ title: '流量卡管理系统', content: '已最小化到系统托盘，双击图标可恢复', icon })
      } else {
        // 直接退出
        tray?.destroy()
        tray = null
        if (db) db.close()
        app.quit()
      }
      return
    }
    mainWindow = null
  })

  // 窗口异常日志
  mainWindow.webContents.on('crashed', () => {
    log.error('渲染进程崩溃')
  })
}

// ===== 系统托盘 =====
function setupTray() {
  const icon = createAppIcon() ?? nativeImage.createEmpty()

  tray = new Tray(icon)
  tray.setToolTip('流量卡管理系统')

  const contextMenu = Menu.buildFromTemplate([
    {
      label: '显示主窗口',
      click: () => {
        mainWindow?.show()
        mainWindow?.focus()
      }
    },
    { type: 'separator' },
    {
      label: '立即检查到期提醒',
      click: () => {
        checkExpiryNotifications(true)
      }
    },
    { type: 'separator' },
    {
      label: '退出',
      click: () => {
        tray?.destroy()
        tray = null
        if (db) db.close()
        app.quit()
      }
    }
  ])

  tray.setContextMenu(contextMenu)

  // 双击托盘图标恢复窗口
  tray.on('double-click', () => {
    mainWindow?.show()
    mainWindow?.focus()
  })

  log.info('系统托盘已创建')
}

// ===== 到期通知检查 =====
function checkExpiryNotifications(manual = false) {
  if (!db) return

  try {
    const expiringCards = db.getExpiringSoon(30)
    if (!expiringCards || expiringCards.length === 0) {
      if (manual) {
        mainWindow?.webContents?.send('notification:message', '暂无即将到期的卡片')
      }
      return
    }

    const now = Date.now()
    const NOTIFICATION_INTERVAL = 24 * 60 * 60 * 1000 // 24小时内不重复通知

    // 分组：7天内到期 vs 30天内到期
    const urgent: typeof expiringCards = []
    const normal: typeof expiringCards = []

    for (const card of expiringCards) {
      const lastNotified = notifiedCards.get(card.id) || 0
      if (now - lastNotified < NOTIFICATION_INTERVAL && !manual) continue

      const daysLeft = Math.ceil(
        (new Date(card.promo_end).getTime() - now) / (1000 * 60 * 60 * 24)
      )

      if (daysLeft <= 7) {
        urgent.push(card)
      } else {
        normal.push(card)
      }
    }

    const toNotify = [...urgent, ...normal]
    if (toNotify.length === 0) return

    // 发送通知
    if (Notification.isSupported()) {
      const urgentCount = urgent.length
      const normalCount = normal.length

      let body = ''
      if (urgentCount > 0) {
        body += `🔴 ${urgentCount} 张卡将在 7 天内到期`
      }
      if (normalCount > 0) {
        if (body) body += '\n'
        body += `🟡 ${normalCount} 张卡将在 30 天内到期`
      }
      body += '\n点击查看详情'

      const notification = new Notification({
        title: '流量卡到期提醒',
        body,
        icon: getAppIconPath(),
        silent: false,
      })

      notification.on('click', () => {
        mainWindow?.show()
        mainWindow?.focus()
      })

      notification.show()

      // 记录已通知
      for (const card of toNotify) {
        notifiedCards.set(card.id, now)
      }

      log.info(`发送到期通知: ${toNotify.length} 张卡 (紧急:${urgentCount} 普通:${normalCount})`)
    }
  } catch (e) {
    log.error('检查到期通知失败:', e)
  }
}

// 初始化数据库
async function initDatabase() {
  const dbPath = path.join(app.getPath('userData'), 'traffic-cards.db')
  db = new Database(dbPath)
  await db.init()
  log.info('数据库路径:', dbPath)
}

// 注册 IPC 处理器
function registerIpcHandlers() {
  if (!db) return
  log.info('注册 IPC 处理器')

  // ===== 流量卡相关 =====
  ipcMain.handle('cards:getAll', (_event, filters) => {
    return db!.getCards(filters)
  })

  ipcMain.handle('cards:getById', (_event, id: number) => {
    return db!.getCardById(id)
  })

  ipcMain.handle('cards:create', (_event, card) => {
    return db!.createCard(card)
  })

  ipcMain.handle('cards:update', (_event, id: number, card) => {
    return db!.updateCard(id, card)
  })

  ipcMain.handle('cards:delete', (_event, id: number) => {
    return db!.deleteCard(id)
  })

  ipcMain.handle('cards:getStats', () => {
    return db!.getCardStats()
  })

  ipcMain.handle('cards:getMonthlyStats', (_event, year: number, month: number) => {
    return db!.getMonthlyStats(year, month)
  })

  ipcMain.handle('cards:getExpiringSoon', (_event, days: number) => {
    return db!.getExpiringSoon(days)
  })

  // ===== 客户相关 =====
  ipcMain.handle('customers:getAll', (_event, filters) => {
    return db!.getCustomers(filters)
  })

  ipcMain.handle('customers:create', (_event, customer) => {
    return db!.createCustomer(customer)
  })

  ipcMain.handle('customers:update', (_event, id: number, customer) => {
    return db!.updateCustomer(id, customer)
  })

  ipcMain.handle('customers:delete', (_event, id: number) => {
    return db!.deleteCustomer(id)
  })

  ipcMain.handle('customers:getById', (_event, id: number) => {
    return db!.getCustomerById(id)
  })

  ipcMain.handle('customers:getCards', (_event, id: number) => {
    return db!.getCustomerCards(id)
  })

  ipcMain.handle('customers:findDuplicates', () => {
    return db!.findDuplicateCustomers()
  })

  ipcMain.handle('customers:merge', (_event, keepId: number, mergeIds: number[]) => {
    return db!.mergeCustomers(keepId, mergeIds)
  })

  // ===== 财务相关 =====
  ipcMain.handle('finance:getProfitSummary', () => {
    return db!.getProfitSummary()
  })

  ipcMain.handle('finance:getMonthlyProfit', (_event, year: number) => {
    return db!.getMonthlyProfit(year)
  })

  ipcMain.handle('finance:getProfitByCarrier', () => {
    return db!.getProfitByCarrier()
  })

  ipcMain.handle('finance:getProfitByPlanType', () => {
    return db!.getProfitByPlanType()
  })

  // ===== 套餐模板管理 =====
  ipcMain.handle('plans:getAll', () => {
    return db!.getAllPlans()
  })

  ipcMain.handle('plans:import', (_event, plans: any[]) => {
    return db!.importPlans(plans)
  })

  ipcMain.handle('plans:match', (_event, cardName: string) => {
    return db!.matchPlan(cardName)
  })

  ipcMain.handle('plans:importFromFile', (_event, fileName: string) => {
    const fullPath = path.isAbsolute(fileName)
      ? fileName
      : path.join(app.getAppPath(), fileName)
    return db!.importPlansFromFile(fullPath)
  })

  ipcMain.handle('plans:delete', (_event, id: number) => {
    db!.deletePlan(id)
  })

  // ===== 数据备份 =====
  ipcMain.handle('backup:export', () => {
    return db!.exportData()
  })

  ipcMain.handle('backup:import', (_event, data) => {
    try {
      const result = db!.importData(data)
      log.info('数据导入成功:', result)
      return result
    } catch (e: any) {
      log.error('数据导入失败:', e.message)
      throw e
    }
  })

  // ===== 172号卡导入 =====
  ipcMain.handle('import:172', (_event, rows: any[]) => {
    const result = db!.importFrom172(rows)
    log.info('172导入:', result)
    return result
  })

  // ===== 号易导入 =====
  ipcMain.handle('import:haoyi', (_event, rows: any[]) => {
    const result = db!.importFromHaoyi(rows)
    log.info('号易导入:', result)
    return result
  })

  // ===== 172号卡API =====
  ipcMain.handle('api172:testConnection', async (_event, config) => {
    log.info('API测试连接')
    const result = await testConnection(config)
    log.info('API测试结果:', result)
    return result
  })

  ipcMain.handle('api172:getProducts', async (_event, config) => {
    return getProducts(config)
  })

  ipcMain.handle('api172:syncProducts', async (_event, config) => {
    log.info('开始从172 API同步产品')
    const result = await getProducts(config)
    if (result.code !== 0) {
      throw new Error(result.message || 'API返回错误')
    }
    const products = result.data || []
    log.info(`172 API返回 ${products.length} 个产品`)
    const syncResult = db!.syncPlansFrom172Api(products)
    log.info('产品同步完成:', syncResult)
    return syncResult
  })

  ipcMain.handle('api172:getOrderInfo', async (_event, config, orderId) => {
    log.info('查询172订单:', orderId)
    const result = await getOrderInfo(orderId, config)
    log.info('订单查询结果:', result)
    return result
  })

  // ===== API配置安全存储 =====
  ipcMain.handle('apiConfig:get', () => {
    return db!.getApiConfig()
  })

  ipcMain.handle('apiConfig:save', (_event, config) => {
    db!.saveApiConfig(config)
    log.info('API配置已保存')
  })
}

app.whenReady().then(async () => {
  log.info('应用启动')
  await initDatabase()
  log.info('数据库初始化完成')
  registerIpcHandlers()
  createWindow()
  log.info('窗口创建完成')
  setupAutoUpdate()
  setupTray()

  // 启动后 5 分钟检查第一次到期通知，之后每 30 分钟检查一次
  setTimeout(() => checkExpiryNotifications(), 5 * 60 * 1000)
  expiryCheckTimer = setInterval(() => checkExpiryNotifications(), 30 * 60 * 1000)

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    }
  })
})

app.on('window-all-closed', () => {
  // 如果有托盘，不关闭应用（最小化到托盘模式）
  if (tray) return
  log.info('应用关闭')
  if (expiryCheckTimer) clearInterval(expiryCheckTimer)
  if (db) db.close()
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

// ===== 自动更新 =====
function setupAutoUpdate() {
  if (!app.isPackaged) {
    log.info('开发环境跳过自动更新')
    return
  }

  autoUpdater.on('update-available', (info) => {
    log.info('发现新版本:', info.version)
    pendingUpdateInfo = info
    mainWindow?.webContents.send('update:available', info.version)
  })

  autoUpdater.on('update-not-available', () => {
    log.info('当前已是最新版本')
    mainWindow?.webContents.send('update:not-available')
  })

  autoUpdater.on('download-progress', (progress) => {
    const percent = Math.round(progress.percent)
    log.info('下载进度:', percent + '%')
    mainWindow?.webContents.send('update:progress', percent)
  })

  autoUpdater.on('error', (err) => {
    log.error('更新错误:', err)
    mainWindow?.webContents.send('update:error', err.message)
  })

  autoUpdater.on('update-downloaded', () => {
    log.info('更新下载完成，准备安装')
    updateDownloadInProgress = false
    mainWindow?.webContents.send('update:downloaded')
  })

  // 启动后检查更新（延迟10秒，避免影响启动速度）
  setTimeout(() => {
    checkForAppUpdates(false)
  }, 10000)
}

async function checkForAppUpdates(manual: boolean) {
  if (!app.isPackaged) {
    const message = '开发环境不检查更新'
    if (manual) mainWindow?.webContents.send('update:error', message)
    return { ok: false, message }
  }

  if (updateCheckInProgress) {
    return { ok: false, message: '正在检查更新' }
  }

  updateCheckInProgress = true
  try {
    const result = await autoUpdater.checkForUpdates()
    return { ok: true, updateInfo: result?.updateInfo ?? null }
  } catch (e: any) {
    const message = e?.message || '检查更新失败'
    log.info('检查更新失败（可能是首次运行或无网络）:', message)
    if (manual) mainWindow?.webContents.send('update:error', message)
    return { ok: false, message }
  } finally {
    updateCheckInProgress = false
  }
}

ipcMain.handle('update:check', async () => {
  return checkForAppUpdates(true)
})

ipcMain.handle('update:download', async () => {
  if (!app.isPackaged) {
    return { ok: false, message: '开发环境不下载更新' }
  }

  if (!pendingUpdateInfo) {
    return { ok: false, message: '没有可下载的新版本' }
  }

  if (updateDownloadInProgress) {
    return { ok: false, message: '正在下载更新' }
  }

  updateDownloadInProgress = true
  try {
    await autoUpdater.downloadUpdate()
    return { ok: true }
  } catch (e: any) {
    updateDownloadInProgress = false
    const message = e?.message || '下载更新失败'
    log.error('下载更新失败:', message)
    mainWindow?.webContents.send('update:error', message)
    return { ok: false, message }
  }
})

ipcMain.handle('update:install', () => {
  if (!app.isPackaged) {
    return { ok: false, message: '开发环境不安装更新' }
  }
  autoUpdater.quitAndInstall()
  return { ok: true }
})

// ===== 通知检查 =====
ipcMain.handle('notifications:checkNow', () => {
  checkExpiryNotifications(true)
})

ipcMain.handle('app:showWindow', () => {
  mainWindow?.show()
  mainWindow?.focus()
})

// 全局异常捕获
process.on('uncaughtException', (error) => {
  log.error('未捕获异常:', error)
})

process.on('unhandledRejection', (reason) => {
  log.error('未处理的 Promise 拒绝:', reason)
})
