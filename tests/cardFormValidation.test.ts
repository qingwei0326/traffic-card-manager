import { describe, expect, it } from 'vitest'
import { defaultForm, validateForm } from '../src/components/CardForm'

// validateForm 是纯函数，无需 jsdom / 无需渲染组件，直接在 node 环境跑。
// 覆盖 7 条校验规则的通过值与边界值，重点锁住"空值跳过"和"相等即合法"两类易错语义。

const form = (overrides: Partial<typeof defaultForm> = {}) => ({
  ...defaultForm,
  ...overrides,
})

describe('validateForm', () => {
  describe('card_name', () => {
    it('rejects empty and whitespace-only names', () => {
      expect(validateForm(form({ card_name: '' })).card_name).toBe('请输入卡片名称')
      expect(validateForm(form({ card_name: '   ' })).card_name).toBe('请输入卡片名称')
    })

    it('accepts a non-empty name', () => {
      expect(validateForm(form({ card_name: '福建移动专享卡' })).card_name).toBeUndefined()
    })
  })

  describe('phone_number', () => {
    // 空值必须跳过校验，否则新建卡片会被误拦（这是最容易写错的一条）
    it('skips validation when phone is empty', () => {
      expect(validateForm(form({ phone_number: '' })).phone_number).toBeUndefined()
    })

    it('accepts valid mainland mobile numbers', () => {
      for (const phone of ['13800138000', '19912345678', '15012345678']) {
        expect(validateForm(form({ phone_number: phone })).phone_number).toBeUndefined()
      }
    })

    it('rejects malformed numbers', () => {
      const bad = [
        '12345', // 太短
        '1380013800', // 10 位
        '138001380000', // 12 位
        '23800138000', // 第二位非 3-9
        '10800138000', // 第二位为 0
        '1380013800a', // 含字母
      ]
      for (const phone of bad) {
        expect(validateForm(form({ phone_number: phone })).phone_number).toBe(
          '手机号格式不正确（11位大陆手机号）',
        )
      }
    })
  })

  describe('numeric lower bounds', () => {
    it('rejects negative monthly_price, profit, and contract_period', () => {
      expect(validateForm(form({ monthly_price: -1 })).monthly_price).toBe('月租不能为负数')
      expect(validateForm(form({ monthly_price: -0.01 })).monthly_price).toBe('月租不能为负数')
      expect(validateForm(form({ profit: -1 })).profit).toBe('利润不能为负数')
      expect(validateForm(form({ contract_period: -1 })).contract_period).toBe('合约期不能为负数')
    })

    it('accepts zero for monthly_price, profit, and contract_period', () => {
      const errors = validateForm(form({ monthly_price: 0, profit: 0, contract_period: 0 }))
      expect(errors.monthly_price).toBeUndefined()
      expect(errors.profit).toBeUndefined()
      expect(errors.contract_period).toBeUndefined()
    })

    // renewal_reminder_days 的下界是 1 而非 0，与其它字段不同
    it('requires renewal_reminder_days to be at least 1', () => {
      expect(validateForm(form({ renewal_reminder_days: 0 })).renewal_reminder_days).toBe(
        '提醒天数至少为 1',
      )
      expect(validateForm(form({ renewal_reminder_days: -1 })).renewal_reminder_days).toBe(
        '提醒天数至少为 1',
      )
      expect(validateForm(form({ renewal_reminder_days: 1 })).renewal_reminder_days).toBeUndefined()
    })
  })

  describe('promo date ordering', () => {
    it('rejects promo_end earlier than promo_start', () => {
      const errors = validateForm(form({ promo_start: '2026-06-10', promo_end: '2026-06-09' }))
      expect(errors.promo_end).toBe('优惠到期不能早于优惠开始')
    })

    // 相等应当合法：规则用的是 < 而非 <=
    it('accepts promo_end equal to promo_start', () => {
      const errors = validateForm(form({ promo_start: '2026-06-10', promo_end: '2026-06-10' }))
      expect(errors.promo_end).toBeUndefined()
    })

    it('skips promo_end check when either date is blank', () => {
      expect(
        validateForm(form({ promo_start: '', promo_end: '2026-06-09' })).promo_end,
      ).toBeUndefined()
      expect(
        validateForm(form({ promo_start: '2026-06-10', promo_end: '' })).promo_end,
      ).toBeUndefined()
    })

    it('rejects promo_start earlier than activate_time', () => {
      const errors = validateForm(form({ activate_time: '2026-06-10', promo_start: '2026-06-09' }))
      expect(errors.promo_start).toBe('优惠开始不能早于激活时间')
    })

    it('accepts promo_start equal to activate_time and skips when activate_time is blank', () => {
      expect(
        validateForm(form({ activate_time: '2026-06-10', promo_start: '2026-06-10' })).promo_start,
      ).toBeUndefined()
      expect(
        validateForm(form({ activate_time: '', promo_start: '2026-06-09' })).promo_start,
      ).toBeUndefined()
    })
  })

  describe('aggregate behaviour', () => {
    it('returns no errors for a fully valid form', () => {
      const errors = validateForm(
        form({
          card_name: '福建移动专享卡【29元235G】',
          phone_number: '13800138000',
          monthly_price: 29,
          profit: 88,
          contract_period: 24,
          renewal_reminder_days: 15,
          activate_time: '2026-06-10',
          promo_start: '2026-06-10',
          promo_end: '2026-12-31',
        }),
      )
      expect(errors).toEqual({})
    })

    it('reports multiple errors at once', () => {
      const errors = validateForm(
        form({ card_name: '', monthly_price: -1, renewal_reminder_days: 0 }),
      )
      expect(errors.card_name).toBe('请输入卡片名称')
      expect(errors.monthly_price).toBe('月租不能为负数')
      expect(errors.renewal_reminder_days).toBe('提醒天数至少为 1')
      expect(Object.keys(errors)).toHaveLength(3)
    })

    // defaultForm 除 card_name 为空外，其余字段都应通过校验
    it('flags only card_name on the untouched default form', () => {
      expect(validateForm(defaultForm)).toEqual({ card_name: '请输入卡片名称' })
    })
  })

  describe('defaultForm', () => {
    it('uses a local-date apply_time rather than a UTC-shifted value', () => {
      expect(defaultForm.apply_time).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    })

    it('ships safe defaults for the fields validateForm guards', () => {
      expect(defaultForm.monthly_price).toBe(0)
      expect(defaultForm.profit).toBe(0)
      expect(defaultForm.contract_period).toBe(0)
      expect(defaultForm.renewal_reminder_days).toBeGreaterThanOrEqual(1)
      expect(defaultForm.status).toBe('使用中')
    })
  })
})
