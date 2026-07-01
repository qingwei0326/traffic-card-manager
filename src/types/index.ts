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
  skipped: number
  total: number
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

// 窗口类型声明
declare global {
  interface Window {
    electronAPI: {
      cards: {
        getAll: (filters?: CardFilters) => Promise<PaginatedResult<Card>>
        getById: (id: number) => Promise<Card>
        create: (card: Partial<Card>) => Promise<Card>
        update: (id: number, card: Partial<Card>) => Promise<Card>
        delete: (id: number) => Promise<any>
        getStats: () => Promise<CardStats>
        getMonthlyStats: (year: number, month: number) => Promise<MonthlyStats>
        getExpiringSoon: (days: number) => Promise<Card[]>
      }
      customers: {
        getAll: (filters?: CustomerFilters) => Promise<PaginatedResult<Customer>>
        getById: (id: number) => Promise<Customer>
        create: (customer: Partial<Customer>) => Promise<Customer>
        update: (id: number, customer: Partial<Customer>) => Promise<Customer>
        delete: (id: number) => Promise<any>
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
      settings: {}
      plans: {
        getAll: () => Promise<Plan[]>
        import: (plans: any[]) => Promise<{ imported: number; total: number }>
        importFromFile: (filePath: string) => Promise<{ imported: number; updated: number; total: number; source: string }>
        match: (cardName: string) => Promise<Plan | null>
        delete: (id: number) => Promise<void>
      }
      backup: {
        export: () => Promise<any>
        import: (data: any) => Promise<any>
      }
      import172: {
        import: (rows: any[]) => Promise<{ imported: number; skipped: number; total: number }>
      }
      importHaoyi: {
        import: (rows: any[]) => Promise<{ imported: number; skipped: number; total: number }>
      }
      api172: {
        testConnection: (config: { user_id: string; secret: string }) => Promise<{ success: boolean; message: string }>
        getProducts: (config: { user_id: string; secret: string }) => Promise<any>
        syncProducts: (config: { user_id: string; secret: string }) => Promise<{ imported: number; updated: number; total: number }>
        getOrderInfo: (config: { user_id: string; secret: string }, orderId: string) => Promise<any>
      }
      apiConfig: {
        get: () => Promise<{ user_id: string; secret: string }>
        save: (config: { user_id: string; secret: string }) => Promise<void>
      }
      update: {
        check: () => Promise<any>
        download: () => Promise<{ ok: boolean; message?: string }>
        install: () => Promise<{ ok: boolean; message?: string }>
        onAvailable: (callback: (version: string) => void) => void
        onNotAvailable: (callback: () => void) => void
        onProgress: (callback: (percent: number) => void) => void
        onDownloaded: (callback: () => void) => void
        onError: (callback: (message: string) => void) => void
      }
      notifications: {
        checkNow: () => Promise<void>
        onMessage: (callback: (msg: string) => void) => void
      }
      app: {
        showWindow: () => Promise<void>
      }
    }
  }
}
