import { afterEach, describe, expect, it, vi } from 'vitest'
import { endSession, onSessionEnded } from './session-channel'

const unsubscribers: (() => void)[] = []
afterEach(() => {
  while (unsubscribers.length > 0) unsubscribers.pop()?.()
})

describe('session-channel', () => {
  it('notifies local listeners', () => {
    const listener = vi.fn()
    unsubscribers.push(onSessionEnded(listener))
    endSession()
    expect(listener).toHaveBeenCalledTimes(1)
  })

  it('stops notifying after unsubscribe', () => {
    const listener = vi.fn()
    onSessionEnded(listener)()
    endSession()
    expect(listener).not.toHaveBeenCalled()
  })

  it('broadcasts the end of the session to other contexts', async () => {
    const other = new BroadcastChannel('mh-auth')
    const received = new Promise<unknown>((resolve) => {
      other.onmessage = (event: MessageEvent) => {
        resolve(event.data)
      }
    })
    endSession()
    expect(await received).toEqual({ type: 'session-ended' })
    other.close()
  })

  it('reports a session end coming from another context', async () => {
    const listener = vi.fn()
    unsubscribers.push(onSessionEnded(listener))
    const other = new BroadcastChannel('mh-auth')
    other.postMessage({ type: 'session-ended' })
    await vi.waitFor(() => {
      expect(listener).toHaveBeenCalledTimes(1)
    })
    other.close()
  })
})
