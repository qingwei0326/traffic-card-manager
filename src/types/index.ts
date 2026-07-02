// 流量卡类型
export interface Card {
  id: number
  card_name: string
  carrier: string
  plan_type: string
  monthly_price: number
  data_amount: string
  region?: string
  contract_period?: number
  renewal_reminder_days?: number
  apply_time: string
  activate_time: string
  promo_start: string
  promo_end: string
  phone_number: string
  customer_id: number | null
  customer_name?: string
  customer_phone?: string
  profit: number
  status: '使用中' | '待确认' | '已到期' | '已注销'
  notes: string
  external_order_id?: string
  id_card?: string
  address?: string
  express_company?: string
  express_number?: string
  first_charge_amount?: number
  source?: string
  created_at: string
  updated_at: string
}

// 客户类型
export interface Customer {
  id: number
  name: string
  phone: string
  wechat: string
  address: string
  notes: string
  tags?: string
  card_count?: number
  total_profit?: number
  created_at: string
  updated_at: string
}

// 统计数据
export interface CardStats {
  total: number
  active: number
  expired: number
  cancelled: number
  totalProfit: number
}

export interface MonthlyStats {
  newCards: number
  monthProfit: number
}

export interface ProfitSummary {
  totalProfit: number
  avgProfit: number
  totalCards: number
  monthProfit: number
  monthCards: number
}

export interface MonthlyProfitRow {
  month: string
  profit: number
  count: number
}

export interface ProfitByType {
  carrier?: string
  plan_type?: string
  profit: number
  count: number
}

// 筛选条件
export interface CardFilters {
  status?: string
  carrier?: string
  plan_type?: string
  search?: string
  page?: number
  pageSize?: number
}

// 分页结果
export interface PaginatedResult<T> {
  data: T[]
  total: number
  page: number
  pageSize: number
}

// 客户筛选
export interface CustomerFilters {
  search?: string
  tag?: string
  page?: number
  pageSize?: number
}

export interface ImportResult {
  imported: number
  updated: number
  skipped: number
  total: number
}

export interface PlanImportResult {
  imported: number
  updated: number
  backfilled: number
  total: number
  source?: string
}

// 套餐模板类型
export interface Plan {
  id: number
  code: string
  grab_code: string
  name: string
  carrier: string
  monthly_price: number
  data_amount: number
  promo_period: number
  contract_period: number
  first_charge: number
  activation: string
  region: string
  commission: string
  note: string
  age_limit: string
  forbid_regions: string
  express: string
  source: string
  sale_status: string
  created_at: string
}

export interface Api172Config {
  user_id: string
  secret: string
}

export interface UpdateResult {
  ok: boolean
  message?: string
}

export interface AppApi {
  cards: {
    getAll: (filters?: CardFilters) => Promise<PaginatedResult<Card>>
    getById: (id: number) => Promise<Card | null>
    create: (card: Partial<Card>) => Promise<Card>
    update: (id: number, card: Partial<Card>) => Promise<Card>
    delete: (id: number) => Promise<void>
    getStats: () => Promise<CardStats>
    getMonthlyStats: (year: number, month: number) => Promise<MonthlyStats>
    getExpiringSoon: (days: number) => Promise<Card[]>
  }
  customers: {
    getAll: (filters?: CustomerFilters) => Promise<PaginatedResult<Customer>>
    getById: (id: number) => Promise<Customer | null>
    create: (customer: Partial<Customer>) => Promise<Customer>
    update: (id: number, customer: Partial<Customer>) => Promise<Customer>
    delete: (id: number) => Promise<void>
    getCards: (id: number) => Promise<Card[]>
    findDuplicates: () => Promise<Customer[][]>
    merge: (keepId: number, mergeIds: number[]) => Promise<{ merged: number }>
  }
  finance: {
    getProfitSummary: () => Promise<ProfitSummary>
    getMonthlyProfit: (year: number) => Promise<MonthlyProfitRow[]>
    getProfitByCarrier: () => Promise<ProfitByType[]>
    getProfitByPlanType: () => Promise<ProfitByType[]>
  }
  settings: Record<string, never>
  plans: {
    getAll: () => Promise<Plan[]>
    import: (plans: unknown[]) => Promise<PlanImportResult>
    importFromFile: (filePath: string) => Promise<PlanImportResult>
    match: (cardName: string) => Promise<Plan | null>
    backfillCards: () => Promise<{ backfilled: number }>
    delete: (id: number) => Promise<void>
  }
  backup: {
    export: () => Promise<any>
    import: (data: any) => Promise<any>
  }
  import172: {
    import: (rows: unknown[]) => Promise<ImportResult>
  }
  importHaoyi: {
    import: (rows: unknown[]) => Promise<ImportResult>
  }
  api172: {
    testConnection: (config: Api172Config) => Promise<{ success: boolean; message: string }>
    getProducts: (config: Api172Config) => Promise<any>
    syncProducts: (config: Api172Config) => Promise<PlanImportResult>
    getOrderInfo: (config: Api172Config, orderId: string) => Promise<any>
  }
  apiConfig: {
    get: () => Promise<Api172Config>
    save: (config: Api172Config) => Promise<void>
  }
  update: {
    check: () => Promise<UpdateResult>
    download: () => Promise<UpdateResult>
    install: () => Promise<UpdateResult>
    onAvailable: (callback: (version: string) => void) => Promise<() => void>
    onNotAvailable: (callback: () => void) => Promise<() => void>
    onProgress: (callback: (percent: number) => void) => Promise<() => void>
    onDownloaded: (callback: () => void) => Promise<() => void>
    onError: (callback: (message: string) => void) => Promise<() => void>
  }
  notifications: {
    checkNow: () => Promise<void>
    onMessage: (callback: (message: string) => void) => Promise<() => void>
  }
  app: {
    showWindow: () => Promise<void>
    chooseCloseAction: (action: 'minimize' | 'quit') => Promise<void>
    onCloseRequest: (callback: () => void) => Promise<() => void>
  }
}
