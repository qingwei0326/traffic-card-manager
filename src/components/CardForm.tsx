import { useState, useEffect } from 'react'
import { Card, Customer } from '../types'
import { Save, X } from 'lucide-react'
import { appApi } from '../lib/appApi'
// 用本地时区取当天日期，避免 toISOString() 的 UTC 偏移导致凌晨少一天
import { todayLocal } from '../lib/date'

interface CardFormProps {
  card: Card | null
  onSave: () => void
  onCancel: () => void
}

export const defaultForm = {
  card_name: '',
  carrier: '移动',
  plan_type: '性价比',
  monthly_price: 0,
  data_amount: '',
  region: '',
  contract_period: 0,
  renewal_reminder_days: 30,
  apply_time: todayLocal(),
  activate_time: '',
  promo_months: 0,
  promo_start: '',
  promo_end: '',
  phone_number: '',
  customer_id: null as number | null,
  profit: 0,
  status: '使用中' as Card['status'],
  notes: '',
}

type FormErrors = Partial<Record<keyof typeof defaultForm, string>>

export function validateForm(form: typeof defaultForm): FormErrors {
  const errors: FormErrors = {}

  if (!form.card_name.trim()) {
    errors.card_name = '请输入卡片名称'
  }

  if (form.phone_number && !/^1[3-9]\d{9}$/.test(form.phone_number)) {
    errors.phone_number = '手机号格式不正确（11位大陆手机号）'
  }

  if (form.monthly_price < 0) {
    errors.monthly_price = '月租不能为负数'
  }

  if (form.profit < 0) {
    errors.profit = '利润不能为负数'
  }

  if (form.contract_period < 0) {
    errors.contract_period = '合约期不能为负数'
  }

  if (form.renewal_reminder_days < 1) {
    errors.renewal_reminder_days = '提醒天数至少为 1'
  }

  if (form.promo_start && form.promo_end && form.promo_end < form.promo_start) {
    errors.promo_end = '优惠到期不能早于优惠开始'
  }

  if (form.activate_time && form.promo_start && form.promo_start < form.activate_time) {
    errors.promo_start = '优惠开始不能早于激活时间'
  }

  // promo_start 为空时，上面两条依赖 promo_start 的检查都会跳过，
  // 单独兜住「优惠到期早于激活时间」，避免脏数据静默入库。
  // promo_end 若已因早于 promo_start 报错，则不再叠加——同一字段只给一条最直接的提示。
  if (
    !errors.promo_end &&
    form.activate_time &&
    form.promo_end &&
    form.promo_end < form.activate_time
  ) {
    errors.promo_end = '优惠到期不能早于激活时间'
  }

  return errors
}

