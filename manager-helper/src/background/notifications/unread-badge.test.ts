import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { installChromeFake } from './chrome-fake.testing'
import type { ChromeFake } from './chrome-fake.testing'
import { clearUnreadBadge, setUnreadBadge } from './unread-badge'

let chromeFake: ChromeFake

beforeEach(() => {
  chromeFake = installChromeFake()
})
afterEach(() => {
  vi.unstubAllGlobals()
})

describe('unread-badge', () => {
  it('shows the unread count on the badge', async () => {
    await setUnreadBadge(3)
    expect(chromeFake.action.setBadgeText).toHaveBeenLastCalledWith({ text: '3' })
    expect(chromeFake.action.setBadgeBackgroundColor).toHaveBeenCalled()
  })

  it('shows 99+ above 99 and nothing at zero', async () => {
    await setUnreadBadge(120)
    expect(chromeFake.action.setBadgeText).toHaveBeenLastCalledWith({ text: '99+' })
    await setUnreadBadge(0)
    expect(chromeFake.action.setBadgeText).toHaveBeenLastCalledWith({ text: '' })
  })

  it('clears the badge on logout', async () => {
    await setUnreadBadge(5)
    await clearUnreadBadge()
    expect(chromeFake.action.setBadgeText).toHaveBeenLastCalledWith({ text: '' })
  })
})
