// @vitest-environment jsdom
// ErrorBoundary 是类组件，无 appApi 依赖。
// 验证：无错误时渲染 children；渲染错误时被捕获并显示兜底 UI；
// 「返回重试」重置状态不崩溃；「刷新页面」调用 window.location.reload。
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import ErrorBoundary from '../src/components/ErrorBoundary'

// 故意在渲染期抛错的子组件
function Boom({ shouldThrow }: { shouldThrow: boolean }) {
  if (shouldThrow) throw new Error('Boom!')
  return <div>安全的子节点</div>
}

beforeEach(() => {
  // 错误边界捕获后会 console.error，静音以保持输出干净
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

describe('ErrorBoundary', () => {
  it('renders children when no error occurs', () => {
    render(
      <ErrorBoundary>
        <div>hello</div>
      </ErrorBoundary>,
    )
    expect(screen.getByText('hello')).toBeTruthy()
  })

  it('catches render errors and shows the fallback UI with the message', () => {
    render(
      <ErrorBoundary>
        <Boom shouldThrow />
      </ErrorBoundary>,
    )
    expect(screen.getByText('页面出了点问题')).toBeTruthy()
    expect(screen.getByText('Boom!')).toBeTruthy()
  })

  it('resets via 返回重试 without crashing (child still throws, boundary re-catches)', () => {
    render(
      <ErrorBoundary>
        <Boom shouldThrow />
      </ErrorBoundary>,
    )
    fireEvent.click(screen.getByText('返回重试'))
    // 子组件仍抛错，边界再次捕获，兜底 UI 仍存在
    expect(screen.getByText('页面出了点问题')).toBeTruthy()
  })

  it('calls window.location.reload when 刷新页面 is clicked', () => {
    // window.location.reload 在 jsdom 上实例属性不可配置，且会真的触发导航。
    // 临时整体替换 window.location（仅本用例），测完还原。
    const reload = vi.fn()
    const originalLocation = Object.getOwnPropertyDescriptor(window, 'location')
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: { ...window.location, reload } as Location,
    })
    try {
      render(
        <ErrorBoundary>
          <Boom shouldThrow />
        </ErrorBoundary>,
      )
      fireEvent.click(screen.getByText('刷新页面'))
      expect(reload).toHaveBeenCalledTimes(1)
    } finally {
      if (originalLocation) {
        Object.defineProperty(window, 'location', originalLocation)
      }
    }
  })
})
