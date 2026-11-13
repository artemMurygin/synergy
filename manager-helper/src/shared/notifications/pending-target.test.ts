import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { onPendingTargetChanged, setPendingTarget, takePendingTarget } from './pending-target'

type ChangeListener = (changes: Record<string, { newValue?: unknown }>, areaName: string) => void

let store: Record<string, unknown>
let changeListeners: ChangeListener[]
let sessionGet: ReturnType<typeof vi.fn<(key: string) => Promise<Record<string, unknown>>>>
let sessionSet: ReturnType<typeof vi.fn<(items: Record<string, unknown>) => Promise<void>>>

function emitChange(changes: Record<string, { newValue?: unknown }>, areaName: string) {
  for (const listener of changeListeners) listener(changes, areaName)
}

beforeEach(() => {
  store = {}
  changeListeners = []
  sessionGet = vi.fn((key: string) => Promise.resolve(key in store ? { [key]: store[key] } : {}))
  sessionSet = vi.fn((items: Record<string, unknown>) => {
    Object.assign(store, items)
    return Promise.resolve()
  })
  vi.stubGlobal('chrome', {
    storage: {
      session: {
        get: sessionGet,
        set: sessionSet,
        remove: vi.fn((key: string) => {
          Reflect.deleteProperty(store, key)
          return Promise.resolve()
        }),
      },
      onChanged: {
        addListener: vi.fn((listener: ChangeListener) => {
          changeListeners.push(listener)
        }),
        removeListener: vi.fn((listener: ChangeListener) => {
          changeListeners = changeListeners.filter((candidate) => candidate !== listener)
        }),
      },
    },
  })
})
afterEach(() => {
  vi.unstubAllGlobals()
})

describe('pending-target', () => {
  it('stores the target in chrome.storage.session', async () => {
    await setPendingTarget({ kind: 'task', taskId: 't1' })
    expect(sessionSet).toHaveBeenCalledWith({
      pendingTarget: { kind: 'task', taskId: 't1' },
    })
  })

  it('take returns the stored target and clears it', async () => {
    await setPendingTarget({ kind: 'task', taskId: 't1' })
    expect(await takePendingTarget()).toEqual({ kind: 'task', taskId: 't1' })
    expect(await takePendingTarget()).toBe(null)
  })

  it('keeps the notifications list target', async () => {
    await setPendingTarget({ kind: 'notifications' })
    expect(await takePendingTarget()).toEqual({ kind: 'notifications' })
  })

  it('keeps the request target with its id', async () => {
    await setPendingTarget({ kind: 'request', requestId: 'r1' })
    expect(await takePendingTarget()).toEqual({ kind: 'request', requestId: 'r1' })
  })

  it('take drops a request target without an id', async () => {
    store.pendingTarget = { kind: 'request' }
    expect(await takePendingTarget()).toBe(null)
  })

  it('take returns null when nothing is stored', async () => {
    expect(await takePendingTarget()).toBe(null)
  })

  it('take drops a malformed stored value', async () => {
    store.pendingTarget = { kind: 'task' }
    expect(await takePendingTarget()).toBe(null)
    expect(store.pendingTarget).toBeUndefined()
  })

  it('take returns null when the storage fails', async () => {
    sessionGet.mockRejectedValueOnce(new Error('boom'))
    expect(await takePendingTarget()).toBe(null)
  })

  it('reports a newly set target in the session area', () => {
    const listener = vi.fn()
    onPendingTargetChanged(listener)
    emitChange({ pendingTarget: { newValue: { kind: 'task', taskId: 't1' } } }, 'session')
    expect(listener).toHaveBeenCalledTimes(1)
  })

  it('ignores removals, other keys and other areas', () => {
    const listener = vi.fn()
    onPendingTargetChanged(listener)
    emitChange({ pendingTarget: {} }, 'session')
    emitChange({ activeSection: { newValue: 'tasks' } }, 'session')
    emitChange({ pendingTarget: { newValue: { kind: 'notifications' } } }, 'local')
    expect(listener).not.toHaveBeenCalled()
  })

  it('stops reporting after unsubscribe', () => {
    const listener = vi.fn()
    onPendingTargetChanged(listener)()
    emitChange({ pendingTarget: { newValue: { kind: 'notifications' } } }, 'session')
    expect(listener).not.toHaveBeenCalled()
  })
})
