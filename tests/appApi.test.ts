import { describe, expect, it, vi } from 'vitest'

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(async (command: string) => {
    if (command.startsWith('update_')) {
      return { ok: false, message: 'Tauri 自动更新将在后续版本接入' }
    }
    return { command }
  }),
}))

vi.mock('@tauri-apps/api/event', () => ({
  listen: vi.fn(async () => vi.fn()),
}))

describe('appApi', () => {
  it('maps update commands to compatibility-stub commands', async () => {
    const { invoke } = await import('@tauri-apps/api/core')
    const { appApi } = await import('../src/lib/appApi')

    await expect(appApi.update.check()).resolves.toEqual({
      ok: false,
      message: 'Tauri 自动更新将在后续版本接入',
    })
    await expect(appApi.update.download()).resolves.toEqual({
      ok: false,
      message: 'Tauri 自动更新将在后续版本接入',
    })
    await expect(appApi.update.install()).resolves.toEqual({
      ok: false,
      message: 'Tauri 自动更新将在后续版本接入',
    })

    expect(invoke).toHaveBeenCalledWith('update_check')
    expect(invoke).toHaveBeenCalledWith('update_download')
    expect(invoke).toHaveBeenCalledWith('update_install')
  })

  it('returns unsubscribe functions from event subscriptions', async () => {
    const { appApi } = await import('../src/lib/appApi')
    const unsubscribe = await appApi.app.onCloseRequest(() => {})
    expect(typeof unsubscribe).toBe('function')
  })
})
