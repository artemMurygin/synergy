import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { vi } from 'vitest'
import type { AuthBridge, SessionSnapshotView } from '../../../../preload/auth-bridge'

export const unauthenticatedSnapshot: SessionSnapshotView = { state: 'unauthenticated', user: null }

export const authenticatedSnapshot: SessionSnapshotView = {
  state: 'authenticated',
  user: { id: 'u1', login: 'admin' }
}

export interface BridgeMock {
  bridge: AuthBridge
  login: ReturnType<typeof vi.fn<AuthBridge['login']>>
  changePassword: ReturnType<typeof vi.fn<AuthBridge['changePassword']>>
  logout: ReturnType<typeof vi.fn<AuthBridge['logout']>>
  retryRestore: ReturnType<typeof vi.fn<AuthBridge['retryRestore']>>
  getState: ReturnType<typeof vi.fn<AuthBridge['getState']>>
  unsubscribe: ReturnType<typeof vi.fn<() => void>>
  emit: (snapshot: SessionSnapshotView) => void
  listenerCount: () => number
}

export function installBridgeMock(initial: SessionSnapshotView = unauthenticatedSnapshot): BridgeMock {
  const listeners = new Set<(snapshot: SessionSnapshotView) => void>()
  const unsubscribe = vi.fn<() => void>()
  const login = vi.fn<AuthBridge['login']>()
  const changePassword = vi.fn<AuthBridge['changePassword']>()
  const logout = vi.fn<AuthBridge['logout']>()
  const retryRestore = vi.fn<AuthBridge['retryRestore']>()
  const getState = vi.fn<AuthBridge['getState']>().mockResolvedValue(initial)
  const bridge: AuthBridge = {
    login,
    changePassword,
    logout,
    retryRestore,
    getState,
    onSessionChanged: (listener) => {
      listeners.add(listener)
      return () => {
        unsubscribe()
        listeners.delete(listener)
      }
    }
  }
  Object.defineProperty(window, 'api', { value: { auth: bridge }, configurable: true, writable: true })
  return {
    bridge,
    login,
    changePassword,
    logout,
    retryRestore,
    getState,
    unsubscribe,
    emit: (snapshot) => listeners.forEach((listener) => listener(snapshot)),
    listenerCount: () => listeners.size
  }
}

export function createQueryClient(): QueryClient {
  return new QueryClient({ defaultOptions: { mutations: { retry: false }, queries: { retry: false } } })
}

export function createWrapper(client: QueryClient = createQueryClient()) {
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  )
}
