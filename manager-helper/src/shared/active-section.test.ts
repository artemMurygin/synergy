import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { getActiveSection, setActiveSection } from './active-section'

let store: Record<string, unknown>

beforeEach(() => {
  store = {}
  vi.stubGlobal('chrome', {
    storage: {
      local: {
        get: vi.fn((key: string) => Promise.resolve(key in store ? { [key]: store[key] } : {})),
        set: vi.fn((items: Record<string, unknown>) => {
          Object.assign(store, items)
          return Promise.resolve()
        }),
      },
    },
  })
})
afterEach(() => {
  vi.unstubAllGlobals()
})

describe('active section', () => {
  it('defaults to chat when nothing is stored', async () => {
    expect(await getActiveSection()).toBe('chat')
  })

  it('reads back what was written', async () => {
    await setActiveSection('tasks')
    expect(await getActiveSection()).toBe('tasks')
    await setActiveSection('chat')
    expect(await getActiveSection()).toBe('chat')
  })

  it('falls back to chat for an unknown stored value', async () => {
    store.activeSection = 'kanban'
    expect(await getActiveSection()).toBe('chat')
  })

  it('falls back to chat when storage throws, and swallows write errors', async () => {
    vi.stubGlobal('chrome', {
      storage: {
        local: {
          get: () => Promise.reject(new Error('boom')),
          set: () => Promise.reject(new Error('boom')),
        },
      },
    })
    expect(await getActiveSection()).toBe('chat')
    await expect(setActiveSection('tasks')).resolves.toBeUndefined()
  })
})
