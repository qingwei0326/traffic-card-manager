// @vitest-environment jsdom
// Skeleton 是纯展示组件，无 appApi 依赖，无需 mock。
// 仅验证三种 type 分支与 className 透传。
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render } from '@testing-library/react'
import Skeleton from '../src/components/Skeleton'

afterEach(() => {
  cleanup()
})

describe('Skeleton', () => {
  it('renders N text lines by default (type="text")', () => {
    const { container } = render(<Skeleton lines={3} />)
    // 默认 type=text：每个 line 渲染一个 animate-pulse 占位块
    expect(container.querySelectorAll('.animate-pulse')).toHaveLength(3)
  })

  it('renders one fewer-width last line for text type', () => {
    const { container } = render(<Skeleton lines={2} />)
    const boxes = container.querySelectorAll('.animate-pulse')
    expect(boxes).toHaveLength(2)
    // 最后一行占 3/4 宽度
    expect(boxes[boxes.length - 1].className).toContain('w-3/4')
  })

  it('renders row skeletons (type="row")', () => {
    const { container } = render(<Skeleton type="row" lines={2} />)
    // 每个 row 是一个 flex 容器
    expect(container.querySelectorAll('.flex.items-center.gap-4.p-3')).toHaveLength(2)
    expect(container.querySelectorAll('.animate-pulse').length).toBeGreaterThan(0)
  })

  it('renders card skeleton (type="card")', () => {
    const { container } = render(<Skeleton type="card" />)
    // card 分支：5 张统计卡 + 多个占位区，必然产出大量 animate-pulse
    expect(container.querySelectorAll('.animate-pulse').length).toBeGreaterThan(10)
  })

  it('forwards a custom className to the root element', () => {
    const { container } = render(<Skeleton className="my-extra" />)
    expect(container.firstElementChild?.className).toContain('my-extra')
  })
})
