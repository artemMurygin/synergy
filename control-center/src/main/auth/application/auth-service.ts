import type { AccessToken } from '../domain/access-token'
import { AuthError, isAuthError } from '../domain/auth-error'
import type { RefreshToken } from '../domain/refresh-token'
import {
  ACCESS_MIN_TTL_MS,
  SERVER_NOT_REVOKED_WARNING,
  VAULT_UNAVAILABLE_WARNING
} from '../domain/session-messages'
import type { SessionSnapshot, SessionUser } from '../domain/session-snapshot'
import { assertTransition, type SessionState } from '../domain/session-state'
import type { AuthApiPort, IssuedTokens } from './auth-api.port'
import type { TokenVaultPort } from './token-vault.port'

interface AuthServiceDependencies {
  api: AuthApiPort
  vault: TokenVaultPort
  now?: () => number
}

type SessionListener = (snapshot: SessionSnapshot) => void

function isTokenRejection(error: unknown): boolean {
  return isAuthError(error) && (error.code === 'TOKEN_INVALID' || error.code === 'TOKEN_EXPIRED')
}

function isServerUnavailable(error: unknown): boolean {
  return isAuthError(error) && (error.code === 'NETWORK' || error.code === 'SERVER_ERROR')
}

export class AuthService {
  private readonly api: AuthApiPort
  private readonly vault: TokenVaultPort
  private readonly now: () => number
  private readonly listeners = new Set<SessionListener>()
  private state: SessionState = 'restoring'
  private user: SessionUser | null = null
  private warning: string | undefined
  private access: AccessToken | null = null
  private refreshToken: RefreshToken | null = null
  private inFlightExchange: Promise<IssuedTokens> | null = null
  private sessionEpoch = 0
  private sessionAbort = new AbortController()

  constructor(dependencies: AuthServiceDependencies) {
    this.api = dependencies.api
    this.vault = dependencies.vault
    this.now = dependencies.now ?? Date.now
  }

  async restore(): Promise<void> {
    if (this.state === 'connectionError') this.transitionTo('restoring')
    if (this.state !== 'restoring') return

    const stored = await this.vault.load()
    if (stored === null) {
      this.transitionTo('unauthenticated')
      return
    }
    this.refreshToken = stored

    try {
      const issued = await this.exchange()
      this.user = await this.fetchUser(issued.access)
      this.transitionTo(issued.mustChangePassword ? 'mustChangePassword' : 'authenticated')
    } catch (error) {
      if (isTokenRejection(error)) return
      if (this.state === 'restoring') this.transitionTo('connectionError')
    }
  }

  async login(login: string, password: string): Promise<SessionSnapshot> {
    const issued = await this.api.login(login, password)
    const epoch = this.sessionEpoch
    this.warning = undefined
    await this.commit(issued, epoch)
    this.user = await this.fetchUser(issued.access)
    this.transitionTo(issued.mustChangePassword ? 'mustChangePassword' : 'authenticated')
    return this.getSnapshot()
  }

  async changePassword(current: string, next: string): Promise<SessionSnapshot> {
    const accessValue = await this.getAccessToken()
    const access = this.access
    if (accessValue === null || access === null) throw new AuthError('TOKEN_INVALID')

    const issued = await this.api.changePassword(access, current, next)
    await this.commit(issued, this.sessionEpoch)
    this.user = (await this.fetchUser(issued.access)) ?? this.user
    this.transitionTo(issued.mustChangePassword ? 'mustChangePassword' : 'authenticated')
    return this.getSnapshot()
  }

  async logout(): Promise<{ serverRevoked: boolean }> {
    const token = this.refreshToken ?? (await this.vault.load())
    let isServerRevoked = true

    if (token !== null) {
      try {
        await this.api.logout(token)
      } catch (error) {
        if (isServerUnavailable(error)) isServerRevoked = false
      }
    }

    await this.wipe(isServerRevoked ? undefined : SERVER_NOT_REVOKED_WARNING)
    return { serverRevoked: isServerRevoked }
  }

  async refresh(): Promise<AccessToken> {
    const issued = await this.exchange()
    return issued.access
  }

