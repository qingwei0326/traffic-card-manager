import { useEffect, useCallback } from 'react'

interface ModalProps {
  open: boolean
  onClose: () => void
  title?: string
  children: React.ReactNode
  width?: string
}

export function Modal({ open, onClose, title, children, width = 'max-w-lg' }: ModalProps) {
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.key === 'Escape') onClose()
  }, [onClose])

  useEffect(() => {
    if (open) {
      document.addEventListener('keydown', handleKeyDown)
      return () => document.removeEventListener('keydown', handleKeyDown)
    }
  }, [open, handleKeyDown])

  if (!open) return null

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className={`modal-content ${width}`} onClick={e => e.stopPropagation()}>
        {title && (
          <div className="flex items-center justify-between p-6 border-b border-gray-200">
            <h3 className="text-lg font-semibold text-gray-900">{title}</h3>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl">✕</button>
          </div>
        )}
        {children}
      </div>
    </div>
  )
}

// 确认弹窗
interface ConfirmModalProps {
  open: boolean
  onClose: () => void
  onConfirm: () => void
  title: string
  message: string
  confirmText?: string
  cancelText?: string
  danger?: boolean
}

export function ConfirmModal({ open, onClose, onConfirm, title, message, confirmText = '确定', cancelText = '取消', danger }: ConfirmModalProps) {
  if (!open) return null

  return (
    <Modal open={open} onClose={onClose} title={title}>
      <div className="p-6">
        <p className="text-gray-600 mb-6">{message}</p>
        <div className="flex justify-end gap-3">
          <button onClick={onClose} className="btn btn-secondary">{cancelText}</button>
          <button
            onClick={() => { onConfirm(); onClose() }}
            className={`btn ${danger ? 'bg-red-500 hover:bg-red-600 text-white' : 'btn-primary'}`}
          >
            {confirmText}
          </button>
        </div>
      </div>
    </Modal>
  )
}

// 提示弹窗
interface AlertModalProps {
  open: boolean
  onClose: () => void
  title?: string
  message: string
  type?: 'success' | 'error' | 'info'
}

export function AlertModal({ open, onClose, title, message, type = 'info' }: AlertModalProps) {
  if (!open) return null

  const colors = {
    success: 'bg-green-50 dark:bg-green-900/20 text-green-800 dark:text-green-300 border-green-200 dark:border-green-800',
    error: 'bg-red-50 dark:bg-red-900/20 text-red-800 dark:text-red-300 border-red-200 dark:border-red-800',
    info: 'bg-blue-50 dark:bg-blue-900/20 text-blue-800 dark:text-blue-300 border-blue-200 dark:border-blue-800',
  }
  const icons = { success: '✅', error: '❌', info: 'ℹ️' }

  return (
    <Modal open={open} onClose={onClose} title={title || (type === 'success' ? '成功' : type === 'error' ? '错误' : '提示')}>
      <div className="p-6">
        <div className={`p-4 rounded-lg border ${colors[type]} mb-6`}>
          <p>{icons[type]} {message}</p>
        </div>
        <div className="flex justify-end">
          <button onClick={onClose} className="btn btn-primary">确定</button>
        </div>
      </div>
    </Modal>
  )
}
