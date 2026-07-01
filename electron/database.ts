// eslint-disable-next-line @typescript-eslint/no-var-requires
const initSqlJs = require('sql.js')
import fs from 'fs'
import path from 'path'
import { CARD_WRITE_FIELDS, buildCardSearchClause, getCardWriteValues } from './cardSql'

function rowsToObjects(columns: string[], values: any[][]): any[] {
  return values.map(row => {
    const obj: any = {}
    columns.forEach((col, i) => {
      obj[col] = row[i]
    })
    return obj
  })
}

export class Database {
  private db: any | null = null
  private dbPath: string
  private configPath: string
  private saveTimer: ReturnType<typeof setTimeout> | null = null

  constructor(dbPath: string) {
    this.dbPath = dbPath
    this.configPath = path.join(path.dirname(dbPath), 'config.json')
  }

  async init() {
    const SQL = await initSqlJs()

    // 尝试从磁盘加载现有数据库
    if (fs.existsSync(this.dbPath)) {
      const buffer = fs.readFileSync(this.dbPath)
      this.db = new SQL.Database(buffer)
    } else {
      this.db = new SQL.Database()
    }

    // 启用外键约束
    this.db.run('PRAGMA foreign_keys = ON')

    // 创建客户表
    this.db.run(`
      CREATE TABLE IF NOT EXISTS customers (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        phone TEXT,
        wechat TEXT,
        address TEXT,
        notes TEXT,
        created_at TEXT DEFAULT (datetime('now', 'localtime')),
        updated_at TEXT DEFAULT (datetime('now', 'localtime'))
      )
    `)

    // 创建流量卡表
    this.db.run(`
      CREATE TABLE IF NOT EXISTS cards (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        card_name TEXT NOT NULL,
        carrier TEXT NOT NULL,
        plan_type TEXT NOT NULL,
        monthly_price REAL DEFAULT 0,
        data_amount TEXT,
        region TEXT,
        contract_period INTEGER DEFAULT 0,
        renewal_reminder_days INTEGER DEFAULT 30,
        apply_time TEXT,
        activate_time TEXT,
        promo_start TEXT,
        promo_end TEXT,
        phone_number TEXT,
        customer_id INTEGER,
        profit REAL DEFAULT 0,
        status TEXT DEFAULT '使用中',
        notes TEXT,
        created_at TEXT DEFAULT (datetime('now', 'localtime')),
        updated_at TEXT DEFAULT (datetime('now', 'localtime')),
        FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE SET NULL
      )
    `)

    // 为现有表添加新字段（如果不存在）
    const alterStatements = [
      "ALTER TABLE cards ADD COLUMN external_order_id TEXT",
      "ALTER TABLE cards ADD COLUMN id_card TEXT",
      "ALTER TABLE cards ADD COLUMN address TEXT",
      "ALTER TABLE cards ADD COLUMN express_company TEXT",
      "ALTER TABLE cards ADD COLUMN express_number TEXT",
      "ALTER TABLE cards ADD COLUMN first_charge_amount REAL DEFAULT 0",
      "ALTER TABLE cards ADD COLUMN source TEXT",
      "ALTER TABLE cards ADD COLUMN region TEXT",
      "ALTER TABLE cards ADD COLUMN contract_period INTEGER DEFAULT 0",
      "ALTER TABLE cards ADD COLUMN renewal_reminder_days INTEGER DEFAULT 30",
    ]

    for (const sql of alterStatements) {
      try {
        this.db.run(sql)
      } catch (e: any) {
        // 只忽略"column already exists"错误，其他错误打印
        if (!e?.message?.includes('duplicate column')) {
          console.error('Schema migration error:', sql, e?.message)
        }
      }
    }

    // 为 customers 表添加新字段
    const customerAlterStatements = [
      "ALTER TABLE customers ADD COLUMN tags TEXT",
    ]
    for (const sql of customerAlterStatements) {
      try { this.db.run(sql) } catch (e: any) {
        if (!e?.message?.includes('duplicate column')) {
          console.error('Schema migration error:', sql, e?.message)
        }
      }
    }

    // 创建套餐模板表
    this.db.run(`
      CREATE TABLE IF NOT EXISTS plans (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        code TEXT UNIQUE,
        grab_code TEXT,
        name TEXT NOT NULL,
        carrier TEXT,
        monthly_price REAL DEFAULT 0,
        data_amount INTEGER DEFAULT 0,
        promo_period INTEGER DEFAULT 0,
        contract_period INTEGER DEFAULT 0,
        first_charge INTEGER DEFAULT 0,
        activation TEXT,
        region TEXT DEFAULT '全国',
        commission TEXT,
        note TEXT,
        age_limit TEXT,
        forbid_regions TEXT,
        express TEXT,
        source TEXT DEFAULT '号易平台',
        created_at TEXT DEFAULT (datetime('now', 'localtime'))
      )
    `)

    // 为plans表添加新字段
    const planAlterStatements = [
      "ALTER TABLE plans ADD COLUMN age_limit TEXT",
      "ALTER TABLE plans ADD COLUMN forbid_regions TEXT",
      "ALTER TABLE plans ADD COLUMN express TEXT",
      "ALTER TABLE plans ADD COLUMN sale_status TEXT DEFAULT '在售'",
    ]
    for (const sql of planAlterStatements) {
      try { this.db.run(sql) } catch (e: any) {
        if (!e?.message?.includes('duplicate column')) {
          console.error('Schema migration error:', sql, e?.message)
        }
      }
    }

    // 修复 region 数据：从套餐名中提取正确的限发区域
    try {
      const plans = this.query('SELECT id, name, region, forbid_regions FROM plans')
      for (const p of plans) {
        const m = p.name.match(/【([^】]+)】/)
        if (m) {
          const tag = m[1]
          if (tag === '发全国' || tag === '全国') continue
          let newRegion = tag.replace(/^只发/, '').replace(/^可发/, '')
          if (newRegion && newRegion !== '全国' && p.region !== newRegion) {
            this.execute('UPDATE plans SET region = ? WHERE id = ?', [newRegion, p.id])
            // 同时修复 forbid_regions：移除与 region 重叠的部分
            if (p.forbid_regions) {
              const regionParts = newRegion.split(/[/、]/).map((s: string) => s.replace(/省|市/g, '').trim())
              const forbidParts = p.forbid_regions.split(/[,，、]/).map((s: string) => s.trim())
              const cleaned = forbidParts.filter((f: string) => {
                const fc = f.replace(/省|市|壮族自治区|自治区/g, '').trim()
                return !regionParts.includes(fc)
              })
              this.execute('UPDATE plans SET forbid_regions = ? WHERE id = ?', [cleaned.join('、'), p.id])
            }
          }
        }
      }
    } catch (e) {
      // ignore
    }

    // 创建索引
    this.db.run('CREATE INDEX IF NOT EXISTS idx_cards_customer_id ON cards(customer_id)')
    this.db.run('CREATE INDEX IF NOT EXISTS idx_cards_status ON cards(status)')
    this.db.run('CREATE INDEX IF NOT EXISTS idx_cards_promo_end ON cards(promo_end)')
    this.db.run('CREATE INDEX IF NOT EXISTS idx_cards_apply_time ON cards(apply_time)')
    this.db.run('CREATE INDEX IF NOT EXISTS idx_cards_region ON cards(region)')
    this.db.run('CREATE INDEX IF NOT EXISTS idx_plans_name ON plans(name)')
    this.db.run('CREATE INDEX IF NOT EXISTS idx_plans_carrier ON plans(carrier)')

    this.save()

    // 修复月租为 0 的卡片：从套餐名提取价格
    this.fixMonthlyPrices()

    // 启动时自动导入套餐模板（如果表为空）
    this.autoImportPlans()
  }

