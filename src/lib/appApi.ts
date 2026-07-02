import { invoke } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'
import type {
  Api172Config,
  AppApi,
  Card,
  Customer,
  ImportResult,
  PaginatedResult,
  Plan,
  PlanImportResult,
} from '../types'

const call = <T>(command: string, args?: Record<string, unknown>) =>
  args === undefined ? invoke<T>(command) : invoke<T>(command, args)

const on = async <T>(event: string, callback: (payload: T) => void) => {
  const unlisten = await listen<T>(event, eventData => callback(eventData.payload))
  return unlisten
}

export const appApi: AppApi = {
  cards: {
    getAll: filters => call<PaginatedResult<Card>>('cards_get_all', { filters }),
    getById: id => call<Card | null>('cards_get_by_id', { id }),
    create: card => call<Card>('cards_create', { card }),
    update: (id, card) => call<Card>('cards_update', { id, card }),
    delete: id => call<void>('cards_delete', { id }),
    getStats: () => call('cards_get_stats'),
    getMonthlyStats: (year, month) => call('cards_get_monthly_stats', { year, month }),
    getExpiringSoon: days => call<Card[]>('cards_get_expiring_soon', { days }),
  },
  customers: {
    getAll: filters => call<PaginatedResult<Customer>>('customers_get_all', { filters }),
    getById: id => call<Customer | null>('customers_get_by_id', { id }),
    create: customer => call<Customer>('customers_create', { customer }),
    update: (id, customer) => call<Customer>('customers_update', { id, customer }),
    delete: id => call<void>('customers_delete', { id }),
    getCards: id => call<Card[]>('customers_get_cards', { id }),
    findDuplicates: () => call<Customer[][]>('customers_find_duplicates'),
    merge: (keepId, mergeIds) => call<{ merged: number }>('customers_merge', { keepId, mergeIds }),
  },
  finance: {
    getProfitSummary: () => call('finance_get_profit_summary'),
    getMonthlyProfit: year => call('finance_get_monthly_profit', { year }),
    getProfitByCarrier: () => call('finance_get_profit_by_carrier'),
    getProfitByPlanType: () => call('finance_get_profit_by_plan_type'),
  },
  settings: {},
  plans: {
    getAll: () => call<Plan[]>('plans_get_all'),
    import: plans => call<PlanImportResult>('plans_import', { plans }),
    importFromFile: filePath => call<PlanImportResult>('plans_import_from_file', { filePath }),
    match: cardName => call<Plan | null>('plans_match', { cardName }),
    backfillCards: () => call<{ backfilled: number }>('plans_backfill_cards'),
    delete: id => call<void>('plans_delete', { id }),
  },
  backup: {
    export: () => call('backup_export'),
    import: data => call('backup_import', { data }),
  },
  import172: {
    import: rows => call<ImportResult>('import_172', { rows }),
  },
  importHaoyi: {
    import: rows => call<ImportResult>('import_haoyi', { rows }),
  },
  api172: {
    testConnection: (config: Api172Config) => call('api172_test_connection', { config }),
    getProducts: (config: Api172Config) => call('api172_get_products', { config }),
    syncProducts: (config: Api172Config) => call('api172_sync_products', { config }),
    getOrderInfo: (config: Api172Config, orderId: string) => call('api172_get_order_info', { config, orderId }),
  },
  apiConfig: {
    get: () => call('api_config_get'),
    save: config => call<void>('api_config_save', { config }),
  },
  update: {
    check: () => call('update_check'),
    download: () => call('update_download'),
    install: () => call('update_install'),
    onAvailable: callback => on<string>('update:available', callback),
    onNotAvailable: callback => on<null>('update:not-available', () => callback()),
    onProgress: callback => on<number>('update:progress', callback),
    onDownloaded: callback => on<null>('update:downloaded', () => callback()),
    onError: callback => on<string>('update:error', callback),
  },
  notifications: {
    checkNow: () => call<void>('notifications_check_now'),
    onMessage: callback => on<string>('notification:message', callback),
  },
  app: {
    showWindow: () => call<void>('app_show_window'),
    chooseCloseAction: action => call<void>('app_choose_close_action', { action }),
    onCloseRequest: callback => on<null>('app:close-request', () => callback()),
  },
}
