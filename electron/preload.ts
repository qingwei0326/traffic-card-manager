import { contextBridge, ipcRenderer } from 'electron'

// 暴露给渲染进程的 API
contextBridge.exposeInMainWorld('electronAPI', {
  // ===== 流量卡 =====
  cards: {
    getAll: (filters?: any) => ipcRenderer.invoke('cards:getAll', filters),
    getById: (id: number) => ipcRenderer.invoke('cards:getById', id),
    create: (card: any) => ipcRenderer.invoke('cards:create', card),
    update: (id: number, card: any) => ipcRenderer.invoke('cards:update', id, card),
    delete: (id: number) => ipcRenderer.invoke('cards:delete', id),
    getStats: () => ipcRenderer.invoke('cards:getStats'),
    getMonthlyStats: (year: number, month: number) => ipcRenderer.invoke('cards:getMonthlyStats', year, month),
    getExpiringSoon: (days: number) => ipcRenderer.invoke('cards:getExpiringSoon', days),
  },

  // ===== 客户 =====
  customers: {
    getAll: (filters?: any) => ipcRenderer.invoke('customers:getAll', filters),
    getById: (id: number) => ipcRenderer.invoke('customers:getById', id),
    create: (customer: any) => ipcRenderer.invoke('customers:create', customer),
    update: (id: number, customer: any) => ipcRenderer.invoke('customers:update', id, customer),
    delete: (id: number) => ipcRenderer.invoke('customers:delete', id),
    getCards: (id: number) => ipcRenderer.invoke('customers:getCards', id),
    findDuplicates: () => ipcRenderer.invoke('customers:findDuplicates'),
    merge: (keepId: number, mergeIds: number[]) => ipcRenderer.invoke('customers:merge', keepId, mergeIds),
  },

  // ===== 财务 =====
  finance: {
    getProfitSummary: () => ipcRenderer.invoke('finance:getProfitSummary'),
    getMonthlyProfit: (year: number) => ipcRenderer.invoke('finance:getMonthlyProfit', year),
    getProfitByCarrier: () => ipcRenderer.invoke('finance:getProfitByCarrier'),
    getProfitByPlanType: () => ipcRenderer.invoke('finance:getProfitByPlanType'),
  },

  // ===== 设置 =====
  settings: {},

  // ===== 套餐模板 =====
  plans: {
    getAll: () => ipcRenderer.invoke('plans:getAll'),
    import: (plans: any[]) => ipcRenderer.invoke('plans:import', plans),
    importFromFile: (filePath: string) => ipcRenderer.invoke('plans:importFromFile', filePath),
    match: (cardName: string) => ipcRenderer.invoke('plans:match', cardName),
    delete: (id: number) => ipcRenderer.invoke('plans:delete', id),
  },

  // ===== 备份 =====
  backup: {
    export: () => ipcRenderer.invoke('backup:export'),
    import: (data: any) => ipcRenderer.invoke('backup:import', data),
  },

  // ===== 172号卡导入 =====
  import172: {
    import: (rows: any[]) => ipcRenderer.invoke('import:172', rows),
  },

  // ===== 号易导入 =====
  importHaoyi: {
    import: (rows: any[]) => ipcRenderer.invoke('import:haoyi', rows),
  },

  // ===== 172号卡API =====
  api172: {
    testConnection: (config: { user_id: string; secret: string }) =>
      ipcRenderer.invoke('api172:testConnection', config),
    getProducts: (config: { user_id: string; secret: string }) =>
      ipcRenderer.invoke('api172:getProducts', config),
    syncProducts: (config: { user_id: string; secret: string }) =>
      ipcRenderer.invoke('api172:syncProducts', config),
    getOrderInfo: (config: { user_id: string; secret: string }, orderId: string) =>
      ipcRenderer.invoke('api172:getOrderInfo', config, orderId),
  },

  // ===== API配置安全存储 =====
  apiConfig: {
    get: () => ipcRenderer.invoke('apiConfig:get'),
    save: (config: { user_id: string; secret: string }) => ipcRenderer.invoke('apiConfig:save', config),
  },

  // ===== 自动更新 =====
  update: {
    check: () => ipcRenderer.invoke('update:check'),
    download: () => ipcRenderer.invoke('update:download'),
    install: () => ipcRenderer.invoke('update:install'),
    onAvailable: (callback: (version: string) => void) => ipcRenderer.on('update:available', (_e, v) => callback(v)),
    onNotAvailable: (callback: () => void) => ipcRenderer.on('update:not-available', () => callback()),
    onProgress: (callback: (percent: number) => void) => ipcRenderer.on('update:progress', (_e, percent) => callback(percent)),
    onDownloaded: (callback: () => void) => ipcRenderer.on('update:downloaded', () => callback()),
    onError: (callback: (message: string) => void) => ipcRenderer.on('update:error', (_e, message) => callback(message)),
  },

  // ===== 通知 =====
  notifications: {
    checkNow: () => ipcRenderer.invoke('notifications:checkNow'),
    onMessage: (callback: (msg: string) => void) => ipcRenderer.on('notification:message', (_e, msg) => callback(msg)),
  },

  // ===== 应用控制 =====
  app: {
    showWindow: () => ipcRenderer.invoke('app:showWindow'),
  },
})