  private autoImportPlans() {
    try {
      const count = this.db!.exec('SELECT COUNT(*) FROM plans')
      if (count.length > 0 && count[0].values[0][0] > 0) return // 已有数据，跳过

      // 从项目目录下的 data 文件导入
      const jsonPath = path.join(__dirname, '..', 'data', 'haoyi-plans-parsed.json')
      if (!fs.existsSync(jsonPath)) return

      const raw = fs.readFileSync(jsonPath, 'utf-8')
      const plans = JSON.parse(raw)
      if (!Array.isArray(plans) || plans.length === 0) return

      console.log('首次启动，自动导入 ' + plans.length + ' 个套餐模板...')
      this.importPlans(plans)
      console.log('套餐模板导入完成')
    } catch (e) {
      console.error('自动导入套餐失败:', e)
    }
  }

  private fixMonthlyPrices() {
    try {
      // 找出月租为 0 但套餐名里有价格的卡片
      const cards = this.query("SELECT id, card_name, monthly_price FROM cards WHERE monthly_price = 0 OR monthly_price IS NULL")
      let fixed = 0
      for (const card of cards) {
        const price = this.parseMonthlyPrice(card.card_name)
        if (price > 0) {
          this.execute('UPDATE cards SET monthly_price = ? WHERE id = ?', [price, card.id])
          fixed++
        }
      }
      // 也尝试匹配套餐模板补全
      const zeroCards = this.query("SELECT id, card_name FROM cards WHERE monthly_price = 0 OR monthly_price IS NULL")
      for (const card of zeroCards) {
        const plan = this.matchPlan(card.card_name)
        if (plan && plan.monthly_price > 0) {
          this.execute('UPDATE cards SET monthly_price = ? WHERE id = ?', [plan.monthly_price, card.id])
          fixed++
        }
      }
      if (fixed > 0) {
        console.log('[DB] 修复了 ' + fixed + ' 张卡片的月租')
        this.save()
      }
    } catch (e) {
      console.error('[DB] 修复月租失败:', e)
    }
  }

  // 延迟批量保存：500ms内的多次写操作只触发一次磁盘写入
  save() {
    if (this.saveTimer) clearTimeout(this.saveTimer)
    this.saveTimer = setTimeout(() => {
      this.flushSave()
    }, 500)
  }

