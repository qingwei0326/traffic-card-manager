// @vitest-environment jsdom
// 纯展示组件单测：只验证「渲染原因 + 可关闭」，不挂载整个 App 树，
// 避免 Dashboard/FinanceStats 等子组件在 jsdom 里的 invoke 噪声。
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import MigrationBanner from '../src/components/MigrationBanner'

afterEach(() => cleanup())

describe('MigrationBanner', () => {
  it('renders the migration error reason and is dismissible', () => {
    const onDismiss = vi.fn()
    render(<MigrationBanner error="数据库版本过高，请用新版本打开" onDismiss={onDismiss} />)

    // 横幅与原因都出现
    expect(screen.getByTestId('migration-warning')).toBeTruthy()
    expect(screen.getByText('数据库版本过高，请用新版本打开')).toBeTruthy()

    // 点击关闭按钮触发 onDismiss
    fireEvent.click(screen.getByLabelText('关闭告警'))
    expect(onDismiss).toHaveBeenCalledTimes(1)
  })
})
