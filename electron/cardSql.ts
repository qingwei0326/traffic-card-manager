export const CARD_WRITE_FIELDS = [
  'card_name',
  'carrier',
  'plan_type',
  'monthly_price',
  'data_amount',
  'region',
  'contract_period',
  'renewal_reminder_days',
  'apply_time',
  'activate_time',
  'promo_start',
  'promo_end',
  'phone_number',
  'customer_id',
  'profit',
  'status',
  'notes',
] as const

export const CARD_SEARCH_FIELDS = [
  'c.card_name',
  'c.phone_number',
  'cu.name',
  'c.region',
  'c.notes',
] as const

export type CardWriteField = typeof CARD_WRITE_FIELDS[number]

export function normalizeCardWriteValue(field: CardWriteField, value: any) {
  if (field === 'customer_id') return value || null
  if (field === 'profit' || field === 'monthly_price' || field === 'contract_period') return value || 0
  if (field === 'renewal_reminder_days') return value || 30
  if (field === 'status') return value || '使用中'
  return value || ''
}

export function getCardWriteValues(card: any) {
  return CARD_WRITE_FIELDS.map(field => normalizeCardWriteValue(field, card[field]))
}

export function buildCardSearchClause(search?: string) {
  if (!search?.trim()) {
    return { sql: '', params: [] as string[] }
  }

  const sql = ` AND (${CARD_SEARCH_FIELDS.map(field => `${field} LIKE ?`).join(' OR ')})`
  const params = CARD_SEARCH_FIELDS.map(() => `%${search.trim()}%`)
  return { sql, params }
}
