import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

const pkg = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../package.json'), 'utf8'))

describe('package.json build config', () => {
  it('electron-builder includes app entry, renderer assets, plan data and sql runtime', () => {
    expect(pkg.main).toBe('dist-electron/main.js')

    const files = pkg.build.files
    expect(files).toContain('dist/**/*')
    expect(files).toContain('dist-electron/**/*')
    expect(files).toContain('data/**/*')
    expect(files).toContain('package.json')
    expect(files).toContain('node_modules/sql.js/**/*')
  })

  it('windows build stays offline-friendly and patches executable icon after packaging', () => {
    expect(pkg.scripts.build).toBe('node scripts/build.js')
    expect(pkg.scripts.release).toBe('node scripts/build.js --publish never')
    expect(pkg.build.win.target).toContain('dir')
    expect(pkg.build.win.target).toContain('nsis')
    expect(pkg.build.afterPack).toBe('./scripts/update-win-icon.js')
    expect(pkg.build.win.signAndEditExecutable).toBe(false)
    expect(pkg.build.win.icon).toBe('build/icon.ico')
    expect(pkg.devDependencies.resedit).toBeDefined()
  })

  it('publishes Windows updates through public GitHub Releases', () => {
    expect(pkg.repository.url).toBe('https://github.com/qingwei0326/traffic-card-manager.git')
    expect(pkg.build.publish).toEqual([
      {
        provider: 'github',
        owner: 'qingwei0326',
        repo: 'traffic-card-manager',
        releaseType: 'release',
      },
    ])
  })

  it('installer lets users choose install path and keeps app data on uninstall', () => {
    expect(pkg.build.nsis.artifactName).toBe('traffic-card-manager-setup-${version}.${ext}')
    expect(pkg.build.nsis.oneClick).toBe(false)
    expect(pkg.build.nsis.allowToChangeInstallationDirectory).toBe(true)
    expect(pkg.build.nsis.createDesktopShortcut).toBe(true)
    expect(pkg.build.nsis.deleteAppDataOnUninstall).toBe(false)
  })
})
