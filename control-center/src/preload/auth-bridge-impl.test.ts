import { describe, expect, it, vi } from 'vitest'
import type { SessionSnapshotView } from './auth-bridge'
import { createAuthBridge } from './auth-bridge-impl'

type Listener = (event: unknown, snapshot: SessionSnapshotView) => void

function createFakeIpcRenderer() {
  const listeners = new Map<string, Set<Listener>>()
  return {
    invoke: vi.fn(),
    on: vi.fn((channel: string, listener: Listener) => {
      const set = listeners.get(channel) ?? new Set<Listener>()
      set.add(listener)
      listeners.set(channel, set)
    }),
    removeListener: vi.fn((channel: string, listener: Listener) => {
      listeners.get(channel)?.delete(listener)
    }),
    emit(channel: string, snapshot: SessionSnapshotView): void {
      listeners.get(channel)?.forEach((listener) => listener({}, snapshot))
    },
    count(channel: string): number {
      return listeners.get(channel)?.size ?? 0
    }
  }
}

describe('createAuthBridge', () => {
  it('exposes only the contract methods', () => {
    const bridge = createAuthBridge(createFakeIpcRenderer())
    expect(Object.keys(bridge).sort()).toEqual([
      'changePassword',
      'getState',
      'login',
      'logout',
      'onSessionChanged',
      'retryRestore'
    ])
  })

  it('does not expose ipcRenderer', () => {
    const bridge = createAuthBridge(createFakeIpcRenderer())
    const serialized = Object.values(bridge).map((value) => typeof value)
    expect(serialized.every((type) => type === 'function')).toBe(true)
    expect('ipcRenderer' in bridge).toBe(false)
    expect('invoke' in bridge).toBe(false)
  })

  it.each([
    ['login', ['a', 'b'], 'auth:login'],
    ['changePassword', ['a', 'b'], 'auth:changePassword'],
    ['logout', [], 'auth:logout'],
    ['retryRestore', [], 'auth:retryRestore'],
    ['getState', [], 'auth:getState']
  ] as const)('%s invokes %s', async (method, args, channel) => {
    const ipc = createFakeIpcRenderer()
    const bridge = createAuthBridge(ipc)
    ipc.invoke.mockResolvedValueOnce('result')
    const result = await bridge[method](...(args as [string, string]))
    expect(ipc.invoke).toHaveBeenCalledWith(channel, ...args)
    expect(result).toBe('result')
  })

  it('delivers session:changed snapshots without the event object', () => {
    const ipc = createFakeIpcRenderer()
    const bridge = createAuthBridge(ipc)
    const listener = vi.fn()
    bridge.onSessionChanged(listener)
    const snapshot: SessionSnapshotView = { state: 'unauthenticated', user: null }
    ipc.emit('session:changed', snapshot)
    expect(listener).toHaveBeenCalledWith(snapshot)
  })

  it('unsubscribe removes only its own listener', () => {
    const ipc = createFakeIpcRenderer()
    const bridge = createAuthBridge(ipc)
    const first = vi.fn()
    const second = vi.fn()
    const unsubscribeFirst = bridge.onSessionChanged(first)
    bridge.onSessionChanged(second)
    unsubscribeFirst()
    expect(ipc.count('session:changed')).toBe(1)
    ipc.emit('session:changed', { state: 'unauthenticated', user: null })
    expect(first).not.toHaveBeenCalled()
    expect(second).toHaveBeenCalledTimes(1)
  })
})
