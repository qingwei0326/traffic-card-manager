import { useState, useEffect } from 'react'
import { Customer } from '../types'
import { appApi } from '../lib/appApi'
import { PRESET_TAGS } from '../lib/constants'

interface CustomerFormProps {
  customer: Customer | null
  onSave: () => void
  onCancel: () => void
}

const defaultForm = {
  name: '',
  phone: '',
  wechat: '',
  address: '',
  notes: '',
  tags: '',
}

type FormErrors = Partial<Record<keyof typeof defaultForm, string>>

function validateForm(form: typeof defaultForm): FormErrors {
  const errors: FormErrors = {}

  if (!form.name.trim()) {
    errors.name = '请输入客户姓名'
  }

  if (form.phone && !/^1[3-9]\d{9}$/.test(form.phone)) {
    errors.phone = '手机号格式不正确（11位大陆手机号）'
  }

  return errors
}

export default function CustomerForm({ customer, onSave, onCancel }: CustomerFormProps) {
  const [form, setForm] = useState(defaultForm)
  const [saving, setSaving] = useState(false)
  const [errors, setErrors] = useState<FormErrors>({})
  const [submitted, setSubmitted] = useState(false)

  useEffect(() => {
    if (customer) {
      setForm({
        name: customer.name,
        phone: customer.phone || '',
        wechat: customer.wechat || '',
        address: customer.address || '',
        notes: customer.notes || '',
        tags: customer.tags || '',
      })
    }
  }, [customer])

  // Escape 键关闭弹窗
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel()
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [onCancel])

  const handleChange = (field: string, value: string) => {
    setForm(prev => ({ ...prev, [field]: value }))
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
      if (customer) {
        await appApi.customers.update(customer.id, form)
      } else {
        await appApi.customers.create(form)
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
      <div className="modal-content max-w-lg" onClick={e => e.stopPropagation()}>
        {/* 头部 */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200">
          <h3 className="text-lg font-semibold text-gray-900">
            {customer ? '编辑客户' : '添加客户'}
          </h3>
          <button
            onClick={onCancel}
            className="text-gray-400 hover:text-gray-600 text-xl"
          >
            ✕
          </button>
        </div>

        {/* 表单 */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {/* 姓名 */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              姓名 <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={form.name}
              onChange={e => handleChange('name', e.target.value)}
              placeholder="客户姓名"
              className={`input ${submitted && errors.name ? 'border-red-500 focus:ring-red-500 focus:border-red-500' : ''}`}
              required
            />
            {submitted && errors.name && <p className="text-red-500 text-xs mt-1">{errors.name}</p>}
          </div>

          {/* 电话 */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">电话</label>
            <input
              type="text"
              value={form.phone}
              onChange={e => handleChange('phone', e.target.value)}
              placeholder="联系电话"
              className={`input ${submitted && errors.phone ? 'border-red-500 focus:ring-red-500 focus:border-red-500' : ''}`}
            />
            {submitted && errors.phone && <p className="text-red-500 text-xs mt-1">{errors.phone}</p>}
          </div>

          {/* 微信 */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">微信</label>
            <input
              type="text"
              value={form.wechat}
              onChange={e => handleChange('wechat', e.target.value)}
              placeholder="微信号"
              className="input"
            />
          </div>

          {/* 地址 */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">地址</label>
            <input
              type="text"
              value={form.address}
              onChange={e => handleChange('address', e.target.value)}
              placeholder="客户地址"
              className="input"
            />
          </div>

          {/* 备注 */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">备注</label>
            <textarea
              value={form.notes}
              onChange={e => handleChange('notes', e.target.value)}
              placeholder="备注信息..."
              rows={3}
              className="input"
            />
          </div>

          {/* 标签 */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">客户标签</label>
            <div className="flex flex-wrap gap-2 mb-2">
              {PRESET_TAGS.map(tag => {
                const selected = form.tags.split(',').map(s => s.trim()).includes(tag)
                return (
                  <button
                    key={tag}
                    type="button"
                    onClick={() => {
                      const tags = form.tags.split(',').map(s => s.trim()).filter(Boolean)
                      if (selected) {
                        handleChange('tags', tags.filter(t => t !== tag).join(', '))
                      } else {
                        handleChange('tags', [...tags, tag].join(', '))
                      }
                    }}
                    className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${
                      selected
                        ? 'bg-blue-500 text-white border-blue-500'
                        : 'bg-white text-gray-600 border-gray-300 hover:border-blue-300'
                    }`}
                  >
                    {tag}
                  </button>
                )
              })}
            </div>
            <input
              type="text"
              value={form.tags}
              onChange={e => handleChange('tags', e.target.value)}
              placeholder="自定义标签，逗号分隔"
              className="input text-sm"
            />
          </div>

          {/* 按钮 */}
          <div className="flex justify-end gap-3 pt-4 border-t border-gray-200">
            <button type="button" onClick={onCancel} className="btn btn-secondary">
              取消
            </button>
            <button type="submit" disabled={saving} className="btn btn-primary">
              {saving ? '保存中...' : '保存'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
