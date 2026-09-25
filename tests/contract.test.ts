// 前后端契约一致性（T13）。复用 scripts/check-contract.mjs 的逻辑，
// 让它在 vitest / CI 的 npm test 里也跑，不必单独记一条命令。
import { describe, expect, it } from 'vitest'
import { checkContract } from '../scripts/check-contract.mjs'

describe('前后端契约一致性', () => {
  it('Rust 注册命令与前端 invoke 命令一一对应', () => {
    const { rust, fe, missingInFrontend, extraInFrontend } = checkContract()
    expect(rust.length, 'Rust 侧注册命令数异常为 0').toBeGreaterThan(0)
    expect(fe.length, '前端侧 invoke 命令数异常为 0').toBeGreaterThan(0)
    expect(
      missingInFrontend,
      `已注册但前端未 invoke 的命令: ${missingInFrontend.join(', ')}`,
    ).toEqual([])
    expect(
      extraInFrontend,
      `前端 invoke 但 Rust 未注册（运行时必 404）: ${extraInFrontend.join(', ')}`,
    ).toEqual([])
  })
})
