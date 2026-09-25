// @vitest-environment jsdom
// Modal / ConfirmModal / AlertModal 是纯展示组件，无 appApi 依赖。
// 验证：关闭时不渲染、打开时渲染、遮罩/关闭按钮/Esc 触发 onClose、
// ConfirmModal 的确认/取消、AlertModal 的 type 默认标题。
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { Modal, ConfirmModal, AlertModal } from '../src/components/Modal'

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

describe('Modal', () => {
  it('renders nothing when open=false', () => {
    const { container } = render(
      <Modal open={false} onClose={() => {}} title="标题">
        <p>内容</p>
      </Modal>,
    )
    expect(container.querySelector('.modal-overlay')).toBeNull()
  })

  it('renders overlay, title and children when open', () => {
    render(
      <Modal open onClose={() => {}} title="我的标题">
        <p>子内容</p>
      </Modal>,
    )
    expect(screen.getByText('我的标题')).toBeTruthy()
    expect(screen.getByText('子内容')).toBeTruthy()
  })

  it('closes when the overlay is clicked', () => {
    const onClose = vi.fn()
    const { container } = render(
      <Modal open onClose={onClose} title="T">
        <p>内容</p>
      </Modal>,
    )
    fireEvent.click(container.querySelector('.modal-overlay')!)
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('does NOT close when inner content is clicked (stopPropagation)', () => {
    const onClose = vi.fn()
    render(
      <Modal open onClose={onClose} title="T">
        <p>内容</p>
      </Modal>,
    )
    fireEvent.click(screen.getByText('内容'))
    expect(onClose).not.toHaveBeenCalled()
  })

  it('closes on Escape keypress', () => {
    const onClose = vi.fn()
    render(
      <Modal open onClose={onClose} title="T">
        <p>内容</p>
      </Modal>,
    )
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('respects a custom width class', () => {
    const { container } = render(
      <Modal open onClose={() => {}} width="max-w-2xl">
        <p>内容</p>
      </Modal>,
    )
    expect(container.querySelector('.modal-content')?.className).toContain('max-w-2xl')
  })
})

describe('ConfirmModal', () => {
  it('renders title and message, calls onConfirm then onClose', () => {
    const onClose = vi.fn()
    const onConfirm = vi.fn()
    render(
      <ConfirmModal open onClose={onClose} onConfirm={onConfirm} title="删除?" message="确认删除" confirmText="删除" danger />,
    )
    expect(screen.getByText('删除?')).toBeTruthy()
    expect(screen.getByText('确认删除')).toBeTruthy()

    fireEvent.click(screen.getByText('删除'))
    expect(onConfirm).toHaveBeenCalledTimes(1)
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('calls only onClose when cancel is clicked', () => {
    const onClose = vi.fn()
    const onConfirm = vi.fn()
    render(
      <ConfirmModal open onClose={onClose} onConfirm={onConfirm} title="T" message="M" />,
    )
    fireEvent.click(screen.getByText('取消'))
    expect(onClose).toHaveBeenCalledTimes(1)
    expect(onConfirm).not.toHaveBeenCalled()
  })
})

describe('AlertModal', () => {
  it('uses default title per type (success / error / info)', () => {
    const { rerender } = render(<AlertModal open onClose={() => {}} message="ok" type="success" />)
    expect(screen.getByText('成功')).toBeTruthy()

    rerender(<AlertModal open onClose={() => {}} message="bad" type="error" />)
    expect(screen.getByText('错误')).toBeTruthy()

    rerender(<AlertModal open onClose={() => {}} message="hi" type="info" />)
    expect(screen.getByText('提示')).toBeTruthy()
  })

  it('renders an explicit title when provided', () => {
    render(<AlertModal open onClose={() => {}} title="警告" message="注意" type="info" />)
    expect(screen.getByText('警告')).toBeTruthy()
  })

  it('calls onClose when the 确定 button is clicked', () => {
    const onClose = vi.fn()
    render(<AlertModal open onClose={onClose} message="hi" />)
    fireEvent.click(screen.getByText('确定'))
    expect(onClose).toHaveBeenCalledTimes(1)
  })
})
