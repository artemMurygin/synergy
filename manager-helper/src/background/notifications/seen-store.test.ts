import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { installChromeFake } from './chrome-fake.testing'
import { createSeenStore } from './seen-store'

let userId: string | null

beforeEach(() => {
  installChromeFake()
  userId = 'u1'
})
afterEach(() => {
  vi.unstubAllGlobals()
})

describe('seen-store', () => {
  it('has no last seen time at first', async () => {
    const seen = createSeenStore(() => userId)
    expect(await seen.getLastSeenCreatedAt()).toBe(null)
  })

  it('only moves the last seen time forward', async () => {
    const seen = createSeenStore(() => userId)
    await seen.advanceLastSeen('2026-11-10T09:00:00.000Z')
    await seen.advanceLastSeen('2026-11-10T08:00:00.000Z')
    expect(await seen.getLastSeenCreatedAt()).toBe('2026-11-10T09:00:00.000Z')
  })

  it('remembers shown notifications with their targets', async () => {
    const seen = createSeenStore(() => userId)
    await seen.markShown([{ id: 'n1', target: { type: 'task', id: 't1' } }])
    expect(await seen.hasShown('n1')).toBe(true)
    expect(await seen.hasShown('n2')).toBe(false)
    expect(await seen.findTarget('n1')).toEqual({ type: 'task', id: 't1' })
    expect(await seen.findTarget('n2')).toBe(null)
  })

  it('survives a restart of the service worker', async () => {
    await createSeenStore(() => userId).markShown([
      { id: 'n1', target: { type: 'task', id: 't1' } },
    ])
    expect(await createSeenStore(() => userId).hasShown('n1')).toBe(true)
  })

  it('keeps the state of another user apart', async () => {
    const seen = createSeenStore(() => userId)
    await seen.advanceLastSeen('2026-11-10T09:00:00.000Z')
    await seen.markShown([{ id: 'n1', target: { type: 'task', id: 't1' } }])
    userId = 'u2'
    expect(await seen.getLastSeenCreatedAt()).toBe(null)
    expect(await seen.hasShown('n1')).toBe(false)
  })

  it('keeps a bounded number of shown notifications', async () => {
    const seen = createSeenStore(() => userId)
    const entries = Array.from({ length: 250 }, (_, index) => ({
      id: `n${String(index)}`,
      target: { type: 'task', id: 't' },
    }))
    await seen.markShown(entries)
    expect(await seen.hasShown('n0')).toBe(false)
    expect(await seen.hasShown('n249')).toBe(true)
  })
})
