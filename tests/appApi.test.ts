import { describe, expect, it, vi } from 'vitest'

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(async (command: string) => {
    return { command }
  }),
}))

vi.mock('@tauri-apps/api/event', () => ({
  listen: vi.fn(async () => vi.fn()),
}))

describe('appApi', () => {
  it('maps update commands to Tauri updater commands', async () => {
    const { invoke } = await import('@tauri-apps/api/core')
    const { appApi } = await import('../src/lib/appApi')

    await expect(appApi.update.check()).resolves.toEqual({ command: 'update_check' })
    await expect(appApi.update.download()).resolves.toEqual({ command: 'update_download' })
    await expect(appApi.update.install()).resolves.toEqual({ command: 'update_install' })

    expect(invoke).toHaveBeenCalledWith('update_check')
    expect(invoke).toHaveBeenCalledWith('update_download')
    expect(invoke).toHaveBeenCalledWith('update_install')
  })

  it('subscribes to update events with payload mapping', async () => {
    const { listen } = await import('@tauri-apps/api/event')
    const { appApi } = await import('../src/lib/appApi')

    await appApi.update.onAvailable(() => {})
    await appApi.update.onNotAvailable(() => {})
    await appApi.update.onProgress(() => {})
    await appApi.update.onDownloaded(() => {})
    await appApi.update.onError(() => {})

    expect(listen).toHaveBeenCalledWith('update:available', expect.any(Function))
    expect(listen).toHaveBeenCalledWith('update:not-available', expect.any(Function))
    expect(listen).toHaveBeenCalledWith('update:progress', expect.any(Function))
    expect(listen).toHaveBeenCalledWith('update:downloaded', expect.any(Function))
    expect(listen).toHaveBeenCalledWith('update:error', expect.any(Function))
  })

  it('returns unsubscribe functions from event subscriptions', async () => {
    const { appApi } = await import('../src/lib/appApi')
    const unsubscribe = await appApi.app.onCloseRequest(() => {})
    expect(typeof unsubscribe).toBe('function')
  })
})
