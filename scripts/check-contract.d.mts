// 与 check-contract.mjs 对应的类型声明，供 TS 侧（tests/contract.test.ts）导入时解析。
export function collectRustCommands(): string[]
export function collectFrontendInvokes(): string[]
export interface ContractResult {
  rust: string[]
  fe: string[]
  missingInFrontend: string[]
  extraInFrontend: string[]
}
export function checkContract(): ContractResult
