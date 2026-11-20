import { describe, expect, it, vi } from 'vitest'
import { installMediaPermissions, type PermissionSessionPort } from './media-permissions'

const APP = 'http://localhost:5173'

function setup(rendererUrl: string | null = APP) {
  let request: Parameters<PermissionSessionPort['setPermissionRequestHandler']>[0] = () => undefined
  let check: Parameters<PermissionSessionPort['setPermissionCheckHandler']>[0] = () => false
  const session: PermissionSessionPort = {
    setPermissionRequestHandler: (handler) => {
      if (handler) request = handler
    },
    setPermissionCheckHandler: (handler) => {
      if (handler) check = handler
    }
  }
  installMediaPermissions(session, rendererUrl ?? undefined)
  const ask = (permission: string, details: { requestingUrl: string; mediaTypes?: string[] }): boolean => {
    const callback = vi.fn()
    request({}, permission, callback, details)
    return callback.mock.calls[0]?.[0] === true
  }
  return { ask, check: (permission: string, origin: string, mediaType?: string) => check(null, permission, origin, { mediaType }) }
}

describe('media-permissions', () => {
  it('allows the audio microphone for the app window', () => {
    const { ask } = setup()
    expect(ask('media', { requestingUrl: `${APP}/`, mediaTypes: ['audio'] })).toBe(true)
  })

  it('denies a request that includes video', () => {
    const { ask } = setup()
    expect(ask('media', { requestingUrl: `${APP}/`, mediaTypes: ['audio', 'video'] })).toBe(false)
    expect(ask('media', { requestingUrl: `${APP}/`, mediaTypes: ['video'] })).toBe(false)
  })

  it('denies a media request without declared types', () => {
    const { ask } = setup()
    expect(ask('media', { requestingUrl: `${APP}/` })).toBe(false)
  })

  it('denies other permissions even for the app window', () => {
    const { ask } = setup()
    for (const permission of ['geolocation', 'notifications', 'clipboard-read', 'openExternal']) {
      expect(ask(permission, { requestingUrl: `${APP}/`, mediaTypes: ['audio'] })).toBe(false)
    }
  })

  it('denies a foreign origin', () => {
    const { ask } = setup()
    expect(ask('media', { requestingUrl: 'https://evil.example/', mediaTypes: ['audio'] })).toBe(false)
  })

  it('treats a packaged file:// page as the app window when there is no dev server', () => {
    const { ask } = setup(null)
    expect(ask('media', { requestingUrl: 'file:///app/out/renderer/index.html', mediaTypes: ['audio'] })).toBe(true)
    expect(ask('media', { requestingUrl: 'https://evil.example/', mediaTypes: ['audio'] })).toBe(false)
  })

  it('answers the permission check: only audio media of the app', () => {
    const { check } = setup()
    expect(check('media', APP, 'audio')).toBe(true)
    expect(check('media', APP, 'video')).toBe(false)
    expect(check('media', 'https://evil.example', 'audio')).toBe(false)
    expect(check('notifications', APP)).toBe(false)
  })
})