export default function CardForm({ card, onSave, onCancel }: CardFormProps) {
  const [form, setForm] = useState(defaultForm)
  const [customers, setCustomers] = useState<Customer[]>([])
  const [saving, setSaving] = useState(false)
  const [errors, setErrors] = useState<FormErrors>({})
  const [submitted, setSubmitted] = useState(false)

  useEffect(() => {
    loadCustomers()
    if (card) {
      setForm({
        card_name: card.card_name,
        carrier: card.carrier,
        plan_type: card.plan_type,
        monthly_price: card.monthly_price,
        data_amount: card.data_amount || '',
        region: card.region || card.address || '',
        contract_period: card.contract_period || 0,
        renewal_reminder_days: card.renewal_reminder_days || 30,
        apply_time: card.apply_time || '',
        activate_time: card.activate_time || '',
        promo_months: 0,
        promo_start: card.promo_start || '',
        promo_end: card.promo_end || '',
        phone_number: card.phone_number || '',
        customer_id: card.customer_id,
        profit: card.profit || 0,
        status: card.status,
        notes: card.notes || '',
      })
    }
  }, [card])

  // Escape 键关闭弹窗
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel()
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [onCancel])

  const loadCustomers = async () => {
    try {
      const result = await appApi.customers.getAll({ pageSize: 500 })
      setCustomers(result.data)
    } catch (error) {
      console.error('加载客户失败:', error)
      // 静默处理，下拉框会显示空
    }
  }

  // 根据激活时间 + 优惠月数自动计算到期日（到月底）
  const calcPromoEnd = (activateTime: string, promoMonths: number): string => {
    if (!activateTime || promoMonths <= 0) return ''
    const d = new Date(activateTime)
    if (isNaN(d.getTime())) return ''
    d.setMonth(d.getMonth() + promoMonths)
    d.setDate(0) // 回到上个月最后一天
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  }

  type CardFormState = typeof defaultForm
  const handleChange = <K extends keyof CardFormState>(field: K, value: CardFormState[K]) => {
    setForm(prev => {
      const next = { ...prev, [field]: value } as CardFormState
      // 激活时间变更时同步优惠开始时间
      if (field === 'activate_time') {
        next.promo_start = next.activate_time
      }
      // 激活时间或优惠月数变更时自动计算到期日（仅在优惠月数 > 0 时）
      if (field === 'activate_time' || field === 'promo_months') {
        const at = field === 'activate_time' ? next.activate_time : prev.activate_time
        const pm = field === 'promo_months' ? next.promo_months : prev.promo_months
        if (pm > 0) {
          next.promo_end = calcPromoEnd(at, pm)
        }
      }
      return next
    })
    // 清除当前字段的错误
    if (errors[field as keyof FormErrors]) {
      setErrors(prev => ({ ...prev, [field]: undefined }))
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSubmitted(true)

    const validationErrors = validateForm(form)
    setErrors(validationErrors)
    if (Object.keys(validationErrors).length > 0) return

    setSaving(true)
    try {
      if (card) {
        await appApi.cards.update(card.id, form)
      } else {
        await appApi.cards.create(form)
      }
      onSave()
    } catch (error) {
      console.error('保存失败:', error)
      alert('保存失败，请重试')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="modal-overlay" onClick={onCancel}>
      <div className="modal-content flex max-h-[90vh] max-w-3xl flex-col" onClick={e => e.stopPropagation()}>
        {/* 头部 */}
        <div className="flex shrink-0 items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-slate-700">
          <h3 className="text-lg font-semibold text-gray-900">
            {card ? '编辑流量卡' : '添加流量卡'}
          </h3>
          <button
            onClick={onCancel}
            className="inline-flex h-8 w-8 items-center justify-center rounded-md text-gray-400 hover:bg-slate-100 hover:text-gray-600 dark:hover:bg-slate-700"
            aria-label="关闭"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* 表单 */}
        <form onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col">
          <div className="flex-1 overflow-y-auto p-6 space-y-6">
          <section>
            <h4 className="text-sm font-semibold text-gray-900 mb-3">基础信息</h4>
            <div className="grid grid-cols-2 gap-4">
            {/* 卡片名称 */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                卡片名称 <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={form.card_name}
                onChange={e => handleChange('card_name', e.target.value)}
                placeholder="如：联通大王卡"
                className={`input ${submitted && errors.card_name ? 'border-red-500 focus:ring-red-500 focus:border-red-500' : ''}`}
                required
              />
              {submitted && errors.card_name && <p className="text-red-500 text-xs mt-1">{errors.card_name}</p>}
            </div>

            {/* 运营商 */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">运营商</label>
              <select
                value={form.carrier}
                onChange={e => handleChange('carrier', e.target.value)}
                className="select"
              >
                <option value="移动">移动</option>
                <option value="联通">联通</option>
                <option value="电信">电信</option>
                <option value="广电">广电</option>
              </select>
            </div>

            {/* 套餐类型 */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">套餐类型</label>
              <select
                value={form.plan_type}
                onChange={e => handleChange('plan_type', e.target.value)}
                className="select"
              >
                <option value="性价比">性价比</option>
                <option value="大流量">大流量</option>
                <option value="长期套餐">长期套餐</option>
                <option value="低价套餐">低价套餐</option>
              </select>
            </div>

            {/* 月租 */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">月租（元）</label>
              <input
                type="number"
                step="0.01"
                value={form.monthly_price}
                onChange={e => handleChange('monthly_price', parseFloat(e.target.value) || 0)}
                placeholder="0.00"
                className={`input ${submitted && errors.monthly_price ? 'border-red-500 focus:ring-red-500 focus:border-red-500' : ''}`}
              />
              {submitted && errors.monthly_price && <p className="text-red-500 text-xs mt-1">{errors.monthly_price}</p>}
            </div>

            {/* 流量 */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">流量总量</label>
              <input
                type="text"
                value={form.data_amount}
                onChange={e => handleChange('data_amount', e.target.value)}
                placeholder="如：100GB"
                className="input"
              />
            </div>
            </div>
          </section>

          <section>
            <h4 className="text-sm font-semibold text-gray-900 mb-3">周期与提醒</h4>
            <div className="grid grid-cols-2 gap-4">
            {/* 号码归属地/地市 */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">号码归属地 / 地市</label>
              <input
                type="text"
                value={form.region}
                onChange={e => handleChange('region', e.target.value)}
                placeholder="如：福建漳州"
                className="input"
              />
            </div>

            {/* 合约期 */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">合约期（月）</label>
              <input
                type="number"
                min="0"
                value={form.contract_period}
                onChange={e => handleChange('contract_period', parseInt(e.target.value) || 0)}
                placeholder="如：24"
                className={`input ${submitted && errors.contract_period ? 'border-red-500 focus:ring-red-500 focus:border-red-500' : ''}`}
              />
              {submitted && errors.contract_period && <p className="text-red-500 text-xs mt-1">{errors.contract_period}</p>}
            </div>

            {/* 优惠月数（自动算到期日） */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">优惠期（月）</label>
              <input
                type="number"
                min="0"
                value={form.promo_months}
                onChange={e => handleChange('promo_months', parseInt(e.target.value) || 0)}
                placeholder="输入月数自动算到期"
                className="input"
              />
              <p className="text-xs text-gray-400 mt-1">填月数 + 激活时间 → 自动算到期日（到月底）</p>
            </div>

            {/* 手机号 */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">手机号</label>
              <input
                type="text"
                value={form.phone_number}
                onChange={e => handleChange('phone_number', e.target.value)}
                placeholder="手机号码"
                className={`input ${submitted && errors.phone_number ? 'border-red-500 focus:ring-red-500 focus:border-red-500' : ''}`}
              />
              {submitted && errors.phone_number && <p className="text-red-500 text-xs mt-1">{errors.phone_number}</p>}
            </div>

            {/* 办卡时间 */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">办卡时间</label>
              <input
                type="date"
                value={form.apply_time}
                onChange={e => handleChange('apply_time', e.target.value)}
                className="input"
              />
            </div>

            {/* 激活时间 */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">激活时间</label>
              <input
                type="date"
                value={form.activate_time}
                onChange={e => handleChange('activate_time', e.target.value)}
                className="input"
              />
            </div>

            {/* 优惠开始 */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">优惠开始时间</label>
              <input
                type="date"
                value={form.promo_start}
                onChange={e => handleChange('promo_start', e.target.value)}
                className={`input ${submitted && errors.promo_start ? 'border-red-500 focus:ring-red-500 focus:border-red-500' : ''}`}
              />
              {submitted && errors.promo_start && <p className="text-red-500 text-xs mt-1">{errors.promo_start}</p>}
            </div>

            {/* 优惠到期 */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                优惠到期时间
                {form.promo_months > 0 && form.promo_end && (
                  <span className="text-xs text-blue-500 font-normal ml-1">（自动计算）</span>
                )}
              </label>
              <input
                type="date"
                value={form.promo_end}
                onChange={e => handleChange('promo_end', e.target.value)}
                className={`input ${form.promo_months > 0 && form.promo_end ? 'bg-gray-50 dark:bg-slate-800' : ''} ${submitted && errors.promo_end ? 'border-red-500 focus:ring-red-500 focus:border-red-500' : ''}`}
              />
              {submitted && errors.promo_end && <p className="text-red-500 text-xs mt-1">{errors.promo_end}</p>}
            </div>

            {/* 续期提醒 */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">提前提醒（天）</label>
              <input
                type="number"
                min="1"
                value={form.renewal_reminder_days}
                onChange={e => handleChange('renewal_reminder_days', parseInt(e.target.value) || 30)}
                placeholder="如：30"
                className={`input ${submitted && errors.renewal_reminder_days ? 'border-red-500 focus:ring-red-500 focus:border-red-500' : ''}`}
              />
              {submitted && errors.renewal_reminder_days && <p className="text-red-500 text-xs mt-1">{errors.renewal_reminder_days}</p>}
            </div>
            </div>
          </section>

          <section>
            <h4 className="text-sm font-semibold text-gray-900 mb-3">客户与状态</h4>
            <div className="grid grid-cols-2 gap-4">
            {/* 客户 */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">关联客户</label>
              <select
                value={form.customer_id || ''}
                onChange={e => handleChange('customer_id', e.target.value ? parseInt(e.target.value) : null)}
                className="select"
              >
                <option value="">无</option>
                {customers.map(c => (
                  <option key={c.id} value={c.id}>{c.name} ({c.phone})</option>
                ))}
              </select>
            </div>

            {/* 利润 */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">本单利润（元）</label>
              <input
                type="number"
                step="0.01"
                value={form.profit}
                onChange={e => handleChange('profit', parseFloat(e.target.value) || 0)}
                placeholder="0.00"
                className={`input ${submitted && errors.profit ? 'border-red-500 focus:ring-red-500 focus:border-red-500' : ''}`}
              />
              {submitted && errors.profit && <p className="text-red-500 text-xs mt-1">{errors.profit}</p>}
            </div>

            {/* 状态 */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">状态</label>
              <select
                value={form.status}
                onChange={e => handleChange('status', e.target.value as Card['status'])}
                className="select"
              >
                <option value="使用中">使用中</option>
                <option value="待确认">待确认</option>
                <option value="已到期">已到期</option>
                <option value="已注销">已注销</option>
              </select>
            </div>
            </div>
          </section>

          {/* 备注 */}
          <section>
            <label className="block text-sm font-medium text-gray-700 mb-1">备注</label>
            <textarea
              value={form.notes}
              onChange={e => handleChange('notes', e.target.value)}
              placeholder="备注信息..."
              rows={3}
              className="input"
            />
          </section>
          </div>

          {/* 按钮 */}
          <div className="flex shrink-0 justify-end gap-3 border-t border-gray-200 bg-white px-6 py-4 dark:border-slate-700 dark:bg-slate-800">
            <button type="button" onClick={onCancel} className="btn btn-secondary">
              取消
            </button>
            <button type="submit" disabled={saving} className="btn btn-primary">
              <Save className="h-4 w-4" />
              {saving ? '保存中...' : '保存'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
