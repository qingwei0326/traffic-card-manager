import { describe, expect, it } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

const root = path.resolve(__dirname, '..')
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'))
const tauriConfig = JSON.parse(fs.readFileSync(path.join(root, 'src-tauri/tauri.conf.json'), 'utf8'))
const defaultCapability = JSON.parse(fs.readFileSync(path.join(root, 'src-tauri/capabilities/default.json'), 'utf8'))
const releaseWorkflow = fs.readFileSync(path.join(root, '.github/workflows/release.yml'), 'utf8')
const ciWorkflow = fs.readFileSync(path.join(root, '.github/workflows/ci.yml'), 'utf8')
const updaterEndpoint = 'https://github.com/qingwei0326/traffic-card-manager/releases/latest/download/latest.json'

describe('Tauri package config', () => {
  const removedRuntime = `${'elec'}${'tron'}`
  const removedBuilder = `${removedRuntime}-builder`
  const removedLog = `${removedRuntime}-log`
  const removedUpdater = `${removedRuntime}-updater`
  const removedSql = `sql${'.'}js`
  const removedVitePlugin = `vite-plugin-${removedRuntime}`
  const removedViteRenderer = `${removedVitePlugin}-renderer`

  it('uses Tauri scripts and removes legacy desktop entry/config', () => {
    expect(pkg.main).toBeUndefined()
    expect(pkg.build).toBeUndefined()
    expect(pkg.scripts.dev).toBe('tauri dev')
    expect(pkg.scripts.build).toBe('tauri build')
    expect(pkg.scripts['dev:renderer']).toBe('vite --host 127.0.0.1')
    expect(pkg.scripts['build:renderer']).toBe('vite build')
  })

  it('keeps renderer dependencies and removes legacy runtime dependencies', () => {
    expect(pkg.dependencies.react).toBeDefined()
    expect(pkg.dependencies['@tauri-apps/api']).toBeDefined()
    expect(pkg.dependencies['@tauri-apps/plugin-updater']).toBeDefined()
    expect(pkg.dependencies[removedSql]).toBeUndefined()
    expect(pkg.dependencies[removedLog]).toBeUndefined()
    expect(pkg.dependencies[removedUpdater]).toBeUndefined()
    expect(pkg.devDependencies[removedRuntime]).toBeUndefined()
    expect(pkg.devDependencies[removedBuilder]).toBeUndefined()
    expect(pkg.devDependencies[removedVitePlugin]).toBeUndefined()
    expect(pkg.devDependencies[removedViteRenderer]).toBeUndefined()
    expect(pkg.devDependencies['@tauri-apps/cli']).toBeDefined()
  })

  it('configures the Tauri app, renderer build, bundled data, and Windows installer', () => {
    expect(tauriConfig.identifier).toBe('com.traffic-card.manager')
    expect(tauriConfig.productName).toBe('流量卡管理系统')
    expect(tauriConfig.version).toBe(pkg.version)
    expect(tauriConfig.build.devUrl).toBe('http://127.0.0.1:5173')
    expect(tauriConfig.build.frontendDist).toBe('../dist')
    expect(tauriConfig.bundle.active).toBe(true)
    expect(tauriConfig.bundle.targets).toContain('nsis')
    expect(tauriConfig.bundle.resources).toContain('../data/172-plans.json')
    expect(tauriConfig.bundle.resources).toContain('../data/haoyi-plans-parsed.json')
  })

  it('configures Tauri updater endpoint, signing public key, and permission', () => {
    expect(tauriConfig.bundle.createUpdaterArtifacts).toBe(true)
    expect(tauriConfig.plugins.updater.endpoints).toContain(updaterEndpoint)
    expect(typeof tauriConfig.plugins.updater.pubkey).toBe('string')
    expect(tauriConfig.plugins.updater.pubkey.length).toBeGreaterThan(20)
    expect(defaultCapability.permissions).toContain('updater:default')
  })

  it('gates every PR and main push with frontend tests, typecheck, and Rust tests', () => {
    expect(pkg.scripts.test).toBe('vitest run')
    expect(pkg.scripts.typecheck).toBe('tsc --noEmit')
    expect(pkg.devDependencies['@types/node']).toBeDefined()
    // 门禁已从 release.yml 迁到 ci.yml：release 只在 tag 触发，日常 PR / push 由 CI 把关
    expect(ciWorkflow).toContain('run: npm test')
    expect(ciWorkflow).toContain('run: npm run typecheck')
    expect(ciWorkflow).toContain('run: cargo test --manifest-path src-tauri/Cargo.toml')
    // Windows 必测：NSIS 打包与路径分隔符差异只在 Windows 暴露
    expect(ciWorkflow).toContain('windows-2022')
    expect(releaseWorkflow).not.toContain('run: npm test')
  })

  it('uses a restrictive Tauri CSP for desktop security', () => {
    const csp = tauriConfig.app.security.csp
    expect(typeof csp).toBe('string')
    expect(csp).toContain("default-src 'self'")
    expect(csp).toContain("script-src 'self'")
    expect(csp).toContain("style-src 'self' 'unsafe-inline'")
    expect(csp).toContain("img-src 'self' data:")
    expect(csp).toContain("object-src 'none'")
    expect(csp).toContain("base-uri 'self'")
  })

  it('allows IPC transport in CSP so invoke does not fall back to postMessage', () => {
    const connectSrc = /connect-src ([^;]+)/.exec(tauriConfig.app.security.csp)?.[1] ?? ''
    // Tauri invoke 走 ipc:/http://ipc.localhost，缺失时每次调用会先被 CSP 拦截再降级兜底
    expect(connectSrc).toContain("'self'")
    expect(connectSrc).toContain('ipc:')
    expect(connectSrc).toContain('http://ipc.localhost')
    expect(connectSrc).toContain('https://haokaopenapi.lot-ml.com')
    expect(connectSrc).toContain('https://github.com')
    // 不得放行通配来源
    expect(connectSrc).not.toContain('*')
  })
})
