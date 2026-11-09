import { beforeEach, describe, expect, it, vi } from 'vitest'

const KEY = 'cc.activeThreadId'

async function loadStore() {
  vi.resetModules()
  return (await import('./chat.store')).useChatStore
}

describe('useChatStore', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('starts with null when nothing is stored', async () => {
    const useChatStore = await loadStore()
    expect(useChatStore.getState().activeThreadId).toBeNull()
  })

  it('setActiveThread updates activeThreadId', async () => {
    const useChatStore = await loadStore()
    useChatStore.getState().setActiveThread('t1')
    expect(useChatStore.getState().activeThreadId).toBe('t1')
  })

  it('persists the value and restores it on store creation', async () => {
    const first = await loadStore()
    first.getState().setActiveThread('t2')
    expect(localStorage.getItem(KEY)).toBe('t2')

    const second = await loadStore()
    expect(second.getState().activeThreadId).toBe('t2')
  })

  it('setActiveThread(null) resets state and storage', async () => {
    const useChatStore = await loadStore()
    useChatStore.getState().setActiveThread('t3')
    useChatStore.getState().setActiveThread(null)
    expect(useChatStore.getState().activeThreadId).toBeNull()
    expect(localStorage.getItem(KEY)).toBeNull()
  })

  it('starts with null when localStorage throws on read', async () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('denied')
    })
    const useChatStore = await loadStore()
    expect(useChatStore.getState().activeThreadId).toBeNull()
  })

  it('does not break when localStorage throws on write', async () => {
    const useChatStore = await loadStore()
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('quota')
    })
    vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => {
      throw new Error('quota')
    })
    expect(() => useChatStore.getState().setActiveThread('t4')).not.toThrow()
    expect(useChatStore.getState().activeThreadId).toBe('t4')
    expect(() => useChatStore.getState().setActiveThread(null)).not.toThrow()
    expect(useChatStore.getState().activeThreadId).toBeNull()
  })

  it('ignores a corrupt stored value (empty string)', async () => {
    localStorage.setItem(KEY, '')
    const useChatStore = await loadStore()
    expect(useChatStore.getState().activeThreadId).toBeNull()
  })
})
