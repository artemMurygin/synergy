import { describe, expect, it, vi } from 'vitest'
import { PORTAL_CHANNELS } from '../../preload/portal-bridge'
import { registerPortalIpc } from './portal-ipc'

type Handler = (event: unknown, ...args: unknown[]) => unknown

function setup(portalUrl: string | null) {
  const handlers = new Map<string, Handler>()
  const openExternal = vi.fn().mockResolvedValue(undefined)
  registerPortalIpc({ ipcMain: { handle: (c, h) => void handlers.set(c, h) }, portalUrl, openExternal })
  const invoke = (...args: unknown[]) => handlers.get(PORTAL_CHANNELS.openRequest)!({}, ...args)
  return { invoke, openExternal }
}

describe('registerPortalIpc', () => {
  it('opens the request page of the configured portal externally', async () => {
    const { invoke, openExternal } = setup('https://portal.example.com')
    await expect(invoke('r 1')).resolves.toBe('opened')
    expect(openExternal).toHaveBeenCalledWith('https://portal.example.com/requests/r%201')
  })

  it('reports unavailable and opens nothing when the portal is not configured', async () => {
    const { invoke, openExternal } = setup(null)
    await expect(invoke('r1')).resolves.toBe('unavailable')
    expect(openExternal).not.toHaveBeenCalled()
  })

  it('reports invalid for an identifier that cannot form a portal address', async () => {
    const { invoke, openExternal } = setup('https://portal.example.com')
    await expect(invoke('..')).resolves.toBe('invalid')
    await expect(invoke('')).resolves.toBe('invalid')
    await expect(invoke(42)).resolves.toBe('invalid')
    expect(openExternal).not.toHaveBeenCalled()
  })

  it('reports invalid when the system fails to open the address', async () => {
    const { invoke, openExternal } = setup('https://portal.example.com')
    openExternal.mockRejectedValue(new Error('no browser'))
    await expect(invoke('r1')).resolves.toBe('invalid')
  })
})