  async getAccessToken(minTtlMs: number = ACCESS_MIN_TTL_MS): Promise<string | null> {
    if (this.access === null) return null
    if (!this.access.expiresWithin(minTtlMs, this.now())) return this.access.value

    try {
      const refreshed = await this.refresh()
      return refreshed.value
    } catch (error) {
      if (isTokenRejection(error)) return null
      const current = this.access
      if (isServerUnavailable(error) && current !== null && !current.expiresWithin(0, this.now())) {
        return current.value
      }
      throw error
    }
  }

  getSnapshot(): SessionSnapshot {
    const snapshot: SessionSnapshot = { state: this.state, user: this.user }
    if (this.warning !== undefined) snapshot.warning = this.warning
    return snapshot
  }

  onChange(listener: SessionListener): () => void {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }

  getSessionSignal(): AbortSignal {
    return this.sessionAbort.signal
  }

  markPasswordChangeRequired(): void {
    if (this.state === 'authenticated') this.transitionTo('mustChangePassword')
  }

  private exchange(): Promise<IssuedTokens> {
    if (this.inFlightExchange === null) {
      this.inFlightExchange = this.runExchange().finally(() => {
        this.inFlightExchange = null
      })
    }
    return this.inFlightExchange
  }

  private async runExchange(): Promise<IssuedTokens> {
    const epoch = this.sessionEpoch
    const token = this.refreshToken ?? (await this.vault.load())
    if (token === null) {
      await this.wipe()
      throw new AuthError('TOKEN_INVALID')
    }

    let issued: IssuedTokens
    try {
      issued = await this.requestRefresh(token)
    } catch (error) {
      if (isTokenRejection(error)) {
        if (epoch === this.sessionEpoch) await this.wipe()
        throw new AuthError('TOKEN_INVALID')
      }
      throw error
    }

    if (epoch !== this.sessionEpoch) throw new AuthError('TOKEN_INVALID')
    await this.commit(issued, epoch)
    if (this.state === 'authenticated' && issued.mustChangePassword) this.transitionTo('mustChangePassword')
    return issued
  }

  private async requestRefresh(token: RefreshToken): Promise<IssuedTokens> {
    try {
      return await this.api.refresh(token)
    } catch (error) {
      if (!isAuthError(error) || error.code !== 'REFRESH_RACE') throw error
      const latest = await this.vault.load()
      if (latest === null) throw new AuthError('TOKEN_INVALID')
      return this.api.refresh(latest)
    }
  }

  private async commit(issued: IssuedTokens, epoch: number): Promise<void> {
    const { persisted } = await this.vault.save(issued.refresh)
    if (epoch !== this.sessionEpoch) {
      await this.vault.clear()
      throw new AuthError('TOKEN_INVALID')
    }
    this.refreshToken = issued.refresh
    this.access = issued.access
    this.warning = persisted ? undefined : VAULT_UNAVAILABLE_WARNING
  }

  private async fetchUser(access: AccessToken): Promise<SessionUser | null> {
    try {
      return await this.api.getCurrentUser(access)
    } catch (error) {
      if (isServerUnavailable(error)) return null
      throw error
    }
  }

  private async wipe(warning?: string): Promise<void> {
    this.sessionEpoch += 1
    this.access = null
    this.refreshToken = null
    this.user = null
    await this.vault.clear()
    this.warning = warning
    if (this.state === 'connectionError') this.transitionTo('restoring')
    if (this.state !== 'unauthenticated') {
      this.transitionTo('unauthenticated')
    } else {
      this.publish()
    }
  }

  private transitionTo(next: SessionState): void {
    if (next !== this.state) {
      assertTransition(this.state, next)
      const previous = this.state
      this.state = next
      if (next === 'unauthenticated' && previous !== 'unauthenticated') this.resetSessionSignal()
    }
    this.publish()
  }

  private resetSessionSignal(): void {
    this.sessionAbort.abort()
    this.sessionAbort = new AbortController()
  }

  private publish(): void {
    const snapshot = this.getSnapshot()
    for (const listener of this.listeners) listener(snapshot)
  }
}
