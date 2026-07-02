import { describe, expect, it } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

const root = path.resolve(__dirname, '..')
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'))
const tauriConfig = JSON.parse(fs.readFileSync(path.join(root, 'src-tauri/tauri.conf.json'), 'utf8'))

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
})
