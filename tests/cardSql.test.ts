import { describe, it, expect } from 'vitest'
import { buildCardSearchClause, CARD_WRITE_FIELDS } from '../electron/cardSql'

describe('cardSql', () => {
  it('search covers package, customer, phone, region and notes fields', () => {
    const clause = buildCardSearchClause('漳州')

    expect(clause.sql).toBe(
      ' AND (c.card_name LIKE ? OR c.phone_number LIKE ? OR cu.name LIKE ? OR c.region LIKE ? OR c.notes LIKE ?)'
    )
    expect(clause.params).toEqual(Array(5).fill('%漳州%'))
  })

  it('write fields include all expected columns', () => {
    expect(CARD_WRITE_FIELDS).toEqual([
      'card_name', 'carrier', 'plan_type', 'monthly_price', 'data_amount',
      'region', 'contract_period', 'renewal_reminder_days',
      'apply_time', 'activate_time', 'promo_start', 'promo_end',
      'phone_number', 'customer_id', 'profit', 'status', 'notes',
    ])
  })

  it('search returns empty for blank input', () => {
    expect(buildCardSearchClause('')).toEqual({ sql: '', params: [] })
    expect(buildCardSearchClause('   ')).toEqual({ sql: '', params: [] })
  })
})
