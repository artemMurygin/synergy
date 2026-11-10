import { describe, expect, it, vi } from 'vitest'
import { AuthError } from '../domain/auth-error'
import type { SessionSnapshot } from '../domain/session-snapshot'
import { registerAuthIpc } from './auth-ipc'

type Handler = (event: unknown, ...args: unknown[]) => unknown

const AUTHENTICATED: SessionSnapshot = {
  state: 'authenticated',
  user: { id: 'u1', login: 'admin' }
}

function createFakeIpcMain() {
  const handlers = new Map<string, Handler>()
  return {
    handlers,
    handle(channel: string, handler: Handler): void {
      handlers.set(channel, handler)
    },
    invoke(channel: string, ...args: unknown[]): unknown {
      const handler = handlers.get(channel)
      if (!handler) throw new Error(`no handler for ${channel}`)
      return handler({}, ...args)
    }
  }
}

function createFakeAuth() {
  let listener: ((snapshot: SessionSnapshot) => void) | null = null
  return {
    login: vi.fn(async (): Promise<SessionSnapshot> => AUTHENTICATED),
    changePassword: vi.fn(async (): Promise<SessionSnapshot> => AUTHENTICATED),
    logout: vi.fn(async () => ({ serverRevoked: true })),
    restore: vi.fn(async (): Promise<void> => undefined),
    getSnapshot: vi.fn((): SessionSnapshot => AUTHENTICATED),
    onChange: vi.fn((next: (snapshot: SessionSnapshot) => void) => {
      listener = next
      return () => {
        listener = null
      }
    }),
    emit(snapshot: SessionSnapshot): void {
      listener?.(snapshot)
    }
  }
}

function createFakeWindow() {
  return { webContents: { send: vi.fn() } }
}

function setup() {
  const ipcMain = createFakeIpcMain()
  const auth = createFakeAuth()
  const windows = [createFakeWindow(), createFakeWindow()]
  registerAuthIpc({ ipcMain, auth, getWindows: () => windows })
  return { ipcMain, auth, windows }
}