  // 立即写入磁盘（用于close和关键操作）
  private flushSave() {
    if (!this.db) return
    try {
      const data = this.db.export()
      const buffer = Buffer.from(data)
      const dir = path.dirname(this.dbPath)
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true })
      }
      // 先写临时文件再原子替换，防止写入中途崩溃导致数据损坏
      const tmpPath = this.dbPath + '.tmp'
      fs.writeFileSync(tmpPath, buffer)
      fs.renameSync(tmpPath, this.dbPath)
    } catch (e) {
      console.error('[DB] 保存数据库失败:', e)
    }
  }

  close() {
    if (this.saveTimer) clearTimeout(this.saveTimer)
    this.flushSave()
    this.db?.close()
    this.db = null
  }

  // ===== API配置管理（安全存储在主进程） =====
  // secret 用 base64 编码，防止明文泄露

  getApiConfig(): { user_id: string; secret: string } {
    try {
      if (fs.existsSync(this.configPath)) {
        const raw = fs.readFileSync(this.configPath, 'utf-8')
        const config = JSON.parse(raw)
        const secret = config.secret_enc ? Buffer.from(config.secret_enc, 'base64').toString('utf-8') : (config.secret || '')
        return { user_id: config.user_id || '', secret }
      }
    } catch {}
    return { user_id: '', secret: '' }
  }

  saveApiConfig(config: { user_id: string; secret: string }) {
    const data = {
      user_id: config.user_id,
      secret_enc: Buffer.from(config.secret, 'utf-8').toString('base64'),
    }
    fs.writeFileSync(this.configPath, JSON.stringify(data, null, 2))
  }

  // 辅助方法：执行查询并返回结果数组
  private query(sql: string, params: any[] = []): any[] {
    if (!this.db) throw new Error('数据库未初始化')
    const stmt = this.db.prepare(sql)
    if (params.length > 0) {
      stmt.bind(params)
    }
    const results: any[] = []
    while (stmt.step()) {
      results.push(stmt.getAsObject())
    }
    stmt.free()
    return results
  }

  // 辅助方法：执行查询并返回单条结果
  private queryOne(sql: string, params: any[] = []): any | null {
    const results = this.query(sql, params)
    return results.length > 0 ? results[0] : null
  }

  // 辅助方法：执行写操作
  private execute(sql: string, params: any[] = []): void {
    if (!this.db) throw new Error('数据库未初始化')
    this.db.run(sql, params)
  }

  // 辅助方法：获取最后插入的 ID
  private getLastInsertId(): number {
    const result = this.queryOne('SELECT last_insert_rowid() as id')
    return result?.id || 0
  }

  // ===== 流量卡操作 =====

  getCards(filters?: { status?: string; carrier?: string; plan_type?: string; search?: string; page?: number; pageSize?: number }) {
    let whereSql = ' WHERE 1=1'
    const params: any[] = []

    if (filters?.status && filters.status !== '全部') {
      whereSql += ' AND c.status = ?'
      params.push(filters.status)
    }
    if (filters?.carrier && filters.carrier !== '全部') {
      whereSql += ' AND c.carrier = ?'
      params.push(filters.carrier)
    }
    if (filters?.plan_type && filters.plan_type !== '全部') {
      whereSql += ' AND c.plan_type = ?'
      params.push(filters.plan_type)
    }
    if (filters?.search) {
      const searchClause = buildCardSearchClause(filters.search)
      whereSql += searchClause.sql
      params.push(...searchClause.params)
    }

    // 查总数
    const countResult = this.queryOne(`SELECT COUNT(*) as total FROM cards c${whereSql}`, params)
    const total = countResult?.total || 0

    // 分页查询
    const page = filters?.page || 1
    const pageSize = filters?.pageSize || 50
    const offset = (page - 1) * pageSize

    const dataSql = `
      SELECT c.*, cu.name as customer_name, cu.phone as customer_phone
      FROM cards c
      LEFT JOIN customers cu ON c.customer_id = cu.id
      ${whereSql}
      ORDER BY c.created_at DESC
      LIMIT ? OFFSET ?
    `
    const data = this.query(dataSql, [...params, pageSize, offset])
    return { data, total, page, pageSize }
  }

  getCardById(id: number) {
    return this.queryOne(`
      SELECT c.*, cu.name as customer_name, cu.phone as customer_phone
      FROM cards c
      LEFT JOIN customers cu ON c.customer_id = cu.id
      WHERE c.id = ?
    `, [id])
  }

  createCard(card: any) {
    const placeholders = CARD_WRITE_FIELDS.map(() => '?').join(', ')
    this.execute(`
      INSERT INTO cards (${CARD_WRITE_FIELDS.join(', ')})
      VALUES (${placeholders})
    `, getCardWriteValues(card))
    this.save()
    const id = this.getLastInsertId()
    return { id, ...card }
  }

  updateCard(id: number, card: any) {
    const assignments = CARD_WRITE_FIELDS.map(field => `${field} = ?`).join(',\n        ')
    this.execute(`
      UPDATE cards SET
        ${assignments},
        updated_at = datetime('now', 'localtime')
      WHERE id = ?
    `, [...getCardWriteValues(card), id])
    this.save()
    return this.getCardById(id)
  }

  deleteCard(id: number) {
    this.execute('DELETE FROM cards WHERE id = ?', [id])
    this.save()
  }

  getCardStats() {
    const total = this.queryOne('SELECT COUNT(*) as count FROM cards')
    const active = this.queryOne("SELECT COUNT(*) as count FROM cards WHERE status = '使用中'")
    const expired = this.queryOne("SELECT COUNT(*) as count FROM cards WHERE status = '已到期'")
    const cancelled = this.queryOne("SELECT COUNT(*) as count FROM cards WHERE status = '已注销'")
    const totalProfit = this.queryOne('SELECT COALESCE(SUM(profit), 0) as total FROM cards')

    return {
      total: total?.count || 0,
      active: active?.count || 0,
      expired: expired?.count || 0,
      cancelled: cancelled?.count || 0,
      totalProfit: totalProfit?.total || 0,
    }
  }

  getMonthlyStats(year: number, month: number) {
    const monthStr = `${year}-${String(month).padStart(2, '0')}`
    const newCards = this.queryOne(`
      SELECT COUNT(*) as count FROM cards
      WHERE strftime('%Y-%m', apply_time) = ?
    `, [monthStr])

    const monthProfit = this.queryOne(`
      SELECT COALESCE(SUM(profit), 0) as total FROM cards
      WHERE strftime('%Y-%m', apply_time) = ?
    `, [monthStr])

    return {
      newCards: newCards?.count || 0,
      monthProfit: monthProfit?.total || 0,
    }
  }

  getExpiringSoon(days: number) {
    const now = new Date()
    const endDate = new Date(now)
    endDate.setDate(endDate.getDate() + days)
    // 使用本地日期而非 UTC，避免时区偏移
    const toLocalDate = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    const endDateStr = toLocalDate(endDate)
    const todayStr = toLocalDate(now)

    return this.query(`
      SELECT c.*, cu.name as customer_name, cu.phone as customer_phone
      FROM cards c
      LEFT JOIN customers cu ON c.customer_id = cu.id
      WHERE c.status = '使用中'
        AND c.promo_end >= ?
        AND julianday(c.promo_end) - julianday(?) <= COALESCE(c.renewal_reminder_days, ?)
      ORDER BY c.promo_end ASC
    `, [todayStr, todayStr, days])
  }

  // ===== 客户操作 =====

  getCustomers(filters?: { search?: string; tag?: string; page?: number; pageSize?: number }) {
    let whereSql = ''
    const params: any[] = []

    if (filters?.search) {
      const s = `%${filters.search}%`
      whereSql = ' WHERE (c.name LIKE ? OR c.phone LIKE ? OR c.wechat LIKE ?)'
      params.push(s, s, s)
    }

    if (filters?.tag) {
      const tagClause = ` c.tags LIKE ? `
      whereSql += whereSql ? ` AND ${tagClause}` : ` WHERE ${tagClause}`
      params.push(`%${filters.tag}%`)
    }

    const countResult = this.queryOne(`SELECT COUNT(*) as total FROM customers c${whereSql}`, params)
    const total = countResult?.total || 0

    const page = filters?.page || 1
    const pageSize = filters?.pageSize || 50
    const offset = (page - 1) * pageSize

    const data = this.query(`
      SELECT c.*,
        (SELECT COUNT(*) FROM cards WHERE customer_id = c.id) as card_count,
        (SELECT COALESCE(SUM(profit), 0) FROM cards WHERE customer_id = c.id) as total_profit
      FROM customers c
      ${whereSql}
      ORDER BY c.created_at DESC
      LIMIT ? OFFSET ?
    `, [...params, pageSize, offset])
    return { data, total, page, pageSize }
  }

  getCustomerById(id: number) {
    return this.queryOne('SELECT * FROM customers WHERE id = ?', [id])
  }

  createCustomer(customer: any) {
    this.execute(`
      INSERT INTO customers (name, phone, wechat, address, notes, tags)
      VALUES (?, ?, ?, ?, ?, ?)
    `, [customer.name, customer.phone, customer.wechat, customer.address, customer.notes || '', customer.tags || ''])
    this.save()
    const id = this.getLastInsertId()
    return { id, ...customer }
  }

  updateCustomer(id: number, customer: any) {
    this.execute(`
      UPDATE customers SET
        name = ?, phone = ?, wechat = ?, address = ?, notes = ?, tags = ?,
        updated_at = datetime('now', 'localtime')
      WHERE id = ?
    `, [customer.name, customer.phone, customer.wechat, customer.address, customer.notes, customer.tags || '', id])
    this.save()
    return this.getCustomerById(id)
  }

  deleteCustomer(id: number) {
    this.execute('DELETE FROM customers WHERE id = ?', [id])
    this.save()
  }

  getCustomerCards(customerId: number) {
    return this.query(`
      SELECT * FROM cards WHERE customer_id = ? ORDER BY created_at DESC
    `, [customerId])
  }

  // 查找重复客户（按名字或手机号）
  findDuplicateCustomers() {
    // 按名字分组找重复
    const byName = this.query(`
      SELECT name, GROUP_CONCAT(id) as ids, COUNT(*) as cnt
      FROM customers GROUP BY name HAVING cnt > 1
    `)

    // 按手机号分组找重复（排除空号）
    const byPhone = this.query(`
      SELECT phone, GROUP_CONCAT(id) as ids, COUNT(*) as cnt
      FROM customers WHERE phone IS NOT NULL AND phone != ''
      GROUP BY phone HAVING cnt > 1
    `)

    // 合并去重：收集所有需要合并的客户ID组
    const groups: Map<string, number[]> = new Map()

    for (const row of byName) {
      const ids = String(row.ids).split(',').map(Number).sort()
      const key = ids.join(',')
      if (!groups.has(key)) groups.set(key, ids)
    }
    for (const row of byPhone) {
      const ids = String(row.ids).split(',').map(Number).sort()
      const key = ids.join(',')
      if (!groups.has(key)) groups.set(key, ids)
    }

    // 如果两个组有交集，合并它们
    const mergedGroups: number[][] = []
    const used = new Set<number>()

    for (const ids of groups.values()) {
      if (ids.some(id => used.has(id))) {
        // 找到已有的组，合并进去
        const existing = mergedGroups.find(g => ids.some(id => g.includes(id)))
        if (existing) {
          for (const id of ids) {
            if (!existing.includes(id)) existing.push(id)
            used.add(id)
          }
        }
      } else {
        mergedGroups.push([...ids])
        ids.forEach(id => used.add(id))
      }
    }

    // 查出每个客户详情
    const result = mergedGroups.map(ids => {
      const placeholders = ids.map(() => '?').join(',')
      const customers = this.query(
        `SELECT c.*,
          (SELECT COUNT(*) FROM cards WHERE customer_id = c.id) as card_count,
          (SELECT COALESCE(SUM(profit), 0) FROM cards WHERE customer_id = c.id) as total_profit
         FROM customers c WHERE c.id IN (${placeholders}) ORDER BY c.id`, ids
      )
      return customers
    })

    return result
  }

  // 合并客户：保留 keepId，将 mergeIds 的卡片和数据合并过来
  mergeCustomers(keepId: number, mergeIds: number[]) {
    if (!mergeIds.length) return { merged: 0 }
    const allIds = [keepId, ...mergeIds]

    this.execute('BEGIN TRANSACTION')
    try {
      const keep = this.getCustomerById(keepId)
      if (!keep) throw new Error('保留的客户不存在')

      // 收集被合并客户的 tags 和 notes
      const mergeTags = new Set<string>((keep.tags || '').split(',').map(s => s.trim()).filter(Boolean))
      const mergeNotes: string[] = [keep.notes || '']

      for (const mid of mergeIds) {
        const c = this.getCustomerById(mid)
        if (!c) continue
        if (c.tags) c.tags.split(',').map((s: string) => s.trim()).filter(Boolean).forEach((t: string) => mergeTags.add(t))
        if (c.notes) mergeNotes.push(c.notes)
      }

      // 更新保留客户的信息（合并 tags 和 notes）
      this.execute(`UPDATE customers SET
        tags = ?, notes = ?, updated_at = datetime('now', 'localtime')
        WHERE id = ?`,
        [Array.from(mergeTags).join(','), mergeNotes.filter(Boolean).join('\n---\n'), keepId])

      // 将被合并客户的卡片转移到保留客户
      for (const mid of mergeIds) {
        this.execute('UPDATE cards SET customer_id = ? WHERE customer_id = ?', [keepId, mid])
      }

      // 删除被合并的客户
      for (const mid of mergeIds) {
        this.execute('DELETE FROM customers WHERE id = ?', [mid])
      }

      this.execute('COMMIT')
    } catch (e) {
      this.execute('ROLLBACK')
      throw e
    }
    this.save()
    return { merged: mergeIds.length }
  }

  // ===== 财务统计 =====

  getProfitSummary() {
    const totalProfit = this.queryOne('SELECT COALESCE(SUM(profit), 0) as total FROM cards')
    const avgProfit = this.queryOne('SELECT COALESCE(AVG(profit), 0) as avg FROM cards WHERE profit > 0')
    const totalCards = this.queryOne('SELECT COUNT(*) as count FROM cards')
    const now = new Date()
    const thisMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
    const monthProfit = this.queryOne(`
      SELECT COALESCE(SUM(profit), 0) as total FROM cards
      WHERE strftime('%Y-%m', apply_time) = ?
    `, [thisMonth])
    const monthCards = this.queryOne(`
      SELECT COUNT(*) as count FROM cards
      WHERE strftime('%Y-%m', apply_time) = ?
    `, [thisMonth])

    return {
      totalProfit: totalProfit?.total || 0,
      avgProfit: avgProfit?.avg || 0,
      totalCards: totalCards?.count || 0,
      monthProfit: monthProfit?.total || 0,
      monthCards: monthCards?.count || 0,
    }
  }

  getMonthlyProfit(year: number) {
    return this.query(`
      SELECT
        strftime('%m', apply_time) as month,
        COALESCE(SUM(profit), 0) as profit,
        COUNT(*) as count
      FROM cards
      WHERE strftime('%Y', apply_time) = ?
      GROUP BY strftime('%Y-%m', apply_time)
      ORDER BY month
    `, [String(year)])
  }

  getProfitByCarrier() {
    return this.query(`
      SELECT carrier,
        COALESCE(SUM(profit), 0) as profit,
        COUNT(*) as count
      FROM cards
      GROUP BY carrier
      ORDER BY profit DESC
    `)
  }

  getProfitByPlanType() {
    return this.query(`
      SELECT plan_type,
        COALESCE(SUM(profit), 0) as profit,
        COUNT(*) as count
      FROM cards
      GROUP BY plan_type
      ORDER BY profit DESC
    `)
  }

  // ===== 设置 =====

  getCarriers() {
    return ['移动', '联通', '电信', '广电']
  }

  getPlanTypes() {
    return ['性价比', '大流量', '长期套餐', '低价套餐']
  }

  // ===== 套餐模板管理 =====

  importPlans(plans: any[]) {
    let imported = 0
    this.execute('BEGIN TRANSACTION')
    try {
      for (const p of plans) {
        const existing = this.queryOne('SELECT id FROM plans WHERE code = ?', [p.code])
        if (existing) continue

        this.execute(`
          INSERT INTO plans (code, grab_code, name, carrier, monthly_price, data_amount,
            promo_period, contract_period, first_charge, activation, region, commission, note, source, sale_status)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [
          p.code, p.grabCode || '', p.name, p.carrier, p.monthlyPrice, p.dataAmount,
          p.promoPeriod, p.contractPeriod, p.firstCharge, p.activation || '',
          p.region || '全国', p.commission || '', p.note || '', '号易平台',
          p.status || '在售'
        ])
        imported++
      }
      this.execute('COMMIT')
    } catch (e) {
      this.execute('ROLLBACK')
      throw e
    }
    this.save()
    return { imported, total: plans.length }
  }

  // 通用套餐导入：支持172和号易两种格式
  importPlansFromFile(filePath: string) {
    const raw = fs.readFileSync(filePath, 'utf-8')
    const plans = JSON.parse(raw)
    if (!Array.isArray(plans) || plans.length === 0) return { imported: 0, updated: 0, total: 0 }

    // 自动识别来源
    const first = plans[0]
    const is172 = 'settlementRules' in first || 'taocanDetail' in first || ('price' in first && 'data' in first)
    const source = is172 ? '172号卡平台' : '号易平台'

    let imported = 0
    let updated = 0

    this.execute('BEGIN TRANSACTION')
    try {
      for (const p of plans) {
        // 统一字段映射
        const code = String(p.code || '')
        const name = p.name || ''
        const carrier = p.carrier || ''
        const monthlyPrice = parseFloat(p.monthlyPrice || p.price) || 0
        const dataAmount = parseInt(p.dataAmount) || parseInt(String(p.data || '').replace(/\D/g, '')) || 0
        const promoPeriod = parseInt(p.promoPeriod) || 0
        const contractPeriod = parseInt(p.contractPeriod) || 0
        const firstCharge = parseInt(p.firstCharge) || 0
        const activation = p.activation || ''
        const region = p.region || '全国'
        const ageLimit = p.ageLimit || ''
        const forbidRegions = p.forbidRegions || ''
        const express = p.express || ''
        const grabCode = p.grabCode || ''
        const saleStatus = (p.status || '在售').includes('下架') ? '停售' : (p.status || '在售')

        // 172特有字段
        const commission = p.commission || ''
        const note = is172
          ? [p.taocanDetail, p.settlementRules, p.keywords].filter(Boolean).join('\n')
          : (p.note || '')

        // 检查是否已存在
        const existing = this.queryOne('SELECT id, source FROM plans WHERE code = ?', [code])
        if (existing) {
          // 更新已有记录（172数据更全，优先更新）
          if (is172) {
            this.execute(`UPDATE plans SET
              name = ?, carrier = ?, monthly_price = ?, data_amount = ?,
              region = ?, commission = ?, note = ?, age_limit = ?,
              forbid_regions = ?, sale_status = ?
              WHERE code = ?`,
              [name, carrier, monthlyPrice, dataAmount, region,
                commission, note, ageLimit, forbidRegions, saleStatus, code])
            updated++
          }
          continue
        }

        this.execute(`
          INSERT INTO plans (code, grab_code, name, carrier, monthly_price, data_amount,
            promo_period, contract_period, first_charge, activation, region, commission, note,
            age_limit, forbid_regions, express, source, sale_status)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [
          code, grabCode, name, carrier, monthlyPrice, dataAmount,
          promoPeriod, contractPeriod, firstCharge, activation, region,
          commission, note, ageLimit, forbidRegions, express, source, saleStatus
        ])
        imported++
      }
      this.execute('COMMIT')
    } catch (e) {
      this.execute('ROLLBACK')
      throw e
    }
    this.save()
    return { imported, updated, total: plans.length, source }
  }

  // 从172 API同步产品到plans表
  syncPlansFrom172Api(products: any[]) {
    if (!Array.isArray(products) || products.length === 0) return { imported: 0, updated: 0, total: 0 }

    let imported = 0
    let updated = 0

    this.execute('BEGIN TRANSACTION')
    try {
      for (const p of products) {
        // 兼容172 API两种可能的字段格式
        const code = String(p.code || p.ProductID || p.productId || '')
        if (!code) continue

        const name = p.name || p.ProductName || p.productName || ''
        const carrier = p.carrier || p.Operator || p.operator || ''
        const monthlyPrice = parseFloat(p.price || p.Price || p.monthlyPrice || '0') || 0
        const dataRaw = p.data || p.Data || p.dataAmount || ''
        const dataAmount = parseInt(String(dataRaw).replace(/\D/g, '')) || 0
        const commission = String(p.commission || p.Commission || '')
        const region = p.region || p.Region || '全国'
        const forbidRegions = p.forbidRegions || p.ForbidRegions || ''
        const ageLimit = p.ageLimit || p.AgeLimit || ''
        const saleStatusRaw = p.status || p.Status || p.saleStatus || '上架中'
        const saleStatus = String(saleStatusRaw).includes('下架') || String(saleStatusRaw).includes('停售') ? '停售' : '在售'

        // 拼接备注
        const noteParts = [
          p.taocanDetail || p.TaocanDetail || '',
          p.settlementRules || p.SettlementRules || '',
          p.keywords || p.Keywords || '',
          p.voice || p.Voice || '',
        ].filter(Boolean)
        const note = noteParts.join('\n')
        const express = p.express || p.Express || ''
        const activation = p.activation || p.Activation || ''
        const promoPeriod = parseInt(p.promoPeriod || p.PromoPeriod || '0') || 0
        const contractPeriod = parseInt(p.contractPeriod || p.ContractPeriod || '0') || 0
        const firstCharge = parseInt(p.firstCharge || p.FirstCharge || '0') || 0
        const grabCode = p.grabCode || p.GrabCode || ''

        // 检查是否已存在
        const existing = this.queryOne('SELECT id FROM plans WHERE code = ?', [code])
        if (existing) {
          this.execute(`UPDATE plans SET
            name = ?, carrier = ?, monthly_price = ?, data_amount = ?,
            region = ?, commission = ?, note = ?, age_limit = ?,
            forbid_regions = ?, sale_status = ?, grab_code = ?,
            promo_period = ?, contract_period = ?, first_charge = ?, activation = ?, express = ?
            WHERE code = ?`,
            [name, carrier, monthlyPrice, dataAmount, region,
              commission, note, ageLimit, forbidRegions, saleStatus, grabCode,
              promoPeriod, contractPeriod, firstCharge, activation, express, code])
          updated++
        } else {
          this.execute(`
            INSERT INTO plans (code, grab_code, name, carrier, monthly_price, data_amount,
              promo_period, contract_period, first_charge, activation, region, commission, note,
              age_limit, forbid_regions, express, source, sale_status)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `, [
            code, grabCode, name, carrier, monthlyPrice, dataAmount,
            promoPeriod, contractPeriod, firstCharge, activation, region,
            commission, note, ageLimit, forbidRegions, express, '172号卡平台', saleStatus
          ])
          imported++
        }
      }
      this.execute('COMMIT')
    } catch (e) {
      this.execute('ROLLBACK')
      throw e
    }
    this.save()
    return { imported, updated, total: products.length }
  }

  getAllPlans() {
    return this.query('SELECT * FROM plans ORDER BY carrier, monthly_price')
  }

  // 根据套餐名模糊匹配套餐模板
  matchPlan(cardName: string) {
    // 精确匹配
    let plan = this.queryOne('SELECT * FROM plans WHERE name = ?', [cardName])
    if (plan) return plan

    // 模糊匹配：去掉【】内容后匹配
    const cleanName = cardName.replace(/【[^】]*】/g, '').trim()
    plan = this.queryOne('SELECT * FROM plans WHERE name LIKE ?', ['%' + cleanName + '%'])
    if (plan) return plan

    // 反向匹配：套餐名包含模板名
    plan = this.queryOne('SELECT * FROM plans WHERE ? LIKE (\'%\' || name || \'%\')', [cardName])
    if (plan) return plan

    return null
  }

  deletePlan(id: number) {
    this.execute('DELETE FROM plans WHERE id = ?', [id])
    this.save()
  }

  // ===== 数据备份 =====

  exportData() {
    const cards = this.query('SELECT * FROM cards')
    const customers = this.query('SELECT * FROM customers')
    return { cards, customers, exportTime: new Date().toISOString() }
  }

  importData(data: { cards: any[]; customers: any[] }) {
    // 校验数据结构
    if (!data || !Array.isArray(data.cards) || !Array.isArray(data.customers)) {
      throw new Error('数据格式不正确：缺少 cards 或 customers 数组')
    }
    for (const c of data.customers) {
      if (!c.name) throw new Error('客户数据缺少姓名字段')
    }
    for (const card of data.cards) {
      if (!card.card_name) throw new Error('卡片数据缺少套餐名称字段')
    }

    // 覆盖导入前自动备份现有数据
    const backupPath = this.dbPath + '.backup.' + Date.now() + '.json'
    try {
      const existing = this.exportData()
      fs.writeFileSync(backupPath, JSON.stringify(existing, null, 2))
      console.log('[DB] 导入前自动备份:', backupPath)
    } catch (e) {
      console.error('[DB] 自动备份失败，继续导入:', e)
    }

    // 使用事务包装，失败时回滚
    this.execute('BEGIN TRANSACTION')
    try {
      // 清空现有数据
      this.execute('DELETE FROM cards')
      this.execute('DELETE FROM customers')

      // 导入客户
      for (const c of data.customers) {
        this.execute(`
          INSERT INTO customers (id, name, phone, wechat, address, notes, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `, [c.id, c.name, c.phone, c.wechat, c.address, c.notes, c.created_at, c.updated_at])
      }

      // 导入卡片（包含所有字段）
      for (const card of data.cards) {
        this.execute(`
          INSERT INTO cards (id, card_name, carrier, plan_type, monthly_price, data_amount,
            region, contract_period, renewal_reminder_days,
            apply_time, activate_time, promo_start, promo_end, phone_number, customer_id,
            profit, status, notes, external_order_id, id_card, address, express_company,
            express_number, first_charge_amount, source, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [
          card.id, card.card_name, card.carrier, card.plan_type,
          card.monthly_price, card.data_amount,
          card.region || card.address || '', card.contract_period || 0,
          card.renewal_reminder_days || 30, card.apply_time,
          card.activate_time, card.promo_start, card.promo_end,
          card.phone_number, card.customer_id, card.profit,
          card.status, card.notes, card.external_order_id || null,
          card.id_card || null, card.address || null, card.express_company || null,
          card.express_number || null, card.first_charge_amount || 0,
          card.source || null, card.created_at, card.updated_at
        ])
      }

      // 重置自增ID计数器
      const maxCustomerId = this.queryOne('SELECT COALESCE(MAX(id), 0) as max_id FROM customers')
      const maxCardId = this.queryOne('SELECT COALESCE(MAX(id), 0) as max_id FROM cards')
      this.execute(`INSERT INTO sqlite_sequence (name, seq) VALUES ('customers', ?) ON CONFLICT(name) DO UPDATE SET seq = ?`, [maxCustomerId?.max_id || 0, maxCustomerId?.max_id || 0])
      this.execute(`INSERT INTO sqlite_sequence (name, seq) VALUES ('cards', ?) ON CONFLICT(name) DO UPDATE SET seq = ?`, [maxCardId?.max_id || 0, maxCardId?.max_id || 0])

      this.execute('COMMIT')
    } catch (e) {
      this.execute('ROLLBACK')
      throw e
    }

    this.save()
    return { success: true, cards: data.cards.length, customers: data.customers.length }
  }

  // ===== 172号卡导入 =====

  importFrom172(rows: any[]) {
    let imported = 0
    let skipped = 0

    this.execute('BEGIN TRANSACTION')
    try {
      for (const row of rows) {
        // 跳过已撤单的订单
        if (row['订单状态'] === '已撤单' || row['订单状态'] === '审核不通过') {
          skipped++
          continue
        }

        // 检查是否已存在（通过172订单号）
        const orderId = row['172订单号']
        if (orderId) {
          const existing = this.queryOne('SELECT id FROM cards WHERE external_order_id = ?', [orderId])
          if (existing) {
            skipped++
            continue
          }
        }

        // 解析套餐信息
        const planName = row['套餐'] || ''
        const carrier = this.parseCarrier(planName)
        const planType = this.parsePlanType(planName)
        const dataAmount = this.parseDataAmount(planName)

        // 构建完整地址
        const address = [row['省份'], row['城市'], row['县区'], row['详细地址']].filter(Boolean).join('')

        // 解析订单金额（注意：这是订单金额，不是利润/佣金）
        let orderAmount = 0
        const amountStr = row['金额'] || ''
        const amountMatch = amountStr.match(/[\d.]+/)
        if (amountMatch) {
          orderAmount = parseFloat(amountMatch[0]) || 0
        }

        // 解析首充金额
        let firstChargeAmount = 0
        const firstChargeStr = row['首充金额'] || ''
        if (firstChargeStr) {
          firstChargeAmount = parseFloat(firstChargeStr) || 0
        }

        // 映射状态
        let status = '待确认'
        if (row['订单状态'] === '已结算') {
          status = row['激活状态'] === '已激活' ? '使用中' : '已到期'
        } else if (row['订单状态'] === '已失效') {
          status = '已到期'
        }

        // 自动创建或查找客户
        const customerName = row['姓名']
        const rawPhone = row['按号码发货'] || row['生产号码'] || ''
        const customerPhone = this.isMaskedPhone(rawPhone) ? '' : rawPhone
        let customerId = null

        if (customerName) {
          // 优先用姓名+手机号匹配，脱敏号码只按姓名匹配
          let existingCustomer = customerPhone
            ? this.queryOne('SELECT id FROM customers WHERE name = ? AND phone = ?', [customerName, customerPhone])
            : null
          // 脱敏号码：按姓名精确匹配
          if (!existingCustomer) {
            existingCustomer = this.queryOne('SELECT id FROM customers WHERE name = ? AND (phone = ? OR phone = "" OR phone IS NULL)', [customerName, customerPhone])
          }

          if (existingCustomer) {
            customerId = existingCustomer.id
          } else {
            // 创建新客户（跳过脱敏手机号）
            this.execute(`
              INSERT INTO customers (name, phone, address, notes)
              VALUES (?, ?, ?, ?)
            `, [customerName, customerPhone, address, row['身份证号'] || ''])
            customerId = this.getLastInsertId()
          }
        }

        // 利润 = 订单金额 * 0.94（扣税）
        const profit = Math.round(orderAmount * 0.94 * 100) / 100

        // 匹配套餐模板，补全信息
        const matchedPlan = this.matchPlan(planName)

        // 插入卡片（优惠开始 = 激活时间）
        const activateTime = row['激活时间'] || ''
        const finalMonthlyPrice = matchedPlan ? matchedPlan.monthly_price : this.parseMonthlyPrice(planName)
        const finalDataAmount = matchedPlan ? String(matchedPlan.data_amount) : dataAmount
        const finalCarrier = matchedPlan ? matchedPlan.carrier : carrier
        const finalRegion = this.formatRegion(row['省份'], row['城市']) || matchedPlan?.region || ''
        const finalContractPeriod = matchedPlan?.contract_period || 0

        // 计算优惠结束时间
        let promoEnd = ''
        if (matchedPlan && matchedPlan.promo_period > 0 && activateTime) {
          const d = new Date(activateTime)
          if (!isNaN(d.getTime())) {
            d.setMonth(d.getMonth() + matchedPlan.promo_period)
            promoEnd = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
          }
        }

        this.execute(`
          INSERT INTO cards (
            card_name, carrier, plan_type, monthly_price, data_amount, region, contract_period, renewal_reminder_days,
            apply_time, activate_time, promo_start, promo_end, phone_number, profit, status,
            customer_id, external_order_id, id_card, address, express_company, express_number,
            first_charge_amount, source, notes
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [
          planName, finalCarrier, planType, finalMonthlyPrice, finalDataAmount,
          finalRegion, finalContractPeriod, 30,
          row['下单时间'], activateTime, activateTime, promoEnd,
          row['按号码发货'] || row['生产号码'],
          profit, status,
          customerId, orderId, row['身份证号'], address, row['物流公司'], row['运单号'],
          firstChargeAmount, row['订单来源'] || '172号卡平台',
          row['生产失败原因'] || ''
        ])

        imported++
      }

      this.execute('COMMIT')
    } catch (e) {
      this.execute('ROLLBACK')
      throw e
    }

    this.save()
    return { imported, skipped, total: rows.length }
  }

  // ===== 号易导入 =====

  importFromHaoyi(rows: any[]) {
    let imported = 0
    let skipped = 0

    this.execute('BEGIN TRANSACTION')
    try {
      for (const row of rows) {
        // 跳过开卡失败的订单
        if (row['上游订单状态'] === '开卡失败' || row['上游订单状态'] === '已取消') {
          skipped++
          continue
        }

        // 检查是否已存在（通过订单号）
        const orderId = row['订单号']
        if (orderId) {
          const existing = this.queryOne('SELECT id FROM cards WHERE external_order_id = ?', [orderId])
          if (existing) {
            skipped++
            continue
          }
        }

        // 解析套餐信息
        const planName = row['商品名称'] || ''
        const carrier = row['运营商'] || this.parseCarrier(planName)
        const planType = this.parsePlanType(planName)
        const dataAmount = this.parseDataAmount(planName)

        // 构建完整地址
        const address = row['收货地址'] || [row['省'], row['市'], row['区'], row['街道']].filter(Boolean).join('')

        // 解析订单金额（注意：这是订单金额，不是利润/佣金）
        let orderAmount = 0
        const amountStr = row['订单金额'] || ''
        const amountMatch = amountStr.match(/[\d.]+/)
        if (amountMatch) {
          orderAmount = parseFloat(amountMatch[0]) || 0
        }

        // 解析首充金额
        let firstChargeAmount = 0
        const firstChargeStr = row['首充金额'] || ''
        if (firstChargeStr) {
          firstChargeAmount = parseFloat(firstChargeStr) || 0
        }

        // 转换Excel日期（从序列号转为日期字符串）
        const applyTime = this.excelDateToString(row['下单时间'])
        const activateTime = this.excelDateToString(row['入网时间'])

        // 映射状态
        let status = '待确认'
        const upstreamStatus = row['上游订单状态'] || ''
        if (upstreamStatus === '已激活') {
          status = '使用中'
        } else if (upstreamStatus === '已开卡') {
          status = '使用中'
        } else if (upstreamStatus === '已发货') {
          status = '待确认'
        } else if (upstreamStatus.includes('失败') || upstreamStatus === '已取消') {
          status = '已到期'
        }

        // 自动创建或查找客户
        const customerName = row['用户姓名']
        const rawPhone = (row['生产号码'] || row['手机号'] || '').replace(/^'/, '')
        const customerPhone = this.isMaskedPhone(rawPhone) ? '' : rawPhone
        let customerId = null

        if (customerName) {
          // 优先用姓名+手机号匹配，脱敏号码只按姓名匹配
          let existingCustomer = customerPhone
            ? this.queryOne('SELECT id FROM customers WHERE name = ? AND phone = ?', [customerName, customerPhone])
            : null
          // 脱敏号码：按姓名精确匹配
          if (!existingCustomer) {
            existingCustomer = this.queryOne('SELECT id FROM customers WHERE name = ? AND (phone = ? OR phone = "" OR phone IS NULL)', [customerName, customerPhone])
          }

          if (existingCustomer) {
            customerId = existingCustomer.id
          } else {
            this.execute(`
              INSERT INTO customers (name, phone, address, notes)
              VALUES (?, ?, ?, ?)
            `, [customerName, customerPhone, address, row['身份证号码'] || ''])
            customerId = this.getLastInsertId()
          }
        }

        // 利润 = 订单金额 * 0.94（扣税）
        const profit = Math.round(orderAmount * 0.94 * 100) / 100

        // 匹配套餐模板，补全信息
        const matchedPlan = this.matchPlan(planName)
        const finalMonthlyPrice = matchedPlan ? matchedPlan.monthly_price : this.parseMonthlyPrice(planName)
        const finalDataAmount = matchedPlan ? String(matchedPlan.data_amount) : dataAmount
        const finalCarrier = matchedPlan ? matchedPlan.carrier : carrier
        const finalRegion = this.formatRegion(row['省'], row['市']) || this.extractRegion(address) || matchedPlan?.region || ''
        const finalContractPeriod = matchedPlan?.contract_period || 0

        // 计算优惠结束时间
        let promoEnd = ''
        if (matchedPlan && matchedPlan.promo_period > 0 && activateTime) {
          const d = new Date(activateTime)
          if (!isNaN(d.getTime())) {
            d.setMonth(d.getMonth() + matchedPlan.promo_period)
            promoEnd = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
          }
        }

        // 插入卡片（优惠开始 = 激活时间/入网时间）
        this.execute(`
          INSERT INTO cards (
            card_name, carrier, plan_type, monthly_price, data_amount, region, contract_period, renewal_reminder_days,
            apply_time, activate_time, promo_start, promo_end, phone_number, profit, status,
            customer_id, external_order_id, id_card, address, express_company, express_number,
            first_charge_amount, source, notes
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [
          planName, finalCarrier, planType, finalMonthlyPrice, finalDataAmount,
          finalRegion, finalContractPeriod, 30,
          applyTime, activateTime, activateTime, promoEnd,
          (row['生产号码'] || '').replace(/^'/, ''),
          profit, status,
          customerId, orderId, row['身份证号码'], address, row['快递名称'], row['物流单号'],
          firstChargeAmount, row['渠道来源'] || '号易平台',
          row['结算规则'] || row['备注'] || ''
        ])

        imported++
      }

      this.execute('COMMIT')
    } catch (e) {
      this.execute('ROLLBACK')
      throw e
    }

    this.save()
    return { imported, skipped, total: rows.length }
  }

  // Excel日期转字符串（Excel日期是距1900-01-01的天数）
  private excelDateToString(excelDate: any): string {
    if (!excelDate || typeof excelDate !== 'number') return ''
    try {
      // Excel日期基准：1900-01-01 = 1
      const date = new Date((excelDate - 25569) * 86400 * 1000)
      const year = date.getFullYear()
      const month = String(date.getMonth() + 1).padStart(2, '0')
      const day = String(date.getDate()).padStart(2, '0')
      const hours = String(date.getHours()).padStart(2, '0')
      const minutes = String(date.getMinutes()).padStart(2, '0')
      const seconds = String(date.getSeconds()).padStart(2, '0')
      return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`
    } catch {
      return ''
    }
  }

  private parseCarrier(planName: string): string {
    if (planName.includes('电信') || planName.includes('CT')) return '电信'
    if (planName.includes('联通') || planName.includes('CU')) return '联通'
    if (planName.includes('移动') || planName.includes('CM')) return '移动'
    if (planName.includes('广电')) return '广电'
    return '未知'
  }

  private parsePlanType(planName: string): string {
    // 1. 关键词优先：含"长期/合约/年" → 长期套餐
    if (planName.includes('长期') || planName.includes('合约') || planName.includes('年')) {
      return '长期套餐'
    }

    // 2. 提取月租价格（匹配"XX元"）
    const priceMatch = planName.match(/(\d+)元/)
    const price = priceMatch ? parseInt(priceMatch[1]) : 999

    // 3. 提取流量（匹配"XXG"）
    const dataMatch = planName.match(/(\d+)G/)
    const data = dataMatch ? parseInt(dataMatch[1]) : 0

    // 4. 按价格分档（月租是最直观的分类标准）
    if (price <= 19) return '低价套餐'
    if (price <= 29) return '性价比'
    if (price >= 39) return '大流量'

    // 5. 价格在30-38元之间，看流量补充判断
    if (data >= 200) return '大流量'
    return '性价比'
  }

  private parseDataAmount(planName: string): string {
    // 尝试匹配 "XXXG" 或 "XXXG+XXXG"
    const matches = planName.match(/(\d+G(?:\+\d+G)?)/)
    if (matches) {
      return matches[1]
    }
    return ''
  }

  private parseMonthlyPrice(planName: string): number {
    // 匹配 "XX元" 或 "月均XX元"
    const match = planName.match(/(?:月均)?(\d+(?:\.\d+)?)元/)
    if (match) {
      return parseFloat(match[1]) || 0
    }
    return 0
  }

  // 检测脱敏手机号（如 "****"、"1****1"、"138****8000"）
  private isMaskedPhone(phone: string): boolean {
    if (!phone) return true
    return phone.includes('*') || /^'+/.test(phone)
  }

  private formatRegion(province?: string, city?: string): string {
    const cleanProvince = String(province || '').replace(/省|市|自治区|壮族|回族|维吾尔/g, '').trim()
    const cleanCity = String(city || '').replace(/市|地区|自治州/g, '').trim()
    if (cleanProvince && cleanCity) return `${cleanProvince}·${cleanCity}`
    return cleanCity || cleanProvince
  }

  private extractRegion(address?: string): string {
    if (!address) return ''
    const provinceMatch = address.match(/(.{2,3}省|.+?自治区|北京市|上海市|天津市|重庆市)/)
    const cityMatch = address.match(/省(.+?市)/) || address.match(/自治区(.+?市)/)
    if (provinceMatch && cityMatch) {
      return this.formatRegion(provinceMatch[1], cityMatch[1])
    }
    return address.slice(0, 6)
  }
}
