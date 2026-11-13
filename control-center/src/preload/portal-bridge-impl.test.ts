import { describe, expect, it, vi } from 'vitest'
import { PORTAL_CHANNELS } from './portal-bridge'
import { createPortalBridge } from './portal-bridge-impl'

describe('createPortalBridge', () => {
  it('invokes the openRequest channel with the request id', async () => {
    const invoke = vi.fn().mockResolvedValue('opened')
    const bridge = createPortalBridge({ invoke })
    await expect(bridge.openRequest('r1')).resolves.toBe('opened')
    expect(invoke).toHaveBeenCalledWith(PORTAL_CHANNELS.openRequest, 'r1')
  })
})