describe('registerAuthIpc', () => {
  it('registers all auth channels', () => {
    const { ipcMain } = setup()
    expect([...ipcMain.handlers.keys()].sort()).toEqual([
      'auth:changePassword',
      'auth:getState',
      'auth:login',
      'auth:logout',
      'auth:retryRestore'
    ])
  })

  it('login returns snapshot on success', async () => {
    const { ipcMain, auth } = setup()
    const result = await ipcMain.invoke('auth:login', 'admin', 'secret')
    expect(auth.login).toHaveBeenCalledWith('admin', 'secret')
    expect(result).toEqual({ ok: true, snapshot: AUTHENTICATED })
  })

  it('login maps AuthError to failure code', async () => {
    const { ipcMain, auth } = setup()
    auth.login.mockRejectedValueOnce(new AuthError('INVALID_CREDENTIALS'))
    expect(await ipcMain.invoke('auth:login', 'admin', 'bad')).toEqual({
      ok: false,
      code: 'INVALID_CREDENTIALS'
    })
  })

  it('login passes retryAfterSec on rate limit', async () => {
    const { ipcMain, auth } = setup()
    auth.login.mockRejectedValueOnce(new AuthError('RATE_LIMITED', { retryAfterSec: 30 }))
    expect(await ipcMain.invoke('auth:login', 'admin', 'x')).toEqual({
      ok: false,
      code: 'RATE_LIMITED',
      retryAfterSec: 30
    })
  })

  it('maps unexpected errors to SERVER_ERROR without leaking the message', async () => {
    const { ipcMain, auth } = setup()
    auth.login.mockRejectedValueOnce(new Error('boom secret-token'))
    const result = await ipcMain.invoke('auth:login', 'admin', 'x')
    expect(result).toEqual({ ok: false, code: 'SERVER_ERROR' })
  })

  it('changePassword returns snapshot and maps errors', async () => {
    const { ipcMain, auth } = setup()
    expect(await ipcMain.invoke('auth:changePassword', 'old', 'new')).toEqual({
      ok: true,
      snapshot: AUTHENTICATED
    })
    expect(auth.changePassword).toHaveBeenCalledWith('old', 'new')
    auth.changePassword.mockRejectedValueOnce(new AuthError('WEAK_PASSWORD'))
    expect(await ipcMain.invoke('auth:changePassword', 'old', 'new')).toEqual({
      ok: false,
      code: 'WEAK_PASSWORD'
    })
  })

  it.each([
    ['non-string login', [1, 'p']],
    ['non-string password', ['a', null]],
    ['empty login', ['', 'p']],
    ['empty password', ['a', '']],
    ['too long login', ['a'.repeat(257), 'p']],
    ['too long password', ['a', 'p'.repeat(257)]],
    ['missing args', []]
  ])('login rejects invalid input: %s', async (_name, args) => {
    const { ipcMain, auth } = setup()
    expect(await ipcMain.invoke('auth:login', ...args)).toEqual({
      ok: false,
      code: 'INVALID_INPUT'
    })
    expect(auth.login).not.toHaveBeenCalled()
  })

  it.each([
    ['non-string current', [{}, 'n']],
    ['empty current', ['', 'n']],
    ['empty next', ['c', '']],
    ['too long next', ['c', 'n'.repeat(257)]]
  ])('changePassword rejects invalid input: %s', async (_name, args) => {
    const { ipcMain, auth } = setup()
    expect(await ipcMain.invoke('auth:changePassword', ...args)).toEqual({
      ok: false,
      code: 'INVALID_INPUT'
    })
    expect(auth.changePassword).not.toHaveBeenCalled()
  })

  it('accepts values of exactly 256 characters', async () => {
    const { ipcMain, auth } = setup()
    const result = await ipcMain.invoke('auth:login', 'a'.repeat(256), 'p'.repeat(256))
    expect(result).toEqual({ ok: true, snapshot: AUTHENTICATED })
    expect(auth.login).toHaveBeenCalled()
  })

  it('logout returns serverRevoked', async () => {
    const { ipcMain, auth } = setup()
    auth.logout.mockResolvedValueOnce({ serverRevoked: false })
    expect(await ipcMain.invoke('auth:logout')).toEqual({ serverRevoked: false })
  })

  it('retryRestore calls restore and resolves with nothing', async () => {
    const { ipcMain, auth } = setup()
    expect(await ipcMain.invoke('auth:retryRestore')).toBeUndefined()
    expect(auth.restore).toHaveBeenCalledTimes(1)
  })

  it('retryRestore swallows errors', async () => {
    const { ipcMain, auth } = setup()
    auth.restore.mockRejectedValueOnce(new Error('x'))
    await expect(ipcMain.invoke('auth:retryRestore')).resolves.toBeUndefined()
  })

  it('getState returns current snapshot', async () => {
    const { ipcMain } = setup()
    expect(await ipcMain.invoke('auth:getState')).toEqual(AUTHENTICATED)
  })

  it('broadcasts session:changed to all windows', () => {
    const { auth, windows } = setup()
    const snapshot: SessionSnapshot = { state: 'unauthenticated', user: null, warning: 'w' }
    auth.emit(snapshot)
    for (const window of windows) {
      expect(window.webContents.send).toHaveBeenCalledWith('session:changed', snapshot)
    }
  })

  it('never exposes token-like fields in results or events', async () => {
    const { ipcMain, auth, windows } = setup()
    const leaky: SessionSnapshot = Object.assign(
      { state: 'authenticated' as const, user: { id: 'u1', login: 'admin' } },
      { accessToken: 'AAA', refreshToken: 'RRR' }
    )
    auth.login.mockResolvedValueOnce(leaky)
    auth.getSnapshot.mockReturnValueOnce(leaky)
    const serialized = JSON.stringify([
      await ipcMain.invoke('auth:login', 'admin', 'p'),
      await ipcMain.invoke('auth:getState')
    ])
    auth.emit(leaky)
    const events = JSON.stringify(windows[0].webContents.send.mock.calls)
    for (const text of [serialized, events]) {
      expect(text).not.toMatch(/AAA|RRR|token/i)
    }
  })
})
