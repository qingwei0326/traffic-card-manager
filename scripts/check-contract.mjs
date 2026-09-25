// 前后端契约一致性检查（T13）。
//
// 目的：防止 Rust 侧注册的命令与前端 appApi.ts 实际 invoke 的命令名漂移。
// 类型漂移已由 `src/types/index.ts` 的 AppApi interface + tsc 守住；
// 这里补上「命令名」这一层——新增了 Rust 命令却忘了在前端接线（或反之），
// 这个脚本会在本地和 CI 直接红掉，而不是等运行时 invoke 404。
//
// 为什么不做「从 Rust 生成完整 TS 类型」：
// 那需要解析 serde 结构体 → TS，工程量与脆度都不划算；types/index.ts 手写 +
// tsc 强制 appApi 实现它，已经达到了类型不漂移的目标。命令名这一层用脚本查足够。
//
// 使用：
//   node scripts/check-contract.mjs          # CLI，不一致则 exit(1)
//   npm run contract:check                   # 同上，供 CI/本地
// 同时导出 checkContract()，供 tests/contract.test.ts 复用（同一份逻辑，不重复）。

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = resolve(__dirname, '..')

function read(relPath) {
  return readFileSync(resolve(root, relPath), 'utf8')
}

/** 提取 invoke_handler! 里注册的 Rust 命令名（路径最后一段）。 */
export function collectRustCommands() {
  const lib = read('src-tauri/src/lib.rs')
  const m = lib.match(/generate_handler!\s*\[([\s\S]*?)\]/)
  if (!m) throw new Error('在 lib.rs 找不到 invoke_handler!([...])')
  const body = m[1]
  const cmds = [...body.matchAll(/commands::[\w]+::([\w]+)/g)].map(x => x[1])
  return [...new Set(cmds)]
}

/** 提取 appApi.ts 里 call<'...'>('命令名', ...) 实际 invoke 的命令名。 */
export function collectFrontendInvokes() {
  const app = read('src/lib/appApi.ts')
  // 注意：必须排除 `const call = <T>(...)` 这个 helper 定义本身——它后面紧跟 ` =`，
  // 所以要求 call 之后直接是 `<泛型>` 或 `(`。泛型可能嵌套尖括号（如
  // call<PaginatedResult<Card>>），但泛型里绝不含圆括号，用 [^()]* 吞掉整段泛型即可。
  const cmds = [...app.matchAll(/call(?:<[^()]*>)?\(\s*'([^']+)'/g)].map(x => x[1])
  return [...new Set(cmds)]
}

/**
 * 比对两端。
 * - missingInFrontend: Rust 注册了但前端没 invoke（前端忘了接线 / 死命令）
 * - extraInFrontend: 前端 invoke 了但 Rust 没注册（运行时必 404）
 */
export function checkContract() {
  const rust = collectRustCommands().sort()
  const fe = collectFrontendInvokes().sort()
  const rustSet = new Set(rust)
  const feSet = new Set(fe)
  const missingInFrontend = rust.filter(c => !feSet.has(c))
  const extraInFrontend = fe.filter(c => !rustSet.has(c))
  return { rust, fe, missingInFrontend, extraInFrontend }
}

const isMain =
  process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.cwd(), process.argv[1])

if (isMain) {
  const { rust, fe, missingInFrontend, extraInFrontend } = checkContract()
  if (missingInFrontend.length || extraInFrontend.length) {
    console.error('前后端契约不一致:')
    missingInFrontend.forEach(c => console.error(`  [Rust→前端缺失] ${c} 已注册但前端未 invoke`))
    extraInFrontend.forEach(c => console.error(`  [前端→Rust缺失] ${c} 前端 invoke 但 Rust 未注册`))
    process.exit(1)
  }
  console.log(`前后端契约一致 ✓（Rust ${rust.length} / 前端 ${fe.length} 个命令）`)
}
