import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { getActiveSessionId, setActiveSessionId } from './active-session'

interface FakeArea {
  get: ReturnType<typeof vi.fn>
  set: ReturnType<typeof vi.fn>
  remove: ReturnType<typeof vi.fn>
}

let area: FakeArea
let store: Record<string, unknown>

beforeEach(() => {
  store = {}
  area = {
    get: vi.fn((key: string) => Promise.resolve(key in store ? { [key]: store[key] } : {})),
    set: vi.fn((items: Record<string, unknown>) => {
      Object.assign(store, items)
      return Promise.resolve()
    }),
    remove: vi.fn((key: string) => {
      Reflect.deleteProperty(store, key)
      return Promise.resolve()
    }),
  }
  vi.stubGlobal('chrome', { storage: { local: area } })
})
afterEach(() => {
  vi.unstubAllGlobals()
})

describe('active-session', () => {
  it('returns null when nothing is stored', async () => {
    await expect(getActiveSessionId()).resolves.toBeNull()
  })

  it('round-trips an id through chrome.storage.local', async () => {
    await setActiveSessionId('abc')
    await expect(getActiveSessionId()).resolves.toBe('abc')
  })

  it('clears the stored id on null', async () => {
    await setActiveSessionId('abc')
    await setActiveSessionId(null)
    await expect(getActiveSessionId()).resolves.toBeNull()
  })

  it('ignores non-string stored values', async () => {
    store.activeChatSessionId = 42
    await expect(getActiveSessionId()).resolves.toBeNull()
  })

  it('is safe when storage throws', async () => {
    area.get.mockRejectedValue(new Error('unavailable'))
    area.set.mockRejectedValue(new Error('unavailable'))
    await expect(getActiveSessionId()).resolves.toBeNull()
    await expect(setActiveSessionId('x')).resolves.toBeUndefined()
  })

  it('is safe when chrome is undefined', async () => {
    vi.stubGlobal('chrome', undefined)
    await expect(getActiveSessionId()).resolves.toBeNull()
    await expect(setActiveSessionId('x')).resolves.toBeUndefined()
  })
})
