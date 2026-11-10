import { describe, expect, it, vi } from 'vitest'
import { AccessToken } from '../domain/access-token'
import { AuthError, isAuthError } from '../domain/auth-error'
import { RefreshToken } from '../domain/refresh-token'
import type { SessionSnapshot, SessionUser } from '../domain/session-snapshot'
import { SERVER_NOT_REVOKED_WARNING, VAULT_UNAVAILABLE_WARNING } from '../domain/session-messages'
import type { AuthApiPort, IssuedTokens } from './auth-api.port'
import type { TokenVaultPort } from './token-vault.port'
import { AuthService } from './auth-service'

const NOW_MS = 1_700_000_000_000
const HOUR_SEC = 3600
const USER: SessionUser = { id: 'user-1', login: 'alice' }

function makeJwt(expSec: number, marker: string): string {
  const encode = (value: object): string => Buffer.from(JSON.stringify(value)).toString('base64url')
  return `${encode({ alg: 'HS256' })}.${encode({ exp: expSec, marker })}.sig`
}

function issue(options: { marker: string; refresh: string; ttlSec?: number; mustChangePassword?: boolean }): IssuedTokens {
  const ttlSec = options.ttlSec ?? HOUR_SEC
  return {
    access: AccessToken.parse(makeJwt(NOW_MS / 1000 + ttlSec, options.marker)),
    refresh: RefreshToken.of(options.refresh),
    mustChangePassword: options.mustChangePassword ?? false
  }
}

function makeVault(initial: string | null = null, persisted = true) {
  let stored: RefreshToken | null = initial === null ? null : RefreshToken.of(initial)
  const save = vi.fn<TokenVaultPort['save']>(async (token) => {
    stored = token
    return { persisted }
  })
  const load = vi.fn<TokenVaultPort['load']>(async () => stored)
  const clear = vi.fn<TokenVaultPort['clear']>(async () => {
    stored = null
  })
  return { save, load, clear, peek: (): string | null => (stored === null ? null : stored.value) }
}

function makeApi() {
  return {
    login: vi.fn<AuthApiPort['login']>(),
    refresh: vi.fn<AuthApiPort['refresh']>(),
    logout: vi.fn<AuthApiPort['logout']>(async () => undefined),
    changePassword: vi.fn<AuthApiPort['changePassword']>(),
    getCurrentUser: vi.fn<AuthApiPort['getCurrentUser']>(async () => USER)
  }
}

function setup(options: { storedRefresh?: string | null; persisted?: boolean } = {}) {
  const api = makeApi()
  const vault = makeVault(options.storedRefresh ?? null, options.persisted ?? true)
  const clock = { nowMs: NOW_MS }
  const service = new AuthService({ api, vault, now: () => clock.nowMs })
  return { api, vault, clock, service }
}

async function catchAuthError(promise: Promise<unknown>): Promise<AuthError> {
  try {
    await promise
  } catch (error) {
    if (isAuthError(error)) return error
    throw error
  }
  throw new Error('Expected AuthError but the promise resolved')
}

