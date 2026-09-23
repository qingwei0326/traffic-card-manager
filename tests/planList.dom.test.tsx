// @vitest-environment jsdom
// 说明：vitest 4.1.9 下 vitest.config.ts 的 environmentMatchGlobs 实测未生效
// （仍按 node 环境执行，render 报 "document is not defined"），
// 因此改用文件级 docblock 显式指定 jsdom，这是更可靠的做法。
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import PlanList from '../src/components/PlanList'
import { appApi } from '../src/lib/appApi'

// 只覆盖 plans.getAll，其余保持真实实现，避免 mock 与真实 API 表面脱节。
vi.mock('../src/lib/appApi', async importOriginal => {
  const actual = await importOriginal<typeof import('../src/lib/appApi')>()
  return {
    ...actual,
    appApi: {
      ...actual.appApi,
      plans: { ...actual.appApi.plans, getAll: vi.fn() },
    },
  }
})

const getAll = () => vi.mocked(appApi.plans.getAll)

beforeEach(() => {
  // PlanList 失败时会 console.error，静音以保持测试输出干净
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

describe('PlanList loadPlans 异常路径', () => {
  it('clears loading and renders the thrown Error message', async () => {
    getAll().mockRejectedValueOnce(new Error('网络断开'))

    render(<PlanList />)

    // 关键回归点：修复前 loadPlans 没有 try/catch，抛错后 setLoading(false) 永不执行，
    // 界面会永久停留在"加载中"。
    // getBy* 找不到时会直接抛错，本身即断言；这里不依赖 jest-dom 的 toBeInTheDocument
    await waitFor(() => expect(screen.getByTestId('plans-error')).toBeTruthy())
    expect(screen.queryByTestId('plans-loading')).toBeNull()
    expect(screen.getByText('网络断开')).toBeTruthy()
  })

  it('falls back to a generic message for non-Error rejections', async () => {
    // Tauri invoke 可能 reject 字符串而非 Error 实例
    getAll().mockRejectedValueOnce('boom')

    render(<PlanList />)

    await waitFor(() => expect(screen.getByTestId('plans-error')).toBeTruthy())
    expect(screen.getByText('加载套餐失败，请重试')).toBeTruthy()
    expect(screen.queryByTestId('plans-loading')).toBeNull()
  })

  it('clears loading and shows no error when plans load', async () => {
    getAll().mockResolvedValueOnce([])

    render(<PlanList />)

    await waitFor(() => expect(screen.queryByTestId('plans-loading')).toBeNull())
    expect(screen.queryByTestId('plans-error')).toBeNull()
  })
})