function deferred<T>() {
  let resolve: (value: T) => void = () => undefined
  let reject: (reason: unknown) => void = () => undefined
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

describe('AuthService.login', () => {
  it('authenticates, keeps access in memory and persists refresh', async () => {
    const { api, vault, service } = setup()
    const issued = issue({ marker: 'a1', refresh: 'r1' })
    api.login.mockResolvedValue(issued)

    const snapshot = await service.login('alice', 'secret')

    expect(snapshot).toEqual({ state: 'authenticated', user: USER })
    expect(api.login).toHaveBeenCalledWith('alice', 'secret')
    expect(vault.peek()).toBe('r1')
    expect(await service.getAccessToken()).toBe(issued.access.value)
    expect(service.getSnapshot()).toEqual(snapshot)
  })

  it('moves to mustChangePassword when the server requires it', async () => {
    const { api, service } = setup()
    api.login.mockResolvedValue(issue({ marker: 'a1', refresh: 'r1', mustChangePassword: true }))

    const snapshot = await service.login('alice', 'secret')

    expect(snapshot.state).toBe('mustChangePassword')
  })

  it.each([
    ['INVALID_CREDENTIALS', undefined],
    ['RATE_LIMITED', 42]
  ] as const)('propagates %s and leaves the session untouched', async (code, retryAfterSec) => {
    const { api, vault, service } = setup()
    api.login.mockRejectedValue(new AuthError(code, { retryAfterSec }))

    const error = await catchAuthError(service.login('alice', 'bad'))

    expect(error.code).toBe(code)
    expect(error.retryAfterSec).toBe(retryAfterSec)
    expect(vault.save).not.toHaveBeenCalled()
    expect(await service.getAccessToken()).toBeNull()
  })

  it.each(['NETWORK', 'SERVER_ERROR'] as const)('keeps the user empty when /me fails with %s', async (code) => {
    const { api, service } = setup()
    api.login.mockResolvedValue(issue({ marker: 'a1', refresh: 'r1' }))
    api.getCurrentUser.mockRejectedValue(new AuthError(code))

    const snapshot = await service.login('alice', 'secret')

    expect(snapshot).toEqual({ state: 'authenticated', user: null })
  })

  it('warns when the vault could not persist the refresh token', async () => {
    const { api, service } = setup({ persisted: false })
    api.login.mockResolvedValue(issue({ marker: 'a1', refresh: 'r1' }))

    const snapshot = await service.login('alice', 'secret')

    expect(snapshot.warning).toBe(VAULT_UNAVAILABLE_WARNING)
    expect(snapshot.state).toBe('authenticated')
  })
})

describe('AuthService.restore', () => {
  it('goes to unauthenticated when there is no stored token', async () => {
    const { api, service } = setup()

    await service.restore()

    expect(service.getSnapshot().state).toBe('unauthenticated')
    expect(api.refresh).not.toHaveBeenCalled()
  })

  it('authenticates with the stored refresh token and rotates it', async () => {
    const { api, vault, service } = setup({ storedRefresh: 'old' })
    api.refresh.mockResolvedValue(issue({ marker: 'a2', refresh: 'new' }))

    await service.restore()

    expect(api.refresh.mock.calls[0][0].value).toBe('old')
    expect(vault.peek()).toBe('new')
    expect(service.getSnapshot()).toEqual({ state: 'authenticated', user: USER })
  })

  it('restores into mustChangePassword when the response says so', async () => {
    const { api, service } = setup({ storedRefresh: 'old' })
    api.refresh.mockResolvedValue(issue({ marker: 'a2', refresh: 'new', mustChangePassword: true }))

    await service.restore()

    expect(service.getSnapshot().state).toBe('mustChangePassword')
  })

  it.each(['TOKEN_INVALID', 'TOKEN_EXPIRED'] as const)('clears the vault on %s', async (code) => {
    const { api, vault, service } = setup({ storedRefresh: 'old' })
    api.refresh.mockRejectedValue(new AuthError(code))

    await service.restore()

    expect(vault.clear).toHaveBeenCalled()
    expect(vault.peek()).toBeNull()
    expect(service.getSnapshot()).toEqual({ state: 'unauthenticated', user: null })
  })

  it.each(['NETWORK', 'SERVER_ERROR'] as const)('enters connectionError on %s without touching the vault', async (code) => {
    const { api, vault, service } = setup({ storedRefresh: 'old' })
    api.refresh.mockRejectedValue(new AuthError(code))

    await service.restore()

    expect(service.getSnapshot().state).toBe('connectionError')
    expect(vault.clear).not.toHaveBeenCalled()
    expect(vault.peek()).toBe('old')
  })

  it('can be retried from connectionError', async () => {
    const { api, service } = setup({ storedRefresh: 'old' })
    api.refresh.mockRejectedValueOnce(new AuthError('NETWORK'))
    api.refresh.mockResolvedValueOnce(issue({ marker: 'a2', refresh: 'new' }))

    await service.restore()
    await service.restore()

    expect(service.getSnapshot().state).toBe('authenticated')
  })

  it('keeps the user empty when /me is unreachable during restore', async () => {
    const { api, service } = setup({ storedRefresh: 'old' })
    api.refresh.mockResolvedValue(issue({ marker: 'a2', refresh: 'new' }))
    api.getCurrentUser.mockRejectedValue(new AuthError('NETWORK'))

    await service.restore()

    expect(service.getSnapshot()).toEqual({ state: 'authenticated', user: null })
  })

  it('publishes restoring while the request is in flight', async () => {
    const { api, service } = setup({ storedRefresh: 'old' })
    const gate = deferred<IssuedTokens>()
    api.refresh.mockReturnValue(gate.promise)

    const restoring = service.restore()
    await vi.waitFor(() => expect(api.refresh).toHaveBeenCalled())

    expect(service.getSnapshot().state).toBe('restoring')
    gate.resolve(issue({ marker: 'a2', refresh: 'new' }))
    await restoring
  })
})

describe('AuthService.refresh', () => {
  async function authenticated() {
    const context = setup()
    context.api.login.mockResolvedValue(issue({ marker: 'a1', refresh: 'r1' }))
    await context.service.login('alice', 'secret')
    return context
  }

  it('shares a single request between parallel calls', async () => {
    const { api, service } = await authenticated()
    const gate = deferred<IssuedTokens>()
    api.refresh.mockReturnValue(gate.promise)

    const calls = [service.refresh(), service.refresh(), service.refresh()]
    gate.resolve(issue({ marker: 'a2', refresh: 'r2' }))
    const results = await Promise.all(calls)

    expect(api.refresh).toHaveBeenCalledTimes(1)
    expect(results[0].value).toBe(results[1].value)
    expect(results[1].value).toBe(results[2].value)
  })

  it('starts a new request after the previous one settled', async () => {
    const { api, service } = await authenticated()
    api.refresh.mockResolvedValueOnce(issue({ marker: 'a2', refresh: 'r2' }))
    api.refresh.mockResolvedValueOnce(issue({ marker: 'a3', refresh: 'r3' }))

    await service.refresh()
    await service.refresh()

    expect(api.refresh).toHaveBeenCalledTimes(2)
    expect(api.refresh.mock.calls[1][0].value).toBe('r2')
  })

  it('retries once with the token from the vault after REFRESH_RACE', async () => {
    const { api, vault, service } = await authenticated()
    api.refresh.mockImplementationOnce(async () => {
      await vault.save(RefreshToken.of('from-other-window'))
      throw new AuthError('REFRESH_RACE')
    })
    api.refresh.mockResolvedValueOnce(issue({ marker: 'a2', refresh: 'r2' }))

    const access = await service.refresh()

    expect(api.refresh).toHaveBeenCalledTimes(2)
    expect(api.refresh.mock.calls[1][0].value).toBe('from-other-window')
    expect(access.value).toBe(issue({ marker: 'a2', refresh: 'r2' }).access.value)
  })

  it('does not retry more than once on REFRESH_RACE', async () => {
    const { api, service } = await authenticated()
    api.refresh.mockRejectedValue(new AuthError('REFRESH_RACE'))

    const error = await catchAuthError(service.refresh())

    expect(error.code).toBe('REFRESH_RACE')
    expect(api.refresh).toHaveBeenCalledTimes(2)
  })

  it.each(['TOKEN_INVALID', 'TOKEN_EXPIRED'] as const)('wipes the session on %s', async (code) => {
    const { api, vault, service } = await authenticated()
    api.refresh.mockRejectedValue(new AuthError(code))

    const error = await catchAuthError(service.refresh())

    expect(error.code).toBe('TOKEN_INVALID')
    expect(vault.peek()).toBeNull()
    expect(service.getSnapshot()).toEqual({ state: 'unauthenticated', user: null })
    expect(await service.getAccessToken()).toBeNull()
  })

  it.each(['NETWORK', 'SERVER_ERROR'] as const)('rethrows %s and keeps the session', async (code) => {
    const { api, vault, service } = await authenticated()
    api.refresh.mockRejectedValue(new AuthError(code))

    const error = await catchAuthError(service.refresh())

    expect(error.code).toBe(code)
    expect(service.getSnapshot().state).toBe('authenticated')
    expect(vault.peek()).toBe('r1')
  })

  it('writes the new refresh token to the vault before publishing the new access', async () => {
    const { api, vault, service } = await authenticated()
    const oldAccess = issue({ marker: 'a1', refresh: 'r1' }).access.value
    const observedDuringSave: Array<string | null> = []
    vault.save.mockImplementation(async () => {
      observedDuringSave.push(await service.getAccessToken(0))
      return { persisted: true }
    })
    api.refresh.mockResolvedValue(issue({ marker: 'a2', refresh: 'r2' }))

    await service.refresh()

    expect(observedDuringSave).toEqual([oldAccess])
    expect(await service.getAccessToken(0)).toBe(issue({ marker: 'a2', refresh: 'r2' }).access.value)
  })

  it('discards a response that arrives after logout', async () => {
    const { api, vault, service } = await authenticated()
    const gate = deferred<IssuedTokens>()
    api.refresh.mockReturnValue(gate.promise)

    const pending = catchAuthError(service.refresh())
    await service.logout()
    gate.resolve(issue({ marker: 'a2', refresh: 'r2' }))
    const error = await pending

    expect(error.code).toBe('TOKEN_INVALID')
    expect(vault.peek()).toBeNull()
    expect(service.getSnapshot().state).toBe('unauthenticated')
  })

  it('moves to mustChangePassword when a refresh reports the flag', async () => {
    const { api, service } = await authenticated()
    api.refresh.mockResolvedValue(issue({ marker: 'a2', refresh: 'r2', mustChangePassword: true }))

    await service.refresh()

    expect(service.getSnapshot().state).toBe('mustChangePassword')
  })
})

describe('AuthService.getAccessToken', () => {
  it('returns null when there is no session', async () => {
    const { service } = setup()

    expect(await service.getAccessToken()).toBeNull()
  })

  it('returns the current token without refreshing when it is fresh', async () => {
    const { api, service } = setup()
    api.login.mockResolvedValue(issue({ marker: 'a1', refresh: 'r1' }))
    await service.login('alice', 'secret')

    await service.getAccessToken()

    expect(api.refresh).not.toHaveBeenCalled()
  })

  it('refreshes proactively when the token expires within the default 30 seconds', async () => {
    const { api, service } = setup()
    api.login.mockResolvedValue(issue({ marker: 'a1', refresh: 'r1', ttlSec: 20 }))
    api.refresh.mockResolvedValue(issue({ marker: 'a2', refresh: 'r2' }))
    await service.login('alice', 'secret')

    const token = await service.getAccessToken()

    expect(api.refresh).toHaveBeenCalledTimes(1)
    expect(token).toBe(issue({ marker: 'a2', refresh: 'r2' }).access.value)
  })

  it('honours a custom minTtlMs', async () => {
    const { api, service } = setup()
    api.login.mockResolvedValue(issue({ marker: 'a1', refresh: 'r1', ttlSec: 20 }))
    await service.login('alice', 'secret')

    await service.getAccessToken(10_000)

    expect(api.refresh).not.toHaveBeenCalled()
  })

  it('follows the injected clock', async () => {
    const { api, clock, service } = setup()
    api.login.mockResolvedValue(issue({ marker: 'a1', refresh: 'r1', ttlSec: 120 }))
    api.refresh.mockResolvedValue(issue({ marker: 'a2', refresh: 'r2' }))
    await service.login('alice', 'secret')
    clock.nowMs += 100_000

    await service.getAccessToken()

    expect(api.refresh).toHaveBeenCalledTimes(1)
  })

  it('returns null when the proactive refresh finds the session invalid', async () => {
    const { api, service } = setup()
    api.login.mockResolvedValue(issue({ marker: 'a1', refresh: 'r1', ttlSec: 5 }))
    api.refresh.mockRejectedValue(new AuthError('TOKEN_INVALID'))
    await service.login('alice', 'secret')

    expect(await service.getAccessToken()).toBeNull()
    expect(service.getSnapshot().state).toBe('unauthenticated')
  })

  it('falls back to a still valid token when the server is unreachable', async () => {
    const { api, service } = setup()
    const issued = issue({ marker: 'a1', refresh: 'r1', ttlSec: 20 })
    api.login.mockResolvedValue(issued)
    api.refresh.mockRejectedValue(new AuthError('NETWORK'))
    await service.login('alice', 'secret')

    expect(await service.getAccessToken()).toBe(issued.access.value)
  })

  it('throws the network error when the token is already expired', async () => {
    const { api, clock, service } = setup()
    api.login.mockResolvedValue(issue({ marker: 'a1', refresh: 'r1', ttlSec: 20 }))
    api.refresh.mockRejectedValue(new AuthError('NETWORK'))
    await service.login('alice', 'secret')
    clock.nowMs += 60_000

    const error = await catchAuthError(service.getAccessToken())

    expect(error.code).toBe('NETWORK')
  })
})

describe('AuthService.changePassword', () => {
  it('stores the new token pair and returns to authenticated', async () => {
    const { api, vault, service } = setup()
    api.login.mockResolvedValue(issue({ marker: 'a1', refresh: 'r1', mustChangePassword: true }))
    api.changePassword.mockResolvedValue(issue({ marker: 'a2', refresh: 'r2' }))
    await service.login('alice', 'temp')

    const snapshot = await service.changePassword('temp', 'brand-new')

    expect(snapshot).toEqual({ state: 'authenticated', user: USER })
    expect(api.changePassword.mock.calls[0].slice(1)).toEqual(['temp', 'brand-new'])
    expect(api.changePassword.mock.calls[0][0].value).toBe(issue({ marker: 'a1', refresh: 'r1' }).access.value)
    expect(vault.peek()).toBe('r2')
    expect(await service.getAccessToken()).toBe(issue({ marker: 'a2', refresh: 'r2' }).access.value)
  })

  it.each(['WRONG_PASSWORD', 'SAME_PASSWORD', 'WEAK_PASSWORD'] as const)('propagates %s and keeps tokens', async (code) => {
    const { api, vault, service } = setup()
    api.login.mockResolvedValue(issue({ marker: 'a1', refresh: 'r1', mustChangePassword: true }))
    api.changePassword.mockRejectedValue(new AuthError(code))
    await service.login('alice', 'temp')

    const error = await catchAuthError(service.changePassword('temp', 'x'))

    expect(error.code).toBe(code)
    expect(service.getSnapshot().state).toBe('mustChangePassword')
    expect(vault.peek()).toBe('r1')
  })

  it('rejects when there is no session', async () => {
    const { service } = setup()

    const error = await catchAuthError(service.changePassword('a', 'b'))

    expect(error.code).toBe('TOKEN_INVALID')
  })
})

describe('AuthService.logout', () => {
  async function authenticated() {
    const context = setup()
    context.api.login.mockResolvedValue(issue({ marker: 'a1', refresh: 'r1' }))
    await context.service.login('alice', 'secret')
    return context
  }

  it('revokes on the server and wipes tokens', async () => {
    const { api, vault, service } = await authenticated()

    const result = await service.logout()

    expect(result).toEqual({ serverRevoked: true })
    expect(api.logout.mock.calls[0][0].value).toBe('r1')
    expect(vault.peek()).toBeNull()
    expect(service.getSnapshot()).toEqual({ state: 'unauthenticated', user: null })
    expect(await service.getAccessToken()).toBeNull()
  })

  it.each(['NETWORK', 'SERVER_ERROR'] as const)('wipes tokens locally and warns when the server fails with %s', async (code) => {
    const { api, vault, service } = await authenticated()
    api.logout.mockRejectedValue(new AuthError(code))

    const result = await service.logout()

    expect(result).toEqual({ serverRevoked: false })
    expect(vault.peek()).toBeNull()
    expect(service.getSnapshot()).toEqual({
      state: 'unauthenticated',
      user: null,
      warning: SERVER_NOT_REVOKED_WARNING
    })
    expect(await service.getAccessToken()).toBeNull()
  })

  it('clears the warning on the next successful login', async () => {
    const { api, service } = await authenticated()
    api.logout.mockRejectedValue(new AuthError('NETWORK'))
    await service.logout()
    api.login.mockResolvedValue(issue({ marker: 'a3', refresh: 'r3' }))

    const snapshot = await service.login('alice', 'secret')

    expect(snapshot.warning).toBeUndefined()
  })

  it('reports serverRevoked when there is no token to revoke', async () => {
    const { api, service } = setup()
    await service.restore()

    const result = await service.logout()

    expect(result).toEqual({ serverRevoked: true })
    expect(api.logout).not.toHaveBeenCalled()
  })

  it('uses the stored token when memory is empty', async () => {
    const { api, vault, service } = setup({ storedRefresh: 'stored' })
    api.refresh.mockRejectedValue(new AuthError('NETWORK'))
    await service.restore()

    const result = await service.logout()

    expect(api.logout.mock.calls[0][0].value).toBe('stored')
    expect(result).toEqual({ serverRevoked: true })
    expect(vault.peek()).toBeNull()
    expect(service.getSnapshot().state).toBe('unauthenticated')
  })
})

describe('AuthService.onChange', () => {
  it('notifies listeners with snapshots and stops after unsubscribe', async () => {
    const { api, service } = setup()
    const received: SessionSnapshot[] = []
    const unsubscribe = service.onChange((snapshot) => received.push(snapshot))
    api.login.mockResolvedValue(issue({ marker: 'a1', refresh: 'r1' }))

    await service.login('alice', 'secret')
    const countAfterLogin = received.length
    unsubscribe()
    await service.logout()

    expect(countAfterLogin).toBeGreaterThan(0)
    expect(received[countAfterLogin - 1].state).toBe('authenticated')
    expect(received).toHaveLength(countAfterLogin)
  })

  it('never exposes tokens in snapshots', async () => {
    const { api, service } = setup()
    const received: SessionSnapshot[] = []
    service.onChange((snapshot) => received.push(snapshot))
    const issued = issue({ marker: 'a1', refresh: 'secret-refresh' })
    api.login.mockResolvedValue(issued)

    await service.login('alice', 'secret')

    const serialized = JSON.stringify([...received, service.getSnapshot()])
    expect(serialized).not.toContain('secret-refresh')
    expect(serialized).not.toContain(issued.access.value)
  })
})

describe('AuthService session signal', () => {
  it('aborts on logout and provides a fresh signal afterwards', async () => {
    const { api, service } = setup()
    api.login.mockResolvedValue(issue({ marker: 'a1', refresh: 'r1' }))
    await service.login('alice', 'secret')
    const signal = service.getSessionSignal()

    await service.logout()

    expect(signal.aborted).toBe(true)
    expect(service.getSessionSignal().aborted).toBe(false)
    expect(service.getSessionSignal()).not.toBe(signal)
  })

  it('aborts when the refresh token is rejected', async () => {
    const { api, service } = setup()
    api.login.mockResolvedValue(issue({ marker: 'a1', refresh: 'r1' }))
    api.refresh.mockRejectedValue(new AuthError('TOKEN_INVALID'))
    await service.login('alice', 'secret')
    const signal = service.getSessionSignal()

    await catchAuthError(service.refresh())

    expect(signal.aborted).toBe(true)
  })

  it('does not abort while the session stays alive', async () => {
    const { api, service } = setup()
    api.login.mockResolvedValue(issue({ marker: 'a1', refresh: 'r1' }))
    api.refresh.mockResolvedValue(issue({ marker: 'a2', refresh: 'r2' }))
    await service.login('alice', 'secret')
    const signal = service.getSessionSignal()

    await service.refresh()

    expect(signal.aborted).toBe(false)
  })
})

describe('AuthService.markPasswordChangeRequired', () => {
  it('moves an authenticated session to mustChangePassword', async () => {
    const { api, service } = setup()
    api.login.mockResolvedValue(issue({ marker: 'a1', refresh: 'r1' }))
    await service.login('alice', 'secret')
    const received: SessionSnapshot[] = []
    service.onChange((snapshot) => received.push(snapshot))

    service.markPasswordChangeRequired()

    expect(service.getSnapshot().state).toBe('mustChangePassword')
    expect(received).toHaveLength(1)
  })

  it('ignores calls outside the authenticated state', () => {
    const { service } = setup()

    service.markPasswordChangeRequired()

    expect(service.getSnapshot().state).toBe('restoring')
  })
})
